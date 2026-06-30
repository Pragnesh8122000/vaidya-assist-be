const mongoose = require('mongoose');

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
    type: String,
    enum: ['Waiting', 'In Consultation', 'Completed', 'Cancelled'],
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
  /** Stable clinic UUID for multi-tenant scoping (matches User.clinicId). */
  clinicId: { type: String, index: true }
}, { timestamps: true });

appointmentSchema.index({ patient: 1 });
appointmentSchema.index({ status: 1 });
appointmentSchema.index({ clinicId: 1, date: 1 });
// Prevent the same doctor from being double-booked at the same date/time.
appointmentSchema.index({ doctor: 1, date: 1, time: 1 }, { unique: true });

module.exports = mongoose.model('Appointment', appointmentSchema);
