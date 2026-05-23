const mongoose = require('mongoose');

const medicineSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  genericName: { type: String, trim: true },
  stock: { type: Number, required: true, default: 0 },
  batchNumber: { type: String, trim: true },
  expiryDate: { type: Date },
  supplier: { type: String, trim: true },
  price: { type: Number, default: 0 },
  category: { type: String, trim: true },
  description: { type: String },
  lowStockThreshold: { type: Number, default: 10 },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

medicineSchema.index({ name: 'text', genericName: 'text' });
medicineSchema.index({ expiryDate: 1 });

module.exports = mongoose.model('Medicine', medicineSchema);
