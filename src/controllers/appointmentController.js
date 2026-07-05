const Appointment = require('../models/Appointment');
const Patient = require('../models/Patient');
const { validateStatusTransition } = require('../models/Appointment');
const { SLOT_TAKEN_MESSAGE } = require('../utils/appointmentSlots');
const { startOfDayUTC, endOfDayUTC, getTodayRangeUTC } = require('../utils/date');
const { buildAliasQuery } = require('../utils/resolveByIdOrCode');

// 4C-1: appointment status enum allow-list — unknown / object values are
// ignored rather than passed into the Mongoose query.
const APPOINTMENT_STATUS_VALUES = ['Waiting', 'Confirmed', 'In Consultation', 'Completed', 'Cancelled'];

// CR-3: socket payload sanitization helpers. Strip PHI that the recipient
// should not see — patient.phone for doctor recipients, doctor.email for
// patient recipients. Accepts a Mongoose doc or POJO and returns a plain
// object so the broadcast payload is safe.
function toPlain(appt) {
  return appt && appt.toObject ? appt.toObject() : { ...appt };
}
function stripPatientPhone(appt) {
  const obj = toPlain(appt);
  if (obj.patient && typeof obj.patient === 'object') {
    const { phone, _id, ...rest } = obj.patient;
    obj.patient = { _id, ...rest };
    delete obj.patient.phone;
  }
  return obj;
}
function stripDoctorEmail(appt) {
  const obj = toPlain(appt);
  if (obj.doctor && typeof obj.doctor === 'object') {
    const { email, _id, ...rest } = obj.doctor;
    obj.doctor = { _id, ...rest };
    delete obj.doctor.email;
  }
  return obj;
}

// CR-3: resolve the patient's portal userId for room-targeted emits. The
// appointment populate only carries patient name/phone, so a single tiny
// lookup is needed to read Patient.user. Returns undefined when the patient
// has no linked portal user (e.g. staff-created walk-in patient).
async function getPatientUserId(patientRef) {
  if (!patientRef) return undefined;
  const pid = patientRef._id ? patientRef._id : patientRef;
  const patientDoc = await Patient.findById(pid).select('user');
  return patientDoc ? patientDoc.user : undefined;
}

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
    if (status) {
      const s = String(status);
      if (APPOINTMENT_STATUS_VALUES.includes(s)) query.status = s;
    }
    if (doctor) query.doctor = doctor;
    if (patient) query.patient = patient;

    // Multi-clinic scoping: restrict to the authenticated user's clinic.
    if (req.clinicId) {
      query.clinicId = req.clinicId;
    }

    // Exclude soft-deleted appointments (audit BE-8).
    query.deletedAt = null;

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
      deletedAt: null,
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
      deletedAt: null,
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

    // Exclude soft-deleted appointments (audit BE-8).
    query.deletedAt = null;

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
    const extra = { deletedAt: null };
    if (req.clinicId) extra.clinicId = req.clinicId;
    const query = buildAliasQuery(req.params.id, 'displayId', extra);

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

    // BE-5: prevent booking in the past (allow today). Mirrors the patient-side
    // bookAppointment guard so the agent-service cannot create past appointments.
    if (payload.date && payload.date.getTime() < startOfDayUTC(new Date()).getTime()) {
      return res.status(400).json({ success: false, message: 'Cannot book an appointment in the past.' });
    }

    // Remove fields that should not be set from the request.
    delete payload.clinic;

    const appointment = await Appointment.create(payload);
    const populated = await Appointment.findById(appointment._id)
      .populate('patient', 'name phone')
      .populate('doctor', 'name')
      .populate('createdBy', 'name');

    // CR-3: emit only to the owning doctor's and owning patient's user rooms.
    // doctorId is the appointment's doctor (populated); patientUserId is
    // resolved via a one-shot Patient.user lookup. PHI sanitized per recipient
    // (patient.phone hidden from doctor, doctor.email hidden from patient).
    // Never io.emit globally across clinics/users.
    const io = req.app.get('io');
    if (io) {
      const doctorId = populated.doctor && populated.doctor._id ? populated.doctor._id : populated.doctor;
      const patientUserId = await getPatientUserId(populated.patient);
      io.to(`user:${doctorId}`).emit('appointment:created', stripPatientPhone(populated));
      if (patientUserId) {
        io.to(`user:${patientUserId}`).emit('appointment:created', stripDoctorEmail(populated));
      }
    }

    res.status(201).json({ success: true, data: populated });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: SLOT_TAKEN_MESSAGE });
    }
    next(error);
  }
};

