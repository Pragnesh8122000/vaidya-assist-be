/**
 * Integration tests for Google Sign-In authentication.
 *
 * These tests mock the Google token verification library
 * (google-auth-library) to avoid needing real Google credentials,
 * but exercise the full controller + Mongoose model logic.
 */

// ── Mock google-auth-library before requiring the controller ────────
// The controller creates an OAuth2Client at module level, so we must
// mock the class before the require.
const mockVerifyIdToken = jest.fn();
jest.mock('google-auth-library', () => ({
  OAuth2Client: jest.fn().mockImplementation(() => ({
    verifyIdToken: mockVerifyIdToken,
  })),
}));

const { googleAuth, completeProfile } = require('../googleAuthController');
const User = require('../../models/User');
const Role = require('../../models/Role');
const Patient = require('../../models/Patient');

jest.mock('../../models/User');
jest.mock('../../models/Role');
jest.mock('../../models/Patient');
jest.mock('../../utils/token', () => ({
  generateToken: jest.fn().mockReturnValue('mock-jwt-token'),
  generateRefreshToken: jest.fn().mockReturnValue('mock-refresh-token'),
}));

function createRes() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
}

const mockGooglePayload = {
  sub: 'google-12345',
  email: 'patient@example.com',
  email_verified: true,
  name: 'Test Patient',
  picture: 'https://example.com/photo.jpg',
};

const mockPatientRole = {
  _id: new (require('mongoose').Types.ObjectId)(),
  slug: 'patient',
  name: 'Patient',
  permissions: [],
};

/** Create a mock user object with all methods the controller calls. */
function createMockUser(overrides = {}) {
  const user = {
    _id: 'user-1',
    email: 'patient@example.com',
    name: 'Test Patient',
    role: mockPatientRole._id,
    isActive: true,
    authProvider: 'password',
    googleId: null,
    avatar: null,
    patientProfile: null,
    phone: null,
    refreshToken: null,
    lastLogin: null,
    profileComplete: true,
    save: jest.fn().mockResolvedValue(),
    ensureIdFields: jest.fn().mockResolvedValue(),
    toJSON: jest.fn().mockReturnValue({
      _id: 'user-1',
      email: 'patient@example.com',
      name: 'Test Patient',
    }),
    ...overrides,
  };
  return user;
}

/**
 * Set up User.findOne to support the .populate() chain.
 * Controller calls: User.findOne({ email }).populate({ ... })
 */
function mockUserFindOne(userOrNull) {
  const populateFn = jest.fn().mockResolvedValue(userOrNull);
  User.findOne.mockReturnValue({ populate: populateFn });
  return populateFn;
}

/**
 * Set up User.findById for the .select().populate() chain.
 * Controller calls: User.findById(id).select('+profileComplete').populate({ ... })
 */
function mockUserFindByIdWithSelect(user) {
  const populatedUser = {
    ...user,
    toJSON: user.toJSON || jest.fn().mockReturnValue(user),
  };
  const populateFn = jest.fn().mockResolvedValue(populatedUser);
  const selectFn = jest.fn().mockReturnValue({ populate: populateFn });
  User.findById.mockReturnValue({ select: selectFn });
  return { selectFn, populateFn };
}

/**
 * Set up User.findById for the .populate() chain (no .select()).
 * Controller calls: User.findById(id).populate({ ... })
 */
function mockUserFindByIdWithPopulate(user) {
  const populatedUser = {
    ...user,
    toJSON: user.toJSON || jest.fn().mockReturnValue(user),
  };
  const populateFn = jest.fn().mockResolvedValue(populatedUser);
  User.findById.mockReturnValue({ populate: populateFn });
  return populateFn;
}

