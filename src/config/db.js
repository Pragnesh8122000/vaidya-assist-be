const mongoose = require('mongoose');

const connectDB = async () => {
  if (!process.env.MONGODB_URI) {
    console.error('MONGODB Error: MONGODB_URI env var is not set.');
    process.exit(1);
  }

  // Log the URI host (not the password) for debugging Atlas connection issues.
  // Parses both mongodb:// and mongodb+srv:// schemes.
  try {
    const parsed = new URL(process.env.MONGODB_URI);
    console.log(`Connecting to MongoDB at ${parsed.host}...`);
  } catch {
    console.log('Connecting to MongoDB (URI format unparseable)...');
  }

  // bufferCommands: false => queries fail fast with a clear error
  // instead of silently buffering for 10s when the connection is down.
  // serverSelectionTimeoutMS: fail connect attempts quickly so a
  // paused/blocked Atlas cluster doesn't hang the boot indefinitely.
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      bufferCommands: false,
      serverSelectionTimeoutMS: 10000,
    });
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`MongoDB Error: ${error.message}`);
    console.error('If using Atlas, check: cluster is running (not paused), IP 0.0.0.0/0 is allowlisted, and the password is correct.');
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
