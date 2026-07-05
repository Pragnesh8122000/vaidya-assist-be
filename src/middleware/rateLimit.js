const rateLimit = require('express-rate-limit');

// SEC-12: optional Redis-backed store so rate limits hold under multi-instance
// deploys. When REDIS_URL is set we spin up a single ioredis client and wire it
// into rate-limit-redis. When REDIS_URL is unset we fall back to the default
// in-memory MemoryStore and emit a one-shot startup warning so operators know
// limits reset per-instance. The store is shared across all limiters below so
// we only open one Redis connection per process.
let sharedStore = null;
let storeWarningEmitted = false;

function buildRedisStore() {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    if (!storeWarningEmitted) {
      // eslint-disable-next-line no-console
      console.warn(
        '[rateLimit] REDIS_URL is not set; falling back to in-memory rate-limit store. ' +
          'Limits will reset per-instance under a multi-dyno deploy.'
      );
      storeWarningEmitted = true;
    }
    return undefined;
  }

  try {
    // Lazy-require so the dependency is only loaded when Redis is actually in
    // use. If the operator sets REDIS_URL without installing the client lib we
    // log a warning and fall back to memory rather than crashing the boot.
    const { Redis: Ioredis } = require('ioredis');
    const { RedisStore } = require('rate-limit-redis');
    const client = new Ioredis(redisUrl, {
      maxRetriesPerRequest: 3,
      enableOfflineQueue: true,
    });
    client.on('error', (err) => {
      // eslint-disable-next-line no-console
      console.warn('[rateLimit] Redis store connection error:', err.message);
    });
    return new RedisStore({
      // rate-limit-redis v4 takes a sendCommand function bound to the client.
      sendCommand: (...args) => client.call(...args),
      prefix: 'rl:be:',
    });
  } catch (err) {
    if (!storeWarningEmitted) {
      // eslint-disable-next-line no-console
      console.warn(
        `[rateLimit] REDIS_URL is set but the Redis store could not be initialized (${err.message}); ` +
          'falling back to in-memory rate-limit store.'
      );
      storeWarningEmitted = true;
    }
    return undefined;
  }
}

function resolveStore() {
  if (sharedStore === null) {
    sharedStore = buildRedisStore();
  }
  return sharedStore;
}

const baseOptions = {
  standardHeaders: true,
  legacyHeaders: false,
};

function limiter(opts) {
  const store = resolveStore();
  return rateLimit({ ...baseOptions, ...opts, ...(store ? { store } : {}) });
}

// Stricter limiter for auth endpoints (login / register / refresh-token) —
// brute-force / credential-stuffing protection. 10 attempts per 15 min per IP.
// Audit S-7; SEC-12 extends coverage to POST /auth/refresh-token.
const authLimiter = limiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, message: 'Too many attempts. Please try again later.' },
});

// General limiter for patient-portal write endpoints (book / cancel /
// reschedule). 60 requests per 10 min per IP — well above legitimate use,
// blocks flooding. Audit S-7 / BE-11.
const portalWriteLimiter = limiter({
  windowMs: 10 * 60 * 1000,
  max: 60,
  message: { success: false, message: 'Too many requests. Please slow down.' },
});

// SEC-12: read limiter for the polling-heavy slot-availability endpoint
// (GET /patient-portal/doctors/:doctorId/slots). 120 requests per 10 min per
// IP — comfortably above legitimate slot-browsing, blocks hammering. Uses the
// same shared store so the limit holds across instances.
const portalReadLimiter = limiter({
  windowMs: 10 * 60 * 1000,
  max: 120,
  message: { success: false, message: 'Too many requests. Please slow down.' },
});

module.exports = { authLimiter, portalWriteLimiter, portalReadLimiter };