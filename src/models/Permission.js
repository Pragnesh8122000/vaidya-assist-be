const mongoose = require('mongoose');

const permissionSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  slug: { type: String, required: true, unique: true },
  module: { type: String, required: true },
  description: { type: String }
}, { timestamps: true });

permissionSchema.index({ module: 1 });

module.exports = mongoose.model('Permission', permissionSchema);
