const mongoose = require('mongoose');
require('./Permission');

const roleSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  slug: { type: String, required: true, unique: true },
  description: { type: String },
  permissions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Permission' }],
  isDefault: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model('Role', roleSchema);
