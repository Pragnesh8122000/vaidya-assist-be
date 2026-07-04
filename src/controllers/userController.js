const User = require('../models/User');
const Role = require('../models/Role');
const { buildAliasQuery } = require('../utils/resolveByIdOrCode');

// Get all users (assistants/staff)
exports.getUsers = async (req, res, next) => {
  try {
    const { role, search, page = 1, limit = 10 } = req.query;
    const query = {};

    if (role) query.role = role;
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    const total = await User.countDocuments(query);
    const users = await User.find(query)
      .populate('role')
      .populate('createdBy', 'name')
      .sort('-createdAt')
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    res.json({
      success: true,
      data: users,
      pagination: { total, page: parseInt(page), pages: Math.ceil(total / limit) }
    });
  } catch (error) {
    next(error);
  }
};

// Create user (assistant/staff)
exports.createUser = async (req, res, next) => {
  try {
    const { name, email, password, phone, role } = req.body;

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Email already exists.' });
    }

    const user = await User.create({
      name, email, password, phone,
      role,
      createdBy: req.user._id
    });

    const populated = await User.findById(user._id).populate('role');
    res.status(201).json({ success: true, data: populated });
  } catch (error) {
    next(error);
  }
};

// Update user
exports.updateUser = async (req, res, next) => {
  try {
    const { name, phone, role, isActive } = req.body;
    const update = {};
    if (name) update.name = name;
    if (phone) update.phone = phone;
    if (role) update.role = role;
    if (isActive !== undefined) update.isActive = isActive;

    const query = buildAliasQuery(req.params.id, 'username');
    const user = await User.findOneAndUpdate(query, update, { new: true }).populate('role');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    res.json({ success: true, data: user });
  } catch (error) {
    next(error);
  }
};

// Delete user
exports.deleteUser = async (req, res, next) => {
  try {
    const query = buildAliasQuery(req.params.id, 'username');
    const user = await User.findOneAndDelete(query);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }
    res.json({ success: true, message: 'User deleted.' });
  } catch (error) {
    next(error);
  }
};

// Get all roles
exports.getRoles = async (req, res, next) => {
  try {
    const roles = await Role.find().populate('permissions');
    res.json({ success: true, data: roles });
  } catch (error) {
    next(error);
  }
};

// Create role
exports.createRole = async (req, res, next) => {
  try {
    const role = await Role.create(req.body);
    const populated = await Role.findById(role._id).populate('permissions');
    res.status(201).json({ success: true, data: populated });
  } catch (error) {
    next(error);
  }
};

// Update role
exports.updateRole = async (req, res, next) => {
  try {
    const role = await Role.findByIdAndUpdate(req.params.id, req.body, { new: true }).populate('permissions');
    if (!role) {
      return res.status(404).json({ success: false, message: 'Role not found.' });
    }
    res.json({ success: true, data: role });
  } catch (error) {
    next(error);
  }
};

// Delete role
exports.deleteRole = async (req, res, next) => {
  try {
    const usersWithRole = await User.countDocuments({ role: req.params.id });
    if (usersWithRole > 0) {
      return res.status(400).json({ success: false, message: 'Cannot delete role assigned to users.' });
    }
    await Role.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Role deleted.' });
  } catch (error) {
    next(error);
  }
};

// Get all permissions
exports.getPermissions = async (req, res, next) => {
  try {
    const Permission = require('../models/Permission');
    const permissions = await Permission.find().sort('module');
    res.json({ success: true, data: permissions });
  } catch (error) {
    next(error);
  }
};
