/**
 * @file backend/src/controllers/position.controller.js
 * @description Position controller with CRUD, filtering, and salary validation
 * @author Dev A
 */

const Position = require('../models/Position');
const Department = require('../models/Department');
const { AppError } = require('../middleware/errorHandler');

/**
 * Validate that paga_min <= paga_max when both are provided.
 *
 * @param {number|null|undefined} min
 * @param {number|null|undefined} max
 * @throws {AppError} If the range is invalid
 */
const validateSalaryRange = (min, max) => {
  if (min != null && max != null && parseFloat(min) > parseFloat(max)) {
    throw new AppError(
      'Minimum salary (paga_min) cannot be greater than maximum salary (paga_max)',
      400
    );
  }
};

/**
 * GET /api/positions
 * List positions with pagination, search, and optional department filter.
 */
const getAll = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 10,
      search = '',
      department_id,
      sortBy = 'emertimi',
      sortOrder = 'ASC',
    } = req.query;

    const result = await Position.findAll({
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      search,
      department_id: department_id ? parseInt(department_id, 10) : undefined,
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
 * GET /api/positions/:id
 * Get a single position with its department details.
 */
const getById = async (req, res, next) => {
  try {
    const position = await Position.findById(req.params.id);
    if (!position) {
      throw new AppError('Position not found', 404);
    }

    res.json({
      success: true,
      data: { position },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/positions/department/:departmentId
 * Get all positions within a specific department.
 */
const getByDepartment = async (req, res, next) => {
  try {
    const positions = await Position.findByDepartment(req.params.departmentId);
    res.json({
      success: true,
      data: { positions },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/positions
 * Create a new position.
 */
const create = async (req, res, next) => {
  try {
    const { department_id, emertimi, pershkrimi, niveli, paga_min, paga_max } = req.body;

    if (!department_id || !emertimi) {
      throw new AppError('department_id and emertimi are required', 400);
    }

    // Verify department exists
    const department = await Department.findById(department_id);
    if (!department) {
      throw new AppError('Specified department does not exist', 404);
    }

    validateSalaryRange(paga_min, paga_max);

    const positionId = await Position.create({
      department_id,
      emertimi,
      pershkrimi,
      niveli,
      paga_min,
      paga_max,
    });

    const position = await Position.findById(positionId);

    res.status(201).json({
      success: true,
      message: 'Position created successfully',
      data: { position },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/positions/:id
 * Update a position.
 */
const update = async (req, res, next) => {
  try {
    const { id } = req.params;

    const existing = await Position.findById(id);
    if (!existing) {
      throw new AppError('Position not found', 404);
    }

    res.locals.auditOldValues = { ...existing };

    const { department_id, emertimi, pershkrimi, niveli, paga_min, paga_max } = req.body;
    const updates = {};

    if (department_id !== undefined) {
      const department = await Department.findById(department_id);
      if (!department) throw new AppError('Specified department does not exist', 404);
      updates.department_id = department_id;
    }
    if (emertimi !== undefined) updates.emertimi = emertimi;
    if (pershkrimi !== undefined) updates.pershkrimi = pershkrimi;
    if (niveli !== undefined) updates.niveli = niveli;
    if (paga_min !== undefined) updates.paga_min = paga_min;
    if (paga_max !== undefined) updates.paga_max = paga_max;

    // Validate combined salary range using existing values as fallback
    const effectiveMin = updates.paga_min ?? existing.paga_min;
    const effectiveMax = updates.paga_max ?? existing.paga_max;
    validateSalaryRange(effectiveMin, effectiveMax);

    if (Object.keys(updates).length === 0) {
      throw new AppError('No fields to update', 400);
    }

    await Position.update(id, updates);
    const position = await Position.findById(id);

    res.json({
      success: true,
      message: 'Position updated successfully',
      data: { position },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/positions/:id
 * Delete a position.
 */
const remove = async (req, res, next) => {
  try {
    const { id } = req.params;

    const existing = await Position.findById(id);
    if (!existing) {
      throw new AppError('Position not found', 404);
    }

    res.locals.auditOldValues = { ...existing };

    await Position.remove(id);

    res.json({
      success: true,
      message: 'Position deleted successfully',
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { getAll, getById, getByDepartment, create, update, remove };
