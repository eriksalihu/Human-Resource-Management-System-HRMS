/**
 * @file backend/src/models/Department.js
 * @description Department model with CRUD, search, manager join, and related queries
 * @author Dev A
 */

const db = require('../config/db');
const { buildPaginationQuery, buildSearchCondition } = require('../utils/helpers');

/** Whitelist of sortable columns to prevent SQL injection */
const ALLOWED_SORT_COLUMNS = ['id', 'emertimi', 'lokacioni', 'buxheti', 'created_at'];

/**
 * Create a new department.
 *
 * @param {Object} data
 * @param {string} data.emertimi - Department name
 * @param {string} [data.pershkrimi] - Description
 * @param {number|null} [data.menaxheri_id] - Manager employee ID
 * @param {string} [data.lokacioni] - Location
 * @param {number} [data.buxheti] - Budget
 * @returns {Promise<number>} Inserted department ID
 */
const create = async (data) => {
  const [result] = await db.query(
    `INSERT INTO Departments (emertimi, pershkrimi, menaxheri_id, lokacioni, buxheti)
     VALUES (?, ?, ?, ?, ?)`,
    [
      data.emertimi,
      data.pershkrimi || null,
      data.menaxheri_id || null,
      data.lokacioni || null,
      data.buxheti || null,
    ]
  );
  return result.insertId;
};

/**
 * Find all departments with optional pagination and search.
 *
 * @param {Object} [opts]
 * @param {number} [opts.page=1]
 * @param {number} [opts.limit=10]
 * @param {string} [opts.search] - Search by emertimi (name)
 * @param {string} [opts.sortBy='emertimi']
 * @param {string} [opts.sortOrder='ASC']
 * @returns {Promise<{ data: Object[], pagination: Object }>}
 */
const findAll = async ({
  page = 1,
  limit = 10,
  search = '',
  sortBy = 'emertimi',
  sortOrder = 'ASC',
} = {}) => {
  // Search condition
  const { whereClause, params: searchParams } = buildSearchCondition(search, [
    'emertimi',
    'pershkrimi',
    'lokacioni',
  ]);
  const where = whereClause ? `WHERE ${whereClause}` : '';

  // Count total
  const [countRows] = await db.query(
    `SELECT COUNT(*) AS total FROM Departments ${where}`,
    searchParams
  );
  const total = countRows[0].total;

  const { limit: perPage, offset, pagination } = buildPaginationQuery({ page, limit, total });

  // Validate sort column
  const safeSortBy = ALLOWED_SORT_COLUMNS.includes(sortBy) ? sortBy : 'emertimi';
  const safeSortOrder = String(sortOrder).toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

  const [rows] = await db.query(
    `SELECT d.*, CONCAT(u.first_name, ' ', u.last_name) AS menaxheri_emri
     FROM Departments d
     LEFT JOIN Employees e ON d.menaxheri_id = e.id
     LEFT JOIN Users u ON e.user_id = u.id
     ${where}
     ORDER BY d.${safeSortBy} ${safeSortOrder}
     LIMIT ? OFFSET ?`,
    [...searchParams, perPage, offset]
  );

  return { data: rows, pagination };
};

/**
 * Find a single department by ID, including manager details.
 *
 * @param {number} id
 * @returns {Promise<Object|null>}
 */
const findById = async (id) => {
  const [rows] = await db.query(
    `SELECT d.*, CONCAT(u.first_name, ' ', u.last_name) AS menaxheri_emri,
            u.email AS menaxheri_email
     FROM Departments d
     LEFT JOIN Employees e ON d.menaxheri_id = e.id
     LEFT JOIN Users u ON e.user_id = u.id
     WHERE d.id = ?`,
    [id]
  );
  return rows[0] || null;
};

/**
 * Update a department.
 *
 * @param {number} id
 * @param {Object} data - Fields to update
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
    `UPDATE Departments SET ${fields.join(', ')} WHERE id = ?`,
    values
  );
  return result.affectedRows > 0;
};

/**
 * Delete a department.
 *
 * @param {number} id
 * @returns {Promise<boolean>} True if a row was deleted
 */
const remove = async (id) => {
  const [result] = await db.query('DELETE FROM Departments WHERE id = ?', [id]);
  return result.affectedRows > 0;
};

/**
 * Get a department along with its positions.
 *
 * @param {number} departmentId
 * @returns {Promise<Object|null>} Department with positions array
 */
const getDepartmentWithPositions = async (departmentId) => {
  const department = await findById(departmentId);
  if (!department) return null;

  const [positions] = await db.query(
    `SELECT id, emertimi, pershkrimi, paga_baze
     FROM Positions WHERE department_id = ?
     ORDER BY emertimi ASC`,
    [departmentId]
  );

  department.positions = positions;
  return department;
};

/**
 * Get the employee count for a department.
 *
 * @param {number} departmentId
 * @returns {Promise<number>}
 */
const getDepartmentEmployeeCount = async (departmentId) => {
  const [rows] = await db.query(
    `SELECT COUNT(*) AS count FROM Employees
     WHERE department_id = ? AND statusi = 'Active'`,
    [departmentId]
  );
  return rows[0].count;
};

module.exports = {
  create,
  findAll,
  findById,
  update,
  remove,
  getDepartmentWithPositions,
  getDepartmentEmployeeCount,
};
