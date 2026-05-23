const router = require('express').Router();
const { body } = require('express-validator');
const validate = require('../middleware/validate');
const { register, login, refreshToken, getMe, logout } = require('../controllers/authController');
const { auth } = require('../middleware/auth');

router.post('/register', [
  body('name').notEmpty().withMessage('Name is required'),
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
], validate, register);

router.post('/login', [
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').notEmpty().withMessage('Password is required'),
], validate, login);

router.post('/refresh-token', refreshToken);
router.get('/me', auth, getMe);
router.post('/logout', auth, logout);

module.exports = router;
