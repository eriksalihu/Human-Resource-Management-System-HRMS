/**
 * @file backend/src/controllers/employee.controller.js
 * @description Employee controller with CRUD, filtering, and employee-number auto-generation
 * @author Dev A
 */

const Employee = require('../models/Employee');
const Department = require('../models/Department');
const Position = require('../models/Position');
const db = require('../config/db');
const { AppError } = require('../middleware/errorHandler');
const {
  generateEmployeeNumber,
  buildPaginationQuery,
} = require('../utils/helpers');

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

/**
 * GET /api/employees/search
 *
 * Advanced employee search. Supports everything `getAll` does, plus:
 *   - Full-text search expanded to department + position names
 *   - Hire-date range filter (from_date / to_date on data_punesimit)
 *   - Multi-value contract type filter (`lloji_kontrates=full-time,intern`)
 *   - Multi-value status filter (`statusi=active,suspended`)
 *
 * Implemented with direct SQL because the existing `Employee.findAll` is
 * fixed at single-value filters. Mirrors the model's BASE_SELECT shape so
 * the response is interchangeable with the standard listing endpoint.
 *
 * @query {string}  [search]            - Free-text term applied across name,
 *                                        email, employee number, department name,
 *                                        and position name (LIKE %term%)
 * @query {number}  [department_id]     - Exact department match
 * @query {number}  [position_id]       - Exact position match
 * @query {string}  [statusi]           - Comma-separated list of statuses
 * @query {string}  [lloji_kontrates]   - Comma-separated list of contract types
 * @query {string}  [from_date]         - Hire date >= this (YYYY-MM-DD)
 * @query {string}  [to_date]           - Hire date <= this (YYYY-MM-DD)
 * @query {number}  [menaxheri_id]      - Manager filter
 * @query {number}  [page=1]
 * @query {number}  [limit=10]
 * @query {string}  [sortBy='id']
 * @query {string}  [sortOrder='ASC']
 */
