const Chat = require('../models/Chat');
const Message = require('../models/Message');

// Get user's chats
exports.getChats = async (req, res, next) => {
  try {
    const chats = await Chat.find({ participants: req.user._id })
      .populate('participants', 'name email avatar isActive')
      .sort('-lastMessageAt');

    res.json({ success: true, data: chats });
  } catch (error) {
    next(error);
  }
};

// Create or get existing chat
exports.createChat = async (req, res, next) => {
  try {
    const { userId } = req.body;

    // Check if chat already exists
    let chat = await Chat.findOne({
      participants: { $all: [req.user._id, userId], $size: 2 }
    }).populate('participants', 'name email avatar isActive');

    if (chat) {
      return res.json({ success: true, data: chat });
    }

    chat = await Chat.create({
      participants: [req.user._id, userId]
    });

    chat = await Chat.findById(chat._id).populate('participants', 'name email avatar isActive');

    res.status(201).json({ success: true, data: chat });
  } catch (error) {
    next(error);
  }
};

// Get messages for a chat
exports.getMessages = async (req, res, next) => {
  try {
    const { page = 1, limit = 50 } = req.query;

    const messages = await Message.find({ chat: req.params.chatId })
      .populate('sender', 'name avatar')
      .sort('-createdAt')
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    res.json({ success: true, data: messages.reverse() });
  } catch (error) {
    next(error);
  }
};

// Send message
exports.sendMessage = async (req, res, next) => {
  try {
    const { content } = req.body;

    const message = await Message.create({
      chat: req.params.chatId,
      sender: req.user._id,
      content,
      readBy: [req.user._id]
    });

    // Update chat's last message
    await Chat.findByIdAndUpdate(req.params.chatId, {
      lastMessage: content,
      lastMessageAt: new Date()
    });

    const populated = await Message.findById(message._id)
      .populate('sender', 'name avatar');

    // Emit socket event
    const io = req.app.get('io');
    if (io) {
      io.to(`chat:${req.params.chatId}`).emit('chat:message', populated);
    }

    res.status(201).json({ success: true, data: populated });
  } catch (error) {
    next(error);
  }
};

// Mark messages as read
exports.markAsRead = async (req, res, next) => {
  try {
    await Message.updateMany(
      { chat: req.params.chatId, readBy: { $ne: req.user._id } },
      { $push: { readBy: req.user._id } }
    );
    res.json({ success: true, message: 'Messages marked as read.' });
  } catch (error) {
    next(error);
  }
};
