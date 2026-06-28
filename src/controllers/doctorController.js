const { fetchDoctors } = require('../utils/doctorQuery');

// Get all doctors (accessible to any authenticated user)
exports.getDoctors = async (req, res, next) => {
  try {
    const { page, limit, search } = req.query;
    const result = await fetchDoctors({ page, limit, search });

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
};
