const express = require('express');
const router = express.Router();
const { auth, checkPermission } = require('../middleware/auth');
const { portalWriteLimiter } = require('../middleware/rateLimit');
const patientController = require('../controllers/patientAppointmentController');

// All patient routes require authentication
router.use(auth);

// Profile routes
router.get('/me', checkPermission('view_own_profile'), patientController.getPatientProfile);
router.put('/me', checkPermission('update_own_profile'), patientController.updatePatientProfile);

// Dependents (book-for-someone-else) — dependents are part of the patient's
// own profile, so the existing profile permissions cover them.
router.get('/me/dependents', checkPermission('view_own_profile'), patientController.getDependents);
router.post('/me/dependents', checkPermission('update_own_profile'), patientController.addDependent);
router.put('/me/dependents/:id', checkPermission('update_own_profile'), patientController.updateDependent);
router.delete('/me/dependents/:id', checkPermission('update_own_profile'), patientController.removeDependent);

// Doctor search
router.get('/doctors', checkPermission('view_own_appointments'), patientController.getDoctors);

// Doctor availability
router.get('/doctors/:doctorId/slots', checkPermission('view_own_appointments'), patientController.getAvailableSlots);

// Appointment routes
router.post('/appointments', portalWriteLimiter, checkPermission('book_appointment'), patientController.bookAppointment);
router.get('/appointments', checkPermission('view_own_appointments'), patientController.getPatientAppointments);
router.get('/appointments/:id', checkPermission('view_own_appointments'), patientController.getAppointmentDetails);
router.get('/appointments/:id/prescription', checkPermission('view_own_appointments'), patientController.getPrescription);
router.get('/appointments/:id/prescription/files/:fileId/download', checkPermission('view_own_appointments'), patientController.downloadPrescriptionFile);
router.put('/appointments/:id/cancel', portalWriteLimiter, checkPermission('book_appointment'), patientController.cancelAppointment);
router.patch('/appointments/:id/reschedule', portalWriteLimiter, checkPermission('book_appointment'), patientController.rescheduleAppointment);

module.exports = router;
