/**
 * @file backend/src/models/Employee.js
 * @description Employee model with multi-table joins, filtering, search, and manager hierarchy
 * @author Dev A
 */

const db = require('../config/db');
const { buildPaginationQuery, buildSearchCondition } = require('../utils/helpers');

/** Whitelist of sortable columns to prevent SQL injection */
const ALLOWED_SORT_COLUMNS = [
  'id',
  'numri_punonjesit',
  'data_punesimit',
  'statusi',
  'lloji_kontrates',
  'created_at',
];

/**
 * Base SELECT / JOIN clause used by most read queries.
 * Pulls user name/email, position name, and department name in a single row.
 */
const BASE_SELECT = `
  SELECT
    e.id,
    e.user_id,
    e.position_id,
    e.department_id,
    e.numri_punonjesit,
    e.data_punesimit,
    e.lloji_kontrates,
    e.statusi,
    e.menaxheri_id,
    e.created_at,
    e.updated_at,
    u.first_name,
    u.last_name,
    u.email,
    u.phone,
    u.profile_image,
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
`;

/**
 * Create a new employee record.
 *
 * @param {Object} data
 * @param {number} data.user_id - Associated user account
 * @param {number} data.position_id
 * @param {number} data.department_id
 * @param {string} data.numri_punonjesit - Unique employee number (e.g., 'EMP-00001')
 * @param {string} data.data_punesimit - Hire date (YYYY-MM-DD)
 * @param {string} data.lloji_kontrates - Contract type
 * @param {string} [data.statusi='active'] - Employment status
 * @param {number} [data.menaxheri_id] - Manager employee ID (self-reference)
 * @returns {Promise<number>} Inserted employee ID
 */
