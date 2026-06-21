const jwt = require('jsonwebtoken');
const User = require('../../models/User');
const { auth } = require('../auth');

jest.mock('jsonwebtoken');
jest.mock('../../models/User');

function createReq(overrides = {}) {
  return {
    header: jest.fn().mockImplementation((key) => {
      const headers = { ...(overrides.headers || {}) };
      return headers[key.toLowerCase()];
    }),
    ...overrides,
  };
}

function createRes() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
}

describe('auth middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.JWT_SECRET = 'test-jwt-secret';
  });

  it('attaches req.doctorId, req.clinicId, and req.user from the token payload', async () => {
    const user = {
      _id: 'user-mongo-id',
      doctorId: 'doc-uuid',
      clinicId: 'clinic-uuid',
      isActive: true,
      role: { permissions: [] },
    };

    jwt.verify.mockReturnValue({
      id: 'user-mongo-id',
      doctorId: 'doc-uuid',
      clinicId: 'clinic-uuid',
    });
    User.findById.mockReturnValue({ populate: jest.fn().mockResolvedValue(user) });

    const req = createReq({ headers: { authorization: 'Bearer valid-token' } });
    const res = createRes();
    const next = jest.fn();

    await auth(req, res, next);

    expect(jwt.verify).toHaveBeenCalledWith('valid-token', process.env.JWT_SECRET);
    expect(User.findById).toHaveBeenCalledWith('user-mongo-id');
    expect(req.doctorId).toBe('doc-uuid');
    expect(req.clinicId).toBe('clinic-uuid');
    expect(req.user).toBe(user);
    expect(next).toHaveBeenCalled();
  });

  it('falls back to user.doctorId/clinicId when token payload lacks them', async () => {
    const user = {
      _id: 'user-mongo-id',
      doctorId: 'doc-uuid-fallback',
      clinicId: 'clinic-uuid-fallback',
      isActive: true,
      role: { permissions: [] },
    };

    jwt.verify.mockReturnValue({ id: 'user-mongo-id' });
    User.findById.mockReturnValue({ populate: jest.fn().mockResolvedValue(user) });

    const req = createReq({ headers: { authorization: 'Bearer old-token' } });
    const res = createRes();
    const next = jest.fn();

    await auth(req, res, next);

    expect(req.doctorId).toBe('doc-uuid-fallback');
    expect(req.clinicId).toBe('clinic-uuid-fallback');
    expect(next).toHaveBeenCalled();
  });

  it('returns 401 when token is missing', async () => {
    const req = createReq({ headers: {} });
    const res = createRes();
    const next = jest.fn();

    await auth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'Access denied. No token provided.',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 TOKEN_EXPIRED when token is expired', async () => {
    const error = new Error('Token expired');
    error.name = 'TokenExpiredError';
    jwt.verify.mockImplementation(() => {
      throw error;
    });

    const req = createReq({ headers: { authorization: 'Bearer expired-token' } });
    const res = createRes();
    const next = jest.fn();

    await auth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'Token expired.',
      code: 'TOKEN_EXPIRED',
    });
    expect(next).not.toHaveBeenCalled();
  });
});
