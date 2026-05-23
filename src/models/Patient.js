const mongoose = require('mongoose');

const medicalNoteSchema = new mongoose.Schema({
  note: { type: String, required: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now }
});

const patientSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  age: { type: Number },
  gender: { type: String, enum: ['Male', 'Female', 'Other'] },
  phone: { type: String, trim: true },
  email: { type: String, lowercase: true, trim: true },
  address: { type: String },
  bloodGroup: { type: String },
  medicalNotes: [medicalNoteSchema],
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

patientSchema.index({ name: 'text', phone: 'text', email: 'text' });
patientSchema.index({ createdBy: 1 });

module.exports = mongoose.model('Patient', patientSchema);
