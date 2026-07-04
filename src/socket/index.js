const jwt = require('jsonwebtoken');
const User = require('../models/User');

const onlineUsers = new Map();

const setupSocket = (io) => {
  // Auth middleware for socket connections
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (!token) return next(new Error('Authentication required'));

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id).populate('role');
      if (!user) return next(new Error('User not found'));

      socket.user = user;
      next();
    } catch (error) {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`User connected: ${socket.user.name} (${socket.user._id})`);

    // Track online status
    onlineUsers.set(socket.user._id.toString(), socket.id);
    io.emit('user:online', { userId: socket.user._id, name: socket.user.name });

    // Join user-specific room
    socket.join(`user:${socket.user._id}`);

    // Get online users
    socket.on('users:getOnline', () => {
      socket.emit('users:online', Array.from(onlineUsers.keys()));
    });

    // Disconnect
    socket.on('disconnect', () => {
      console.log(`User disconnected: ${socket.user.name}`);
      onlineUsers.delete(socket.user._id.toString());
      io.emit('user:offline', { userId: socket.user._id });
    });
  });

  return io;
};

module.exports = setupSocket;
