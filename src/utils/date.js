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
 * @param {Date|string|number} date
 * @returns {Date}
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
 * @param {Date|string|number} date
 * @returns {Date}
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
 * @returns {{ start: Date, end: Date }}
 */
function getTodayRangeUTC() {
  return {
    start: startOfDayUTC(new Date()),
    end: endOfDayUTC(new Date()),
  };
}

/**
 * Return the start of the UTC day N days ago.
 * @param {number} days
 * @returns {Date}
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
