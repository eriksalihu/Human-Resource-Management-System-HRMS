/**
 * @file backend/src/models/Salary.js
 * @description Salary model with CRUD, employee history, period queries, and payroll aggregation
 * @author Dev A
 */

const db = require('../config/db');
const { buildPaginationQuery } = require('../utils/helpers');

/** Whitelist of sortable columns to prevent SQL injection */
const ALLOWED_SORT_COLUMNS = [
  'id',
  'viti',
  'muaji',
  'paga_baze',
  'paga_neto',
  'data_pageses',
  'statusi',
  'created_at',
];

/**
 * Base SELECT / JOIN clause that enriches salary rows with employee and user info.
 */
const BASE_SELECT = `
  SELECT
    s.id,
    s.employee_id,
    s.paga_baze,
    s.bonuse,
    s.zbritje,
    s.paga_neto,
    s.muaji,
    s.viti,
    s.data_pageses,
    s.statusi,
    s.created_at,
    e.numri_punonjesit,
    u.first_name,
    u.last_name,
    u.email,
    p.emertimi AS position_emertimi,
    d.emertimi AS department_emertimi
  FROM Salaries s
  LEFT JOIN Employees   e ON s.employee_id = e.id
  LEFT JOIN Users       u ON e.user_id = u.id
  LEFT JOIN Positions   p ON e.position_id = p.id
  LEFT JOIN Departments d ON e.department_id = d.id
`;

/**
 * Create a new salary record.
 *
 * @param {Object} data
 * @param {number} data.employee_id
 * @param {number} data.paga_baze - Gross base pay
 * @param {number} [data.bonuse=0]
 * @param {number} [data.zbritje=0] - Deductions
 * @param {number} data.paga_neto - Net pay (pre-computed by controller)
 * @param {number} data.muaji - Month 1–12
 * @param {number} data.viti - Year
 * @param {string} [data.data_pageses] - Payment date (YYYY-MM-DD)
 * @param {string} [data.statusi='pending']
 * @returns {Promise<number>} Inserted salary ID
 */