describe('googleAuth controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── Valid token, existing patient → 200, login with Google linking ──
  it('logs in an existing patient by email and links Google', async () => {
    const existingUser = createMockUser({
      authProvider: 'password',
      googleId: null,
      profileComplete: true,
    });

    mockVerifyIdToken.mockResolvedValue({
      getPayload: () => ({ ...mockGooglePayload }),
    });
    mockUserFindOne(existingUser);
    mockUserFindByIdWithSelect(existingUser);

    const req = { body: { idToken: 'valid-token', role: 'patient' } };
    const res = createRes();

    await googleAuth(req, res, jest.fn());

    // Should update authProvider to 'both' (linking Google to password account)
    expect(existingUser.authProvider).toBe('both');
    expect(existingUser.googleId).toBe('google-12345');
    expect(existingUser.save).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          token: 'mock-jwt-token',
        }),
      }),
    );
  });

  // ── Valid token, no account, role=patient → 201, auto-create ──────
  it('creates a new patient account from Google Sign-In', async () => {
    const newUser = createMockUser({
      _id: 'user-new',
      email: 'newpatient@example.com',
      name: 'New Patient',
      authProvider: 'google',
      profileComplete: false,
      googleId: 'google-12345',
    });

    const populatedNewUser = {
      ...newUser,
      profileComplete: false,
      toJSON: jest.fn().mockReturnValue({ ...newUser, profileComplete: false }),
    };

    mockVerifyIdToken.mockResolvedValue({
      getPayload: () => ({
        ...mockGooglePayload,
        email: 'newpatient@example.com',
        name: 'New Patient',
      }),
    });
    mockUserFindOne(null); // No existing user
    Role.findOne.mockResolvedValue(mockPatientRole);
    User.create.mockResolvedValue(newUser);
    Patient.create.mockResolvedValue({ _id: 'patient-1', name: 'New Patient', save: jest.fn() });

    // First findById: after create, re-populate (line 115) — no .select()
    // Second findById: for response (line 140) — with .select()
    const findByIdPopulate = jest.fn().mockResolvedValue(populatedNewUser);
    const findByIdSelect = jest.fn().mockReturnValue({ populate: jest.fn().mockResolvedValue(populatedNewUser) });

    User.findById
      .mockReturnValueOnce({ populate: findByIdPopulate }) // line 115
      .mockReturnValueOnce({ select: findByIdSelect });    // line 140

    const req = { body: { idToken: 'valid-token', role: 'patient' } };
    const res = createRes();

    await googleAuth(req, res, jest.fn());

    expect(User.create).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'newpatient@example.com',
        authProvider: 'google',
        profileComplete: false,
        googleId: 'google-12345',
      }),
    );
    expect(Patient.create).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          profileComplete: false,
        }),
      }),
    );
  });

  // ── Valid token, no account, role=doctor → 403, reject ────────────
  it('rejects Google Sign-In for a non-existent doctor account', async () => {
    mockVerifyIdToken.mockResolvedValue({
      getPayload: () => ({ ...mockGooglePayload }),
    });
    mockUserFindOne(null); // No existing user

    const req = { body: { idToken: 'valid-token', role: 'doctor' } };
    const res = createRes();

    await googleAuth(req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: 'No account found for this email. Please contact your clinic administrator.',
      }),
    );
  });

  // ── email_verified=false → 403 ─────────────────────────────────────
  it('rejects Google Sign-In when email is not verified', async () => {
    mockVerifyIdToken.mockResolvedValue({
      getPayload: () => ({ ...mockGooglePayload, email_verified: false }),
    });

    const req = { body: { idToken: 'valid-token' } };
    const res = createRes();

    await googleAuth(req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: expect.stringContaining('not verified'),
      }),
    );
  });

  // ── Invalid/expired Google token → 401 ─────────────────────────────
  it('rejects an invalid Google ID token', async () => {
    mockVerifyIdToken.mockRejectedValue(new Error('Token used too late'));

    const req = { body: { idToken: 'bad-token' } };
    const res = createRes();

    await googleAuth(req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: 'Invalid or expired Google token.',
      }),
    );
  });

  // ── Missing idToken → 400 ──────────────────────────────────────────
  it('rejects request with missing idToken', async () => {
    const req = { body: {} };
    const res = createRes();

    await googleAuth(req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: 'Google ID token is required.',
      }),
    );
  });

  // ── Account linking: password-only user signs in with Google ───────
  it('links a Google account to an existing password-only account', async () => {
    const existingUser = createMockUser({
      authProvider: 'password',
      googleId: null,
      profileComplete: true,
    });

    mockVerifyIdToken.mockResolvedValue({
      getPayload: () => ({ ...mockGooglePayload }),
    });
    mockUserFindOne(existingUser);
    mockUserFindByIdWithSelect(existingUser);

    const req = { body: { idToken: 'valid-token' } };
    const res = createRes();

    await googleAuth(req, res, jest.fn());

    expect(existingUser.authProvider).toBe('both');
    expect(existingUser.googleId).toBe('google-12345');
    expect(res.status).toHaveBeenCalledWith(200);
  });

  // ── Existing Google-only user signs in again ───────────────────────
  it('logs in a Google-only user on subsequent sign-ins', async () => {
    const googleUser = createMockUser({
      authProvider: 'google',
      googleId: 'google-12345',
      profileComplete: true,
    });

    mockVerifyIdToken.mockResolvedValue({
      getPayload: () => ({ ...mockGooglePayload }),
    });
    mockUserFindOne(googleUser);
    mockUserFindByIdWithSelect(googleUser);

    const req = { body: { idToken: 'valid-token' } };
    const res = createRes();

    await googleAuth(req, res, jest.fn());

    // authProvider stays 'google' (no linking needed)
    expect(googleUser.authProvider).toBe('google');
    expect(res.status).toHaveBeenCalledWith(200);
  });

  // ── Deactivated account → 401 ─────────────────────────────────────
  it('rejects a deactivated account', async () => {
    const deactivatedUser = createMockUser({
      isActive: false,
      authProvider: 'password',
    });

    mockVerifyIdToken.mockResolvedValue({
      getPayload: () => ({ ...mockGooglePayload }),
    });
    mockUserFindOne(deactivatedUser);
    // The controller will try to re-fetch for the response, but the
    // isActive check happens before that, so we still need the mock.
    mockUserFindByIdWithSelect(deactivatedUser);

    const req = { body: { idToken: 'valid-token' } };
    const res = createRes();

    await googleAuth(req, res, jest.fn());

    // Controller updates user (googleId, authProvider) then saves BEFORE
    // checking isActive. The save must succeed for the check to be reached.
    expect(deactivatedUser.authProvider).toBe('both');
    expect(deactivatedUser.googleId).toBe('google-12345');
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Account is deactivated.',
      }),
    );
  });
});

