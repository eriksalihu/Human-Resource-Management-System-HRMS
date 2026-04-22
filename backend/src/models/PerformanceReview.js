/**
 * @file backend/src/models/PerformanceReview.js
 * @description PerformanceReview model with CRUD, reviewer/employee queries, average rating, and period-based listing
 * @author Dev A
 */

const db = require('../config/db');
const { buildPaginationQuery } = require('../utils/helpers');

/** Whitelist of sortable columns to prevent SQL injection. */
const ALLOWED_SORT_COLUMNS = [
  'id',
  'periudha',
  'nota',
  'data_vleresimit',
  'created_at',
];

/**
 * Base SELECT / JOIN clause enriching a review with employee info (via Users)
 * and reviewer info (via Employees → Users).
 */
const BASE_SELECT = `
  SELECT
    pr.id,
    pr.employee_id,
    pr.vleresues_id,
    pr.periudha,
    pr.nota,
    pr.pikat_forta,
    pr.pikat_dobta,
    pr.objektivat,
    pr.data_vleresimit,
    pr.created_at,
    pr.updated_at,
    e.numri_punonjesit,
    e.department_id,
    u.first_name,
    u.last_name,
    u.email,
    d.emertimi AS department_emertimi,
    p.emertimi AS position_emertimi,
    rev_u.first_name AS reviewer_first_name,
    rev_u.last_name  AS reviewer_last_name
  FROM PerformanceReviews pr
  LEFT JOIN Employees   e     ON pr.employee_id = e.id
  LEFT JOIN Users       u     ON e.user_id = u.id
  LEFT JOIN Departments d     ON e.department_id = d.id
  LEFT JOIN Positions   p     ON e.position_id = p.id
  LEFT JOIN Employees   rev   ON pr.vleresues_id = rev.id
  LEFT JOIN Users       rev_u ON rev.user_id = rev_u.id
`;

/**
 * Create a new performance review.
 *
 * @param {Object} data
 * @param {number} data.employee_id
 * @param {number} [data.vleresues_id] - Reviewer employee ID
 * @param {string} data.periudha - e.g. "2026-Q1", "Annual 2026"
 * @param {number} [data.nota] - Rating between 1.0 and 5.0
 * @param {string} [data.pikat_forta] - Strengths
 * @param {string} [data.pikat_dobta] - Weaknesses
 * @param {string} [data.objektivat] - Objectives / goals
 * @param {string} data.data_vleresimit - Review date YYYY-MM-DD
 * @returns {Promise<number>} Inserted review ID
 */