const create = async (data) => {
  const [result] = await db.query(
    `INSERT INTO Salaries
       (employee_id, paga_baze, bonuse, zbritje, paga_neto,
        muaji, viti, data_pageses, statusi)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.employee_id,
      data.paga_baze,
      data.bonuse || 0,
      data.zbritje || 0,
      data.paga_neto,
      data.muaji,
      data.viti,
      data.data_pageses || null,
      data.statusi || 'pending',
    ]
  );
  return result.insertId;
};

/**
 * List salaries with pagination, filters (employee / period / status), and sort.
 *
 * @param {Object} [opts]
 * @param {number} [opts.page=1]
 * @param {number} [opts.limit=10]
 * @param {number} [opts.employee_id]
 * @param {number} [opts.muaji]
 * @param {number} [opts.viti]
 * @param {string} [opts.statusi]
 * @param {number} [opts.department_id]
 * @param {string} [opts.sortBy='created_at']
 * @param {string} [opts.sortOrder='DESC']
 * @returns {Promise<{ data: Object[], pagination: Object }>}
 */
const findAll = async ({
  page = 1,
  limit = 10,
  employee_id,
  muaji,
  viti,
  statusi,
  department_id,
  sortBy = 'created_at',
  sortOrder = 'DESC',
} = {}) => {
  const conditions = [];
  const params = [];

  if (employee_id) {
    conditions.push('s.employee_id = ?');
    params.push(employee_id);
  }
  if (muaji) {
    conditions.push('s.muaji = ?');
    params.push(muaji);
  }
  if (viti) {
    conditions.push('s.viti = ?');
    params.push(viti);
  }
  if (statusi) {
    conditions.push('s.statusi = ?');
    params.push(statusi);
  }
  if (department_id) {
    conditions.push('e.department_id = ?');
    params.push(department_id);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const [countRows] = await db.query(
    `SELECT COUNT(*) AS total
     FROM Salaries s
     LEFT JOIN Employees e ON s.employee_id = e.id
     ${where}`,
    params
  );
  const total = countRows[0].total;

  const { limit: perPage, offset, pagination } = buildPaginationQuery({ page, limit, total });

  const safeSortBy = ALLOWED_SORT_COLUMNS.includes(sortBy) ? sortBy : 'created_at';
  const safeSortOrder = String(sortOrder).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

  const [rows] = await db.query(
    `${BASE_SELECT}
     ${where}
     ORDER BY s.${safeSortBy} ${safeSortOrder}
     LIMIT ? OFFSET ?`,
    [...params, perPage, offset]
  );

  return { data: rows, pagination };
};

/**
 * Find a single salary by ID, enriched with employee / position / department.
 *
 * @param {number} id
 * @returns {Promise<Object|null>}
 */
const findById = async (id) => {
  const [rows] = await db.query(
    `${BASE_SELECT}
     WHERE s.id = ?`,
    [id]
  );
  return rows[0] || null;
};

/**
 * Get the full salary history for a single employee (most recent first).
 *
 * @param {number} employeeId
 * @returns {Promise<Object[]>}
 */
const findByEmployee = async (employeeId) => {
  const [rows] = await db.query(
    `${BASE_SELECT}
     WHERE s.employee_id = ?
     ORDER BY s.viti DESC, s.muaji DESC`,
    [employeeId]
  );
  return rows;
};

/**
 * Get all salaries in a given period (month + year).
 *
 * @param {number} muaji - Month 1–12
 * @param {number} viti - Year
 * @returns {Promise<Object[]>}
 */
const findByPeriod = async (muaji, viti) => {
  const [rows] = await db.query(
    `${BASE_SELECT}
     WHERE s.muaji = ? AND s.viti = ?
     ORDER BY u.last_name ASC, u.first_name ASC`,
    [muaji, viti]
  );
  return rows;
};

/**
 * Find an existing salary record for the (employee, month, year) triple.
 * Used to prevent duplicate entries before insert.
 *
 * @param {number} employeeId
 * @param {number} muaji
 * @param {number} viti
 * @returns {Promise<Object|null>}
 */
const findByEmployeePeriod = async (employeeId, muaji, viti) => {
  const [rows] = await db.query(
    `SELECT * FROM Salaries
     WHERE employee_id = ? AND muaji = ? AND viti = ?
     LIMIT 1`,
    [employeeId, muaji, viti]
  );
  return rows[0] || null;
};

/**
 * Calculate aggregate payroll totals for a given month / year.
 * Optionally restrict to a single department.
 *
 * @param {number} muaji
 * @param {number} viti
 * @param {number} [departmentId]
 * @returns {Promise<Object>} Aggregates: headcount, total_base, total_bonuses, total_deductions, total_net
 */
const calculatePayroll = async (muaji, viti, departmentId) => {
  const params = [muaji, viti];
  let deptFilter = '';
  if (departmentId) {
    deptFilter = 'AND e.department_id = ?';
    params.push(departmentId);
  }

  const [rows] = await db.query(
    `SELECT
       COUNT(*)                 AS headcount,
       COALESCE(SUM(s.paga_baze), 0) AS total_base,
       COALESCE(SUM(s.bonuse),    0) AS total_bonuses,
       COALESCE(SUM(s.zbritje),   0) AS total_deductions,
       COALESCE(SUM(s.paga_neto), 0) AS total_net
     FROM Salaries s
     LEFT JOIN Employees e ON s.employee_id = e.id
     WHERE s.muaji = ? AND s.viti = ?
     ${deptFilter}`,
    params
  );
  return rows[0];
};

/**
 * Aggregate per-employee salary totals over a range (useful for annual reports).
 *
 * @param {number} employeeId
 * @param {number} [year] - Optional year filter; defaults to all time
 * @returns {Promise<Object[]>} Row per (viti, muaji) — same shape as findByEmployee but minimal
 */
const getSalaryHistory = async (employeeId, year) => {
  const params = [employeeId];
  let yearFilter = '';
  if (year) {
    yearFilter = 'AND viti = ?';
    params.push(year);
  }

  const [rows] = await db.query(
    `SELECT viti, muaji, paga_baze, bonuse, zbritje, paga_neto, statusi, data_pageses
     FROM Salaries
     WHERE employee_id = ?
     ${yearFilter}
     ORDER BY viti DESC, muaji DESC`,
    params
  );
  return rows;
};

/**
 * Update a salary record.
 *
 * @param {number} id
 * @param {Object} data - Fields to update
 * @returns {Promise<boolean>}
 */
const update = async (id, data) => {
  const fields = [];
  const values = [];

  for (const [key, value] of Object.entries(data)) {
    fields.push(`${key} = ?`);
    values.push(value);
  }

  if (fields.length === 0) return false;

  values.push(id);
  const [result] = await db.query(
    `UPDATE Salaries SET ${fields.join(', ')} WHERE id = ?`,
    values
  );
  return result.affectedRows > 0;
};

/**
 * Delete a salary record.
 *
 * @param {number} id
 * @returns {Promise<boolean>}
 */
const remove = async (id) => {
  const [result] = await db.query('DELETE FROM Salaries WHERE id = ?', [id]);
  return result.affectedRows > 0;
};

module.exports = {
  create,
  findAll,
  findById,
  findByEmployee,
  findByPeriod,
  findByEmployeePeriod,
  calculatePayroll,
  getSalaryHistory,
  update,
  remove,
};
