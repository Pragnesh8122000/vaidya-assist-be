const User = require('../models/User');
const Role = require('../models/Role');
const { buildAliasQuery } = require('../utils/resolveByIdOrCode');

// CR-2: Doctor (role.slug === 'doctor') is the super-admin and bypasses
// clinic scoping so they can manage staff across clinics. Every other
// role (assistants/admins with `manage_assistants`) is scoped to their
// own `req.clinicId` and cannot enumerate/update/delete users in other
// clinics, nor assign/escalate anyone to the `doctor` super-admin role.
const isSuperAdmin = (req) => !!(req.user && req.user.role && req.user.role.slug === 'doctor');

// Fields a caller is allowed to set/update on a User. Anything else is
// stripped to prevent mass assignment (e.g. `clinicId`, `password` hash,
// `refreshToken`, `doctorId`). `role` is gated separately below.
const ALLOWED_UPDATE_FIELDS = ['name', 'email', 'phone', 'isActive', 'role'];

// SEC-7: explicit allow-list for Role create/update so a caller cannot slip
// in arbitrary schema fields (e.g. `_id`, `__v`, timestamps). `permissions`
// is an array of Permission ObjectIds — Mongoose will validate the ref but
// we keep it as the only structured field the caller may set.
const ALLOWED_ROLE_FIELDS = ['name', 'slug', 'description', 'permissions', 'isDefault'];

function pickAllowedRole(body) {
  const out = {};
  for (const k of ALLOWED_ROLE_FIELDS) {
    if (k in body) out[k] = body[k];
  }
  return out;
}

// 4C-1: escape regex metacharacters in raw user search input before passing
// to $regex, to prevent regex injection / DoS.
const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Resolve a role id (or slug) to its document so we can guard against
// `doctor` assignment/escalation. Returns null when not found / not sent.
const resolveRole = async (roleRef) => {
  if (!roleRef) return null;
  try {
    return await Role.findById(roleRef);
  } catch {
    return null;
  }
};

// Get all users (assistants/staff)
exports.getUsers = async (req, res, next) => {
  try {
    const { role, search, page = 1, limit = 10 } = req.query;
    const query = {};

    // CR-2: non-doctor callers only see users in their own clinic.
    if (!isSuperAdmin(req)) {
      query.clinicId = req.clinicId;
    }

    if (role) query.role = role;
    if (search) {
      const term = escapeRegex(search);
      query.$or = [
        { name: { $regex: term, $options: 'i' } },
        { email: { $regex: term, $options: 'i' } }
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

    // CR-2: a non-doctor caller cannot assign the `doctor` super-admin role.
    if (role) {
      const targetRole = await resolveRole(role);
      if (targetRole && targetRole.slug === 'doctor' && !isSuperAdmin(req)) {
        return res.status(403).json({ success: false, message: 'Cannot assign doctor role' });
      }
    }

    // CR-2: pin the new user to the caller's clinic for non-doctor staff.
    // A doctor (super-admin) may specify `clinicId` in the body or rely on
    // the User model's uuid default.
    const payload = {
      name, email, password, phone,
      role,
      createdBy: req.user._id
    };
    if (isSuperAdmin(req)) {
      if (req.body.clinicId) payload.clinicId = req.body.clinicId;
    } else {
      payload.clinicId = req.clinicId;
    }

    const user = await User.create(payload);

    const populated = await User.findById(user._id).populate('role');
    res.status(201).json({ success: true, data: populated });
  } catch (error) {
    next(error);
  }
};

// Update user
exports.updateUser = async (req, res, next) => {
  try {
    // CR-2: build update strictly from an allow-list to prevent mass
    // assignment of `clinicId`, `password`, `refreshToken`, `doctorId`, etc.
    const update = {};
    for (const field of ALLOWED_UPDATE_FIELDS) {
      if (req.body[field] !== undefined) {
        update[field] = req.body[field];
      }
    }

    // CR-2: a non-doctor caller cannot escalate anyone to `doctor`.
    if (update.role) {
      const targetRole = await resolveRole(update.role);
      if (targetRole && targetRole.slug === 'doctor' && !isSuperAdmin(req)) {
        return res.status(403).json({ success: false, message: 'Cannot escalate to doctor role' });
      }
    }

    // CR-2: scope the lookup to the caller's clinic for non-doctor staff so
    // they cannot touch users in other clinics. `clinicId` is already
    // stripped from `update` by the allow-list, so it cannot be changed.
    const extra = {};
    if (!isSuperAdmin(req)) {
      extra.clinicId = req.clinicId;
    }

    const query = buildAliasQuery(req.params.id, 'username', extra);
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
    // CR-2: scope the lookup to the caller's clinic for non-doctor staff.
    const extra = {};
    if (!isSuperAdmin(req)) {
      extra.clinicId = req.clinicId;
    }

    const query = buildAliasQuery(req.params.id, 'username', extra);
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
    // SEC-7: build from an allow-list to prevent mass assignment of `_id` /
    // `__v` / timestamps / any future internal field.
    const payload = pickAllowedRole(req.body);
    const role = await Role.create(payload);
    const populated = await Role.findById(role._id).populate('permissions');
    res.status(201).json({ success: true, data: populated });
  } catch (error) {
    next(error);
  }
};

// Update role
exports.updateRole = async (req, res, next) => {
  try {
    // SEC-7: allow-list the update payload.
    const update = pickAllowedRole(req.body);
    const role = await Role.findByIdAndUpdate(req.params.id, update, { new: true }).populate('permissions');
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