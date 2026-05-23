const Notification = require('../models/Notification');

// Get user notifications
exports.getNotifications = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, unreadOnly } = req.query;
    const query = { user: req.user._id };
    if (unreadOnly === 'true') query.read = false;

    const total = await Notification.countDocuments(query);
    const notifications = await Notification.find(query)
      .sort('-createdAt')
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const unreadCount = await Notification.countDocuments({ user: req.user._id, read: false });

    res.json({
      success: true,
      data: notifications,
      unreadCount,
      pagination: { total, page: parseInt(page), pages: Math.ceil(total / limit) }
    });
  } catch (error) {
    next(error);
  }
};

// Mark notification as read
exports.markAsRead = async (req, res, next) => {
  try {
    await Notification.findByIdAndUpdate(req.params.id, { read: true });
    res.json({ success: true, message: 'Marked as read.' });
  } catch (error) {
    next(error);
  }
};

// Mark all as read
exports.markAllAsRead = async (req, res, next) => {
  try {
    await Notification.updateMany({ user: req.user._id, read: false }, { read: true });
    res.json({ success: true, message: 'All marked as read.' });
  } catch (error) {
    next(error);
  }
};

// Create notification helper (used internally)
exports.createNotification = async (userId, title, message, type = 'system', link = '') => {
  try {
    const notification = await Notification.create({ user: userId, title, message, type, link });
    return notification;
  } catch (error) {
    console.error('Notification creation error:', error);
  }
};