const create = async (data) => {
  const [result] = await db.query(
    `INSERT INTO Employees
       (user_id, position_id, department_id, numri_punonjesit,
        data_punesimit, lloji_kontrates, statusi, menaxheri_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.user_id,
      data.position_id,
      data.department_id,
      data.numri_punonjesit,
      data.data_punesimit,
      data.lloji_kontrates,
      data.statusi || 'active',
      data.menaxheri_id || null,
    ]
  );
  return result.insertId;
};

/**
 * Find all employees with pagination, search, and filters.
 *
 * @param {Object} [opts]
 * @param {number} [opts.page=1]
 * @param {number} [opts.limit=10]
 * @param {string} [opts.search] - Matches name, email, or employee number
 * @param {number} [opts.department_id]
 * @param {number} [opts.position_id]
 * @param {string} [opts.statusi]
 * @param {string} [opts.lloji_kontrates]
 * @param {number} [opts.menaxheri_id]
 * @param {string} [opts.sortBy='id']
 * @param {string} [opts.sortOrder='ASC']
 * @returns {Promise<{ data: Object[], pagination: Object }>}
 */
const findAll = async ({
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
} = {}) => {
  const conditions = [];
  const params = [];

  if (search) {
    const { whereClause, params: searchParams } = buildSearchCondition(search, [
      'u.first_name',
      'u.last_name',
      'u.email',
      'e.numri_punonjesit',
    ]);
    if (whereClause) {
      conditions.push(whereClause);
      params.push(...searchParams);
    }
  }

  if (department_id) {
    conditions.push('e.department_id = ?');
    params.push(department_id);
  }
  if (position_id) {
    conditions.push('e.position_id = ?');
    params.push(position_id);
  }
  if (statusi) {
    conditions.push('e.statusi = ?');
    params.push(statusi);
  }
  if (lloji_kontrates) {
    conditions.push('e.lloji_kontrates = ?');
    params.push(lloji_kontrates);
  }
  if (menaxheri_id) {
    conditions.push('e.menaxheri_id = ?');
    params.push(menaxheri_id);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  // Count total matching rows
  const [countRows] = await db.query(
    `SELECT COUNT(*) AS total
     FROM Employees e
     LEFT JOIN Users u ON e.user_id = u.id
     ${where}`,
    params
  );
  const total = countRows[0].total;

  const { limit: perPage, offset, pagination } = buildPaginationQuery({ page, limit, total });

  const safeSortBy = ALLOWED_SORT_COLUMNS.includes(sortBy) ? sortBy : 'id';
  const safeSortOrder = String(sortOrder).toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

  const [rows] = await db.query(
    `${BASE_SELECT}
     ${where}
     ORDER BY e.${safeSortBy} ${safeSortOrder}
     LIMIT ? OFFSET ?`,
    [...params, perPage, offset]
  );

  return { data: rows, pagination };
};

/**
 * Find a single employee by ID with all related details.
 *
 * @param {number} id
 * @returns {Promise<Object|null>}
 */
const findById = async (id) => {
  const [rows] = await db.query(
    `${BASE_SELECT}
     WHERE e.id = ?`,
    [id]
  );
  return rows[0] || null;
};

/**
 * Find the employee record associated with a user ID.
 * Used by "my profile" endpoints.
 *
 * @param {number} userId
 * @returns {Promise<Object|null>}
 */
const findByUserId = async (userId) => {
  const [rows] = await db.query(
    `${BASE_SELECT}
     WHERE e.user_id = ?`,
    [userId]
  );
  return rows[0] || null;
};

/**
 * Find an employee by unique employee number.
 *
 * @param {string} numriPunonjesit
 * @returns {Promise<Object|null>}
 */
const findByEmployeeNumber = async (numriPunonjesit) => {
  const [rows] = await db.query(
    `${BASE_SELECT}
     WHERE e.numri_punonjesit = ?`,
    [numriPunonjesit]
  );
  return rows[0] || null;
};

/**
 * Update an employee. Only the provided fields are touched.
 *
 * @param {number} id
 * @param {Object} data
 * @returns {Promise<boolean>} True if a row was updated
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
    `UPDATE Employees SET ${fields.join(', ')} WHERE id = ?`,
    values
  );
  return result.affectedRows > 0;
};

/**
 * Soft-delete by setting statusi = 'terminated'.
 * Hard deletes are avoided because Salaries / LeaveRequests / Attendances
 * reference this row.
 *
 * @param {number} id
 * @returns {Promise<boolean>}
 */
const remove = async (id) => {
  const [result] = await db.query(
    `UPDATE Employees SET statusi = 'terminated' WHERE id = ?`,
    [id]
  );
  return result.affectedRows > 0;
};

/**
 * Get all subordinates of a given manager (direct reports).
 *
 * @param {number} managerId
 * @returns {Promise<Object[]>}
 */
const getManagerSubordinates = async (managerId) => {
  const [rows] = await db.query(
    `${BASE_SELECT}
     WHERE e.menaxheri_id = ?
     ORDER BY u.last_name ASC, u.first_name ASC`,
    [managerId]
  );
  return rows;
};

/**
 * Count employees in a given department (any status).
 *
 * @param {number} departmentId
 * @returns {Promise<number>}
 */
const countByDepartment = async (departmentId) => {
  const [rows] = await db.query(
    `SELECT COUNT(*) AS total FROM Employees WHERE department_id = ?`,
    [departmentId]
  );
  return rows[0].total;
};

/**
 * Get the next sequential number for generating an employee number.
 * Uses MAX(id) + 1 as the base — simple and sufficient for a university project.
 *
 * @returns {Promise<number>}
 */
const getNextSequenceNumber = async () => {
  const [rows] = await db.query(`SELECT COALESCE(MAX(id), 0) AS last_id FROM Employees`);
  return (rows[0].last_id || 0) + 1;
};

module.exports = {
  create,
  findAll,
  findById,
  findByUserId,
  findByEmployeeNumber,
  update,
  remove,
  getManagerSubordinates,
  countByDepartment,
  getNextSequenceNumber,
};
