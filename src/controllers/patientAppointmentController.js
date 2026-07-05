const User = require('../models/User');
const Patient = require('../models/Patient');
const Appointment = require('../models/Appointment');
const File = require('../models/File');
const path = require('path');
const fs = require('fs');
const { fetchDoctors } = require('../utils/doctorQuery');
const { startOfDayUTC } = require('../utils/date');
const { buildAliasQuery } = require('../utils/resolveByIdOrCode');
const {
  SLOT_TAKEN_MESSAGE,
  DEFAULT_SLOT_GRID,
  isSlotTaken,
  getBookedTimes,
} = require('../utils/appointmentSlots');

// CR-3: socket payload sanitization. Strip PHI fields that the recipient should
// not see — patient.phone for doctor recipients, doctor.email for patient
// recipients. Accepts a Mongoose doc or POJO and returns a plain object so the
// sanitized payload is safe to broadcast.
function sanitizeAppointmentPayload(appt) {
  const obj = appt && appt.toObject ? appt.toObject() : { ...appt };
  return obj;
}
function stripPatientPhone(appt) {
  const obj = sanitizeAppointmentPayload(appt);
  if (obj.patient && typeof obj.patient === 'object') {
    const { phone, _id, ...rest } = obj.patient;
    obj.patient = { _id, ...rest };
    delete obj.patient.phone;
  }
  return obj;
}
function stripDoctorEmail(appt) {
  const obj = sanitizeAppointmentPayload(appt);
  if (obj.doctor && typeof obj.doctor === 'object') {
    const { email, _id, ...rest } = obj.doctor;
    obj.doctor = { _id, ...rest };
    delete obj.doctor.email;
  }
  return obj;
}

// 4C-1: allow-list for the patient-facing profile update (mass-assignment
// guard). Server-controlled / identity fields (clinicId, user, createdBy,
// dependents, _id) are intentionally excluded.
const ALLOWED_PROFILE_FIELDS = ['name', 'phone', 'email', 'address', 'bloodGroup', 'dob', 'gender'];

// 4C-1: appointment status enum allow-list — unknown / object values are
// ignored rather than passed into the Mongoose query.
const APPOINTMENT_STATUS_VALUES = ['Waiting', 'Confirmed', 'In Consultation', 'Completed', 'Cancelled'];

// Get authenticated patient profile
exports.getPatientProfile = async (req, res, next) => {
  try {
    if (!req.user.patientProfile) {
      return res.status(404).json({ success: false, message: 'Patient profile not found for this user.' });
    }

    const patient = await Patient.findById(req.user.patientProfile);
    if (!patient) {
      return res.status(404).json({ success: false, message: 'Patient profile not found.' });
    }

    res.json({ success: true, data: patient });
  } catch (error) {
    next(error);
  }
};

// Update patient profile
exports.updatePatientProfile = async (req, res, next) => {
  try {
    if (!req.user.patientProfile) {
      return res.status(404).json({ success: false, message: 'Patient profile not found.' });
    }

    // 4C-1: build the update from an allow-list only, to prevent mass
    // assignment of clinicId / user / createdBy / dependents / _id.
    const update = {};
    for (const k of ALLOWED_PROFILE_FIELDS) {
      if (k in req.body) update[k] = req.body[k];
    }

    const patient = await Patient.findByIdAndUpdate(
      req.user.patientProfile,
      update,
      { new: true, runValidators: true }
    );

    if (!patient) {
      return res.status(404).json({ success: false, message: 'Patient profile not found.' });
    }

    res.json({ success: true, data: patient });
  } catch (error) {
    next(error);
  }
};

