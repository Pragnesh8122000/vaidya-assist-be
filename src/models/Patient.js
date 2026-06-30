const mongoose = require('mongoose');

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
  clinicId: { type: String, index: true }
}, { timestamps: true });

patientSchema.index({ name: 'text', phone: 'text', email: 'text' });
patientSchema.index({ createdBy: 1 });
patientSchema.index({ clinicId: 1, createdAt: -1 });

module.exports = mongoose.model('Patient', patientSchema);
