const Patient = require('../models/Patient');
const { buildAliasQuery } = require('../utils/resolveByIdOrCode');

// 4C-1: escape regex metacharacters in raw user search input before passing
// to $regex, to prevent regex injection / DoS.
const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// 4C-1: allow-lists for scalar enum filters so unknown / object values are
// ignored rather than passed straight into the Mongoose query.
const GENDER_VALUES = ['Male', 'Female', 'Other'];

// SEC-7: explicit allow-list of patient fields a caller may set on create /
// update. Server-controlled / identity fields (clinicId, user, createdBy,
// dependents, medicalNotes, displayId, _id) are excluded to prevent mass
// assignment.
const ALLOWED_PATIENT_FIELDS = [
  'name',
  'age',
  'gender',
  'phone',
  'email',
  'address',
  'bloodGroup',
];

function pickAllowed(body, allowlist) {
  const out = {};
  for (const k of allowlist) {
    if (k in body) out[k] = body[k];
  }
  return out;
}

function clinicScope(req) {
  return req.clinicId ? { clinicId: req.clinicId } : {};
}

// Get all patients
exports.getPatients = async (req, res, next) => {
  try {
    const { search, page = 1, limit = 10, gender, bloodGroup } = req.query;
    const query = { ...clinicScope(req) };

    if (search) {
      const term = escapeRegex(search);
      query.$or = [
        { name: { $regex: term, $options: 'i' } },
        { phone: { $regex: term, $options: 'i' } },
        { email: { $regex: term, $options: 'i' } }
      ];
    }
    if (gender) {
      const g = String(gender);
      if (GENDER_VALUES.includes(g)) query.gender = g;
    }
    if (bloodGroup) query.bloodGroup = String(bloodGroup);

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

    // SEC-7: build the payload from an allow-list only, then layer the
    // server-controlled fields on top so a caller cannot set clinicId /
    // createdBy / user / dependents / displayId via the request body.
    const payload = pickAllowed(req.body, ALLOWED_PATIENT_FIELDS);
    payload.name = req.body.name.trim();
    payload.createdBy = req.user._id;
    payload.clinicId = req.user.clinicId || req.clinicId;
    const patient = await Patient.create(payload);
    res.status(201).json({ success: true, data: patient });
  } catch (error) {
    next(error);
  }
};

// Update patient
exports.updatePatient = async (req, res, next) => {
  try {
    // SEC-7: allow-list the update to prevent mass assignment of clinicId /
    // createdBy / user / dependents / medicalNotes / displayId / _id.
    const safeBody = pickAllowed(req.body, ALLOWED_PATIENT_FIELDS);
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
