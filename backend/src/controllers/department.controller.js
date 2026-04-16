/**
 * @file backend/src/controllers/department.controller.js
 * @description Department controller with CRUD, validation, and audit logging
 * @author Dev A
 */

const Department = require('../models/Department');
const { AppError } = require('../middleware/errorHandler');

/**
 * GET /api/departments
 * List departments with pagination and search.
 */
const getAll = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 10,
      search = '',
      sortBy = 'emertimi',
      sortOrder = 'ASC',
    } = req.query;

    const result = await Department.findAll({
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
 * GET /api/departments/:id
 * Get a department by ID with manager details and positions.
 */
const getById = async (req, res, next) => {
  try {
    const department = await Department.getDepartmentWithPositions(req.params.id);
    if (!department) {
      throw new AppError('Department not found', 404);
    }

    const employeeCount = await Department.getDepartmentEmployeeCount(req.params.id);
    department.employee_count = employeeCount;

    res.json({
      success: true,
      data: { department },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/departments
 * Create a new department.
 */
const create = async (req, res, next) => {
  try {
    const { emertimi, pershkrimi, menaxheri_id, lokacioni, buxheti } = req.body;

    if (!emertimi) {
      throw new AppError('Emertimi (department name) is required', 400);
    }

    const departmentId = await Department.create({
      emertimi,
      pershkrimi,
      menaxheri_id,
      lokacioni,
      buxheti,
    });

    const department = await Department.findById(departmentId);

    res.status(201).json({
      success: true,
      message: 'Department created successfully',
      data: { department },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/departments/:id
 * Update a department.
 */
const update = async (req, res, next) => {
  try {
    const { id } = req.params;

    const existing = await Department.findById(id);
    if (!existing) {
      throw new AppError('Department not found', 404);
    }

    // Store old values for audit logging
    res.locals.auditOldValues = { ...existing };

    const { emertimi, pershkrimi, menaxheri_id, lokacioni, buxheti } = req.body;
    const updates = {};

    if (emertimi !== undefined) updates.emertimi = emertimi;
    if (pershkrimi !== undefined) updates.pershkrimi = pershkrimi;
    if (menaxheri_id !== undefined) updates.menaxheri_id = menaxheri_id;
    if (lokacioni !== undefined) updates.lokacioni = lokacioni;
    if (buxheti !== undefined) updates.buxheti = buxheti;

    if (Object.keys(updates).length === 0) {
      throw new AppError('No fields to update', 400);
    }

    await Department.update(id, updates);
    const department = await Department.findById(id);

    res.json({
      success: true,
      message: 'Department updated successfully',
      data: { department },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/departments/:id
 * Delete a department. Checks for active employees before allowing deletion.
 */
const remove = async (req, res, next) => {
  try {
    const { id } = req.params;

    const existing = await Department.findById(id);
    if (!existing) {
      throw new AppError('Department not found', 404);
    }

    // Prevent deletion if department has active employees
    const employeeCount = await Department.getDepartmentEmployeeCount(id);
    if (employeeCount > 0) {
      throw new AppError(
        `Cannot delete department with ${employeeCount} active employee(s). Reassign them first.`,
        409
      );
    }

    res.locals.auditOldValues = { ...existing };

    await Department.remove(id);

    res.json({
      success: true,
      message: 'Department deleted successfully',
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { getAll, getById, create, update, remove };
