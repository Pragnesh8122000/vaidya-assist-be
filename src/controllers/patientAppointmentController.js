const User = require('../models/User');
const Patient = require('../models/Patient');
const Appointment = require('../models/Appointment');
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
    const doctors = await User.find({ role: { $exists: true } }).populate('role');

    // Filter users who have the 'doctor' role
    const filteredDoctors = doctors.filter(user =>
      user.role && user.role.slug === 'doctor'
    );

    res.json({ success: true, data: filteredDoctors });
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