// Get list of doctors available for booking
// CR-1: scope to the patient's own clinic so a patient cannot see doctors from
// other clinics. The patient's clinicId lives on their Patient profile (the
// User.clinicId for patients is a random uuid default, not a real clinic), so
// we read it from there. Self-registered patients without a clinicId keep the
// previous permissive behavior (see bookAppointment clinic-consistency check).
exports.getDoctors = async (req, res, next) => {
  try {
    const { search } = req.query;
    // CR-1: scope to the patient's own clinic so a patient cannot see doctors
    // from other clinics. The patient's clinicId lives on their Patient profile
    // (the User.clinicId for patients is a random uuid default, not a real
    // clinic), so we read it from there. Self-registered patients without a
    // clinicId keep the previous permissive behavior (no clinicId in the
    // fetchDoctors call). The guard also keeps the call signature identical to
    // the pre-fix behavior when no patient profile is available.
    let clinicId;
    if (req.user && req.user.patientProfile) {
      const patient = await Patient.findById(req.user.patientProfile).select('clinicId');
      clinicId = patient && patient.clinicId ? patient.clinicId : undefined;
    }
    const options = { search };
    if (clinicId) options.clinicId = clinicId;
    const result = await fetchDoctors(options);
    res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
};

// Book an appointment
exports.bookAppointment = async (req, res, next) => {
  try {
    const { doctorId, date, time, reason } = req.body;

    // Validate required fields
    if (!doctorId || !date || !time) {
      return res.status(400).json({ success: false, message: 'Doctor, date and time are required.' });
    }
    if (!/^\d{2}:\d{2}$/.test(time)) {
      return res.status(400).json({ success: false, message: 'Time must be in HH:MM format.' });
    }

    const appointmentDate = startOfDayUTC(date);
    if (Number.isNaN(appointmentDate.getTime())) {
      return res.status(400).json({ success: false, message: 'Invalid appointment date.' });
    }

    // Optional: prevent booking in the past (allow today).
    const todayStart = startOfDayUTC(new Date());
    if (appointmentDate < todayStart) {
      return res.status(400).json({ success: false, message: 'Cannot book an appointment in the past.' });
    }

    if (!req.user.patientProfile) {
      return res.status(400).json({ success: false, message: 'No patient profile associated with this user.' });
    }

    const patient = await Patient.findById(req.user.patientProfile);
    if (!patient) {
      return res.status(404).json({ success: false, message: 'Patient profile not found.' });
    }

    // Resolve "booking for" metadata. `patient` always remains the registered
    // portal user (the booker); bookedFor records the actual subject.
    let bookedFor = { type: 'myself', dependentName: patient.name };
    const incomingBookedFor = req.body.bookedFor;
    if (incomingBookedFor && incomingBookedFor.type === 'dependent') {
      const dependent = patient.dependents.id(incomingBookedFor.dependentId);
      if (!dependent) {
        return res.status(400).json({ success: false, message: 'Selected dependent was not found in your profile.' });
      }
      bookedFor = {
        type: 'dependent',
        dependentId: dependent._id,
        dependentName: dependent.name,
      };
    }

    // Validate doctor exists and is a doctor. BE-15: we intentionally populate
    // only `role` (not `role.permissions`) — patient-portal booking verifies the
    // target user is a doctor via `role.slug` and never performs a permission
    // check, so deep-populating permissions would add query overhead for no
    // benefit. Doctor-side controllers that DO check permissions populate the
    // full permission graph via the auth middleware on `req.user` instead.
    const doctor = await User.findById(doctorId).populate('role');
    if (!doctor || !doctor.role || doctor.role.slug !== 'doctor') {
      return res.status(400).json({ success: false, message: 'Invalid doctor selected.' });
    }

    // CR-1: validate clinic consistency. When the patient HAS a clinicId, the
    // doctor MUST be in the same clinic — reject with 409 otherwise. Patients
    // without a clinicId (self-registered, registration form did not send one)
    // keep the previous permissive behavior so they can still book; the
    // appointment is stamped with the doctor's clinicId below regardless.
    if (patient.clinicId && (!doctor.clinicId || doctor.clinicId !== patient.clinicId)) {
      return res.status(409).json({ success: false, message: 'Doctor not available in your clinic.' });
    }

    // Scope the conflict check to the same UTC day so it matches stored dates.
    // Exclude Cancelled appointments so a freed slot can be rebooked — this
    // stays in sync with the partial unique index (audit DB-1 / BE-1).
    const slotTaken = await isSlotTaken(doctorId, date, time);

    if (slotTaken) {
      return res.status(409).json({ success: false, message: SLOT_TAKEN_MESSAGE });
    }

    const appointment = await Appointment.create({
      patient: req.user.patientProfile,
      doctor: doctorId,
      date: appointmentDate,
      time: time,
      reason: reason,
      status: 'Waiting',
      bookedFor,
      createdBy: req.user._id,
      // Inherit the doctor's clinic so the appointment is visible to clinic staff.
      clinicId: doctor.clinicId || req.clinicId,
    });

    const populated = await Appointment.findById(appointment._id)
      .populate('doctor', 'name email');

    res.status(201).json({ success: true, data: populated });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: SLOT_TAKEN_MESSAGE });
    }
    next(error);
  }
};

