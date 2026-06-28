const express = require('express');
const router = express.Router();
const { auth, checkPermission } = require('../middleware/auth');
const patientController = require('../controllers/patientAppointmentController');

// All patient routes require authentication
router.use(auth);

// Profile routes
router.get('/me', checkPermission('view_own_profile'), patientController.getPatientProfile);
router.put('/me', checkPermission('update_own_profile'), patientController.updatePatientProfile);

// Doctor search
router.get('/doctors', checkPermission('view_own_appointments'), patientController.getDoctors);

// Doctor availability
router.get('/doctors/:doctorId/slots', checkPermission('view_own_appointments'), patientController.getAvailableSlots);

// Appointment routes
router.post('/appointments', checkPermission('book_appointment'), patientController.bookAppointment);
router.get('/appointments', checkPermission('view_own_appointments'), patientController.getPatientAppointments);
router.get('/appointments/:id', checkPermission('view_own_appointments'), patientController.getAppointmentDetails);
router.put('/appointments/:id/cancel', checkPermission('book_appointment'), patientController.cancelAppointment);
router.patch('/appointments/:id/reschedule', checkPermission('book_appointment'), patientController.rescheduleAppointment);

module.exports = router;
