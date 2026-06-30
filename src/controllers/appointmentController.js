const Appointment = require('../models/Appointment');
const { startOfDayUTC, endOfDayUTC, getTodayRangeUTC } = require('../utils/date');

// Get all appointments
exports.getAppointments = async (req, res, next) => {
  try {
    const { date, status, doctor, patient, startDate, endDate, page = 1, limit = 10 } = req.query;
    const query = {};

    if (date) {
      query.date = { $gte: startOfDayUTC(date), $lte: endOfDayUTC(date) };
    }
    if (startDate && endDate) {
      query.date = { $gte: startOfDayUTC(startDate), $lte: endOfDayUTC(endDate) };
    }
    if (status) query.status = status;
    if (doctor) query.doctor = doctor;
    if (patient) query.patient = patient;

    // Multi-clinic scoping: restrict to the authenticated user's clinic.
    if (req.clinicId) {
      query.clinicId = req.clinicId;
    }

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
    const { start, end } = getTodayRangeUTC();

    const appointments = await Appointment.find({
      doctor: req.user._id,
      date: { $gte: start, $lte: end },
      ...(req.clinicId ? { clinicId: req.clinicId } : {}),
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
    const { start } = getTodayRangeUTC();

    const appointments = await Appointment.find({
      doctor: req.user._id,
      date: { $gte: start },
      ...(req.clinicId ? { clinicId: req.clinicId } : {}),
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
      query.date = { $gte: startOfDayUTC(startDate), $lte: endOfDayUTC(endDate) };
    }

    // Multi-clinic scoping: restrict to the authenticated user's clinic.
    if (req.clinicId) {
      query.clinicId = req.clinicId;
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
    const query = { _id: req.params.id };
    if (req.clinicId) query.clinicId = req.clinicId;

    const appointment = await Appointment.findOne(query)
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

// Validate the fields required for an appointment.
function validateAppointmentBody(body) {
  const { patient, date, time } = body;
  const errors = [];
  if (!patient) errors.push('Patient is required.');
  if (!date) errors.push('Date is required.');
  if (!time || typeof time !== 'string' || !/^\d{2}:\d{2}$/.test(time)) {
    errors.push('Time is required and must be in HH:MM format.');
  }
  return errors;
}

// Create appointment
exports.createAppointment = async (req, res, next) => {
  try {
    const validationErrors = validateAppointmentBody(req.body);
    if (validationErrors.length) {
      return res.status(400).json({ success: false, message: 'Validation Error', errors: validationErrors });
    }

    // The agent-service may send a UUID doctorId, but Mongo expects the
    // authenticated user's ObjectId. Force the doctor to the current user
    // (the agent always calls on behalf of the doctor who owns the token).
    const payload = {
      ...req.body,
      doctor: req.user._id,
      createdBy: req.user._id,
      clinicId: req.user.clinicId || req.clinicId,
    };

    // Normalize the date to UTC midnight so the separate `time` string fully
    // describes the slot and the unique index prevents double-booking.
    if (payload.date) {
      payload.date = startOfDayUTC(payload.date);
    }

    // Remove fields that should not be set from the request.
    delete payload.clinic;

    const appointment = await Appointment.create(payload);
    const populated = await Appointment.findById(appointment._id)
      .populate('patient', 'name phone')
      .populate('doctor', 'name')
      .populate('createdBy', 'name');

    // Emit socket event
    const io = req.app.get('io');
    if (io) {
      io.emit('appointment:created', populated);
    }

    res.status(201).json({ success: true, data: populated });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: 'This time slot is already booked.' });
    }
    next(error);
  }
};

// Update appointment
exports.updateAppointment = async (req, res, next) => {
  try {
    const query = { _id: req.params.id };
    if (req.clinicId) query.clinicId = req.clinicId;

    // Prevent mass-assignment of identity/scoping fields.
    const allowedUpdates = { ...req.body };
    delete allowedUpdates._id;
    delete allowedUpdates.doctor;
    delete allowedUpdates.patient;
    delete allowedUpdates.clinicId;
    delete allowedUpdates.clinic;
    delete allowedUpdates.createdBy;

    if (allowedUpdates.date) {
      allowedUpdates.date = startOfDayUTC(allowedUpdates.date);
    }

    const appointment = await Appointment.findOneAndUpdate(query, allowedUpdates, { new: true, runValidators: true })
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
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: 'This time slot is already booked.' });
    }
    next(error);
  }
};

// Attach a structured prescription to an appointment (doctor write path,
// audit #23). Replaces any existing prescription on that visit.
exports.setPrescription = async (req, res, next) => {
  try {
    const query = { _id: req.params.id };
    if (req.clinicId) query.clinicId = req.clinicId;

    const appointment = await Appointment.findOne(query);
    if (!appointment) {
      return res.status(404).json({ success: false, message: 'Appointment not found.' });
    }

    const { medications = [], notes } = req.body;
    if (!Array.isArray(medications)) {
      return res.status(400).json({ success: false, message: 'medications must be an array.' });
    }
    // Basic validation: every medication needs a name.
    for (const m of medications) {
      if (!m || !m.name || !String(m.name).trim()) {
        return res.status(400).json({ success: false, message: 'Each medication requires a name.' });
      }
    }

    appointment.prescription = {
      medications: medications.map((m) => ({
        name: String(m.name).trim(),
        dosage: m.dosage ? String(m.dosage).trim() : undefined,
        frequency: m.frequency ? String(m.frequency).trim() : undefined,
        duration: m.duration ? String(m.duration).trim() : undefined,
        instructions: m.instructions ? String(m.instructions).trim() : undefined,
      })),
      notes: notes ? String(notes).trim() : '',
      createdBy: req.user._id,
      createdAt: new Date(),
    };
    await appointment.save();

    const populated = await Appointment.findById(appointment._id)
      .populate('patient', 'name phone')
      .populate('doctor', 'name email')
      .populate('prescription.createdBy', 'name');

    const io = req.app.get('io');
    if (io) {
      io.emit('prescription:updated', populated);
    }

    res.json({ success: true, data: populated });
  } catch (error) {
    next(error);
  }
};

// Delete appointment
exports.deleteAppointment = async (req, res, next) => {
  try {
    const query = { _id: req.params.id };
    if (req.clinicId) query.clinicId = req.clinicId;

    const appointment = await Appointment.findOneAndDelete(query);
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
