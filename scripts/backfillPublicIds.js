// One-off migration that seeds the human-readable public codes (audit #24).
//
//   Appointment.displayId  — APP_YYYYMMDDHHMM (UTC, from `date`)
//   Patient.displayId      — PT_YYYYMMDDHHMM  (UTC, from `createdAt`)
//   User.username          — slugified name, e.g. dr.rajesh.sharma
//
// New rows are generated lazily by the model pre-save hooks. This script
// covers historical rows so the new controller alias resolvers (and the
// chat assistant) can find every existing record by code.
//
// IDEMPOTENT: rows that already have the field are skipped. Re-runnable.
//
// COLLISION HANDLING: if two appointments/patients share the same
// UTC minute (or two users share the same name slug), the candidate
// selector (`nextAvailable*`) probes for an unused suffix. A 11000
// duplicate-key error from Mongo is caught and counted as a collision
// — the row is skipped without aborting the migration, so the operator
// can re-run after seeding the missing one manually.
//
// Run from the vaidya-assist-be directory:
//   node scripts/backfillPublicIds.js
// (loads .env for MONGO_URI, or set MONGO_URI in the environment)

require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const Appointment = require('../src/models/Appointment');
const Patient = require('../src/models/Patient');
const User = require('../src/models/User');
const {
  appointmentDisplayId,
  patientDisplayId,
  slugifyUsername,
  nextAvailableDisplayId,
  nextAvailableUsername,
} = require('../src/utils/publicIds');

/**
 * Stream rows missing the given field, generate a value, and save.
 *
 * @param {Model} model              Mongoose model.
 * @param {string} field             Field to populate (e.g. 'displayId').
 * @param {function(object):string}  buildBase  Returns the base code for a row.
 * @param {function}                 pickNext  Async (model, base) -> value.
 * @returns {Promise<{updated:number, skipped:number, collisions:number, errors:number}>}
 */
async function backfill(model, field, buildBase, pickNext) {
  const cursor = model
    .find({ [field]: { $exists: false } })
    .cursor({ batchSize: 100 });

  let updated = 0;
  let skipped = 0;
  let collisions = 0;
  let errors = 0;

  for await (const doc of cursor) {
    const base = buildBase(doc);
    try {
      const value = await pickNext(model, base);
      doc[field] = value;
      doc.markModified(field);
      await doc.save();
      updated++;
    } catch (e) {
      if (e && e.code === 11000) {
        // Duplicate-key: a concurrent write (or a row we already updated in
        // a prior pass) took our candidate. Skip and keep going.
        collisions++;
        continue;
      }
      console.error(`   ! ${model.modelName}._id=${doc._id} (base=${base}): ${e.message}`);
      errors++;
    }
  }

  return { updated, skipped, collisions, errors };
}

async function run() {
  await connectDB();
  console.log('Connected to MongoDB. Backfilling public IDs…\n');

  // 1. Appointment.displayId from `date`.
  const a = await backfill(
    Appointment,
    'displayId',
    (d) => appointmentDisplayId(d.date),
    nextAvailableDisplayId,
  );
  console.log(
    `Appointment.displayId: updated=${a.updated} ` +
    `skipped=${a.skipped} collisions=${a.collisions} errors=${a.errors}`,
  );

  // 2. Patient.displayId from `createdAt` (fall back to _id.getTimestamp()
  //    for legacy rows where createdAt is missing).
  const p = await backfill(
    Patient,
    'displayId',
    (d) => patientDisplayId(d.createdAt || d._id.getTimestamp()),
    nextAvailableDisplayId,
  );
  console.log(
    `Patient.displayId:     updated=${p.updated} ` +
    `skipped=${p.skipped} collisions=${p.collisions} errors=${p.errors}`,
  );

  // 3. User.username from `name`.
  const u = await backfill(
    User,
    'username',
    (d) => slugifyUsername(d.name),
    nextAvailableUsername,
  );
  console.log(
    `User.username:         updated=${u.updated} ` +
    `skipped=${u.skipped} collisions=${u.collisions} errors=${u.errors}`,
  );

  const totalErrors = a.errors + p.errors + u.errors;
  if (totalErrors > 0) {
    console.error(`\n❌ Migration finished with ${totalErrors} error(s). See logs above.`);
    process.exitCode = 1;
  } else {
    console.log('\n✅ Done. Re-runnable: existing values are not overwritten.');
  }
}

run()
  .then(() => mongoose.disconnect())
  .catch((err) => {
    console.error('Migration failed:', err);
    process.exitCode = 1;
    mongoose.disconnect();
  });
