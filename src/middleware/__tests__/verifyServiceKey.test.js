const { verifyServiceKey } = require('../verifyServiceKey');

const originalEnv = process.env;

function createReq(headerValue) {
  return {
    header: jest.fn().mockImplementation((key) => {
      if (key === 'X-Service-Key') return headerValue;
      return undefined;
    }),
  };
}

function createRes() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
}

describe('verifyServiceKey', () => {
  afterEach(() => {
    process.env = { ...originalEnv };
    delete process.env.INTERNAL_SERVICE_KEY;
    delete process.env.NODE_ENV;
  });

  it('allows request when INTERNAL_SERVICE_KEY is not configured in non-production', () => {
    delete process.env.INTERNAL_SERVICE_KEY;
    process.env.NODE_ENV = 'development';
    const req = createReq('anything');
    const res = createRes();
    const next = jest.fn();

    verifyServiceKey(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('fail-closed in production when INTERNAL_SERVICE_KEY is not configured', () => {
    delete process.env.INTERNAL_SERVICE_KEY;
    process.env.NODE_ENV = 'production';
    const req = createReq('anything');
    const res = createRes();
    const next = jest.fn();

    verifyServiceKey(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'Service key is not configured.',
    });
  });

  it('allows request when provided key matches', () => {
    process.env.INTERNAL_SERVICE_KEY = 'secret-key';
    process.env.NODE_ENV = 'production';
    const req = createReq('secret-key');
    const res = createRes();
    const next = jest.fn();

    verifyServiceKey(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('returns 403 when provided key does not match', () => {
    process.env.INTERNAL_SERVICE_KEY = 'secret-key';
    process.env.NODE_ENV = 'production';
    const req = createReq('wrong-key');
    const res = createRes();
    const next = jest.fn();

    verifyServiceKey(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'Invalid or missing service key.',
    });
  });

  it('returns 403 when key is missing', () => {
    process.env.INTERNAL_SERVICE_KEY = 'secret-key';
    process.env.NODE_ENV = 'production';
    const req = createReq(undefined);
    const res = createRes();
    const next = jest.fn();

    verifyServiceKey(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('rejects mismatched key with a different length (constant-time guard)', () => {
    process.env.INTERNAL_SERVICE_KEY = 'secret-key';
    process.env.NODE_ENV = 'production';
    const req = createReq('short');
    const res = createRes();
    const next = jest.fn();

    verifyServiceKey(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });
});