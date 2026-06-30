require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const swaggerUi = require('swagger-ui-express');

const connectDB = require('./config/db');
const errorHandler = require('./middleware/errorHandler');
const swaggerSpec = require('./docs/swagger');
const setupSocket = require('./socket');

// Route imports
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const patientRoutes = require('./routes/patientRoutes');
const doctorRoutes = require('./routes/doctorRoutes');
const patientAppointmentRoutes = require('./routes/patientAppointmentRoutes');
const appointmentRoutes = require('./routes/appointmentRoutes');
const medicineRoutes = require('./routes/medicineRoutes');
const fileRoutes = require('./routes/fileRoutes');
const reportRoutes = require('./routes/reportRoutes');
const chatRoutes = require('./routes/chatRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const notificationRoutes = require('./routes/notificationRoutes');

const startServer = async () => {
  // Connect to MongoDB first. If this fails, connectDB() calls process.exit(1)
  // and the server never starts — which is what we want, because every route
  // depends on the DB. Without this, mongoose only attempts to connect lazily
  // on the first findOne(), which then sits in the buffer queue and times out.
  await connectDB();

  const app = express();
  const server = http.createServer(app);

  const ALLOWED_ORIGINS = [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:5175',
    'https://vaidya-assist-be.onrender.com',
    'https://vaidya-assist-fe.vercel.app',
    'https://vaidya-assist-appointment.vercel.app'
  ];

  const io = new Server(server, {
    cors: {
      origin: process.env.CLIENT_URL || ALLOWED_ORIGINS,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      credentials: true,
    }
  });

  app.use(cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      if (ALLOWED_ORIGINS.includes(origin) || process.env.CLIENT_URL === origin) {
        return callback(null, true);
      }
      return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }));

  app.options('*', cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(morgan('dev'));

  // Static files (uploads)
  app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

  // API Documentation
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

  // Routes
  app.use('/api/auth', authRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/patients', patientRoutes);
  app.use('/api/doctors', doctorRoutes);
  app.use('/api/patient-portal', patientAppointmentRoutes);
  app.use('/api/appointments', appointmentRoutes);
  app.use('/api/medicines', medicineRoutes);
  app.use('/api/files', fileRoutes);
  app.use('/api/reports', reportRoutes);
  app.use('/api/chats', chatRoutes);
  app.use('/api/dashboard', dashboardRoutes);
  app.use('/api/notifications', notificationRoutes);

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({ success: true, message: 'Vaidya Assist API is running', timestamp: new Date() });
  });

  // Error handler
  app.use(errorHandler);

  const PORT = process.env.PORT || 5000;
  server.listen(PORT, () => {
    console.log(`\n🏥 Vaidya Assist Server running on port ${PORT}`);
    console.log(`📚 API Docs: http://localhost:${PORT}/api-docs`);
    console.log(`🔗 API: http://localhost:${PORT}/api`);
  });
};

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
