const Appointment = require('../models/Appointment');
const { startOfDayUTC, endOfDayUTC } = require('./date');

// Canonical "slot taken" message — shared by book / reschedule / getAvailableSlots
// so the 409 surface is consistent (audit §3.3 unification).
const SLOT_TAKEN_MESSAGE = 'This time slot is already booked.';

// Hardcoded working-hours grid (09:00–17:00, 30-min intervals). Single source
// of truth so the slot grid shown by getAvailableSlots matches the grid the
// booking flow validates against. Audit BE-9 tracks making this doctor-config.
const DEFAULT_SLOT_GRID = (() => {
  const slots = [];
  for (let hour = 9; hour < 17; hour++) {
    slots.push(`${String(hour).padStart(2, '0')}:00`);
    slots.push(`${String(hour).padStart(2, '0')}:30`);
  }
  return slots;
})();

/**
 * Returns true if the given doctor already has a non-Cancelled appointment
 * at {date, time}. Pass `excludeAppointmentId` when rescheduling an existing
 * appointment so it is not counted as a conflict with itself.
 *
 * The `status: { $ne: 'Cancelled' }` filter MUST stay in sync with the partial
 * unique index on {doctor, date, time} in models/Appointment.js. Without the
 * filter, a cancelled slot would still block rebooking at the API layer even
 * though the partial index now permits it (audit DB-1 / BE-1 / BE-3).
 */
async function isSlotTaken(doctorId, date, time, excludeAppointmentId = null) {
  const query = {
    doctor: doctorId,
    date: { $gte: startOfDayUTC(date), $lte: endOfDayUTC(date) },
    time,
    status: { $ne: 'Cancelled' },
    deletedAt: null,
  };
  if (excludeAppointmentId) {
    query._id = { $ne: excludeAppointmentId };
  }
  const conflict = await Appointment.findOne(query);
  return Boolean(conflict);
}

/**
 * Returns the set of booked time strings (HH:MM) for a doctor on a given
 * date, excluding Cancelled appointments. Used by getAvailableSlots (audit BE-2).
 *
 * TODO(BE-11): cache slot-availability results in Redis and rate-limit the
 * getAvailableSlots endpoint. Currently every request hits MongoDB directly,
 * which is fine at low volume but won't scale under heavy polling.
 */
async function getBookedTimes(doctorId, date) {
  const booked = await Appointment.find({
    doctor: doctorId,
    date: { $gte: startOfDayUTC(date), $lte: endOfDayUTC(date) },
    status: { $ne: 'Cancelled' },
    deletedAt: null,
  }).select('time -_id');
  return new Set(booked.map(apt => apt.time));
}

module.exports = {
  SLOT_TAKEN_MESSAGE,
  DEFAULT_SLOT_GRID,
  isSlotTaken,
  getBookedTimes,
};