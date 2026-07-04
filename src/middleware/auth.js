const jwt = require('jsonwebtoken');
const User = require('../models/User');

const auth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ success: false, message: 'Access denied. No token provided.' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).populate({
      path: 'role',
      populate: { path: 'permissions' }
    });

    if (!user || !user.isActive) {
      return res.status(401).json({ success: false, message: 'Invalid token or user inactive.' });
    }

    // Stable scoping IDs used by agent-service and other internal services.
    // These come from the token payload, which is set at login/refresh.
    req.doctorId = decoded.doctorId || user.doctorId;
    req.clinicId = decoded.clinicId || user.clinicId;
    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Token expired.', code: 'TOKEN_EXPIRED' });
    }
    res.status(401).json({ success: false, message: 'Invalid token.' });
  }
};

const checkPermission = (...requiredPermissions) => {
  return (req, res, next) => {
    if (!req.user || !req.user.role) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    const userPermissions = req.user.role.permissions.map(p => p.slug);

    // Doctor (super admin) has all permissions. This bypasses the permission
    // gate only — clinic scoping is still enforced downstream in every
    // controller via `req.clinicId` (set in `auth` from the token payload).
    // `User.clinicId` has a uuidv4 default, so req.clinicId is always set for
    // a real doctor, meaning a doctor never sees other clinics' data. Audit BE-10.
    if (req.user.role.slug === 'doctor') {
      return next();
    }

    const hasPermission = requiredPermissions.some(perm => userPermissions.includes(perm));
    if (!hasPermission) {
      return res.status(403).json({ success: false, message: 'Insufficient permissions.' });
    }

    next();
  };
};

module.exports = { auth, checkPermission };
