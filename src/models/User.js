const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true, select: false },
  phone: { type: String, trim: true },
  role: { type: mongoose.Schema.Types.ObjectId, ref: 'Role', required: true },
  /** Stable external UUID for this doctor/staff. Used by agent-service for scoping. */
  doctorId: { type: String, unique: true, sparse: true, default: () => uuidv4() },
  /** Stable external UUID for the clinic this doctor/staff belongs to. */
  clinicId: { type: String, unique: true, sparse: true, default: () => uuidv4() },
  avatar: { type: String },
  isActive: { type: Boolean, default: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  refreshToken: { type: String, select: false },
  lastLogin: { type: Date },
  patientProfile: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient' }
}, { timestamps: true });

userSchema.index({ role: 1 });

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  delete obj.refreshToken;
  return obj;
};

/**
 * Ensure the user has stable doctorId/clinicId UUIDs.
 *
 * Existing users created before these fields were added may be missing them.
 * This method generates them lazily and persists the document.
 */
userSchema.methods.ensureIdFields = async function () {
  let modified = false;
  if (!this.doctorId) {
    this.doctorId = uuidv4();
    modified = true;
  }
  if (!this.clinicId) {
    this.clinicId = uuidv4();
    modified = true;
  }
  if (modified) {
    await this.save();
  }
  return this;
};

module.exports = mongoose.model('User', userSchema);
