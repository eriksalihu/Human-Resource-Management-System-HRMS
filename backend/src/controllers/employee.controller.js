/**
 * @file backend/src/controllers/employee.controller.js
 * @description Employee controller with CRUD, filtering, and employee-number auto-generation
 * @author Dev A
 */

const Employee = require('../models/Employee');
const Department = require('../models/Department');
const Position = require('../models/Position');
const { AppError } = require('../middleware/errorHandler');
const { generateEmployeeNumber } = require('../utils/helpers');

/**
 * Valid contract-type values (must match the ENUM in the Employees table).
 */
const VALID_CONTRACT_TYPES = ['full-time', 'part-time', 'contract', 'intern'];

/**
 * Valid employee-status values (must match the ENUM in the Employees table).
 */
const VALID_STATUSES = ['active', 'inactive', 'suspended', 'terminated'];

/**
 * GET /api/employees
 * List employees with pagination, search, and filters.
 */
const getAll = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 10,
      search = '',
      department_id,
      position_id,
      statusi,
      lloji_kontrates,
      menaxheri_id,
      sortBy = 'id',
      sortOrder = 'ASC',
    } = req.query;

    const result = await Employee.findAll({
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      search,
      department_id: department_id ? parseInt(department_id, 10) : undefined,
      position_id: position_id ? parseInt(position_id, 10) : undefined,
      statusi,
      lloji_kontrates,
      menaxheri_id: menaxheri_id ? parseInt(menaxheri_id, 10) : undefined,
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
 * GET /api/employees/:id
 * Get a single employee with full related data.
 */
const getById = async (req, res, next) => {
  try {
    const employee = await Employee.findById(req.params.id);
    if (!employee) {
      throw new AppError('Employee not found', 404);
    }

    res.json({
      success: true,
      data: { employee },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/employees/me
 * Return the employee record for the currently authenticated user.
 */
const getProfile = async (req, res, next) => {
  try {
    const employee = await Employee.findByUserId(req.user.id);
    if (!employee) {
      throw new AppError('No employee record linked to this user', 404);
    }

    res.json({
      success: true,
      data: { employee },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/employees/manager/:managerId/subordinates
 * List direct reports of a given manager.
 */
const getSubordinates = async (req, res, next) => {
  try {
    const subordinates = await Employee.getManagerSubordinates(req.params.managerId);
    res.json({
      success: true,
      data: { subordinates },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/employees
 * Create a new employee. Auto-generates the employee number and validates FKs.
 */
const create = async (req, res, next) => {
  try {
    const {
      user_id,
      position_id,
      department_id,
      data_punesimit,
      lloji_kontrates,
      statusi,
      menaxheri_id,
    } = req.body;

    if (!user_id || !position_id || !department_id || !data_punesimit || !lloji_kontrates) {
      throw new AppError(
        'user_id, position_id, department_id, data_punesimit and lloji_kontrates are required',
        400
      );
    }

    if (!VALID_CONTRACT_TYPES.includes(lloji_kontrates)) {
      throw new AppError(
        `Invalid lloji_kontrates. Must be one of: ${VALID_CONTRACT_TYPES.join(', ')}`,
        400
      );
    }
    if (statusi && !VALID_STATUSES.includes(statusi)) {
      throw new AppError(
        `Invalid statusi. Must be one of: ${VALID_STATUSES.join(', ')}`,
        400
      );
    }

    // Verify department + position exist
    const [department, position] = await Promise.all([
      Department.findById(department_id),
      Position.findById(position_id),
    ]);
    if (!department) throw new AppError('Specified department does not exist', 404);
    if (!position) throw new AppError('Specified position does not exist', 404);

    // Verify manager (if provided) exists
    if (menaxheri_id) {
      const manager = await Employee.findById(menaxheri_id);
      if (!manager) throw new AppError('Specified manager does not exist', 404);
    }

    // Auto-generate unique employee number
    const sequence = await Employee.getNextSequenceNumber();
    const numri_punonjesit = generateEmployeeNumber(sequence);

    const employeeId = await Employee.create({
      user_id,
      position_id,
      department_id,
      numri_punonjesit,
      data_punesimit,
      lloji_kontrates,
      statusi,
      menaxheri_id,
    });

    const employee = await Employee.findById(employeeId);

    res.status(201).json({
      success: true,
      message: 'Employee created successfully',
      data: { employee },
    });
  } catch (err) {
    // Map common DB errors to friendly messages
    if (err.code === 'ER_DUP_ENTRY') {
      return next(new AppError('Employee number or user is already registered', 409));
    }
    if (err.code === 'ER_NO_REFERENCED_ROW_2') {
      return next(new AppError('Referenced user/position/department does not exist', 400));
    }
    next(err);
  }
};

/**
 * PUT /api/employees/:id
 * Update an employee. Only HR/Admin can change department/position/manager/status.
 */
const update = async (req, res, next) => {
  try {
    const { id } = req.params;

    const existing = await Employee.findById(id);
    if (!existing) {
      throw new AppError('Employee not found', 404);
    }

    res.locals.auditOldValues = { ...existing };

    const {
      position_id,
      department_id,
      data_punesimit,
      lloji_kontrates,
      statusi,
      menaxheri_id,
    } = req.body;

    const updates = {};

    if (department_id !== undefined) {
      const department = await Department.findById(department_id);
      if (!department) throw new AppError('Specified department does not exist', 404);
      updates.department_id = department_id;
    }
    if (position_id !== undefined) {
      const position = await Position.findById(position_id);
      if (!position) throw new AppError('Specified position does not exist', 404);
      updates.position_id = position_id;
    }
    if (menaxheri_id !== undefined && menaxheri_id !== null) {
      if (Number(menaxheri_id) === Number(id)) {
        throw new AppError('An employee cannot be their own manager', 400);
      }
      const manager = await Employee.findById(menaxheri_id);
      if (!manager) throw new AppError('Specified manager does not exist', 404);
      updates.menaxheri_id = menaxheri_id;
    } else if (menaxheri_id === null) {
      updates.menaxheri_id = null;
    }
    if (data_punesimit !== undefined) updates.data_punesimit = data_punesimit;
    if (lloji_kontrates !== undefined) {
      if (!VALID_CONTRACT_TYPES.includes(lloji_kontrates)) {
        throw new AppError(
          `Invalid lloji_kontrates. Must be one of: ${VALID_CONTRACT_TYPES.join(', ')}`,
          400
        );
      }
      updates.lloji_kontrates = lloji_kontrates;
    }
    if (statusi !== undefined) {
      if (!VALID_STATUSES.includes(statusi)) {
        throw new AppError(
          `Invalid statusi. Must be one of: ${VALID_STATUSES.join(', ')}`,
          400
        );
      }
      updates.statusi = statusi;
    }

    if (Object.keys(updates).length === 0) {
      throw new AppError('No fields to update', 400);
    }

    await Employee.update(id, updates);
    const employee = await Employee.findById(id);

    res.json({
      success: true,
      message: 'Employee updated successfully',
      data: { employee },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/employees/:id
 * Soft-delete (terminate) an employee.
 */
const remove = async (req, res, next) => {
  try {
    const { id } = req.params;

    const existing = await Employee.findById(id);
    if (!existing) {
      throw new AppError('Employee not found', 404);
    }

    res.locals.auditOldValues = { ...existing };

    await Employee.remove(id);

    res.json({
      success: true,
      message: 'Employee terminated successfully',
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getAll,
  getById,
  getProfile,
  getSubordinates,
  create,
  update,
  remove,
};
