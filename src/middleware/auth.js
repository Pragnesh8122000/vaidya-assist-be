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

    // Doctor (super admin) has all permissions
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
