const Appointment = require('../models/Appointment');
const Patient = require('../models/Patient');
const Medicine = require('../models/Medicine');

// Get dashboard statistics
exports.getDashboardStats = async (req, res, next) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const [totalPatients, todayAppointments, pendingAppointments, totalMedicines, lowStockMedicines] = await Promise.all([
      Patient.countDocuments(),
      Appointment.countDocuments({ date: { $gte: today, $lt: tomorrow } }),
      Appointment.countDocuments({ status: { $in: ['Waiting', 'In Consultation'] } }),
      Medicine.countDocuments(),
      Medicine.countDocuments({ $expr: { $lte: ['$stock', '$lowStockThreshold'] } })
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
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    const data = await Appointment.aggregate([
      { $match: { date: { $gte: startDate } } },
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
    startDate.setMonth(startDate.getMonth() - months);

    const data = await Appointment.aggregate([
      { $match: { date: { $gte: startDate }, status: 'Completed' } },
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
