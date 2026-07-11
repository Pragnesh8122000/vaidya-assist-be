const { OAuth2Client } = require('google-auth-library');
const User = require('../models/User');
const Role = require('../models/Role');
const Patient = require('../models/Patient');
const { generateToken, generateRefreshToken } = require('../utils/token');

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

/**
 * POST /api/auth/google
 *
 * Verify a Google ID token, then either:
 *  - Log in an existing user whose email matches the Google account, OR
 *  - Auto-create a new Patient account (profileComplete: false), OR
 *  - Reject if the role is 'doctor'/'admin' and no matching account exists.
 *
 * Request body:
 *  { idToken: string, role: 'patient' | 'doctor' }
 *  - `role` defaults to 'patient' if omitted.
 *  - `role` tells the backend what type of account to create when no match exists.
 *    For 'doctor'/'admin', no account is auto-created.
 */
exports.googleAuth = async (req, res, next) => {
  try {
    const { idToken, role = 'patient' } = req.body;

    if (!idToken) {
      return res.status(400).json({ success: false, message: 'Google ID token is required.' });
    }

    // 1. Verify the token server-side using Google's official library.
    let ticket;
    try {
      ticket = await client.verifyIdToken({
        idToken,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[googleAuth] Token verification failed:', err.message);
      return res.status(401).json({ success: false, message: 'Invalid or expired Google token.' });
    }

    const payload = ticket.getPayload();

    // 2. Reject if email is not verified by Google.
    if (!payload.email_verified) {
      return res.status(403).json({ success: false, message: 'Google email is not verified. Please verify your email with Google first.' });
    }

    const { email, name, picture } = payload;
    const googleId = payload.sub;

    // eslint-disable-next-line no-console
    console.info(`[googleAuth] Sign-in attempt: email=${email}, role=${role}`);

    // 3. Look up existing account by email.
    let user = await User.findOne({ email }).populate({ path: 'role', populate: { path: 'permissions' } });
    let isNewUser = false;

    if (user) {
      // --- Existing account found: log them in. ---

      // Account linking: if this account was previously password-only, update
      // authProvider to 'both' so we know Google is now a linked method.
      // If the account was already 'google' or 'both', this is a no-op.
      if (user.authProvider === 'password') {
        user.authProvider = 'both';
      }
      // Always update googleId if not yet set (e.g., first Google sign-in
      // for a password-created account).
      if (!user.googleId) {
        user.googleId = googleId;
      }
      // Update avatar from Google profile if the user doesn't have one.
      if (!user.avatar && picture) {
        user.avatar = picture;
      }
      await user.save();
    } else {
      // --- No existing account. ---

      if (role === 'patient') {
        // Auto-create a new Patient account.
        const patientRole = await Role.findOne({ slug: 'patient' });
        if (!patientRole) {
          return res.status(500).json({ success: false, message: 'Patient role not seeded. Run npm run seed first.' });
        }

        user = await User.create({
          name: name || email.split('@')[0],
          email,
          // No password for Google-only accounts
          role: patientRole._id,
          googleId,
          authProvider: 'google',
          profileComplete: false,
          avatar: picture || undefined,
        });
        await user.ensureIdFields();

        // Create the linked Patient record.
        const patient = await Patient.create({
          name: user.name,
          email: user.email,
          user: user._id,
          createdBy: user._id,
          clinicId: req.body.clinicId || undefined,
        });

        user.patientProfile = patient._id;
        await user.save();

        // Re-populate for the response.
        user = await User.findById(user._id).populate({ path: 'role', populate: { path: 'permissions' } });
        isNewUser = true;
      } else {
        // Doctor/Admin: reject — accounts must be provisioned by an admin.
        return res.status(403).json({
          success: false,
          message: 'No account found for this email. Please contact your clinic administrator.',
        });
      }
    }

    // Check if account is active.
    if (!user.isActive) {
      return res.status(401).json({ success: false, message: 'Account is deactivated.' });
    }

    // 4. Issue the app's normal JWT (same shape/expiry as password login).
    await user.ensureIdFields();
    const token = generateToken(user);
    const refreshToken = generateRefreshToken(user._id);

    user.refreshToken = refreshToken;
    user.lastLogin = new Date();
    await user.save();

    const populatedUser = await User.findById(user._id)
      .select('+profileComplete')
      .populate({ path: 'role', populate: { path: 'permissions' } });

    res.status(isNewUser ? 201 : 200).json({
      success: true,
      data: {
        user: populatedUser.toJSON(),
        token,
        refreshToken,
        // Include profileComplete in the response so the frontend knows
        // whether to redirect to the profile-completion flow.
        profileComplete: populatedUser.profileComplete,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/auth/complete-profile
 *
 * Complete a new patient's profile after Google Sign-In.
 * Only available to users whose profileComplete is false.
 *
 * Request body:
 *  { phone, age, gender, address, bloodGroup }
 */
exports.completeProfile = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { phone, age, gender, address, bloodGroup } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    if (user.profileComplete) {
      return res.status(400).json({ success: false, message: 'Profile is already complete.' });
    }

    // Validate required fields for profile completion.
    if (!phone || !phone.trim()) {
      return res.status(400).json({ success: false, message: 'Phone number is required.' });
    }

    // Update User phone.
    user.phone = phone.trim();
    await user.save();

    // Update the linked Patient record.
    if (user.patientProfile) {
      const patient = await Patient.findById(user.patientProfile);
      if (patient) {
        patient.phone = phone.trim();
        if (age !== undefined && age !== '') patient.age = Number(age);
        if (gender) patient.gender = gender;
        if (address) patient.address = address;
        if (bloodGroup) patient.bloodGroup = bloodGroup;
        await patient.save();
      }
    }

    // Mark profile as complete.
    user.profileComplete = true;
    await user.save();

    const populatedUser = await User.findById(user._id)
      .select('+profileComplete')
      .populate({ path: 'role', populate: { path: 'permissions' } });

    res.json({
      success: true,
      data: {
        user: populatedUser.toJSON(),
        profileComplete: true,
      },
    });
  } catch (error) {
    next(error);
  }
};