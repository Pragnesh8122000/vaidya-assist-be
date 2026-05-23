const mongoose = require('mongoose');

const fileSchema = new mongoose.Schema({
  filename: { type: String, required: true },
  originalName: { type: String, required: true },
  path: { type: String, required: true },
  mimetype: { type: String, required: true },
  size: { type: Number },
  patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient' },
  type: {
    type: String,
    enum: ['Medical Report', 'Prescription', 'Lab Result', 'Scan', 'Other'],
    default: 'Other'
  },
  description: { type: String },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

fileSchema.index({ patient: 1 });
fileSchema.index({ type: 1 });

module.exports = mongoose.model('File', fileSchema);
