const mongoose = require('mongoose');

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
