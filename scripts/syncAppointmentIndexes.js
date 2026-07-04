// One-off migration for the cancelled-slot fix (audit DB-1 / BE-1 / BE-2 / BE-3).
//
// Replaces the old non-partial unique index {doctor:1, date:1, time:1} with the
// partial unique index defined in src/models/Appointment.js, so a cancelled
// slot can be rebooked instead of being locked forever.
//
// PRE-CHECK (mandatory): if any {doctor, date, time} triple currently has BOTH
// a Cancelled and a non-Cancelled appointment, the partial unique index CANNOT
// be created — the non-Cancelled duplicate would violate uniqueness. We detect
// this first and exit WITHOUT touching indexes so you can clean up manually,
// then re-run.
//
// Run from the vaidya-assist-be directory:
//   node scripts/syncAppointmentIndexes.js
// (loads .env for MONGO_URI, or set MONGO_URI in the environment)

require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const Appointment = require('../src/models/Appointment');

const OLD_INDEX_NAME = 'doctor_1_date_1_time_1';

// Find {doctor, date, time} triples that contain BOTH a Cancelled appointment
// and a non-Cancelled one. These would block partial-index creation.
async function findCollisions() {
  const rows = await Appointment.aggregate([
    {
      $group: {
        _id: { doctor: '$doctor', date: '$date', time: '$time' },
        statuses: { $addToSet: '$status' },
        count: { $sum: 1 },
        ids: { $push: '$_id' },
      },
    },
    { $match: { statuses: 'Cancelled' } }, // has at least one Cancelled
  ]);
  // Keep only triples that ALSO have a non-Cancelled status.
  return rows.filter(r => r.statuses.some(s => s !== 'Cancelled'));
}

async function run() {
  await connectDB();
  console.log('Connected to MongoDB.');

  // 1. Pre-check for collisions that would block index creation.
  const collisions = await findCollisions();
  if (collisions.length > 0) {
    console.error(
      `\n❌ ABORTING: found ${collisions.length} {doctor,date,time} triple(s) ` +
      `with both a Cancelled and a non-Cancelled appointment.`
    );
    console.error(
      '   The partial unique index cannot be created while these duplicates exist.\n' +
      '   Resolve manually (e.g. delete or re-time the Cancelled duplicate), then re-run.'
    );
    for (const c of collisions) {
      const dateIso = c._id.date ? new Date(c._id.date).toISOString() : 'null';
      console.error(
        `   - doctor=${c._id.doctor} date=${dateIso} time=${c._id.time} ` +
        `statuses=[${c.statuses.join(',')}] ids=[${c.ids.map(String).join(',')}]`
      );
    }
    process.exitCode = 1;
    return;
  }
  console.log('✅ Pre-check clean: no Cancelled+non-Cancelled collisions on {doctor,date,time}.');

  // 2. Drop the old non-partial unique index if it still exists.
  const indexes = await Appointment.collection.listIndexes().toArray();
  const hasOld = indexes.some(i => i.name === OLD_INDEX_NAME);
  if (hasOld) {
    console.log(`Dropping old index "${OLD_INDEX_NAME}"...`);
    await Appointment.collection.dropIndex(OLD_INDEX_NAME);
    console.log('   dropped.');
  } else {
    console.log(`Old index "${OLD_INDEX_NAME}" not present (already migrated or never created).`);
  }

  // 3. Sync schema indexes — creates the new partial unique index.
  const result = await Appointment.syncIndexes();
  console.log('syncIndexes result:', JSON.stringify(result, null, 2));
  console.log('\n✅ Migration complete. The partial unique index is in place.');
}

run()
  .then(() => mongoose.disconnect())
  .catch((err) => {
    console.error('Migration failed:', err);
    process.exitCode = 1;
    mongoose.disconnect();
  });