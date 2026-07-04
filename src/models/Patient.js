const mongoose = require('mongoose');
const {
  patientDisplayId,
  nextAvailableDisplayId,
} = require('../utils/publicIds');

const medicalNoteSchema = new mongoose.Schema({
  note: { type: String, required: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now }
});

// A family member / dependent the patient can book appointments on behalf of.
// Stored inline so no cross-Patient scoping is required — the registered
// patient remains the accountable portal user (and the Appointment.patient).
const dependentSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  age: { type: Number },
  gender: { type: String, enum: ['Male', 'Female', 'Other'] },
  bloodGroup: { type: String },
  relation: { type: String, required: true, trim: true }
}, { timestamps: true });

const patientSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  age: { type: Number },
  gender: { type: String, enum: ['Male', 'Female', 'Other'] },
  phone: { type: String, trim: true },
  email: { type: String, lowercase: true, trim: true },
  address: { type: String },
  bloodGroup: { type: String },
  medicalNotes: [medicalNoteSchema],
  dependents: [dependentSchema],
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  /** Stable clinic UUID for multi-tenant scoping (matches User.clinicId). */
  clinicId: { type: String, index: true },
  // Human-readable public code (e.g. PT_202607041430). Generated pre-save
  // from `createdAt`. Sparse + unique across the entire collection. The BE
  // controllers accept this code as an alias for `_id` on /:id lookups via
  // the resolveByIdOrCode helper. See scripts/backfillPublicIds.js to seed
  // historical rows.
  displayId: { type: String, unique: true, sparse: true, index: true }
}, { timestamps: true });

patientSchema.index({ name: 'text', phone: 'text', email: 'text' });
patientSchema.index({ createdBy: 1 });
patientSchema.index({ clinicId: 1, createdAt: -1 });

// Generate a globally unique displayId on first save. Idempotent — skips
// when the field is already set, so the backfill script can re-run safely.
patientSchema.pre('save', async function () {
  if (this.displayId) return;
  const base = patientDisplayId(this.createdAt || new Date());
  this.displayId = await nextAvailableDisplayId(this.constructor, base);
});

module.exports = mongoose.model('Patient', patientSchema);
