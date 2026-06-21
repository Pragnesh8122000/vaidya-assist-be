const router = require('express').Router();
const { auth, checkPermission } = require('../middleware/auth');
const { verifyServiceKey } = require('../middleware/verifyServiceKey');
const { getMedicines, getMedicine, createMedicine, updateMedicine, deleteMedicine, getLowStock, getExpiringSoon } = require('../controllers/medicineController');

router.use(auth);

router.get('/', checkPermission('view_medicines'), getMedicines);
router.get('/low-stock', checkPermission('view_medicines'), verifyServiceKey, getLowStock);
router.get('/expiring-soon', checkPermission('view_medicines'), getExpiringSoon);
router.get('/:id', checkPermission('view_medicines'), getMedicine);
router.post('/', checkPermission('manage_medicines'), createMedicine);
router.put('/:id', checkPermission('manage_medicines'), updateMedicine);
router.delete('/:id', checkPermission('manage_medicines'), deleteMedicine);

module.exports = router;
