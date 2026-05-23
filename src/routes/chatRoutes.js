const router = require('express').Router();
const { auth } = require('../middleware/auth');
const { getChats, createChat, getMessages, sendMessage, markAsRead } = require('../controllers/chatController');

router.use(auth);

router.get('/', getChats);
router.post('/', createChat);
router.get('/:chatId/messages', getMessages);
router.post('/:chatId/messages', sendMessage);
router.put('/:chatId/read', markAsRead);

module.exports = router;
