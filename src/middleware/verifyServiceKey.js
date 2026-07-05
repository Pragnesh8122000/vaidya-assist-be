/**
 * Verify the optional `X-Service-Key` header used by internal services.
 *
 * The agent-service sends this header when `INTERNAL_SERVICE_KEY` is configured.
 *
 * SEC-6: fail-closed in production — if INTERNAL_SERVICE_KEY is unset we reject
 * every request that reaches this middleware, so enforcement cannot be silently
 * disabled by a missing env var. In non-production (dev/test) we keep the
 * historical pass-through behaviour so local development and the test suite do
 * not need the env var set.
 *
 * SEC-6: the key comparison uses crypto.timingSafeEqual (constant-time) to
 * remove the timing-attack surface of a plain `!==` compare.
 */
const crypto = require('crypto');

function safeEqual(a, b) {
  const aBuf = Buffer.from(String(a));
  const bBuf = Buffer.from(String(b));
  if (aBuf.length !== bBuf.length) {
    // Still perform a comparison to keep timing roughly constant.
    crypto.timingSafeEqual(aBuf, aBuf);
    return false;
  }
  return crypto.timingSafeEqual(aBuf, bBuf);
}

const verifyServiceKey = (req, res, next) => {
  const expectedKey = process.env.INTERNAL_SERVICE_KEY;

  if (!expectedKey) {
    // Fail-closed in production; pass-through elsewhere for dev/test.
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({
        success: false,
        message: 'Service key is not configured.',
      });
    }
    return next();
  }

  const providedKey = req.header('X-Service-Key');

  if (!providedKey || !safeEqual(providedKey, expectedKey)) {
    return res.status(403).json({
      success: false,
      message: 'Invalid or missing service key.',
    });
  }

  next();
};

module.exports = { verifyServiceKey };