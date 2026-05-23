const router = require('express').Router();
const { auth, checkPermission } = require('../middleware/auth');
const { getAppointmentReport, getPatientReport, getMedicineReport } = require('../controllers/reportController');

router.use(auth);

router.get('/appointments', checkPermission('generate_reports'), getAppointmentReport);
router.get('/patients', checkPermission('generate_reports'), getPatientReport);
router.get('/medicines', checkPermission('generate_reports'), getMedicineReport);

module.exports = router;
