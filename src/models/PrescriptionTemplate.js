const mongoose = require('mongoose');

// Reusable medication line, mirroring Appointment.prescription.medications.
const medicationSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  dosage: { type: String, trim: true },
  frequency: { type: String, trim: true },
  duration: { type: String, trim: true },
  instructions: { type: String, trim: true }
}, { _id: true });

// Doctor-defined prescription template for quick attachment to a completed
// visit. Clinic-scoped so staff in the same clinic share templates.
const prescriptionTemplateSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  description: { type: String, trim: true },
  medications: [medicationSchema],
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  /** Stable clinic UUID for multi-tenant scoping (matches User.clinicId). */
  clinicId: { type: String, index: true }
}, { timestamps: true });

prescriptionTemplateSchema.index({ clinicId: 1, createdAt: -1 });

module.exports = mongoose.model('PrescriptionTemplate', prescriptionTemplateSchema);