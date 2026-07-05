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

    // CR-3: join user-specific and clinic-specific rooms so emits can be
    // targeted instead of broadcast globally. The clinic room lets presence
    // and per-clinic events stay within a clinic; never broadcast presence
    // across clinics.
    const clinicId = socket.user.clinicId;
    socket.join(`user:${socket.user._id}`);
    if (clinicId) {
      socket.join(`clinic:${clinicId}`);
      io.to(`clinic:${clinicId}`).emit('user:online', { userId: socket.user._id, name: socket.user.name });
    } else {
      // No clinic (should not happen — User.clinicId has a uuid default): fall
      // back to the user's own room rather than a global broadcast.
      socket.emit('user:online', { userId: socket.user._id, name: socket.user.name });
    }

    // Get online users
    socket.on('users:getOnline', () => {
      socket.emit('users:online', Array.from(onlineUsers.keys()));
    });

    // Disconnect
    socket.on('disconnect', () => {
      console.log(`User disconnected: ${socket.user.name}`);
      onlineUsers.delete(socket.user._id.toString());
      // CR-3: scope offline presence to the same clinic room, never global.
      if (clinicId) {
        io.to(`clinic:${clinicId}`).emit('user:offline', { userId: socket.user._id });
      }
    });
  });

  return io;
};

module.exports = setupSocket;
