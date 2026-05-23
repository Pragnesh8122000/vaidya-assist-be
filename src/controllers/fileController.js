const File = require('../models/File');
const path = require('path');
const fs = require('fs');

// Upload file
exports.uploadFile = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded.' });
    }

    const file = await File.create({
      filename: req.file.filename,
      originalName: req.file.originalname,
      path: req.file.path,
      mimetype: req.file.mimetype,
      size: req.file.size,
      patient: req.body.patient || null,
      type: req.body.type || 'Other',
      description: req.body.description || '',
      uploadedBy: req.user._id
    });

    const populated = await File.findById(file._id)
      .populate('patient', 'name')
      .populate('uploadedBy', 'name');

    res.status(201).json({ success: true, data: populated });
  } catch (error) {
    next(error);
  }
};

// Get all files
exports.getFiles = async (req, res, next) => {
  try {
    const { patient, type, page = 1, limit = 10 } = req.query;
    const query = {};

    if (patient) query.patient = patient;
    if (type) query.type = type;

    const total = await File.countDocuments(query);
    const files = await File.find(query)
      .populate('patient', 'name')
      .populate('uploadedBy', 'name')
      .sort('-createdAt')
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    res.json({
      success: true,
      data: files,
      pagination: { total, page: parseInt(page), pages: Math.ceil(total / limit) }
    });
  } catch (error) {
    next(error);
  }
};

// Download file
exports.downloadFile = async (req, res, next) => {
  try {
    const file = await File.findById(req.params.id);
    if (!file) {
      return res.status(404).json({ success: false, message: 'File not found.' });
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

// Delete file
exports.deleteFile = async (req, res, next) => {
  try {
    const file = await File.findById(req.params.id);
    if (!file) {
      return res.status(404).json({ success: false, message: 'File not found.' });
    }

    // Delete from disk
    const filePath = path.resolve(file.path);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    await File.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'File deleted.' });
  } catch (error) {
    next(error);
  }
};
