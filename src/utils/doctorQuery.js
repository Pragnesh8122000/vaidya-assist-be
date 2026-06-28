const User = require('../models/User');
const Role = require('../models/Role');

/**
 * Shared helper to fetch doctor users for the clinic.
 *
 * Used by both the staff `/api/doctors` endpoint and the patient portal
 * `/api/patient-portal/doctors` endpoint so the logic stays in one place.
 *
 * @param {Object} options
 * @param {number} [options.page=1]
 * @param {number} [options.limit=50]
 * @param {string} [options.search]
 * @returns {Promise<{data: Object[], count: number, pagination: Object}>}
 */
async function fetchDoctors({ page = 1, limit = 50, search = '' } = {}) {
  const doctorRole = await Role.findOne({ slug: 'doctor' });

  const query = {};
  if (doctorRole) {
    query.role = doctorRole._id;
  }

  if (search && search.trim().length > 0) {
    const term = search.trim();
    query.$or = [
      { name: { $regex: term, $options: 'i' } },
      { email: { $regex: term, $options: 'i' } },
    ];
  }

  const total = await User.countDocuments(query);
  const pageNumber = Math.max(1, parseInt(page, 10) || 1);
  const pageSize = Math.max(1, Math.min(parseInt(limit, 10) || 50, 200));

  const users = await User.find(query)
    .populate('role', 'name slug')
    .populate('createdBy', 'name')
    .sort('-createdAt')
    .skip((pageNumber - 1) * pageSize)
    .limit(pageSize);

  return {
    data: users,
    count: users.length,
    pagination: {
      total,
      page: pageNumber,
      pages: Math.ceil(total / pageSize),
      limit: pageSize,
    },
  };
}

module.exports = { fetchDoctors };
