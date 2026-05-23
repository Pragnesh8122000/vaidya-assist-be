const router = require('express').Router();
const { auth } = require('../middleware/auth');
const { getDashboardStats, getAppointmentChart, getPatientVisitStats, getMedicineStockChart, getAppointmentStatusDist } = require('../controllers/dashboardController');

router.use(auth);

router.get('/stats', getDashboardStats);
router.get('/appointment-chart', getAppointmentChart);
router.get('/patient-visits', getPatientVisitStats);
router.get('/medicine-stock', getMedicineStockChart);
router.get('/appointment-status', getAppointmentStatusDist);

module.exports = router;