// Update appointment
exports.updateAppointment = async (req, res, next) => {
  try {
    const extra = { deletedAt: null };
    if (req.clinicId) extra.clinicId = req.clinicId;
    const query = buildAliasQuery(req.params.id, 'displayId', extra);

    // Prevent mass-assignment of identity/scoping fields.
    const allowedUpdates = { ...req.body };
    delete allowedUpdates._id;
    delete allowedUpdates.doctor;
    delete allowedUpdates.patient;
    delete allowedUpdates.clinicId;
    delete allowedUpdates.clinic;
    delete allowedUpdates.createdBy;
    // BE-16: audit fields are server-controlled, never client-set.
    delete allowedUpdates.lastStatusChangedBy;
    delete allowedUpdates.lastStatusChangedAt;

    if (allowedUpdates.date) {
      allowedUpdates.date = startOfDayUTC(allowedUpdates.date);
    }

    // Fetch the existing appointment for transition + reschedule re-validation.
    // findOneAndUpdate bypasses pre('validate') hooks, so the model-level guard
    // does not cover this path — validate here. Audit BE-6 / BE-7.
    const existing = await Appointment.findOne(query).select('doctor date time status');
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Appointment not found.' });
    }

    // BE-6: validate status transition when status is changing.
    if (allowedUpdates.status && allowedUpdates.status !== existing.status) {
      if (!validateStatusTransition(existing.status, allowedUpdates.status)) {
        return res.status(400).json({
          success: false,
          message: `Cannot change appointment status from '${existing.status}' to '${allowedUpdates.status}'.`,
        });
      }
      // BE-16: stamp the audit trail for the actor changing the status.
      allowedUpdates.lastStatusChangedBy = req.user ? req.user._id : undefined;
      allowedUpdates.lastStatusChangedAt = new Date();
    } else if (allowedUpdates.status && allowedUpdates.status === existing.status) {
      // Status not actually changing — don't touch the audit trail.
      delete allowedUpdates.lastStatusChangedBy;
      delete allowedUpdates.lastStatusChangedAt;
    }

    // BE-7: when date or time changes, re-validate past-date + slot conflict.
    const dateChanged = allowedUpdates.date !== undefined;
    const timeChanged = allowedUpdates.time !== undefined && allowedUpdates.time !== existing.time;
    if (dateChanged || timeChanged) {
      const newDate = dateChanged ? allowedUpdates.date : existing.date;
      const newTime = timeChanged ? allowedUpdates.time : existing.time;
      if (newDate && newDate.getTime() < startOfDayUTC(new Date()).getTime()) {
        return res.status(400).json({ success: false, message: 'Cannot move an appointment to a date in the past.' });
      }
      if (newTime && !/^\d{2}:\d{2}$/.test(newTime)) {
        return res.status(400).json({ success: false, message: 'Time must be in HH:MM format.' });
      }
      if (newDate && newTime) {
        const conflict = await Appointment.findOne({
          doctor: existing.doctor,
          date: { $gte: startOfDayUTC(newDate), $lte: endOfDayUTC(newDate) },
          time: newTime,
          status: { $ne: 'Cancelled' },
          deletedAt: null,
          _id: { $ne: existing._id },
        });
        if (conflict) {
          return res.status(409).json({ success: false, message: SLOT_TAKEN_MESSAGE });
        }
      }
    }

    const appointment = await Appointment.findOneAndUpdate(query, allowedUpdates, { new: true, runValidators: true })
      .populate('patient', 'name phone')
      .populate('doctor', 'name');

    if (!appointment) {
      return res.status(404).json({ success: false, message: 'Appointment not found.' });
    }

    // CR-3: emit only to the owning doctor's and owning patient's user rooms.
    // doctorId is the appointment's doctor (req.user._id on this doctor-side
    // route). The patient's portal userId is resolved via a one-shot lookup of
    // Patient.user (not present in the populate). PHI is sanitized per
    // recipient — patient.phone hidden from the doctor, doctor.email hidden
    // from the patient. Never io.emit globally across clinics/users.
    const io = req.app.get('io');
    if (io) {
      const doctorId = appointment.doctor && appointment.doctor._id ? appointment.doctor._id : appointment.doctor;
      const patientUserId = await getPatientUserId(appointment.patient);
      const doctorTarget = `user:${doctorId}`;
      io.to(doctorTarget).emit('appointment:updated', stripPatientPhone(appointment));
      if (patientUserId) {
        io.to(`user:${patientUserId}`).emit('appointment:updated', stripDoctorEmail(appointment));
      }
      if (req.body.status) {
        const statusPayload = { id: appointment._id, status: req.body.status, appointment };
        io.to(doctorTarget).emit('appointment:statusUpdate', { ...statusPayload, appointment: stripPatientPhone(appointment) });
        if (patientUserId) {
          io.to(`user:${patientUserId}`).emit('appointment:statusUpdate', { ...statusPayload, appointment: stripDoctorEmail(appointment) });
        }
      }
    }

    res.json({ success: true, data: appointment });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: SLOT_TAKEN_MESSAGE });
    }
    next(error);
  }
};

