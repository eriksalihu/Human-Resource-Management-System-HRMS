/**
 * @file backend/src/controllers/user.controller.js
 * @description User management controller with CRUD, search, and soft delete
 * @author Dev A
 */

const User = require('../models/User');
const Role = require('../models/Role');
const { AppError } = require('../middleware/errorHandler');

/**
 * GET /api/users
 * Retrieve a paginated, searchable list of users.
 * Supports ?page, ?limit, ?search, ?sortBy, ?sortOrder query params.
 */
const getAll = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 10,
      search = '',
      sortBy = 'created_at',
      sortOrder = 'DESC',
    } = req.query;

    const result = await User.findAll({
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      search,
      sortBy,
      sortOrder,
    });

    res.json({
      success: true,
      data: result.data,
      pagination: result.pagination,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/users/:id
 * Retrieve a single user by ID, including their roles.
 */
const getById = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      throw new AppError('User not found', 404);
    }

    const roles = await Role.getUserRoles(user.id);
    user.roles = roles.map((r) => r.name);

    res.json({
      success: true,
      data: { user },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/users
 * Create a new user (admin-only).
 * Expects { email, password, first_name, last_name, phone?, role_id? } in body.
 */
const create = async (req, res, next) => {
  try {
    const { email, password, first_name, last_name, phone, role_id } = req.body;

    if (!email || !password || !first_name || !last_name) {
      throw new AppError('Email, password, first_name, and last_name are required', 400);
    }

    const existing = await User.findByEmail(email);
    if (existing) {
      throw new AppError('Email is already registered', 409);
    }

    const bcrypt = require('bcryptjs');
    const password_hash = await bcrypt.hash(password, 12);

    const userId = await User.create({
      email,
      password_hash,
      first_name,
      last_name,
      phone,
    });

    // Assign role if provided, default to "Employee"
    if (role_id) {
      const role = await Role.findById(role_id);
      if (!role) throw new AppError('Specified role does not exist', 400);
      await Role.assignToUser(userId, role_id);
    } else {
      const defaultRole = await Role.findByName('Employee');
      if (defaultRole) await Role.assignToUser(userId, defaultRole.id);
    }

    const user = await User.findById(userId);

    res.status(201).json({
      success: true,
      message: 'User created successfully',
      data: { user },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/users/:id
 * Update user fields. Admins can update any user; regular users can only
 * update their own profile via the updateProfile endpoint.
 */
const update = async (req, res, next) => {
  try {
    const { id } = req.params;

    const existing = await User.findById(id);
    if (!existing) {
      throw new AppError('User not found', 404);
    }

    // Store old values for audit logging
    res.locals.auditOldValues = { ...existing };

    const { first_name, last_name, phone, email, is_active } = req.body;
    const updates = {};

    if (first_name !== undefined) updates.first_name = first_name;
    if (last_name !== undefined) updates.last_name = last_name;
    if (phone !== undefined) updates.phone = phone;
    if (email !== undefined) {
      if (email !== existing.email) {
        const emailTaken = await User.findByEmail(email);
        if (emailTaken) throw new AppError('Email is already in use', 409);
      }
      updates.email = email;
    }
    if (is_active !== undefined) updates.is_active = is_active;

    if (Object.keys(updates).length === 0) {
      throw new AppError('No fields to update', 400);
    }

    await User.update(id, updates);
    const user = await User.findById(id);

    res.json({
      success: true,
      message: 'User updated successfully',
      data: { user },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/users/:id
 * Soft-delete a user by setting is_active = false (admin-only).
 */
const remove = async (req, res, next) => {
  try {
    const { id } = req.params;

    const existing = await User.findById(id);
    if (!existing) {
      throw new AppError('User not found', 404);
    }

    // Prevent self-deletion
    if (parseInt(id, 10) === req.user.id) {
      throw new AppError('You cannot delete your own account', 400);
    }

    res.locals.auditOldValues = { ...existing };

    await User.update(id, { is_active: false });

    res.json({
      success: true,
      message: 'User deactivated successfully',
    });
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/users/profile
 * Allow the authenticated user to update their own profile fields.
 */
const updateProfile = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const existing = await User.findById(userId);
    if (!existing) {
      throw new AppError('User not found', 404);
    }

    const { first_name, last_name, phone } = req.body;
    const updates = {};

    if (first_name !== undefined) updates.first_name = first_name;
    if (last_name !== undefined) updates.last_name = last_name;
    if (phone !== undefined) updates.phone = phone;

    if (Object.keys(updates).length === 0) {
      throw new AppError('No fields to update', 400);
    }

    await User.update(userId, updates);
    const user = await User.findById(userId);
    const roles = await Role.getUserRoles(userId);
    user.roles = roles.map((r) => r.name);

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: { user },
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { getAll, getById, create, update, remove, updateProfile };
