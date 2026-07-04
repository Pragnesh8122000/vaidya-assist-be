const rateLimit = require('express-rate-limit');

// Stricter limiter for auth endpoints (login / register) — brute-force /
// credential-stuffing protection. 10 attempts per 15 min per IP. Audit S-7.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many attempts. Please try again later.' },
});

// General limiter for patient-portal write endpoints (book / cancel /
// reschedule). 60 requests per 10 min per IP — well above legitimate use,
// blocks flooding. Audit S-7 / BE-11.
const portalWriteLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests. Please slow down.' },
});

module.exports = { authLimiter, portalWriteLimiter };