// Attach a structured prescription to an appointment (doctor write path,
// audit #23). Replaces any existing prescription on that visit.
exports.setPrescription = async (req, res, next) => {
  try {
    const extra = { deletedAt: null };
    if (req.clinicId) extra.clinicId = req.clinicId;
    const query = buildAliasQuery(req.params.id, 'displayId', extra);

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

    // CR-3: targeted emit to owning doctor + owning patient's user room only.
    const io = req.app.get('io');
    if (io) {
      const doctorId = populated.doctor && populated.doctor._id ? populated.doctor._id : populated.doctor;
      const patientUserId = await getPatientUserId(populated.patient);
      io.to(`user:${doctorId}`).emit('prescription:updated', stripPatientPhone(populated));
      if (patientUserId) {
        io.to(`user:${patientUserId}`).emit('prescription:updated', stripDoctorEmail(populated));
      }
    }

    res.json({ success: true, data: populated });
  } catch (error) {
    next(error);
  }
};

// Delete appointment (soft-delete — audit BE-8). Marks the row deletedAt
// instead of removing it, so deletes stay auditable/recoverable. Read paths
// filter `deletedAt: null` so the row stops appearing.
exports.deleteAppointment = async (req, res, next) => {
  try {
    const extra = { deletedAt: null };
    if (req.clinicId) extra.clinicId = req.clinicId;
    const query = buildAliasQuery(req.params.id, 'displayId', extra);

    const appointment = await Appointment.findOne(query);
    if (!appointment) {
      return res.status(404).json({ success: false, message: 'Appointment not found.' });
    }

    // CR-3: resolve room targets BEFORE the soft-delete so emits can be targeted
    // after. doctorId is the appointment's doctor (ObjectId on the doc — not
    // populated here, but the raw id is what the room key needs). patientUserId
    // is resolved via a one-shot Patient.user lookup. The deleted payload is
    // just the id (no PHI), so no sanitization is required — but it must never
    // be broadcast globally across clinics/users.
    const doctorId = appointment.doctor;
    const patientUserId = await getPatientUserId(appointment.patient);

    appointment.deletedAt = new Date();
    await appointment.save();

    const io = req.app.get('io');
    if (io) {
      io.to(`user:${doctorId}`).emit('appointment:deleted', req.params.id);
      if (patientUserId) {
        io.to(`user:${patientUserId}`).emit('appointment:deleted', req.params.id);
      }
    }

    res.json({ success: true, message: 'Appointment deleted.' });
  } catch (error) {
    next(error);
  }
};
