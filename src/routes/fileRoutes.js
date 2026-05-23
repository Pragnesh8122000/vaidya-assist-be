const router = require('express').Router();
const { auth, checkPermission } = require('../middleware/auth');
const upload = require('../middleware/upload');
const { uploadFile, getFiles, downloadFile, deleteFile } = require('../controllers/fileController');

router.use(auth);

router.get('/', checkPermission('view_files'), getFiles);
router.post('/', checkPermission('upload_files'), upload.single('file'), uploadFile);
router.get('/:id/download', checkPermission('view_files'), downloadFile);
router.delete('/:id', checkPermission('upload_files'), deleteFile);

module.exports = router;