const create = async (data) => {
  const [result] = await db.query(
    `INSERT INTO PerformanceReviews
       (employee_id, vleresues_id, periudha, nota, pikat_forta, pikat_dobta, objektivat, data_vleresimit)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.employee_id,
      data.vleresues_id || null,
      data.periudha,
      data.nota != null ? data.nota : null,
      data.pikat_forta || null,
      data.pikat_dobta || null,
      data.objektivat || null,
      data.data_vleresimit,
    ]
  );
  return result.insertId;
};

/**
 * List performance reviews with pagination, filters, and sort.
 *
 * @param {Object} [opts]
 * @param {number} [opts.page=1]
 * @param {number} [opts.limit=10]
 * @param {number} [opts.employee_id]
 * @param {number} [opts.vleresues_id]
 * @param {number} [opts.department_id]
 * @param {string} [opts.periudha]
 * @param {string} [opts.from_date] - data_vleresimit >= from_date
 * @param {string} [opts.to_date] - data_vleresimit <= to_date
 * @param {string} [opts.sortBy='data_vleresimit']
 * @param {string} [opts.sortOrder='DESC']
 * @returns {Promise<{ data: Object[], pagination: Object }>}
 */
const findAll = async ({
  page = 1,
  limit = 10,
  employee_id,
  vleresues_id,
  department_id,
  periudha,
  from_date,
  to_date,
  sortBy = 'data_vleresimit',
  sortOrder = 'DESC',
} = {}) => {
  const conditions = [];
  const params = [];

  if (employee_id) {
    conditions.push('pr.employee_id = ?');
    params.push(employee_id);
  }
  if (vleresues_id) {
    conditions.push('pr.vleresues_id = ?');
    params.push(vleresues_id);
  }
  if (department_id) {
    conditions.push('e.department_id = ?');
    params.push(department_id);
  }
  if (periudha) {
    conditions.push('pr.periudha = ?');
    params.push(periudha);
  }
  if (from_date) {
    conditions.push('pr.data_vleresimit >= ?');
    params.push(from_date);
  }
  if (to_date) {
    conditions.push('pr.data_vleresimit <= ?');
    params.push(to_date);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const [countRows] = await db.query(
    `SELECT COUNT(*) AS total
     FROM PerformanceReviews pr
     LEFT JOIN Employees e ON pr.employee_id = e.id
     ${where}`,
    params
  );
  const total = countRows[0].total;

  const { limit: perPage, offset, pagination } = buildPaginationQuery({ page, limit, total });

  const safeSortBy = ALLOWED_SORT_COLUMNS.includes(sortBy) ? sortBy : 'data_vleresimit';
  const safeSortOrder = String(sortOrder).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

  const [rows] = await db.query(
    `${BASE_SELECT}
     ${where}
     ORDER BY pr.${safeSortBy} ${safeSortOrder}
     LIMIT ? OFFSET ?`,
    [...params, perPage, offset]
  );

  return { data: rows, pagination };
};

/**
 * Find a single performance review by ID with full related info.
 *
 * @param {number} id
 * @returns {Promise<Object|null>}
 */
const findById = async (id) => {
  const [rows] = await db.query(
    `${BASE_SELECT}
     WHERE pr.id = ?`,
    [id]
  );
  return rows[0] || null;
};

/**
 * Get all reviews for a specific employee, newest-first.
 *
 * @param {number} employeeId
 * @returns {Promise<Object[]>}
 */
const findByEmployee = async (employeeId) => {
  const [rows] = await db.query(
    `${BASE_SELECT}
     WHERE pr.employee_id = ?
     ORDER BY pr.data_vleresimit DESC`,
    [employeeId]
  );
  return rows;
};

/**
 * Get all reviews authored by a specific reviewer, newest-first.
 *
 * @param {number} reviewerId
 * @returns {Promise<Object[]>}
 */
const findByReviewer = async (reviewerId) => {
  const [rows] = await db.query(
    `${BASE_SELECT}
     WHERE pr.vleresues_id = ?
     ORDER BY pr.data_vleresimit DESC`,
    [reviewerId]
  );
  return rows;
};

/**
 * Get all reviews for a specific review period (e.g. "2026-Q1").
 *
 * @param {string} periudha
 * @param {Object} [opts]
 * @param {number} [opts.department_id] - Optional department scope
 * @returns {Promise<Object[]>}
 */
const getPeriodReviews = async (periudha, { department_id } = {}) => {
  const params = [periudha];
  let deptFilter = '';
  if (department_id) {
    deptFilter = 'AND e.department_id = ?';
    params.push(department_id);
  }

  const [rows] = await db.query(
    `${BASE_SELECT}
     WHERE pr.periudha = ?
     ${deptFilter}
     ORDER BY pr.nota DESC, u.last_name, u.first_name`,
    params
  );
  return rows;
};

/**
 * Compute the average review rating for an employee over an optional window.
 *
 * @param {number} employeeId
 * @param {Object} [opts]
 * @param {string} [opts.from_date]
 * @param {string} [opts.to_date]
 * @returns {Promise<{ average: number|null, review_count: number }>}
 */
const getAverageRating = async (employeeId, { from_date, to_date } = {}) => {
  const conditions = ['employee_id = ?', 'nota IS NOT NULL'];
  const params = [employeeId];

  if (from_date) {
    conditions.push('data_vleresimit >= ?');
    params.push(from_date);
  }
  if (to_date) {
    conditions.push('data_vleresimit <= ?');
    params.push(to_date);
  }

  const [rows] = await db.query(
    `SELECT AVG(nota) AS average, COUNT(*) AS review_count
     FROM PerformanceReviews
     WHERE ${conditions.join(' AND ')}`,
    params
  );

  const row = rows[0] || {};
  return {
    average: row.average != null ? Number(row.average) : null,
    review_count: Number(row.review_count || 0),
  };
};

/**
 * Rating distribution bucketed into 1–5 whole-number bins, optionally scoped
 * by period or department. Used by the dashboard statistics view.
 *
 * @param {Object} [opts]
 * @param {string} [opts.periudha]
 * @param {number} [opts.department_id]
 * @returns {Promise<Object[]>} [{ bucket, count }]
 */
const getRatingDistribution = async ({ periudha, department_id } = {}) => {
  const conditions = ['pr.nota IS NOT NULL'];
  const params = [];

  if (periudha) {
    conditions.push('pr.periudha = ?');
    params.push(periudha);
  }
  if (department_id) {
    conditions.push('e.department_id = ?');
    params.push(department_id);
  }

  const [rows] = await db.query(
    `SELECT FLOOR(pr.nota) AS bucket, COUNT(*) AS count
     FROM PerformanceReviews pr
     LEFT JOIN Employees e ON pr.employee_id = e.id
     WHERE ${conditions.join(' AND ')}
     GROUP BY FLOOR(pr.nota)
     ORDER BY bucket ASC`,
    params
  );
  return rows;
};

/**
 * Generic update — any of periudha, nota, pikat_forta, pikat_dobta,
 * objektivat, data_vleresimit, vleresues_id.
 *
 * @param {number} id
 * @param {Object} data
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
    `UPDATE PerformanceReviews SET ${fields.join(', ')} WHERE id = ?`,
    values
  );
  return result.affectedRows > 0;
};

/**
 * Hard-delete a performance review.
 *
 * @param {number} id
 * @returns {Promise<boolean>}
 */
const remove = async (id) => {
  const [result] = await db.query(
    'DELETE FROM PerformanceReviews WHERE id = ?',
    [id]
  );
  return result.affectedRows > 0;
};

module.exports = {
  create,
  findAll,
  findById,
  findByEmployee,
  findByReviewer,
  getPeriodReviews,
  getAverageRating,
  getRatingDistribution,
  update,
  remove,
};