const advancedSearch = async (req, res, next) => {
  try {
    const {
      search = '',
      department_id,
      position_id,
      statusi,
      lloji_kontrates,
      from_date,
      to_date,
      menaxheri_id,
      page = 1,
      limit = 10,
      sortBy = 'id',
      sortOrder = 'ASC',
    } = req.query;

    /** Allowed sort columns (whitelist against SQL injection). */
    const ALLOWED_SORT = [
      'id',
      'numri_punonjesit',
      'data_punesimit',
      'lloji_kontrates',
      'statusi',
      'created_at',
    ];

    /** Allow only known statuses / contract types — silently drop anything else. */
    const splitAndFilter = (csv, validSet) =>
      String(csv || '')
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s && validSet.includes(s));

    const statusValues = splitAndFilter(statusi, VALID_STATUSES);
    const contractValues = splitAndFilter(lloji_kontrates, VALID_CONTRACT_TYPES);

    /** Build WHERE clauses incrementally. */
    const conditions = [];
    const params = [];

    if (search) {
      // Full-text-ish search across the user-visible identity fields.
      conditions.push(
        `(u.first_name LIKE ?
          OR u.last_name LIKE ?
          OR u.email LIKE ?
          OR e.numri_punonjesit LIKE ?
          OR d.emertimi LIKE ?
          OR p.emertimi LIKE ?)`
      );
      const like = `%${search}%`;
      params.push(like, like, like, like, like, like);
    }

    if (department_id) {
      conditions.push('e.department_id = ?');
      params.push(parseInt(department_id, 10));
    }
    if (position_id) {
      conditions.push('e.position_id = ?');
      params.push(parseInt(position_id, 10));
    }
    if (menaxheri_id) {
      conditions.push('e.menaxheri_id = ?');
      params.push(parseInt(menaxheri_id, 10));
    }

    if (statusValues.length > 0) {
      conditions.push(
        `e.statusi IN (${statusValues.map(() => '?').join(', ')})`
      );
      params.push(...statusValues);
    }

    if (contractValues.length > 0) {
      conditions.push(
        `e.lloji_kontrates IN (${contractValues.map(() => '?').join(', ')})`
      );
      params.push(...contractValues);
    }

    if (from_date) {
      conditions.push('e.data_punesimit >= ?');
      params.push(from_date);
    }
    if (to_date) {
      conditions.push('e.data_punesimit <= ?');
      params.push(to_date);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    /** Count total matching rows (mirrors the model's count query). */
    const [countRows] = await db.query(
      `SELECT COUNT(*) AS total
       FROM Employees e
       LEFT JOIN Users u        ON e.user_id = u.id
       LEFT JOIN Positions p    ON e.position_id = p.id
       LEFT JOIN Departments d  ON e.department_id = d.id
       ${where}`,
      params
    );
    const total = Number(countRows[0]?.total) || 0;

    const {
      limit: perPage,
      offset,
      pagination,
    } = buildPaginationQuery({
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      total,
    });

    const safeSortBy = ALLOWED_SORT.includes(sortBy) ? sortBy : 'id';
    const safeSortOrder =
      String(sortOrder).toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

    /** Page of results — joined to mirror the Employee model's BASE_SELECT. */
    const [rows] = await db.query(
      `SELECT
         e.id, e.user_id, e.position_id, e.department_id,
         e.numri_punonjesit, e.data_punesimit, e.lloji_kontrates,
         e.statusi, e.menaxheri_id, e.created_at, e.updated_at,
         u.first_name, u.last_name, u.email, u.phone, u.profile_image,
         u.is_active AS user_is_active,
         p.emertimi  AS position_emertimi,
         p.niveli    AS position_niveli,
         d.emertimi  AS department_emertimi,
         d.lokacioni AS department_lokacioni,
         mgr_u.first_name AS menaxheri_first_name,
         mgr_u.last_name  AS menaxheri_last_name,
         mgr.numri_punonjesit AS menaxheri_numri
       FROM Employees e
       LEFT JOIN Users u        ON e.user_id = u.id
       LEFT JOIN Positions p    ON e.position_id = p.id
       LEFT JOIN Departments d  ON e.department_id = d.id
       LEFT JOIN Employees mgr  ON e.menaxheri_id = mgr.id
       LEFT JOIN Users mgr_u    ON mgr.user_id = mgr_u.id
       ${where}
       ORDER BY e.${safeSortBy} ${safeSortOrder}
       LIMIT ? OFFSET ?`,
      [...params, perPage, offset]
    );

    res.json({
      success: true,
      data: rows,
      pagination,
      filters_applied: {
        search: search || null,
        department_id: department_id ? parseInt(department_id, 10) : null,
        position_id: position_id ? parseInt(position_id, 10) : null,
        statusi: statusValues,
        lloji_kontrates: contractValues,
        from_date: from_date || null,
        to_date: to_date || null,
        menaxheri_id: menaxheri_id ? parseInt(menaxheri_id, 10) : null,
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/employees/export/csv
 * Export the full employee roster as a CSV download.
 *
 * Joins Users / Positions / Departments / manager so the file is
 * self-contained for HR (no opaque foreign keys). Honours the same
 * filter params as the listing (`department_id`, `statusi`,
 * `lloji_kontrates`, `search`) so "filter then export" works.
 *
 * Streaming rationale: a growing company could have thousands of
 * employees. Rather than build one giant string in memory, we set the
 * CSV headers, write the header row, then stream rows from a query
 * cursor in chunks — memory stays flat regardless of roster size.
 *
 * @query {string} [search]
 * @query {number} [department_id]
 * @query {string} [statusi]            single status
 * @query {string} [lloji_kontrates]    single contract type
 */
const exportToCSV = async (req, res, next) => {
  try {
    const { search, department_id, statusi, lloji_kontrates } = req.query;

    const conditions = [];
    const params = [];

    if (search) {
      conditions.push(
        '(u.first_name LIKE ? OR u.last_name LIKE ? OR u.email LIKE ? OR e.numri_punonjesit LIKE ?)'
      );
      const like = `%${search}%`;
      params.push(like, like, like, like);
    }
    if (department_id) {
      conditions.push('e.department_id = ?');
      params.push(parseInt(department_id, 10));
    }
    if (statusi && VALID_STATUSES.includes(statusi)) {
      conditions.push('e.statusi = ?');
      params.push(statusi);
    }
    if (
      lloji_kontrates &&
      VALID_CONTRACT_TYPES.includes(lloji_kontrates)
    ) {
      conditions.push('e.lloji_kontrates = ?');
      params.push(lloji_kontrates);
    }

    const where = conditions.length
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

    /**
     * Escape one CSV cell per RFC 4180: wrap in quotes when the value
     * contains a comma, quote, or newline; double internal quotes.
     * Null / undefined → empty cell.
     */
    const csvCell = (value) => {
      if (value === null || value === undefined) return '';
      const str = String(value);
      return /[",\r\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
    };

    const HEADERS = [
      'Employee #',
      'First name',
      'Last name',
      'Email',
      'Phone',
      'Position',
      'Department',
      'Manager',
      'Contract',
      'Status',
      'Hire date',
      'Latest net salary',
    ];

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="employees_${new Date()
        .toISOString()
        .slice(0, 10)}.csv"`
    );
    // UTF-8 BOM so Excel renders accented names (e.g. "Krasniqi")
    // correctly instead of mojibake.
    res.write('﻿');
    res.write(`${HEADERS.join(',')}\r\n`);

    /**
     * Keyset-paginated streaming: instead of one giant in-memory result
     * set (or relying on mysql2 promise-pool stream internals), we page
     * through the roster in batches of BATCH_SIZE ordered by `e.id`,
     * writing each batch straight to the response and back-pressuring on
     * `res.write`. Node memory stays flat at one batch regardless of
     * whether the company has 50 or 50,000 employees.
     */
    const BATCH_SIZE = 500;
    const baseSql = (extraWhere) => `
      SELECT
        e.id,
        e.numri_punonjesit,
        u.first_name, u.last_name, u.email, u.phone,
        p.emertimi  AS position_emertimi,
        d.emertimi  AS department_emertimi,
        mgr_u.first_name AS mgr_first, mgr_u.last_name AS mgr_last,
        e.lloji_kontrates, e.statusi, e.data_punesimit,
        (SELECT s.paga_neto
           FROM Salaries s
          WHERE s.employee_id = e.id
          ORDER BY s.viti DESC, s.muaji DESC
          LIMIT 1) AS latest_net
      FROM Employees e
      LEFT JOIN Users u        ON e.user_id = u.id
      LEFT JOIN Positions p    ON e.position_id = p.id
      LEFT JOIN Departments d  ON e.department_id = d.id
      LEFT JOIN Employees mgr  ON e.menaxheri_id = mgr.id
      LEFT JOIN Users mgr_u    ON mgr.user_id = mgr_u.id
      ${conditions.length ? `WHERE ${conditions.join(' AND ')} AND` : 'WHERE'} ${extraWhere}
      ORDER BY e.id ASC
      LIMIT ${BATCH_SIZE}`;

    let lastId = 0;
    // Drain helper so we respect backpressure on slow clients.
    const writeLine = (chunk) =>
      new Promise((resolve) => {
        if (res.write(chunk)) resolve();
        else res.once('drain', resolve);
      });

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const [rows] = await db.query(baseSql('e.id > ?'), [
        ...params,
        lastId,
      ]);
      if (rows.length === 0) break;

      for (const r of rows) {
        const managerName =
          r.mgr_first || r.mgr_last
            ? `${r.mgr_first || ''} ${r.mgr_last || ''}`.trim()
            : '';
        const line = [
          r.numri_punonjesit,
          r.first_name,
          r.last_name,
          r.email,
          r.phone,
          r.position_emertimi,
          r.department_emertimi,
          managerName,
          r.lloji_kontrates,
          r.statusi,
          r.data_punesimit
            ? new Date(r.data_punesimit).toISOString().slice(0, 10)
            : '',
          r.latest_net != null ? Number(r.latest_net).toFixed(2) : '',
        ]
          .map(csvCell)
          .join(',');
        // eslint-disable-next-line no-await-in-loop
        await writeLine(`${line}\r\n`);
      }

      lastId = rows[rows.length - 1].id;
      if (rows.length < BATCH_SIZE) break;
    }

    res.end();
  } catch (err) {
    // If nothing has been written yet we can still surface a JSON error;
    // once the body is streaming, the best we can do is end the response.
    if (res.headersSent) {
      // eslint-disable-next-line no-console
      console.error('[employee.exportToCSV] post-stream error:', err);
      return res.end();
    }
    return next(err);
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
  advancedSearch,
  exportToCSV,
};
