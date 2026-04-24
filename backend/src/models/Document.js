/**
 * @file backend/src/models/Document.js
 * @description Document model with CRUD, per-employee listing, type filtering, expiration alerts, and file-path management
 * @author Dev A
 */

const db = require('../config/db');
const { buildPaginationQuery } = require('../utils/helpers');

/** Whitelist of sortable columns to prevent SQL injection. */
const ALLOWED_SORT_COLUMNS = [
  'id',
  'emertimi',
  'lloji',
  'data_ngarkimit',
  'data_skadimit',
  'created_at',
];

/** Valid values for Documents.lloji enum column. */
const VALID_TYPES = ['contract', 'id-card', 'certificate', 'resume', 'other'];

/**
 * Base SELECT joining Documents → Employees → Users for a friendly
 * employee_name on every row without extra round-trips per list item.
 */
const BASE_SELECT = `
  SELECT
    d.id,
    d.employee_id,
    d.lloji,
    d.emertimi,
    d.file_path,
    d.data_ngarkimit,
    d.data_skadimit,
    d.created_at,
    CONCAT(u.first_name, ' ', u.last_name) AS employee_name,
    e.numri_punonjesit AS employee_number
  FROM Documents d
  LEFT JOIN Employees e ON d.employee_id = e.id
  LEFT JOIN Users u ON e.user_id = u.id
`;

/**
 * Create a new document row (file is already persisted on disk by multer).
 *
 * @param {Object} data
 * @param {number} data.employee_id
 * @param {string} data.lloji - One of VALID_TYPES
 * @param {string} data.emertimi - Display name
 * @param {string} data.file_path - Relative path under /uploads
 * @param {string} [data.data_skadimit] - Optional expiration date (YYYY-MM-DD)
 * @returns {Promise<number>} Inserted document ID
 */
const create = async (data) => {
  const [result] = await db.query(
    `INSERT INTO Documents
       (employee_id, lloji, emertimi, file_path, data_skadimit)
     VALUES (?, ?, ?, ?, ?)`,
    [
      data.employee_id,
      data.lloji,
      data.emertimi,
      data.file_path,
      data.data_skadimit || null,
    ]
  );
  return result.insertId;
};

/**
 * List documents with pagination and filters.
 *
 * @param {Object} [opts]
 * @param {number} [opts.page=1]
 * @param {number} [opts.limit=10]
 * @param {number} [opts.employee_id]
 * @param {string} [opts.lloji] - Filter by document type
 * @param {string} [opts.search] - LIKE over emertimi
 * @param {string} [opts.sortBy='data_ngarkimit']
 * @param {string} [opts.sortOrder='DESC']
 * @returns {Promise<{ data: Object[], pagination: Object }>}
 */
const findAll = async ({
  page = 1,
  limit = 10,
  employee_id,
  lloji,
  search,
  sortBy = 'data_ngarkimit',
  sortOrder = 'DESC',
} = {}) => {
  const conditions = [];
  const params = [];

  if (employee_id) {
    conditions.push('d.employee_id = ?');
    params.push(employee_id);
  }
  if (lloji) {
    conditions.push('d.lloji = ?');
    params.push(lloji);
  }
  if (search) {
    conditions.push('d.emertimi LIKE ?');
    params.push(`%${search}%`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const [countRows] = await db.query(
    `SELECT COUNT(*) AS total
     FROM Documents d
     ${where}`,
    params
  );
  const total = countRows[0].total;

  const {
    limit: perPage,
    offset,
    pagination,
  } = buildPaginationQuery({ page, limit, total });

  const safeSortBy = ALLOWED_SORT_COLUMNS.includes(sortBy)
    ? sortBy
    : 'data_ngarkimit';
  const safeSortOrder =
    String(sortOrder).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

  const [rows] = await db.query(
    `${BASE_SELECT}
     ${where}
     ORDER BY d.${safeSortBy} ${safeSortOrder}
     LIMIT ? OFFSET ?`,
    [...params, perPage, offset]
  );

  return { data: rows, pagination };
};

/**
 * Find a single document by ID.
 *
 * @param {number} id
 * @returns {Promise<Object|null>}
 */
const findById = async (id) => {
  const [rows] = await db.query(
    `${BASE_SELECT}
     WHERE d.id = ?`,
    [id]
  );
  return rows[0] || null;
};

/**
 * List all documents for a given employee.
 *
 * @param {number} employeeId
 * @param {Object} [opts]
 * @param {string} [opts.lloji] - Optional type filter
 * @returns {Promise<Object[]>}
 */
const findByEmployee = async (employeeId, { lloji } = {}) => {
  const conditions = ['d.employee_id = ?'];
  const params = [employeeId];

  if (lloji) {
    conditions.push('d.lloji = ?');
    params.push(lloji);
  }

  const [rows] = await db.query(
    `${BASE_SELECT}
     WHERE ${conditions.join(' AND ')}
     ORDER BY d.data_ngarkimit DESC`,
    params
  );
  return rows;
};

/**
 * List all documents of a given type across the organization.
 *
 * @param {string} lloji - One of VALID_TYPES
 * @returns {Promise<Object[]>}
 */
const findByType = async (lloji) => {
  const [rows] = await db.query(
    `${BASE_SELECT}
     WHERE d.lloji = ?
     ORDER BY d.data_ngarkimit DESC`,
    [lloji]
  );
  return rows;
};

/**
 * Find documents whose `data_skadimit` falls within the next `days` days.
 * Past-due documents (where the date has already passed) are also returned
 * so HR can see "overdue" items alongside "due soon" ones.
 *
 * @param {number} [days=30] - Lookahead window in days
 * @returns {Promise<Object[]>}
 */
const findExpiring = async (days = 30) => {
  const windowDays = Number.isFinite(Number(days)) ? Math.max(0, Number(days)) : 30;

  const [rows] = await db.query(
    `${BASE_SELECT}
     WHERE d.data_skadimit IS NOT NULL
       AND d.data_skadimit <= DATE_ADD(CURDATE(), INTERVAL ? DAY)
     ORDER BY d.data_skadimit ASC`,
    [windowDays]
  );
  return rows;
};

/**
 * Count documents grouped by type across the org. Useful for dashboards.
 *
 * @returns {Promise<Object[]>} [{ lloji, total }]
 */
const countByType = async () => {
  const [rows] = await db.query(
    `SELECT lloji, COUNT(*) AS total
     FROM Documents
     GROUP BY lloji
     ORDER BY total DESC`
  );
  return rows;
};

/**
 * Generic update — any of lloji, emertimi, file_path, data_skadimit.
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
    `UPDATE Documents SET ${fields.join(', ')} WHERE id = ?`,
    values
  );
  return result.affectedRows > 0;
};

/**
 * Hard-delete a document row.
 * NOTE: the caller is responsible for removing the file on disk.
 *
 * @param {number} id
 * @returns {Promise<boolean>}
 */
const remove = async (id) => {
  const [result] = await db.query('DELETE FROM Documents WHERE id = ?', [id]);
  return result.affectedRows > 0;
};

module.exports = {
  VALID_TYPES,
  create,
  findAll,
  findById,
  findByEmployee,
  findByType,
  findExpiring,
  countByType,
  update,
  remove,
};
