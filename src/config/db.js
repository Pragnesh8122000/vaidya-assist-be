const mongoose = require('mongoose');

const connectDB = async () => {
  if (!process.env.MONGODB_URI) {
    console.error('MONGODB Error: MONGODB_URI env var is not set.');
    process.exit(1);
  }

  // bufferCommands: false => queries fail fast with a clear error
  // instead of silently buffering for 10s when the connection is down.
  // serverSelectionTimeoutMS: fail connect attempts quickly so Render
  // cold starts don't hang for 30s.
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      bufferCommands: false,
      serverSelectionTimeoutMS: 10000,
    });
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`MongoDB Error: ${error.message}`);
    process.exit(1);
  }

  // Surface connection-state changes in Render logs so we can see
  // disconnects/reconnects instead of guessing why queries time out.
  mongoose.connection.on('disconnected', () => {
    console.warn('MongoDB disconnected. Mongoose will attempt to reconnect...');
  });
  mongoose.connection.on('reconnected', () => {
    console.log('MongoDB reconnected.');
  });
  mongoose.connection.on('error', (err) => {
    console.error(`MongoDB runtime error: ${err.message}`);
  });
};

module.exports = connectDB;
