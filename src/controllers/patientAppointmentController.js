const User = require('../models/User');
const Patient = require('../models/Patient');
const Appointment = require('../models/Appointment');
const File = require('../models/File');
const path = require('path');
const fs = require('fs');
const { fetchDoctors } = require('../utils/doctorQuery');
const { startOfDayUTC, endOfDayUTC } = require('../utils/date');

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

    const patient = await Patient.findByIdAndUpdate(
      req.user.patientProfile,
      req.body,
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
exports.getDoctors = async (req, res, next) => {
  try {
    const { search } = req.query;
    const result = await fetchDoctors({ search });
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

    // Validate doctor exists and is a doctor
    const doctor = await User.findById(doctorId).populate('role');
    if (!doctor || !doctor.role || doctor.role.slug !== 'doctor') {
      return res.status(400).json({ success: false, message: 'Invalid doctor selected.' });
    }

    // Scope the conflict check to the same UTC day so it matches stored dates.
    const conflict = await Appointment.findOne({
      doctor: doctorId,
      date: { $gte: startOfDayUTC(date), $lte: endOfDayUTC(date) },
      time: time,
    });

    if (conflict) {
      return res.status(409).json({ success: false, message: 'This time slot is already booked.' });
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
      return res.status(409).json({ success: false, message: 'This time slot is already booked.' });
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
      query.status = req.query.status;
    }

    const appointments = await Appointment.find(query)
      .populate('doctor', 'name email')
      .sort({ date: -1 });

    res.json({ success: true, data: appointments });
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

    const appointment = await Appointment.findById(req.params.id)
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

    const appointment = await Appointment.findById(req.params.id);

    if (!appointment) {
      return res.status(404).json({ success: false, message: 'Appointment not found.' });
    }

    // Security check: Ensure the appointment belongs to the authenticated patient
    if (appointment.patient.toString() !== req.user.patientProfile.toString()) {
      return res.status(403).json({ success: false, message: 'Unauthorized to cancel this appointment.' });
    }

    // Only allow cancelling appointments that are in 'Waiting' status
    if (appointment.status !== 'Waiting') {
      return res.status(400).json({
        success: false,
        message: `Cannot cancel appointment with status '${appointment.status}'. Only 'Waiting' appointments can be cancelled.`,
      });
    }

    appointment.status = 'Cancelled';
    await appointment.save();

    const populated = await Appointment.findById(appointment._id)
      .populate('doctor', 'name email')
      .populate('patient', 'name phone');

    // Emit socket event for real-time updates
    const io = req.app.get('io');
    if (io) {
      io.emit('appointment:statusUpdate', {
        id: appointment._id,
        status: 'Cancelled',
        appointment: populated,
      });
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

    const appointment = await Appointment.findById(req.params.id);

    if (!appointment) {
      return res.status(404).json({ success: false, message: 'Appointment not found.' });
    }

    // Security check: Ensure the appointment belongs to the authenticated patient
    if (appointment.patient.toString() !== req.user.patientProfile.toString()) {
      return res.status(403).json({ success: false, message: 'Unauthorized to reschedule this appointment.' });
    }

    // Only allow rescheduling appointments that are in 'Waiting' status
    if (appointment.status !== 'Waiting') {
      return res.status(400).json({
        success: false,
        message: `Cannot reschedule appointment with status '${appointment.status}'. Only 'Waiting' appointments can be rescheduled.`,
      });
    }

    // Check if the new time slot is available for the same doctor
    const conflict = await Appointment.findOne({
      doctor: appointment.doctor,
      date: { $gte: startOfDayUTC(date), $lte: endOfDayUTC(date) },
      time: time,
      status: { $ne: 'Cancelled' },
    });

    if (conflict) {
      return res.status(409).json({ success: false, message: 'The requested time slot is already booked.' });
    }

    appointment.date = newDate;
    appointment.time = time;
    await appointment.save();

    const populated = await Appointment.findById(appointment._id)
      .populate('doctor', 'name email')
      .populate('patient', 'name phone');

    // Emit socket event for real-time updates
    const io = req.app.get('io');
    if (io) {
      io.emit('appointment:updated', populated);
    }

    res.json({ success: true, data: populated });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: 'The requested time slot is already booked.' });
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

    // Define available time slots (09:00 to 17:00, 30-minute intervals)
    const allSlots = [];
    for (let hour = 9; hour < 17; hour++) {
      allSlots.push(`${String(hour).padStart(2, '0')}:00`);
      allSlots.push(`${String(hour).padStart(2, '0')}:30`);
    }

    // Find all non-cancelled appointments for this doctor on this date
    const bookedAppointments = await Appointment.find({
      doctor: doctorId,
      date: { $gte: startOfDayUTC(date), $lte: endOfDayUTC(date) },
      status: { $ne: 'Cancelled' },
    }).select('time -_id');

    const bookedTimes = new Set(bookedAppointments.map(apt => apt.time));

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

    const appointment = await Appointment.findById(req.params.id)
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
// Mirrors fileController.downloadFile but enforces patient ownership instead of
// the staff-only `view_files` permission.
exports.downloadPrescriptionFile = async (req, res, next) => {
  try {
    if (!req.user.patientProfile) {
      return res.status(404).json({ success: false, message: 'Patient profile not found.' });
    }

    const appointment = await Appointment.findById(req.params.id).select('patient');
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
