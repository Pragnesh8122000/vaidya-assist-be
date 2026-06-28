require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
require('../src/models/Appointment');
require('../src/models/Patient');
require('../src/models/User');

const USER_ID = '6a40cf4b26bd710957393fb3';
const PATIENT_ID = '6a40cf4b26bd710957393fb5';

async function cleanup() {
  await mongoose.connect(process.env.MONGODB_URI);

  const appointmentsResult = await mongoose
    .model('Appointment')
    .deleteMany({ patient: new mongoose.Types.ObjectId(PATIENT_ID) });

  const patientResult = await mongoose
    .model('Patient')
    .deleteOne({ _id: new mongoose.Types.ObjectId(PATIENT_ID) });

  const userResult = await mongoose
    .model('User')
    .deleteOne({ _id: new mongoose.Types.ObjectId(USER_ID) });

  console.log('Cleanup complete:', {
    appointmentsDeleted: appointmentsResult.deletedCount,
    patientDeleted: patientResult.deletedCount,
    userDeleted: userResult.deletedCount,
  });

  await mongoose.disconnect();
}

cleanup().catch((err) => {
  console.error('Cleanup failed:', err.message);
  process.exit(1);
});
