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

// Get single medicine
exports.getMedicine = async (req, res, next) => {
  try {
    const medicine = await Medicine.findById(req.params.id);
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
    const medicine = await Medicine.create({ ...req.body, createdBy: req.user._id });
    res.status(201).json({ success: true, data: medicine });
  } catch (error) {
    next(error);
  }
};

// Update medicine
exports.updateMedicine = async (req, res, next) => {
  try {
    const medicine = await Medicine.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
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
    const medicine = await Medicine.findByIdAndDelete(req.params.id);
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
      $expr: { $lte: ['$stock', '$lowStockThreshold'] }
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
      expiryDate: { $lte: thirtyDaysFromNow, $gte: new Date() }
    }).sort('expiryDate');
    res.json({ success: true, data: medicines });
  } catch (error) {
    next(error);
  }
};
