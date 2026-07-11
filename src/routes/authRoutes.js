const router = require('express').Router();
const { body } = require('express-validator');
const validate = require('../middleware/validate');
const { register, registerPatient, login, refreshToken, getMe, logout } = require('../controllers/authController');
const { googleAuth, completeProfile } = require('../controllers/googleAuthController');
const { auth } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimit');

router.post('/register', authLimiter, [
  body('name').notEmpty().withMessage('Name is required'),
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
], validate, register);

router.post('/register-patient', authLimiter, [
  body('name').notEmpty().withMessage('Name is required'),
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
], validate, registerPatient);

router.post('/login', authLimiter, [
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').notEmpty().withMessage('Password is required'),
], validate, login);

// Google Sign-In: verify ID token and log in / auto-create patient.
// Rate-limited with the same authLimiter as password login.
router.post('/google', authLimiter, [
  body('idToken').notEmpty().withMessage('Google ID token is required'),
], validate, googleAuth);

// Complete patient profile after Google Sign-In.
// Only accessible to authenticated users whose profileComplete is false.
router.patch('/complete-profile', auth, completeProfile);

// SEC-12: rate-limit refresh-token to blunt token-grinding / brute-force
// attempts against the refresh endpoint.
router.post('/refresh-token', authLimiter, refreshToken);
router.get('/me', auth, getMe);
router.post('/logout', auth, logout);

module.exports = router;