// Get all appointments for the authenticated patient
exports.getPatientAppointments = async (req, res, next) => {
  try {
    if (!req.user.patientProfile) {
      return res.status(404).json({ success: false, message: 'Patient profile not found.' });
    }

    const query = { patient: req.user.patientProfile };

    // Filter by status if provided (e.g., ?status=Waiting)
    if (req.query.status) {
      const s = String(req.query.status);
      if (APPOINTMENT_STATUS_VALUES.includes(s)) query.status = s;
    }

    // Exclude soft-deleted appointments (audit BE-8).
    query.deletedAt = null;

    // BE-12: paginate the patient's appointment list. Defaults (page 1,
    // limit 50) cap unbounded result sets; clients that ignore pagination
    // still get a usable first page. `pagination` metadata follows the
    // backend convention so callers can render controls if needed.
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 100);
    const skip = (page - 1) * limit;

    const [appointments, total] = await Promise.all([
      Appointment.find(query)
        .populate('doctor', 'name email')
        .sort({ date: -1 })
        .skip(skip)
        .limit(limit),
      Appointment.countDocuments(query),
    ]);

    res.json({
      success: true,
      data: appointments,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNextPage: skip + appointments.length < total,
      },
    });
  } catch (error) {
    next(error);
  }
};

// Get specific appointment details
exports.getAppointmentDetails = async (req, res, next) => {
  try {
    if (!req.user.patientProfile) {
      return res.status(404).json({ success: false, message: 'Patient profile not found.' });
    }

    const query = buildAliasQuery(req.params.id, 'displayId', { deletedAt: null });
    const appointment = await Appointment.findOne(query)
      .populate('doctor', 'name email');

    if (!appointment) {
      return res.status(404).json({ success: false, message: 'Appointment not found.' });
    }

    // Security check: Ensure the appointment belongs to the authenticated patient
    if (appointment.patient.toString() !== req.user.patientProfile.toString()) {
      return res.status(403).json({ success: false, message: 'Unauthorized to view this appointment.' });
    }

    res.json({ success: true, data: appointment });
  } catch (error) {
    next(error);
  }
};

// Cancel an appointment (set status to 'Cancelled')
exports.cancelAppointment = async (req, res, next) => {
  try {
    if (!req.user.patientProfile) {
      return res.status(404).json({ success: false, message: 'Patient profile not found.' });
    }

    const query = buildAliasQuery(req.params.id, 'displayId', { deletedAt: null });
    const appointment = await Appointment.findOne(query);

    if (!appointment) {
      return res.status(404).json({ success: false, message: 'Appointment not found.' });
    }

    // Security check: Ensure the appointment belongs to the authenticated patient
    if (appointment.patient.toString() !== req.user.patientProfile.toString()) {
      return res.status(403).json({ success: false, message: 'Unauthorized to cancel this appointment.' });
    }

    // Only allow cancelling appointments that are in 'Waiting' or 'Confirmed'
    // status. §3.2 (OQ#3=Option B): 'Confirmed' is cancellable like 'Waiting'.
    if (appointment.status !== 'Waiting' && appointment.status !== 'Confirmed') {
      return res.status(400).json({
        success: false,
        message: `Cannot cancel appointment with status '${appointment.status}'. Only 'Waiting' or 'Confirmed' appointments can be cancelled.`,
      });
    }

    appointment.status = 'Cancelled';
    await appointment.save();

    const populated = await Appointment.findById(appointment._id)
      .populate('doctor', 'name email')
      .populate('patient', 'name phone');

    // CR-3: emit only to the owning doctor and the owning patient's user room.
    // The actor on this patient-portal route IS the patient, so req.user._id is
    // the patient's userId. patient.phone is stripped for the doctor recipient;
    // doctor.email is stripped for the patient recipient. Never broadcast PHI
    // globally across clinics/users.
    const io = req.app.get('io');
    if (io) {
      const doctorId = populated.doctor && populated.doctor._id ? populated.doctor._id : populated.doctor;
      const patientUserId = req.user._id;
      const doctorPayload = {
        id: appointment._id,
        status: 'Cancelled',
        appointment: stripPatientPhone(populated),
      };
      const patientPayload = {
        id: appointment._id,
        status: 'Cancelled',
        appointment: stripDoctorEmail(populated),
      };
      io.to(`user:${doctorId}`).emit('appointment:statusUpdate', doctorPayload);
      io.to(`user:${patientUserId}`).emit('appointment:statusUpdate', patientPayload);
    }

    res.json({ success: true, data: populated });
  } catch (error) {
    next(error);
  }
};

