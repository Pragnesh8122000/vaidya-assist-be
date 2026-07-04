const Patient = require('../models/Patient');
const { buildAliasQuery } = require('../utils/resolveByIdOrCode');

function clinicScope(req) {
  return req.clinicId ? { clinicId: req.clinicId } : {};
}

// Get all patients
exports.getPatients = async (req, res, next) => {
  try {
    const { search, page = 1, limit = 10, gender, bloodGroup } = req.query;
    const query = { ...clinicScope(req) };

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
    const query = buildAliasQuery(req.params.id, 'displayId', clinicScope(req));
    const patient = await Patient.findOne(query)
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
    if (!req.body.name || typeof req.body.name !== 'string' || req.body.name.trim().length === 0) {
      return res.status(400).json({ success: false, message: 'Patient name is required.' });
    }

    const patient = await Patient.create({
      ...req.body,
      name: req.body.name.trim(),
      createdBy: req.user._id,
      clinicId: req.user.clinicId || req.clinicId
    });
    res.status(201).json({ success: true, data: patient });
  } catch (error) {
    next(error);
  }
};

// Update patient
exports.updatePatient = async (req, res, next) => {
  try {
    // Preserve clinic ownership on updates; ignore any clinicId/createdBy supplied in body.
    const { clinicId: _ignored, createdBy: _ignored2, ...safeBody } = req.body;
    const query = buildAliasQuery(req.params.id, 'displayId', clinicScope(req));
    const patient = await Patient.findOneAndUpdate(query, safeBody, { new: true, runValidators: true });
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
    const query = buildAliasQuery(req.params.id, 'displayId', clinicScope(req));
    const patient = await Patient.findOneAndDelete(query);
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
    const query = buildAliasQuery(req.params.id, 'displayId', clinicScope(req));
    const patient = await Patient.findOne(query);
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
