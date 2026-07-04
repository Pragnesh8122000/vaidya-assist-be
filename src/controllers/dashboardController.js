const Appointment = require('../models/Appointment');
const Patient = require('../models/Patient');
const Medicine = require('../models/Medicine');
const { startOfDayUTC } = require('../utils/date');

// Base scoping filter for the authenticated clinic. New documents store
// clinicId explicitly; legacy data should be backfilled via migration.
function clinicScope(req) {
  return req.clinicId ? { clinicId: req.clinicId } : {};
}

// Get dashboard statistics
exports.getDashboardStats = async (req, res, next) => {
  try {
    const today = startOfDayUTC(new Date());
    const tomorrow = new Date(today);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

    const scope = clinicScope(req);

    const [totalPatients, todayAppointments, pendingAppointments, totalMedicines, lowStockMedicines] = await Promise.all([
      Patient.countDocuments(scope),
      Appointment.countDocuments({ ...scope, date: { $gte: today, $lt: tomorrow }, deletedAt: null }),
      Appointment.countDocuments({ ...scope, status: { $in: ['Waiting', 'In Consultation'] }, deletedAt: null }),
      Medicine.countDocuments(scope),
      Medicine.countDocuments({ ...scope, $expr: { $lte: ['$stock', '$lowStockThreshold'] } })
    ]);

    res.json({
      success: true,
      data: { totalPatients, todayAppointments, pendingAppointments, totalMedicines, lowStockMedicines }
    });
  } catch (error) {
    next(error);
  }
};

// Get appointment chart data (last 7 days)
exports.getAppointmentChart = async (req, res, next) => {
  try {
    const days = parseInt(req.query.days) || 7;
    const startDate = new Date();
    startDate.setUTCDate(startDate.getUTCDate() - days);
    startDate.setUTCHours(0, 0, 0, 0);

    const data = await Appointment.aggregate([
      { $match: { ...clinicScope(req), date: { $gte: startDate }, deletedAt: null } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
          count: { $sum: 1 },
          completed: { $sum: { $cond: [{ $eq: ['$status', 'Completed'] }, 1, 0] } },
          cancelled: { $sum: { $cond: [{ $eq: ['$status', 'Cancelled'] }, 1, 0] } }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

// Get patient visit statistics
exports.getPatientVisitStats = async (req, res, next) => {
  try {
    const months = parseInt(req.query.months) || 6;
    const startDate = new Date();
    startDate.setUTCMonth(startDate.getUTCMonth() - months);
    startDate.setUTCHours(0, 0, 0, 0);

    const data = await Appointment.aggregate([
      { $match: { ...clinicScope(req), date: { $gte: startDate }, status: 'Completed', deletedAt: null } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m', date: '$date' } },
          visits: { $sum: 1 },
          uniquePatients: { $addToSet: '$patient' }
        }
      },
      {
        $project: {
          _id: 1,
          visits: 1,
          uniquePatients: { $size: '$uniquePatients' }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

// Get medicine stock chart
exports.getMedicineStockChart = async (req, res, next) => {
  try {
    const data = await Medicine.aggregate([
      { $match: clinicScope(req) },
      {
        $group: {
          _id: '$category',
          totalStock: { $sum: '$stock' },
          count: { $sum: 1 },
          totalValue: { $sum: { $multiply: ['$stock', '$price'] } }
        }
      },
      { $sort: { totalStock: -1 } }
    ]);

    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

// Get appointment status distribution
exports.getAppointmentStatusDist = async (req, res, next) => {
  try {
    const data = await Appointment.aggregate([
      { $match: { ...clinicScope(req), deletedAt: null } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};
