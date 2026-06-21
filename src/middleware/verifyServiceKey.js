/**
 * Verify the optional `X-Service-Key` header used by internal services.
 *
 * The agent-service sends this header when `INTERNAL_SERVICE_KEY` is configured.
 * This middleware rejects requests that present a key but it is wrong.
 * If the env var is not set on the receiving service, the header is ignored
 * (useful for gradual rollout and local dev).
 */
const verifyServiceKey = (req, res, next) => {
  const expectedKey = process.env.INTERNAL_SERVICE_KEY;

  // If no key is configured on this service, allow the request through.
  // In production, set INTERNAL_SERVICE_KEY to enforce service-to-service auth.
  if (!expectedKey) {
    return next();
  }

  const providedKey = req.header('X-Service-Key');

  if (providedKey !== expectedKey) {
    return res.status(403).json({
      success: false,
      message: 'Invalid or missing service key.',
    });
  }

  next();
};

module.exports = { verifyServiceKey };
