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
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

appointmentSchema.index({ date: 1, doctor: 1 });
appointmentSchema.index({ patient: 1 });
appointmentSchema.index({ status: 1 });

module.exports = mongoose.model('Appointment', appointmentSchema);
