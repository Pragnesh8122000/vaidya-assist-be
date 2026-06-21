const router = require('express').Router();
const { auth, checkPermission } = require('../middleware/auth');
const { getAppointments, getAppointment, createAppointment, updateAppointment, deleteAppointment, getCalendarAppointments, getTodayAppointments, getUpcomingAppointments } = require('../controllers/appointmentController');

router.use(auth);

router.get('/', checkPermission('view_appointments'), getAppointments);
router.get('/today', checkPermission('view_appointments'), getTodayAppointments);
router.get('/upcoming', checkPermission('view_appointments'), getUpcomingAppointments);
router.get('/calendar', checkPermission('view_appointments'), getCalendarAppointments);
router.get('/:id', checkPermission('view_appointments'), getAppointment);
router.post('/', checkPermission('manage_appointments'), createAppointment);
router.put('/:id', checkPermission('manage_appointments'), updateAppointment);
router.delete('/:id', checkPermission('manage_appointments'), deleteAppointment);

module.exports = router;
