/**
 * @file backend/src/controllers/attendance.controller.js
 * @description Attendance controller with manual CRUD, self-service check-in/out, department view, and monthly reports
 * @author Dev A
 */

const Attendance = require('../models/Attendance');
const Employee = require('../models/Employee');
const { AppError } = require('../middleware/errorHandler');

/** Roles permitted to view/manage any employee's attendance. */
const PRIVILEGED_ROLES = ['Admin', 'HR Manager'];

/**
 * Resolve the employee record for the authenticated user.
 * Throws 404 if the user has no linked employee row.
 */
const getRequestingEmployee = async (userId) => {
  const employee = await Employee.findByUserId(userId);
  if (!employee) {
    throw new AppError('No employee record linked to this user account', 404);
  }
  return employee;
};

/** Simple ISO date check (YYYY-MM-DD). */
const isValidDate = (s) => {
  if (!s || typeof s !== 'string') return false;
  const d = new Date(s);
  return !Number.isNaN(d.getTime());
};

/**
 * GET /api/attendances
 * List attendance rows with filters (HR / Admin / Manager view).
 */
const getAll = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 10,
      employee_id,
      department_id,
      statusi,
      from_date,
      to_date,
      sortBy = 'data',
      sortOrder = 'DESC',
    } = req.query;

    const result = await Attendance.findAll({
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      employee_id: employee_id ? parseInt(employee_id, 10) : undefined,
      department_id: department_id ? parseInt(department_id, 10) : undefined,
      statusi,
      from_date,
      to_date,
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
 * GET /api/attendances/:id
 * Get a single attendance row.
 */
const getById = async (req, res, next) => {
  try {
    const row = await Attendance.findById(req.params.id);
    if (!row) {
      throw new AppError('Attendance record not found', 404);
    }

    res.json({
      success: true,
      data: { attendance: row },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/attendances/me
 * Authenticated user's own attendance history (optionally date-ranged).
 */
const getMyAttendance = async (req, res, next) => {
  try {
    const employee = await getRequestingEmployee(req.user.id);
    const { from_date, to_date } = req.query;

    const rows = await Attendance.findByEmployee(employee.id, {
      from_date,
      to_date,
    });

    res.json({
      success: true,
      data: { employee_id: employee.id, attendance: rows },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/attendances/department/:departmentId
 * All attendance rows for employees in a department on a given date
 * (or date range). Managers / HR / Admin only.
 */
const getDepartmentAttendance = async (req, res, next) => {
  try {
    const departmentId = parseInt(req.params.departmentId, 10);
    if (!departmentId) {
      throw new AppError('Invalid department ID', 400);
    }

    const {
      page = 1,
      limit = 50,
      from_date,
      to_date,
      statusi,
    } = req.query;

    const result = await Attendance.findAll({
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      department_id: departmentId,
      from_date,
      to_date,
      statusi,
    });

    // Daily summary for the most recent date we can infer from the filter range.
    const summaryDate = to_date || from_date || new Date().toISOString().slice(0, 10);
    const summary = await Attendance.getDailySummary(summaryDate, {
      department_id: departmentId,
    });

    res.json({
      success: true,
      data: result.data,
      pagination: result.pagination,
      summary: { date: summaryDate, by_status: summary },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/attendances/report/monthly
 * Per-employee monthly breakdown for a given year/month (+ optional dept/emp).
 */
const getMonthlyReport = async (req, res, next) => {
  try {
    const year = parseInt(req.query.year, 10);
    const month = parseInt(req.query.month, 10);

    if (!year || !month || month < 1 || month > 12) {
      throw new AppError(
        'Valid year and month (1-12) query parameters are required',
        400
      );
    }

    const departmentId = req.query.department_id
      ? parseInt(req.query.department_id, 10)
      : undefined;
    const employeeId = req.query.employee_id
      ? parseInt(req.query.employee_id, 10)
      : undefined;

    const report = await Attendance.getMonthlyReport({
      year,
      month,
      department_id: departmentId,
      employee_id: employeeId,
    });

    res.json({
      success: true,
      data: { year, month, report },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/attendances
 * Manually create an attendance row (HR / Admin).
 */
const create = async (req, res, next) => {
  try {
    const { employee_id, data, ora_hyrjes, ora_daljes, statusi, shenimet } = req.body;

    if (!employee_id || !data) {
      throw new AppError('employee_id and data are required', 400);
    }
    if (!isValidDate(data)) {
      throw new AppError('data must be a valid YYYY-MM-DD date', 400);
    }
    if (statusi && !Attendance.VALID_STATUSES.includes(statusi)) {
      throw new AppError(
        `Invalid statusi. Must be one of: ${Attendance.VALID_STATUSES.join(', ')}`,
        400
      );
    }

    const exists = await Employee.findById(employee_id);
    if (!exists) {
      throw new AppError('Specified employee does not exist', 404);
    }

    const duplicate = await Attendance.findByEmployeeAndDate(employee_id, data);
    if (duplicate) {
      throw new AppError(
        `An attendance record already exists for employee #${employee_id} on ${data}`,
        409
      );
    }

    const id = await Attendance.create({
      employee_id,
      data,
      ora_hyrjes,
      ora_daljes,
      statusi,
      shenimet,
    });
    const attendance = await Attendance.findById(id);

    res.status(201).json({
      success: true,
      message: 'Attendance recorded successfully',
      data: { attendance },
    });
  } catch (err) {
    // Map MySQL duplicate-key (unique_attendance) into a friendly 409.
    if (err.code === 'ER_DUP_ENTRY') {
      return next(new AppError('Attendance for this employee on this date already exists', 409));
    }
    next(err);
  }
};

/**
 * POST /api/attendances/check-in
 * Self-service check-in for the authenticated employee (uses server time).
 */
const checkIn = async (req, res, next) => {
  try {
    const employee = await getRequestingEmployee(req.user.id);
    const result = await Attendance.checkIn(employee.id);

    if (result.alreadyCheckedIn) {
      throw new AppError('You have already checked in today', 409);
    }

    const attendance = await Attendance.findById(result.id);

    res.status(result.created ? 201 : 200).json({
      success: true,
      message: 'Checked in successfully',
      data: { attendance },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/attendances/check-out
 * Self-service check-out for the authenticated employee (uses server time).
 */
const checkOut = async (req, res, next) => {
  try {
    const employee = await getRequestingEmployee(req.user.id);
    const result = await Attendance.checkOut(employee.id);

    if (!result) {
      throw new AppError(
        'No check-in record for today — please check in first',
        409
      );
    }

    const attendance = await Attendance.findById(result.id);

    res.json({
      success: true,
      message: 'Checked out successfully',
      data: { attendance },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/attendances/:id
 * Update an attendance row (HR / Admin).
 */
const update = async (req, res, next) => {
  try {
    const { id } = req.params;
    const existing = await Attendance.findById(id);
    if (!existing) {
      throw new AppError('Attendance record not found', 404);
    }

    res.locals.auditOldValues = { ...existing };

    const { data, ora_hyrjes, ora_daljes, statusi, shenimet } = req.body;
    const updates = {};

    if (data !== undefined) {
      if (!isValidDate(data)) {
        throw new AppError('data must be a valid YYYY-MM-DD date', 400);
      }
      updates.data = data;
    }
    if (ora_hyrjes !== undefined) updates.ora_hyrjes = ora_hyrjes;
    if (ora_daljes !== undefined) updates.ora_daljes = ora_daljes;
    if (statusi !== undefined) {
      if (!Attendance.VALID_STATUSES.includes(statusi)) {
        throw new AppError(
          `Invalid statusi. Must be one of: ${Attendance.VALID_STATUSES.join(', ')}`,
          400
        );
      }
      updates.statusi = statusi;
    }
    if (shenimet !== undefined) updates.shenimet = shenimet;

    if (Object.keys(updates).length === 0) {
      throw new AppError('No fields to update', 400);
    }

    await Attendance.update(id, updates);
    const attendance = await Attendance.findById(id);

    res.json({
      success: true,
      message: 'Attendance updated successfully',
      data: { attendance },
    });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return next(new AppError('Attendance for this employee on this date already exists', 409));
    }
    next(err);
  }
};

/**
 * DELETE /api/attendances/:id
 * Hard-delete an attendance row (Admin / HR).
 */
const remove = async (req, res, next) => {
  try {
    const { id } = req.params;
    const existing = await Attendance.findById(id);
    if (!existing) {
      throw new AppError('Attendance record not found', 404);
    }

    res.locals.auditOldValues = { ...existing };
    await Attendance.remove(id);

    res.json({
      success: true,
      message: 'Attendance record deleted successfully',
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getAll,
  getById,
  getMyAttendance,
  getDepartmentAttendance,
  getMonthlyReport,
  create,
  checkIn,
  checkOut,
  update,
  remove,
  PRIVILEGED_ROLES,
};
