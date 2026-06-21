const jwt = require('jsonwebtoken');

/**
 * Generate an access token for a user.
 *
 * The token payload now includes stable `doctorId` and `clinicId` UUIDs so that
 * agent-service can verify and scope requests statelessly. The user object must
 * have these populated (call `user.ensureIdFields()` before this if needed).
 */
const generateToken = (user) => {
  return jwt.sign(
    { id: user._id, doctorId: user.doctorId, clinicId: user.clinicId },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE }
  );
};

const generateRefreshToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_REFRESH_SECRET, { expiresIn: process.env.JWT_REFRESH_EXPIRE });
};

module.exports = { generateToken, generateRefreshToken };
