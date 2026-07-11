const User = require('../models/User');
const Role = require('../models/Role');
const Patient = require('../models/Patient');
const jwt = require('jsonwebtoken');
const { generateToken, generateRefreshToken } = require('../utils/token');

// Register (Doctor only - self registration)
exports.register = async (req, res, next) => {
  try {
    const { name, email, password, phone } = req.body;

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Email already registered.' });
    }

    const doctorRole = await Role.findOne({ slug: 'doctor' });
    if (!doctorRole) {
      return res.status(500).json({ success: false, message: 'Roles not seeded. Run npm run seed first.' });
    }

    const user = await User.create({ name, email, password, phone, role: doctorRole._id });
    await user.ensureIdFields();
    const token = generateToken(user);
    const refreshToken = generateRefreshToken(user._id);

    user.refreshToken = refreshToken;
    user.lastLogin = new Date();
    await user.save();

    const populatedUser = await User.findById(user._id).populate({ path: 'role', populate: { path: 'permissions' } });

    res.status(201).json({
      success: true,
      data: { user: populatedUser, token, refreshToken }
    });
  } catch (error) {
    next(error);
  }
};

// Register Patient
exports.registerPatient = async (req, res, next) => {
  try {
    const { name, email, password, phone, age, gender, address, bloodGroup } = req.body;

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Email already registered.' });
    }

    const patientRole = await Role.findOne({ slug: 'patient' });
    if (!patientRole) {
      return res.status(500).json({ success: false, message: 'Patient role not seeded.' });
    }

    // Create User
    const user = await User.create({
      name,
      email,
      password,
      phone,
      role: patientRole._id
    });

    // Create Patient record (scoped to the clinic that owns this patient portal)
    const patient = await Patient.create({
      name,
      email,
      phone,
      age,
      gender,
      address,
      bloodGroup,
      user: user._id,
      createdBy: user._id, // Patient is technically created by themselves here
      clinicId: req.body.clinicId || undefined,
    });

    // Link Patient back to User
    user.patientProfile = patient._id;
    await user.save();

    await user.ensureIdFields();
    const token = generateToken(user);
    const refreshToken = generateRefreshToken(user._id);

    user.refreshToken = refreshToken;
    user.lastLogin = new Date();
    await user.save();

    const populatedUser = await User.findById(user._id).populate({ path: 'role', populate: { path: 'permissions' } });

    res.status(201).json({
      success: true,
      data: { user: populatedUser, token, refreshToken }
    });
  } catch (error) {
    next(error);
  }
};

// Login
exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email }).select('+password +authProvider').populate({ path: 'role', populate: { path: 'permissions' } });
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    if (!user.isActive) {
      return res.status(401).json({ success: false, message: 'Account is deactivated.' });
    }

    // Google-only accounts have no password. Give a clear message rather
    // than a generic "invalid credentials" that might prompt repeated
    // password attempts.
    if (user.authProvider === 'google' && !user.password) {
      return res.status(401).json({ success: false, message: 'This account uses Google Sign-In. Please sign in with Google.' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    await user.ensureIdFields();
    const token = generateToken(user);
    const refreshToken = generateRefreshToken(user._id);

    user.refreshToken = refreshToken;
    user.lastLogin = new Date();
    await user.save();

    res.json({
      success: true,
      data: { user: user.toJSON(), token, refreshToken }
    });
  } catch (error) {
    next(error);
  }
};

// Refresh Token
exports.refreshToken = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ success: false, message: 'Refresh token required.' });
    }

    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    const user = await User.findById(decoded.id).select('+refreshToken').populate({ path: 'role', populate: { path: 'permissions' } });

    if (!user || user.refreshToken !== refreshToken) {
      return res.status(401).json({ success: false, message: 'Invalid refresh token.' });
    }

    await user.ensureIdFields();
    const newToken = generateToken(user);
    const newRefreshToken = generateRefreshToken(user._id);

    user.refreshToken = newRefreshToken;
    await user.save();

    res.json({
      success: true,
      data: { token: newToken, refreshToken: newRefreshToken }
    });
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Invalid refresh token.' });
  }
};

// Get current user
exports.getMe = async (req, res) => {
  res.json({ success: true, data: req.user });
};

// Logout
exports.logout = async (req, res, next) => {
  try {
    await User.findByIdAndUpdate(req.user._id, { refreshToken: null });
    res.json({ success: true, message: 'Logged out successfully.' });
  } catch (error) {
    next(error);
  }
};
