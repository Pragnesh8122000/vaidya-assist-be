describe('rateLimit middleware (SEC-12)', () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = { ...originalEnv };
    delete process.env.REDIS_URL;
    jest.resetModules();
  });

  it('exports authLimiter, portalWriteLimiter, and portalReadLimiter', () => {
    delete process.env.REDIS_URL;
    const { authLimiter, portalWriteLimiter, portalReadLimiter } = require('../rateLimit');
    expect(authLimiter).toBeDefined();
    expect(portalWriteLimiter).toBeDefined();
    expect(portalReadLimiter).toBeDefined();
    // Each is an express-rate-limit middleware handler.
    expect(typeof authLimiter).toBe('function');
    expect(typeof portalReadLimiter).toBe('function');
  });

  it('falls back to in-memory store (no throw) when REDIS_URL is unset', () => {
    delete process.env.REDIS_URL;
    // Suppress the one-shot startup warning from the test runner output.
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() => require('../rateLimit')).not.toThrow();
    warnSpy.mockRestore();
  });
});