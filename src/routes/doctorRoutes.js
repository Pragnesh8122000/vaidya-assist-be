const express = require('express');
const { auth } = require('../middleware/auth');
const doctorController = require('../controllers/doctorController');

const router = express.Router();

// All doctor routes require authentication
router.use(auth);

// GET /api/doctors - list all doctors with count and pagination
router.get('/', doctorController.getDoctors);

module.exports = router;
