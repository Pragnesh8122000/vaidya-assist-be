const router = require('express').Router();
const { auth, checkPermission } = require('../middleware/auth');
const { getUsers, createUser, updateUser, deleteUser, getRoles, createRole, updateRole, deleteRole, getPermissions } = require('../controllers/userController');

router.use(auth);

router.get('/', checkPermission('manage_assistants'), getUsers);
router.post('/', checkPermission('manage_assistants'), createUser);
router.put('/:id', checkPermission('manage_assistants'), updateUser);
router.delete('/:id', checkPermission('manage_assistants'), deleteUser);

router.get('/roles', checkPermission('manage_roles'), getRoles);
router.post('/roles', checkPermission('manage_roles'), createRole);
router.put('/roles/:id', checkPermission('manage_roles'), updateRole);
router.delete('/roles/:id', checkPermission('manage_roles'), deleteRole);

router.get('/permissions', checkPermission('manage_roles'), getPermissions);

module.exports = router;