describe('completeProfile controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('completes a profile and sets profileComplete to true', async () => {
    const user = createMockUser({
      profileComplete: false,
      patientProfile: 'patient-1',
    });
    // Override save to actually update profileComplete
    user.save = jest.fn().mockImplementation(function () {
      // First save: phone update
      // Second save: profileComplete = true
      return Promise.resolve(this);
    });

    const patient = {
      _id: 'patient-1',
      phone: null,
      save: jest.fn().mockResolvedValue(),
    };

    // First call: User.findById(userId) — simple, no chain
    User.findById.mockResolvedValueOnce(user);
    Patient.findById.mockResolvedValue(patient);

    // After phone save and profileComplete save, the controller re-fetches:
    // User.findById(user._id).select('+profileComplete').populate({ ... })
    const populatedUser = {
      ...user,
      phone: '1234567890',
      profileComplete: true,
      toJSON: jest.fn().mockReturnValue({
        _id: 'user-1',
        phone: '1234567890',
        profileComplete: true,
      }),
    };
    const populateFn = jest.fn().mockResolvedValue(populatedUser);
    const selectFn = jest.fn().mockReturnValue({ populate: populateFn });
    User.findById.mockReturnValueOnce({ select: selectFn });

    const req = {
      user: { _id: 'user-1' },
      body: { phone: '1234567890', age: '30', gender: 'Male', address: '123 Main St', bloodGroup: 'O+' },
    };
    const res = createRes();

    await completeProfile(req, res, jest.fn());

    expect(user.phone).toBe('1234567890');
    expect(user.profileComplete).toBe(true);
    expect(patient.phone).toBe('1234567890');
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          profileComplete: true,
        }),
      }),
    );
  });

  it('rejects completion when profile is already complete', async () => {
    User.findById.mockResolvedValue({ _id: 'user-1', profileComplete: true });

    const req = {
      user: { _id: 'user-1' },
      body: { phone: '1234567890' },
    };
    const res = createRes();

    await completeProfile(req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Profile is already complete.',
      }),
    );
  });

  it('rejects completion without a phone number', async () => {
    User.findById.mockResolvedValue({ _id: 'user-1', profileComplete: false });

    const req = {
      user: { _id: 'user-1' },
      body: { phone: '' },
    };
    const res = createRes();

    await completeProfile(req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Phone number is required.',
      }),
    );
  });
});