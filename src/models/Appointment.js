const mongoose = require('mongoose');
const {
  appointmentDisplayId,
  nextAvailableDisplayId,
} = require('../utils/publicIds');

// A single medication line within a prescription.
const medicationSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  dosage: { type: String, trim: true },
  frequency: { type: String, trim: true },
  duration: { type: String, trim: true },
  instructions: { type: String, trim: true }
}, { _id: true });

// Structured prescription written by the doctor for this visit.
const prescriptionSchema = new mongoose.Schema({
  medications: [medicationSchema],
  notes: { type: String, trim: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now }
}, { _id: true });

const appointmentSchema = new mongoose.Schema({
  patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
  doctor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  date: { type: Date, required: true },
  time: { type: String, required: true },
  endTime: { type: String },
  status: {
    // §3.2 (OQ#3=Option B): 'Confirmed' added so staff can confirm a 'Waiting'
    // request before the visit. Additive — existing rows keep the 4 original
    // statuses; nothing is migrated. The partial unique index still treats only
    // 'Cancelled' as freeing the slot, so a 'Confirmed' appointment holds its
    // slot exactly like 'Waiting'/'In Consultation'/'Completed'.
    type: String,
    enum: ['Waiting', 'Confirmed', 'In Consultation', 'Completed', 'Cancelled'],
    default: 'Waiting'
  },
  notes: { type: String },
  reason: { type: String },
  // Structured prescription attached by the doctor (write path: staff endpoint;
  // read path: patient portal). Null until a doctor writes one.
  prescription: { type: prescriptionSchema, default: null },
  // Who the visit is for. `patient` always stays the registered portal user
  // (the booker) so existing ownership/scoping checks remain valid; this
  // records the actual subject of the visit when it is a dependent.
  bookedFor: {
    type: { type: String, enum: ['myself', 'dependent'], default: 'myself' },
    dependentId: { type: mongoose.Schema.Types.ObjectId },
    dependentName: { type: String, trim: true }
  },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  // BE-16: audit trail for status changes. Both fields are additive — existing
  // rows have undefined/null values and are not migrated. Set by the doctor-side
  // updateAppointment controller whenever it changes `status`. Stored on the
  // appointment itself (not a separate audit collection) so the trail travels
  // with the record and survives no extra join on read.
  lastStatusChangedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  lastStatusChangedAt: { type: Date },
  /** Stable clinic UUID for multi-tenant scoping (matches User.clinicId). */
  clinicId: { type: String, index: true },
  // Soft-delete marker (audit BE-8). Null/missing = active; a Date = deleted.
  // Read paths filter `deletedAt: null` (matches both null and missing) so
  // soft-deleted rows stop appearing. The doctor-side deleteAppointment sets
  // this instead of removing the row, keeping deletes auditable/recoverable.
  deletedAt: { type: Date, default: null, index: true },
  // Human-readable public code (e.g. APP_202607041430). Generated pre-save
  // from `date`. Sparse + unique across the entire collection. The BE
  // controllers accept this code as an alias for `_id` on /:id lookups via
  // the resolveByIdOrCode helper. See scripts/backfillPublicIds.js to seed
  // historical rows.
  displayId: { type: String, unique: true, sparse: true, index: true }
}, { timestamps: true });

appointmentSchema.index({ patient: 1 });
appointmentSchema.index({ status: 1 });
appointmentSchema.index({ clinicId: 1, date: 1 });
// Prevent the same doctor from being double-booked at the same date/time.
// PARTIAL: cancelled appointments free up the slot for rebooking. The
// `partialFilterExpression` MUST stay in sync with the `status: { $ne: 'Cancelled' }`
// filter used by isSlotTaken / getBookedTimes in utils/appointmentSlots.js —
// if you change one, change the other. See scripts/syncAppointmentIndexes.js
// for the one-off migration that swaps the old non-partial unique index for
// this one (drops the old index, creates this partial index).
appointmentSchema.index(
  { doctor: 1, date: 1, time: 1 },
  { unique: true, partialFilterExpression: { status: { $ne: 'Cancelled' } } }
);

// Allowed status transitions for an appointment. Terminal states (Completed,
// Cancelled) cannot transition further. 'Confirmed' behaves like 'Waiting' for
// transitions — a confirmed appointment can still be cancelled or moved into
// consultation, and a 'Waiting' request can be confirmed by staff. Audit BE-6 /
// DB-3 / §3.2 (OQ#3=Option B).
const ALLOWED_TRANSITIONS = {
  Waiting: ['Confirmed', 'In Consultation', 'Completed', 'Cancelled'],
  Confirmed: ['In Consultation', 'Completed', 'Cancelled'],
  'In Consultation': ['Completed', 'Cancelled'],
  Completed: [],
  Cancelled: [],
};

function validateStatusTransition(from, to) {
  if (from === to) return true;
  const allowed = ALLOWED_TRANSITIONS[from] || [];
  return allowed.includes(to);
}

// Defense-in-depth: enforce the transition table on every save() path. The
// doctor-side updateAppointment uses findOneAndUpdate (which bypasses hooks),
// so it also validates at the controller layer. Mongoose does not expose the
// previous field value directly, so a one-shot query is needed when status is
// modified on an existing document. Audit DB-3.
appointmentSchema.pre('validate', async function () {
  if (this.isNew || !this.isModified('status')) return;
  const previous = await this.constructor.findById(this._id).select('status -_id');
  const from = previous ? previous.status : this.status;
  if (!validateStatusTransition(from, this.status)) {
    const err = new Error(`Invalid status transition from '${from}' to '${this.status}'.`);
    err.name = 'ValidationError';
    throw err;
  }
});

// Generate a globally unique displayId (e.g. APP_202607041430) on first save
// for new rows. Idempotent: skips when displayId is already set, so the
// backfill script can re-run safely.
appointmentSchema.pre('save', async function () {
  if (this.displayId) return;
  const base = appointmentDisplayId(this.date);
  this.displayId = await nextAvailableDisplayId(this.constructor, base);
});

const Appointment = mongoose.model('Appointment', appointmentSchema);
module.exports = Appointment;
module.exports.ALLOWED_TRANSITIONS = ALLOWED_TRANSITIONS;
module.exports.validateStatusTransition = validateStatusTransition;
