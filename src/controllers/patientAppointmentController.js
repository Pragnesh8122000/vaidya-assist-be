const User = require('../models/User');
const Patient = require('../models/Patient');
const Appointment = require('../models/Appointment');

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
    const doctors = await User.find({
      $exists: { role: true }
    }).populate('role');

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

    if (!req.user.patientProfile) {
      return res.status(400).json({ success: false, message: 'No patient profile associated with this user.' });
    }

    // Validate doctor exists and is a doctor
    const doctor = await User.findById(doctorId).populate('role');
    if (!doctor || !doctor.role || doctor.role.slug !== 'doctor') {
      return res.status(400).json({ success: false, message: 'Invalid doctor selected.' });
    }

    // Check for conflict (simplified check)
    const conflict = await Appointment.findOne({
      doctor: doctorId,
      date: new Date(date),
      time: time
    });

    if (conflict) {
      return res.status(400).json({ success: false, message: 'This time slot is already booked.' });
    }

    const appointment = await Appointment.create({
      patient: req.user.patientProfile,
      doctor: doctorId,
      date: new Date(date),
      time: time,
      reason: reason,
      status: 'Waiting',
      createdBy: req.user._id
    });

    res.status(201).json({ success: true, data: appointment });
  } catch (error) {
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
