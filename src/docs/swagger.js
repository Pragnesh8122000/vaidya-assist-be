const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Vaidya Assist API',
      version: '1.0.0',
      description: 'Doctor Assistant Management System API',
    },
    servers: [{ url: '/api', description: 'API Server' }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
    security: [{ bearerAuth: [] }],
    tags: [
      { name: 'Auth', description: 'Authentication endpoints' },
      { name: 'Users', description: 'User management' },
      { name: 'Patients', description: 'Patient management' },
      { name: 'Appointments', description: 'Appointment management' },
      { name: 'Medicines', description: 'Medicine inventory' },
      { name: 'Files', description: 'File management' },
      { name: 'Reports', description: 'Report generation' },
      { name: 'Chat', description: 'Messaging' },
      { name: 'Dashboard', description: 'Dashboard analytics' },
      { name: 'Notifications', description: 'Notification management' },
    ],
  },
  apis: ['./src/routes/*.js'],
};

module.exports = swaggerJsdoc(options);
