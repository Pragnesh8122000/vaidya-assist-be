/**
 * Human-readable public codes for Appointment, Patient, and User.
 *
 * - Appointment.displayId: APP_YYYYMMDDHHMM (UTC), e.g. APP_202607041430
 * - Patient.displayId:     PT_YYYYMMDDHHMM  (UTC), e.g. PT_202607041430
 * - User.username:         slug of the user's name, e.g. dr.rajesh.sharma
 *
 * All values are globally unique (sparse + unique index in each model).
 * The model pre-save hooks call these to generate values lazily for new
 * rows; the backfill script (scripts/backfillPublicIds.js) calls them to
 * seed historical rows.
 */

/** Build `PREFIX_YYYYMMDDHHMM` from a date in UTC. */
function displayIdFor(prefix, date) {
  const d = date ? new Date(date) : new Date();
  if (Number.isNaN(d.getTime())) {
    // Defensive: an invalid date should never reach here from the BE
    // (the controllers validate it), but a malformed backfill input
    // shouldn't crash the whole migration.
    throw new Error(`displayIdFor(${prefix}): invalid date ${date}`);
  }
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${prefix}_${y}${m}${day}${hh}${mm}`;
}

const appointmentDisplayId = (date) => displayIdFor('APP', date);
const patientDisplayId    = (date) => displayIdFor('PT',  date);

/**
 * Slugify a display name for use as a username.
 *
 * "Dr. Rajesh Kumar Sharma" -> "dr.rajesh.kumar.sharma"
 * "  Räjeś--Śhārma "         -> "raje.s.harma" (diacritics stripped, runs collapsed)
 *
 * - lowercases
 * - strips diacritics via NFKD
 * - collapses any non-alphanumeric run to a single '.'
 * - trims leading/trailing dots
 * - caps at 60 chars
 */
function slugifyUsername(name) {
  if (typeof name !== 'string') return '';
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip combining diacritics
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '')
    .slice(0, 60);
}

/**
 * Pick the first free username of the form `<base>` / `<base>2` / ... / `<base>99`.
 *
 * Single round trip: builds the candidate list up front and queries
 * `Model.find({ username: { $in: [...] } })` to find which are taken.
 * Falls back to `<base><rand-suffix>` if all 99 are taken (effectively never
 * in practice — 100 users with the same name is implausible).
 */
async function nextAvailableUsername(Model, base) {
  if (!base) base = 'user';
  const candidates = [base];
  for (let i = 2; i <= 99; i++) candidates.push(`${base}${i}`);
  const taken = new Set(
    (await Model.find({ username: { $in: candidates } }, { username: 1, _id: 0 }))
      .map((u) => u.username),
  );
  const free = candidates.find((c) => !taken.has(c));
  if (free) return free;
  // Extremely unlikely — 100 of the same name. Append a 4-char base36 suffix.
  return `${base}${Date.now().toString(36).slice(-4)}`;
}

/**
 * Pick the first free displayId of the form `<base>` / `<base>2` / ... / `<base>9`.
 *
 * Two appointments booked in the same minute is the only realistic collision
 * (back-to-back double-bookings). 9 candidates is plenty.
 */
async function nextAvailableDisplayId(Model, base) {
  const candidates = [base];
  for (let i = 2; i <= 9; i++) candidates.push(`${base}${i}`);
  const taken = new Set(
    (await Model.find({ displayId: { $in: candidates } }, { displayId: 1, _id: 0 }))
      .map((u) => u.displayId),
  );
  const free = candidates.find((c) => !taken.has(c));
  if (free) return free;
  // 10+ collisions in the same minute. Append a random 2-digit suffix to break ties.
  return `${base}${Math.floor(Math.random() * 90 + 10)}`;
}

module.exports = {
  appointmentDisplayId,
  patientDisplayId,
  slugifyUsername,
  nextAvailableUsername,
  nextAvailableDisplayId,
};
