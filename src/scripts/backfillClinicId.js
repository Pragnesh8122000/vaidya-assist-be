const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../../.env') });

const connectDB = require('../config/db');
const User = require('../models/User');
const Patient = require('../models/Patient');
const Appointment = require('../models/Appointment');
const Medicine = require('../models/Medicine');

async function backfill() {
  await connectDB();
  console.log('🔧 Starting clinicId backfill...');

  // Ensure every user has a clinicId
  const users = await User.find({});
  for (const user of users) {
    await user.ensureIdFields();
  }
  console.log(`✅ Ensured clinicId on ${users.length} users`);

  // Backfill patients by createdBy -> user.clinicId
  const patients = await Patient.find({ clinicId: { $exists: false } });
  for (const p of patients) {
    const creator = await User.findById(p.createdBy);
    if (creator?.clinicId) {
      p.clinicId = creator.clinicId;
      await p.save();
    }
  }
  console.log(`✅ Backfilled ${patients.length} patients`);

  // Backfill appointments by doctor -> user.clinicId, fallback createdBy
  const appointments = await Appointment.find({ clinicId: { $exists: false } });
  for (const a of appointments) {
    const doctor = await User.findById(a.doctor);
    const creator = await User.findById(a.createdBy);
    const clinicId = doctor?.clinicId || creator?.clinicId;
    if (clinicId) {
      a.clinicId = clinicId;
      await a.save();
    }
  }
  console.log(`✅ Backfilled ${appointments.length} appointments`);

  // Backfill medicines by createdBy -> user.clinicId
  const medicines = await Medicine.find({ clinicId: { $exists: false } });
  for (const m of medicines) {
    const creator = await User.findById(m.createdBy);
    if (creator?.clinicId) {
      m.clinicId = creator.clinicId;
      await m.save();
    }
  }
  console.log(`✅ Backfilled ${medicines.length} medicines`);

  console.log('🎉 Backfill complete');
  process.exit(0);
}

backfill().catch((err) => {
  console.error('❌ Backfill failed:', err);
  process.exit(1);
});
