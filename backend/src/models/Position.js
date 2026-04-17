/**
 * @file backend/src/models/Position.js
 * @description Position model with CRUD, department join, and salary range queries
 * @author Dev A
 */

const db = require('../config/db');
const { buildPaginationQuery, buildSearchCondition } = require('../utils/helpers');

/** Whitelist of sortable columns to prevent SQL injection */
const ALLOWED_SORT_COLUMNS = [
  'id',
  'emertimi',
  'niveli',
  'paga_min',
  'paga_max',
  'created_at',
];

/**
 * Create a new position.
 *
 * @param {Object} data
 * @param {number} data.department_id - Parent department ID
 * @param {string} data.emertimi - Position name
 * @param {string} [data.pershkrimi] - Description
 * @param {string} [data.niveli] - Level (Junior, Mid, Senior, etc.)
 * @param {number} [data.paga_min] - Minimum salary
 * @param {number} [data.paga_max] - Maximum salary
 * @returns {Promise<number>} Inserted position ID
 */
const create = async (data) => {
  const [result] = await db.query(
    `INSERT INTO Positions (department_id, emertimi, pershkrimi, niveli, paga_min, paga_max)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      data.department_id,
      data.emertimi,
      data.pershkrimi || null,
      data.niveli || null,
      data.paga_min || null,
      data.paga_max || null,
    ]
  );
  return result.insertId;
};

/**
 * Find all positions with optional pagination, search, and department filter.
 *
 * @param {Object} [opts]
 * @param {number} [opts.page=1]
 * @param {number} [opts.limit=10]
 * @param {string} [opts.search]
 * @param {number} [opts.department_id] - Filter to a specific department
 * @param {string} [opts.sortBy='emertimi']
 * @param {string} [opts.sortOrder='ASC']
 * @returns {Promise<{ data: Object[], pagination: Object }>}
 */
const findAll = async ({
  page = 1,
  limit = 10,
  search = '',
  department_id,
  sortBy = 'emertimi',
  sortOrder = 'ASC',
} = {}) => {
  const conditions = [];
  const params = [];

  if (search) {
    const { whereClause, params: searchParams } = buildSearchCondition(search, [
      'p.emertimi',
      'p.niveli',
    ]);
    if (whereClause) {
      conditions.push(whereClause);
      params.push(...searchParams);
    }
  }

  if (department_id) {
    conditions.push('p.department_id = ?');
    params.push(department_id);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  // Count total
  const [countRows] = await db.query(
    `SELECT COUNT(*) AS total FROM Positions p ${where}`,
    params
  );
  const total = countRows[0].total;

  const { limit: perPage, offset, pagination } = buildPaginationQuery({ page, limit, total });

  const safeSortBy = ALLOWED_SORT_COLUMNS.includes(sortBy) ? sortBy : 'emertimi';
  const safeSortOrder = String(sortOrder).toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

  const [rows] = await db.query(
    `SELECT p.*, d.emertimi AS department_emertimi
     FROM Positions p
     LEFT JOIN Departments d ON p.department_id = d.id
     ${where}
     ORDER BY p.${safeSortBy} ${safeSortOrder}
     LIMIT ? OFFSET ?`,
    [...params, perPage, offset]
  );

  return { data: rows, pagination };
};

/**
 * Find a single position by ID with department details.
 *
 * @param {number} id
 * @returns {Promise<Object|null>}
 */
const findById = async (id) => {
  const [rows] = await db.query(
    `SELECT p.*, d.emertimi AS department_emertimi, d.lokacioni AS department_lokacioni
     FROM Positions p
     LEFT JOIN Departments d ON p.department_id = d.id
     WHERE p.id = ?`,
    [id]
  );
  return rows[0] || null;
};

/**
 * Update a position.
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
    `UPDATE Positions SET ${fields.join(', ')} WHERE id = ?`,
    values
  );
  return result.affectedRows > 0;
};

/**
 * Delete a position.
 *
 * @param {number} id
 * @returns {Promise<boolean>}
 */
const remove = async (id) => {
  const [result] = await db.query('DELETE FROM Positions WHERE id = ?', [id]);
  return result.affectedRows > 0;
};

/**
 * Get all positions within a specific department.
 *
 * @param {number} departmentId
 * @returns {Promise<Object[]>}
 */
const findByDepartment = async (departmentId) => {
  const [rows] = await db.query(
    `SELECT id, emertimi, pershkrimi, niveli, paga_min, paga_max
     FROM Positions
     WHERE department_id = ?
     ORDER BY emertimi ASC`,
    [departmentId]
  );
  return rows;
};

/**
 * Find positions within a given salary range.
 *
 * @param {number} minSalary
 * @param {number} maxSalary
 * @returns {Promise<Object[]>}
 */
const findBySalaryRange = async (minSalary, maxSalary) => {
  const [rows] = await db.query(
    `SELECT p.*, d.emertimi AS department_emertimi
     FROM Positions p
     LEFT JOIN Departments d ON p.department_id = d.id
     WHERE p.paga_min >= ? AND p.paga_max <= ?
     ORDER BY p.paga_min ASC`,
    [minSalary, maxSalary]
  );
  return rows;
};

module.exports = {
  create,
  findAll,
  findById,
  update,
  remove,
  findByDepartment,
  findBySalaryRange,
};
