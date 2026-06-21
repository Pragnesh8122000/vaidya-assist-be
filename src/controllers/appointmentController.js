const Appointment = require('../models/Appointment');

// Get all appointments
exports.getAppointments = async (req, res, next) => {
  try {
    const { date, status, doctor, patient, startDate, endDate, page = 1, limit = 10 } = req.query;
    const query = {};

    if (date) {
      const d = new Date(date);
      query.date = { $gte: new Date(d.setHours(0, 0, 0, 0)), $lte: new Date(d.setHours(23, 59, 59, 999)) };
    }
    if (startDate && endDate) {
      query.date = { $gte: new Date(startDate), $lte: new Date(endDate) };
    }
    if (status) query.status = status;
    if (doctor) query.doctor = doctor;
    if (patient) query.patient = patient;

    const total = await Appointment.countDocuments(query);
    const appointments = await Appointment.find(query)
      .populate('patient', 'name phone age gender')
      .populate('doctor', 'name email')
      .populate('createdBy', 'name')
      .sort({ date: 1, time: 1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    res.json({
      success: true,
      data: appointments,
      pagination: { total, page: parseInt(page), pages: Math.ceil(total / limit) }
    });
  } catch (error) {
    next(error);
  }
};

// Get today's appointments for the authenticated doctor
exports.getTodayAppointments = async (req, res, next) => {
  try {
    const today = new Date();
    const start = new Date(today.setHours(0, 0, 0, 0));
    const end = new Date(today.setHours(23, 59, 59, 999));

    const appointments = await Appointment.find({
      doctor: req.user._id,
      date: { $gte: start, $lte: end },
    })
      .populate('patient', 'name phone age gender')
      .populate('doctor', 'name email')
      .populate('createdBy', 'name')
      .sort({ date: 1, time: 1 });

    res.json({ success: true, data: appointments });
  } catch (error) {
    next(error);
  }
};

// Get upcoming appointments for the authenticated doctor
exports.getUpcomingAppointments = async (req, res, next) => {
  try {
    const { limit = 10 } = req.query;
    const now = new Date();

    const appointments = await Appointment.find({
      doctor: req.user._id,
      date: { $gte: now },
    })
      .populate('patient', 'name phone age gender')
      .populate('doctor', 'name email')
      .populate('createdBy', 'name')
      .sort({ date: 1, time: 1 })
      .limit(parseInt(limit, 10));

    res.json({ success: true, data: appointments });
  } catch (error) {
    next(error);
  }
};

// Get calendar appointments (no pagination)
exports.getCalendarAppointments = async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    const query = {};

    if (startDate && endDate) {
      query.date = { $gte: new Date(startDate), $lte: new Date(endDate) };
    }

    const appointments = await Appointment.find(query)
      .populate('patient', 'name phone')
      .populate('doctor', 'name')
      .sort({ date: 1, time: 1 });

    res.json({ success: true, data: appointments });
  } catch (error) {
    next(error);
  }
};

// Get single appointment
exports.getAppointment = async (req, res, next) => {
  try {
    const appointment = await Appointment.findById(req.params.id)
      .populate('patient')
      .populate('doctor', 'name email')
      .populate('createdBy', 'name');
    if (!appointment) {
      return res.status(404).json({ success: false, message: 'Appointment not found.' });
    }
    res.json({ success: true, data: appointment });
  } catch (error) {
    next(error);
  }
};

// Create appointment
exports.createAppointment = async (req, res, next) => {
  try {
    // The agent-service sends a UUID doctorId, but Mongo expects the
    // authenticated user's ObjectId. Force the doctor to the current user.
    const appointment = await Appointment.create({ ...req.body, doctor: req.user._id, createdBy: req.user._id });
    const populated = await Appointment.findById(appointment._id)
      .populate('patient', 'name phone')
      .populate('doctor', 'name');

    // Emit socket event
    const io = req.app.get('io');
    if (io) {
      io.emit('appointment:created', populated);
    }

    res.status(201).json({ success: true, data: populated });
  } catch (error) {
    next(error);
  }
};

// Update appointment
exports.updateAppointment = async (req, res, next) => {
  try {
    const appointment = await Appointment.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true })
      .populate('patient', 'name phone')
      .populate('doctor', 'name');
    if (!appointment) {
      return res.status(404).json({ success: false, message: 'Appointment not found.' });
    }

    // Emit socket event for status update
    const io = req.app.get('io');
    if (io) {
      io.emit('appointment:updated', appointment);
      if (req.body.status) {
        io.emit('appointment:statusUpdate', { id: appointment._id, status: req.body.status, appointment });
      }
    }

    res.json({ success: true, data: appointment });
  } catch (error) {
    next(error);
  }
};

// Delete appointment
exports.deleteAppointment = async (req, res, next) => {
  try {
    const appointment = await Appointment.findByIdAndDelete(req.params.id);
    if (!appointment) {
      return res.status(404).json({ success: false, message: 'Appointment not found.' });
    }

    const io = req.app.get('io');
    if (io) {
      io.emit('appointment:deleted', req.params.id);
    }

    res.json({ success: true, message: 'Appointment deleted.' });
  } catch (error) {
    next(error);
  }
};
