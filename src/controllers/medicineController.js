const Medicine = require('../models/Medicine');

// Get all medicines
exports.getMedicines = async (req, res, next) => {
  try {
    const { search, category, lowStock, expired, page = 1, limit = 10 } = req.query;
    const query = {};

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { genericName: { $regex: search, $options: 'i' } }
      ];
    }
    if (category) query.category = category;
    if (lowStock === 'true') {
      query.$expr = { $lte: ['$stock', '$lowStockThreshold'] };
    }
    if (expired === 'true') {
      query.expiryDate = { $lte: new Date() };
    }

    // Multi-clinic scoping: restrict to the authenticated user's clinic.
    if (req.clinicId) {
      query.clinicId = req.clinicId;
    }

    const total = await Medicine.countDocuments(query);
    const medicines = await Medicine.find(query)
      .sort('-createdAt')
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    res.json({
      success: true,
      data: medicines,
      pagination: { total, page: parseInt(page), pages: Math.ceil(total / limit) }
    });
  } catch (error) {
    next(error);
  }
};

function clinicScope(req) {
  return req.clinicId ? { clinicId: req.clinicId } : {};
}

// Get single medicine
exports.getMedicine = async (req, res, next) => {
  try {
    const query = { _id: req.params.id, ...clinicScope(req) };
    const medicine = await Medicine.findOne(query);
    if (!medicine) {
      return res.status(404).json({ success: false, message: 'Medicine not found.' });
    }
    res.json({ success: true, data: medicine });
  } catch (error) {
    next(error);
  }
};

// Create medicine
exports.createMedicine = async (req, res, next) => {
  try {
    const { name, stock } = req.body;
    if (!name || stock === undefined || stock === null || stock === '') {
      return res.status(400).json({ success: false, message: 'Medicine name and stock are required.' });
    }

    const medicine = await Medicine.create({
      ...req.body,
      createdBy: req.user._id,
      clinicId: req.user.clinicId || req.clinicId,
    });
    res.status(201).json({ success: true, data: medicine });
  } catch (error) {
    next(error);
  }
};

// Update medicine
exports.updateMedicine = async (req, res, next) => {
  try {
    // Preserve clinic ownership on updates; ignore any clinicId/createdBy supplied in body.
    const { clinicId: _ignored, createdBy: _ignored2, ...safeBody } = req.body;
    const query = { _id: req.params.id, ...clinicScope(req) };
    const medicine = await Medicine.findOneAndUpdate(query, safeBody, { new: true, runValidators: true });
    if (!medicine) {
      return res.status(404).json({ success: false, message: 'Medicine not found.' });
    }
    res.json({ success: true, data: medicine });
  } catch (error) {
    next(error);
  }
};

// Delete medicine
exports.deleteMedicine = async (req, res, next) => {
  try {
    const query = { _id: req.params.id, ...clinicScope(req) };
    const medicine = await Medicine.findOneAndDelete(query);
    if (!medicine) {
      return res.status(404).json({ success: false, message: 'Medicine not found.' });
    }
    res.json({ success: true, message: 'Medicine deleted.' });
  } catch (error) {
    next(error);
  }
};

// Get low stock medicines
exports.getLowStock = async (req, res, next) => {
  try {
    const medicines = await Medicine.find({
      $expr: { $lte: ['$stock', '$lowStockThreshold'] },
      ...(req.clinicId ? { clinicId: req.clinicId } : {}),
    }).sort('stock');
    res.json({ success: true, data: medicines });
  } catch (error) {
    next(error);
  }
};

// Get expiring soon medicines
exports.getExpiringSoon = async (req, res, next) => {
  try {
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    const medicines = await Medicine.find({
      expiryDate: { $lte: thirtyDaysFromNow, $gte: new Date() },
      ...(req.clinicId ? { clinicId: req.clinicId } : {}),
    }).sort('expiryDate');
    res.json({ success: true, data: medicines });
  } catch (error) {
    next(error);
  }
};