// Reschedule an appointment (update date and/or time)
exports.rescheduleAppointment = async (req, res, next) => {
  try {
    if (!req.user.patientProfile) {
      return res.status(404).json({ success: false, message: 'Patient profile not found.' });
    }

    const { date, time } = req.body;

    // Validate required fields
    if (!date || !time) {
      return res.status(400).json({ success: false, message: 'Date and time are required for rescheduling.' });
    }
    if (!/^\d{2}:\d{2}$/.test(time)) {
      return res.status(400).json({ success: false, message: 'Time must be in HH:MM format.' });
    }

    const newDate = startOfDayUTC(date);
    if (Number.isNaN(newDate.getTime())) {
      return res.status(400).json({ success: false, message: 'Invalid appointment date.' });
    }

    // Prevent rescheduling to the past
    const todayStart = startOfDayUTC(new Date());
    if (newDate < todayStart) {
      return res.status(400).json({ success: false, message: 'Cannot reschedule to a date in the past.' });
    }

    const query = buildAliasQuery(req.params.id, 'displayId', { deletedAt: null });
    const appointment = await Appointment.findOne(query);

    if (!appointment) {
      return res.status(404).json({ success: false, message: 'Appointment not found.' });
    }

    // Security check: Ensure the appointment belongs to the authenticated patient
    if (appointment.patient.toString() !== req.user.patientProfile.toString()) {
      return res.status(403).json({ success: false, message: 'Unauthorized to reschedule this appointment.' });
    }

    // Only allow rescheduling appointments that are in 'Waiting' or 'Confirmed'
    // status. §3.2 (OQ#3=Option B): 'Confirmed' is reschedulable like 'Waiting'.
    if (appointment.status !== 'Waiting' && appointment.status !== 'Confirmed') {
      return res.status(400).json({
        success: false,
        message: `Cannot reschedule appointment with status '${appointment.status}'. Only 'Waiting' or 'Confirmed' appointments can be rescheduled.`,
      });
    }

    // Check if the new time slot is available for the same doctor. Exclude the
    // appointment being rescheduled from the conflict set. The status filter
    // stays in sync with the partial unique index (audit DB-1 / BE-3).
    const slotTaken = await isSlotTaken(appointment.doctor, date, time, appointment._id);

    if (slotTaken) {
      return res.status(409).json({ success: false, message: SLOT_TAKEN_MESSAGE });
    }

    appointment.date = newDate;
    appointment.time = time;
    await appointment.save();

    const populated = await Appointment.findById(appointment._id)
      .populate('doctor', 'name email')
      .populate('patient', 'name phone');

    // CR-3: targeted emit to owning doctor + owning patient's user room only.
    // The actor here is the patient (req.user._id). PHI is sanitized per
    // recipient (patient.phone hidden from doctor, doctor.email from patient).
    const io = req.app.get('io');
    if (io) {
      const doctorId = populated.doctor && populated.doctor._id ? populated.doctor._id : populated.doctor;
      const patientUserId = req.user._id;
      io.to(`user:${doctorId}`).emit('appointment:updated', stripPatientPhone(populated));
      io.to(`user:${patientUserId}`).emit('appointment:updated', stripDoctorEmail(populated));
    }

    res.json({ success: true, data: populated });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: SLOT_TAKEN_MESSAGE });
    }
    next(error);
  }
};

