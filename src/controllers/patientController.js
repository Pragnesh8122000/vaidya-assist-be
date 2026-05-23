const Patient = require('../models/Patient');

// Get all patients
exports.getPatients = async (req, res, next) => {
  try {
    const { search, page = 1, limit = 10, gender, bloodGroup } = req.query;
    const query = {};

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }
    if (gender) query.gender = gender;
    if (bloodGroup) query.bloodGroup = bloodGroup;

    const total = await Patient.countDocuments(query);
    const patients = await Patient.find(query)
      .populate('createdBy', 'name')
      .sort('-createdAt')
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    res.json({
      success: true,
      data: patients,
      pagination: { total, page: parseInt(page), pages: Math.ceil(total / limit) }
    });
  } catch (error) {
    next(error);
  }
};

// Get single patient
exports.getPatient = async (req, res, next) => {
  try {
    const patient = await Patient.findById(req.params.id)
      .populate('createdBy', 'name')
      .populate('medicalNotes.createdBy', 'name');
    if (!patient) {
      return res.status(404).json({ success: false, message: 'Patient not found.' });
    }
    res.json({ success: true, data: patient });
  } catch (error) {
    next(error);
  }
};

// Create patient
exports.createPatient = async (req, res, next) => {
  try {
    const patient = await Patient.create({ ...req.body, createdBy: req.user._id });
    res.status(201).json({ success: true, data: patient });
  } catch (error) {
    next(error);
  }
};

// Update patient
exports.updatePatient = async (req, res, next) => {
  try {
    const patient = await Patient.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!patient) {
      return res.status(404).json({ success: false, message: 'Patient not found.' });
    }
    res.json({ success: true, data: patient });
  } catch (error) {
    next(error);
  }
};

// Delete patient
exports.deletePatient = async (req, res, next) => {
  try {
    const patient = await Patient.findByIdAndDelete(req.params.id);
    if (!patient) {
      return res.status(404).json({ success: false, message: 'Patient not found.' });
    }
    res.json({ success: true, message: 'Patient deleted.' });
  } catch (error) {
    next(error);
  }
};

// Add medical note
exports.addMedicalNote = async (req, res, next) => {
  try {
    const patient = await Patient.findById(req.params.id);
    if (!patient) {
      return res.status(404).json({ success: false, message: 'Patient not found.' });
    }

    patient.medicalNotes.push({ note: req.body.note, createdBy: req.user._id });
    await patient.save();

    res.json({ success: true, data: patient });
  } catch (error) {
    next(error);
  }
};
