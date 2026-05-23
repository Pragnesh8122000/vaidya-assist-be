const router = require('express').Router();
const { auth, checkPermission } = require('../middleware/auth');
const { getPatients, getPatient, createPatient, updatePatient, deletePatient, addMedicalNote } = require('../controllers/patientController');

router.use(auth);

router.get('/', checkPermission('view_patients'), getPatients);
router.get('/:id', checkPermission('view_patients'), getPatient);
router.post('/', checkPermission('manage_patients'), createPatient);
router.put('/:id', checkPermission('manage_patients'), updatePatient);
router.delete('/:id', checkPermission('manage_patients'), deletePatient);
router.post('/:id/notes', checkPermission('manage_patients'), addMedicalNote);

module.exports = router;