// Get available time slots for a specific doctor on a given date
exports.getAvailableSlots = async (req, res, next) => {
  try {
    const { doctorId } = req.params;
    const { date } = req.query;

    if (!date) {
      return res.status(400).json({ success: false, message: 'Date query parameter is required (YYYY-MM-DD).' });
    }

    const slotDate = startOfDayUTC(date);
    if (Number.isNaN(slotDate.getTime())) {
      return res.status(400).json({ success: false, message: 'Invalid date format.' });
    }

    // Validate that the doctor exists and has the 'doctor' role
    const doctor = await User.findById(doctorId).populate('role');
    if (!doctor || !doctor.role || doctor.role.slug !== 'doctor') {
      return res.status(404).json({ success: false, message: 'Doctor not found.' });
    }

    // Available time slots come from the shared grid (09:00–17:00, 30-min) so
    // the grid shown to patients matches the grid the booking flow validates
    // against. Audit BE-9 tracks making this doctor-configurable.
    const allSlots = DEFAULT_SLOT_GRID;

    // Booked times exclude Cancelled appointments — stays in sync with the
    // partial unique index and with isSlotTaken (audit BE-2).
    const bookedTimes = await getBookedTimes(doctorId, date);

    const availableSlots = allSlots.map(slot => ({
      time: slot,
      available: !bookedTimes.has(slot),
    }));

    res.json({ success: true, data: { date: date, doctorId: doctorId, doctorName: doctor.name, slots: availableSlots } });
  } catch (error) {
    next(error);
  }
};

// ---------------------------------------------------------------------------
// Dependents (book-for-someone-else, audit #22)
// Dependents live inside the authenticated patient's own Patient document, so
// no cross-Patient scoping is required. All handlers are keyed on
// req.user.patientProfile.
// ---------------------------------------------------------------------------

// List the authenticated patient's dependents
exports.getDependents = async (req, res, next) => {
  try {
    if (!req.user.patientProfile) {
      return res.status(404).json({ success: false, message: 'Patient profile not found.' });
    }
    const patient = await Patient.findById(req.user.patientProfile).select('dependents');
    if (!patient) {
      return res.status(404).json({ success: false, message: 'Patient profile not found.' });
    }
    res.json({ success: true, data: patient.dependents });
  } catch (error) {
    next(error);
  }
};

// Add a dependent
exports.addDependent = async (req, res, next) => {
  try {
    if (!req.user.patientProfile) {
      return res.status(404).json({ success: false, message: 'Patient profile not found.' });
    }
    const { name, age, gender, bloodGroup, relation } = req.body;
    if (!name || !relation) {
      return res.status(400).json({ success: false, message: 'Name and relation are required for a dependent.' });
    }
    const patient = await Patient.findById(req.user.patientProfile);
    if (!patient) {
      return res.status(404).json({ success: false, message: 'Patient profile not found.' });
    }
    patient.dependents.push({ name, age, gender, bloodGroup, relation });
    await patient.save();
    res.status(201).json({ success: true, data: patient.dependents });
  } catch (error) {
    next(error);
  }
};

// Update a dependent
exports.updateDependent = async (req, res, next) => {
  try {
    if (!req.user.patientProfile) {
      return res.status(404).json({ success: false, message: 'Patient profile not found.' });
    }
    const patient = await Patient.findById(req.user.patientProfile);
    if (!patient) {
      return res.status(404).json({ success: false, message: 'Patient profile not found.' });
    }
    const dependent = patient.dependents.id(req.params.id);
    if (!dependent) {
      return res.status(404).json({ success: false, message: 'Dependent not found.' });
    }
    const { name, age, gender, bloodGroup, relation } = req.body;
    if (name !== undefined) dependent.name = name;
    if (age !== undefined) dependent.age = age;
    if (gender !== undefined) dependent.gender = gender;
    if (bloodGroup !== undefined) dependent.bloodGroup = bloodGroup;
    if (relation !== undefined) dependent.relation = relation;
    await patient.save();
    res.json({ success: true, data: patient.dependents });
  } catch (error) {
    next(error);
  }
};

