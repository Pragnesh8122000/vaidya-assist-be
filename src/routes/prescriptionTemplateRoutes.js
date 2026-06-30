const router = require('express').Router();
const { auth, checkPermission } = require('../middleware/auth');
const {
  getTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
} = require('../controllers/prescriptionTemplateController');

router.use(auth);

// Reuse existing appointment permissions: viewing appointments lets staff read
// templates; managing appointments lets them author templates. Doctors
// (role.slug === 'doctor') are super-admin and pass automatically.
router.get('/', checkPermission('view_appointments'), getTemplates);
router.post('/', checkPermission('manage_appointments'), createTemplate);
router.put('/:id', checkPermission('manage_appointments'), updateTemplate);
router.delete('/:id', checkPermission('manage_appointments'), deleteTemplate);

module.exports = router;