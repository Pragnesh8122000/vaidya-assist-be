/**
 * Date helpers for consistent UTC-day handling.
 *
 * Appointments store a `date` Date field at midnight UTC for date-only
 * inputs (YYYY-MM-DD from the UIs) and a separate `time` string. All
 * day-based queries use these helpers so they behave the same regardless of
 * the server's local timezone.
 */

/**
 * Return the start of the UTC day for the given date input.
 *
 * The returned Date is midnight UTC (00:00:00.000Z) of the calendar day that
 * `date` falls in *when read via its UTC getters*. For a YYYY-MM-DD string,
 * `new Date('2026-07-20')` is already midnight UTC, so this returns that
 * same instant. For a Date or timestamp, the day boundary is computed in
 * UTC regardless of the host's local timezone — callers therefore must not
 * pre-shift the input to a local timezone. Audit §3.1 (OQ#2=A: the clinic
 * runs on a fixed timezone; all stored appointment `date` values are UTC
 * midnight, and all day-range queries must use these helpers to match).
 * @param {Date|string|number} date
 * @returns {Date} midnight UTC for the input's UTC calendar day
 */
function startOfDayUTC(date) {
  const d = new Date(date);
  return new Date(Date.UTC(
    d.getUTCFullYear(),
    d.getUTCMonth(),
    d.getUTCDate(),
    0, 0, 0, 0
  ));
}

/**
 * Return the end of the UTC day for the given date input.
 *
 * The returned Date is 23:59:59.999Z of the UTC calendar day that `date` falls
 * in (read via its UTC getters). Use together with `startOfDayUTC` for
 * inclusive day-range queries on the stored `date` field. Audit §3.1.
 * @param {Date|string|number} date
 * @returns {Date} end-of-UTC-day instant for the input's UTC calendar day
 */
function endOfDayUTC(date) {
  const d = new Date(date);
  return new Date(Date.UTC(
    d.getUTCFullYear(),
    d.getUTCMonth(),
    d.getUTCDate(),
    23, 59, 59, 999
  ));
}

/**
 * Return the start/end range for "today" in UTC.
 *
 * "Today" is the UTC calendar day of the host's current instant — not the
 * host's local-timezone day. Audit §3.1 (OQ#2=A).
 * @returns {{ start: Date, end: Date }} midnight-to-23:59:59 UTC range for today
 */
function getTodayRangeUTC() {
  return {
    start: startOfDayUTC(new Date()),
    end: endOfDayUTC(new Date()),
  };
}

/**
 * Return the start of the UTC day N days ago.
 *
 * Subtracts N days on the UTC calendar (uses `setUTCDate`), then returns
 * midnight UTC of that day. Audit §3.1.
 * @param {number} days
 * @returns {Date} midnight UTC for N days ago (UTC calendar)
 */
function startOfDayDaysAgoUTC(days) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return startOfDayUTC(d);
}

module.exports = {
  startOfDayUTC,
  endOfDayUTC,
  getTodayRangeUTC,
  startOfDayDaysAgoUTC,
};
