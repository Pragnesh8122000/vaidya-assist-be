const PrescriptionTemplate = require('../models/PrescriptionTemplate');

// List templates for the authenticated user's clinic.
exports.getTemplates = async (req, res, next) => {
  try {
    const query = {};
    if (req.clinicId) query.clinicId = req.clinicId;

    const templates = await PrescriptionTemplate.find(query)
      .populate('createdBy', 'name')
      .sort('-createdAt');

    res.json({ success: true, data: templates });
  } catch (error) {
    next(error);
  }
};

// Create a template.
exports.createTemplate = async (req, res, next) => {
  try {
    const { name, description, medications = [] } = req.body;
    if (!name || !String(name).trim()) {
      return res.status(400).json({ success: false, message: 'Template name is required.' });
    }
    if (!Array.isArray(medications)) {
      return res.status(400).json({ success: false, message: 'medications must be an array.' });
    }
    for (const m of medications) {
      if (!m || !m.name || !String(m.name).trim()) {
        return res.status(400).json({ success: false, message: 'Each medication requires a name.' });
      }
    }

    const template = await PrescriptionTemplate.create({
      name: String(name).trim(),
      description: description ? String(description).trim() : '',
      medications: medications.map((m) => ({
        name: String(m.name).trim(),
        dosage: m.dosage ? String(m.dosage).trim() : undefined,
        frequency: m.frequency ? String(m.frequency).trim() : undefined,
        duration: m.duration ? String(m.duration).trim() : undefined,
        instructions: m.instructions ? String(m.instructions).trim() : undefined,
      })),
      createdBy: req.user._id,
      clinicId: req.clinicId || req.user.clinicId,
    });

    const populated = await PrescriptionTemplate.findById(template._id)
      .populate('createdBy', 'name');

    res.status(201).json({ success: true, data: populated });
  } catch (error) {
    next(error);
  }
};

// Update a template (clinic-scoped).
exports.updateTemplate = async (req, res, next) => {
  try {
    const query = { _id: req.params.id };
    if (req.clinicId) query.clinicId = req.clinicId;

    const { name, description, medications } = req.body;

    const template = await PrescriptionTemplate.findOne(query);
    if (!template) {
      return res.status(404).json({ success: false, message: 'Template not found.' });
    }

    if (name !== undefined) template.name = String(name).trim();
    if (description !== undefined) template.description = String(description).trim();
    if (Array.isArray(medications)) {
      for (const m of medications) {
        if (!m || !m.name || !String(m.name).trim()) {
          return res.status(400).json({ success: false, message: 'Each medication requires a name.' });
        }
      }
      template.medications = medications.map((m) => ({
        name: String(m.name).trim(),
        dosage: m.dosage ? String(m.dosage).trim() : undefined,
        frequency: m.frequency ? String(m.frequency).trim() : undefined,
        duration: m.duration ? String(m.duration).trim() : undefined,
        instructions: m.instructions ? String(m.instructions).trim() : undefined,
      }));
    }

    await template.save();
    const populated = await PrescriptionTemplate.findById(template._id)
      .populate('createdBy', 'name');

    res.json({ success: true, data: populated });
  } catch (error) {
    next(error);
  }
};

// Delete a template (clinic-scoped).
exports.deleteTemplate = async (req, res, next) => {
  try {
    const query = { _id: req.params.id };
    if (req.clinicId) query.clinicId = req.clinicId;

    const template = await PrescriptionTemplate.findOneAndDelete(query);
    if (!template) {
      return res.status(404).json({ success: false, message: 'Template not found.' });
    }

    res.json({ success: true, message: 'Template deleted.' });
  } catch (error) {
    next(error);
  }
};