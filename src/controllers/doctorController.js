const { fetchDoctors } = require('../utils/doctorQuery');

// CR-1: the 'doctor' role slug is the super-admin (see middleware/auth.js
// checkPermission). Super-admin callers see doctors across all clinics; every
// other authenticated caller is scoped to their own clinic via req.clinicId.
const isSuperAdmin = (req) => req.user && req.user.role && req.user.role.slug === 'doctor';

// Get all doctors (accessible to any authenticated user)
exports.getDoctors = async (req, res, next) => {
  try {
    const { page, limit, search } = req.query;
    const clinicId = isSuperAdmin(req) ? undefined : req.clinicId;
    const result = await fetchDoctors({ page, limit, search, clinicId });

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
};