// Remove a dependent
exports.removeDependent = async (req, res, next) => {
  try {
    if (!req.user.patientProfile) {
      return res.status(404).json({ success: false, message: 'Patient profile not found.' });
    }
    const patient = await Patient.findById(req.user.patientProfile);
    if (!patient) {
      return res.status(404).json({ success: false, message: 'Patient profile not found.' });
    }
    const dependent = patient.dependents.id(req.params.id);
    if (!dependent) {
      return res.status(404).json({ success: false, message: 'Dependent not found.' });
    }
    patient.dependents.pull(req.params.id);
    await patient.save();
    res.json({ success: true, data: patient.dependents });
  } catch (error) {
    next(error);
  }
};

// ---------------------------------------------------------------------------
// Prescription view (audit #23)
// ---------------------------------------------------------------------------

// Get the prescription for one of the patient's own appointments. Falls back
// to any uploaded prescription files for the patient when no structured
// prescription has been written yet.
exports.getPrescription = async (req, res, next) => {
  try {
    if (!req.user.patientProfile) {
      return res.status(404).json({ success: false, message: 'Patient profile not found.' });
    }

    const query = buildAliasQuery(req.params.id, 'displayId', { deletedAt: null });
    const appointment = await Appointment.findOne(query)
      .populate('doctor', 'name email');

    if (!appointment) {
      return res.status(404).json({ success: false, message: 'Appointment not found.' });
    }

    // Ownership: the appointment must belong to the authenticated patient.
    if (appointment.patient.toString() !== req.user.patientProfile.toString()) {
      return res.status(403).json({ success: false, message: 'Unauthorized to view this prescription.' });
    }

    const hasStructured = appointment.prescription &&
      Array.isArray(appointment.prescription.medications) &&
      appointment.prescription.medications.length > 0;

    // Fallback: scanned prescription files uploaded for this patient.
    let files = [];
    if (!hasStructured) {
      files = await File.find({ patient: appointment.patient, type: 'Prescription' })
        .populate('uploadedBy', 'name')
        .sort('-createdAt')
        .select('originalName mimetype size createdAt uploadedBy');
    }

    res.json({
      success: true,
      data: {
        appointment: {
          _id: appointment._id,
          displayId: appointment.displayId,
          doctor: appointment.doctor,
          date: appointment.date,
          time: appointment.time,
          status: appointment.status,
          reason: appointment.reason,
        },
        prescription: hasStructured ? appointment.prescription : null,
        files,
      },
    });
  } catch (error) {
    next(error);
  }
};

// Patient-facing download of a prescription file attached to their own record.
// Enforces patient ownership via req.user.patientProfile and streams the file
// from the shared /uploads directory.
exports.downloadPrescriptionFile = async (req, res, next) => {
  try {
    if (!req.user.patientProfile) {
      return res.status(404).json({ success: false, message: 'Patient profile not found.' });
    }

    const query = buildAliasQuery(req.params.id, 'displayId', { deletedAt: null });
    const appointment = await Appointment.findOne(query).select('patient');
    if (!appointment) {
      return res.status(404).json({ success: false, message: 'Appointment not found.' });
    }
    if (appointment.patient.toString() !== req.user.patientProfile.toString()) {
      return res.status(403).json({ success: false, message: 'Unauthorized.' });
    }

    const file = await File.findById(req.params.fileId);
    if (!file) {
      return res.status(404).json({ success: false, message: 'File not found.' });
    }
    // The file must belong to this patient and be a prescription.
    if (!file.patient || file.patient.toString() !== req.user.patientProfile.toString() || file.type !== 'Prescription') {
      return res.status(403).json({ success: false, message: 'Unauthorized.' });
    }

    const filePath = path.resolve(file.path);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, message: 'File not found on disk.' });
    }

    res.download(filePath, file.originalName);
  } catch (error) {
    next(error);
  }
};
