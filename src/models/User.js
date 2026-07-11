const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const {
  slugifyUsername,
  nextAvailableUsername,
} = require('../utils/publicIds');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  // Password is conditionally required: mandatory for 'password' authProvider,
  // optional for 'google' or 'both' (a user who linked Google may have no password).
  // The custom validator enforces this; existing password-based accounts are unaffected.
  password: {
    type: String,
    select: false,
    validate: {
      validator: function (value) {
        // If authProvider requires a password, it must be set.
        // (Google-only accounts can have a null/undefined password.)
        if (this.authProvider === 'password' || this.authProvider === 'both') {
          return !!value;
        }
        return true; // 'google' authProvider — password is optional
      },
      message: 'Password is required for password-based authentication.',
    },
  },
  phone: { type: String, trim: true },
  role: { type: mongoose.Schema.Types.ObjectId, ref: 'Role', required: true },
  /** Stable external UUID for this doctor/staff. Used by agent-service for scoping. */
  doctorId: { type: String, unique: true, sparse: true, default: () => uuidv4() },
  /** Stable external UUID for the clinic this doctor/staff belongs to. */
  clinicId: { type: String, index: true, default: () => uuidv4() },
  avatar: { type: String },
  isActive: { type: Boolean, default: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  refreshToken: { type: String, select: false },
  lastLogin: { type: Date },
  patientProfile: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient' },
  // Human-readable handle (e.g. "dr.rajesh.sharma"). Derived pre-save from
  // `name`; collisions append a digit ("priya.patel2"). Distinct from
  // `doctorId` (the stable internal UUID) so we never expose that. Used by
  // the chat assistant and shown in the staff Assistants table. Sparse +
  // unique across the entire collection. See scripts/backfillPublicIds.js
  // to seed historical rows.
  username: { type: String, unique: true, sparse: true, index: true },
  // --- Google Sign-In fields ---
  // Google sub claim (unique per Google account). Sparse so only documents
  // that have a googleId get an index entry; password-only users are unaffected.
  googleId: { type: String, unique: true, sparse: true },
  // Tracks which authentication methods the user has used. 'password' =
  // email/password only, 'google' = Google Sign-In only (no password set),
  // 'both' = user has linked both methods.
  authProvider: { type: String, enum: ['password', 'google', 'both'], default: 'password' },
  // Set to false when a new patient account is created via Google Sign-In and
  // has not yet filled in required profile fields. Defaults to true so that
  // existing accounts and password-based registrations (which collect all
  // fields upfront) are not blocked.
  profileComplete: { type: Boolean, default: true },
}, { timestamps: true });

userSchema.index({ role: 1 });

userSchema.pre('save', async function (next) {
  // Google-only accounts may have no password. Only hash when present and modified.
  if (!this.isModified('password') || !this.password) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Generate a globally unique username slug on first save. Idempotent —
// skips when already set, so the backfill script can re-run safely.
userSchema.pre('save', async function () {
  if (this.username) return;
  const base = slugifyUsername(this.name);
  this.username = await nextAvailableUsername(this.constructor, base);
});

userSchema.methods.comparePassword = async function (candidatePassword) {
  // Google-only accounts have no password set. Reject password comparison
  // rather than crashing on a null hash.
  if (!this.password) return false;
  return bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  delete obj.refreshToken;
  delete obj.googleId; // Don't expose Google ID in API responses
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
