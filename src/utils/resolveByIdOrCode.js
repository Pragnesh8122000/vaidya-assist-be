/**
 * Alias resolver for controllers.
 *
 * Allows `/api/appointments/:id` (and the same for patients, users) to
 * accept EITHER the Mongo ObjectId OR the new public code
 * (`APP_YYYYMMDDHHMM`, `PT_YYYYMMDDHHMM`, or a username like
 * `dr.rajesh.sharma`).
 *
 * Why a query helper and not a separate `/:code` route?
 *  - One route registration per resource (no path explosion in the FE).
 *  - No change to existing callers — they keep passing `_id` and the
 *    controller keeps working.
 *  - Mongoose would throw `CastError` if you called `findById('APP_...'`
 *    because the string isn't a valid ObjectId, so we have to discriminate
 *    which branch to include.
 *
 * Usage:
 *   const { buildAliasQuery } = require('../utils/resolveByIdOrCode');
 *   const query = buildAliasQuery(req.params.id, 'displayId', { deletedAt: null });
 *   const doc = await Model.findOne(query);
 *
 * If `id` is a valid 24-char hex string, the returned query matches EITHER
 * `_id` OR the public code. If it's any other string (the public code itself,
 * or an empty string from a malformed request), it only matches the public
 * code.
 */

// 24 hex chars, case-insensitive. Matches a Mongo ObjectId.
const OBJECT_ID_RE = /^[a-f0-9]{24}$/i;

/**
 * Build a Mongo query that matches `_id` (when the input is ObjectId-shaped)
 * OR the public-code field, merged with `extra` filters like `deletedAt` and
 * `clinicId`.
 *
 * @param {string} id  the `req.params.id` value
 * @param {string} codeField  the public-code field on the model
 *                            ('displayId' for Appointment/Patient, 'username' for User)
 * @param {object} [extra]  additional filters to AND in
 * @returns {object}  a Mongo query object
 */
function buildAliasQuery(id, codeField, extra = {}) {
  const ors = [];
  if (typeof id === 'string' && OBJECT_ID_RE.test(id)) {
    ors.push({ _id: id });
  }
  ors.push({ [codeField]: id });
  return { ...extra, $or: ors };
}

module.exports = { buildAliasQuery, OBJECT_ID_RE };
