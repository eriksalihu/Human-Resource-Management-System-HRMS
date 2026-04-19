/**
 * @file backend/src/models/LeaveRequest.js
 * @description LeaveRequest model with CRUD, approval workflow, overlap detection, and balance calculation
 * @author Dev A
 */

const db = require('../config/db');
const { buildPaginationQuery } = require('../utils/helpers');

/** Whitelist of sortable columns to prevent SQL injection */
const ALLOWED_SORT_COLUMNS = [
  'id',
  'data_fillimit',
  'data_perfundimit',
  'statusi',
  'lloji',
  'data_kerkeses',
  'created_at',
];

/**
 * Base SELECT / JOIN clause enriching a leave request with employee, user,
 * department, and approver info.
 */
const BASE_SELECT = `
  SELECT
    lr.id,
    lr.employee_id,
    lr.lloji,
    lr.data_fillimit,
    lr.data_perfundimit,
    lr.arsyeja,
    lr.statusi,
    lr.aprovuar_nga,
    lr.data_kerkeses,
    lr.created_at,
    lr.updated_at,
    DATEDIFF(lr.data_perfundimit, lr.data_fillimit) + 1 AS total_days,
    e.numri_punonjesit,
    u.first_name,
    u.last_name,
    u.email,
    d.emertimi AS department_emertimi,
    appr_u.first_name AS approver_first_name,
    appr_u.last_name  AS approver_last_name
  FROM LeaveRequests lr
  LEFT JOIN Employees   e      ON lr.employee_id = e.id
  LEFT JOIN Users       u      ON e.user_id = u.id
  LEFT JOIN Departments d      ON e.department_id = d.id
  LEFT JOIN Employees   appr   ON lr.aprovuar_nga = appr.id
  LEFT JOIN Users       appr_u ON appr.user_id = appr_u.id
`;

/**
 * Create a new leave request (always starts in 'pending' status).
 *
 * @param {Object} data
 * @param {number} data.employee_id
 * @param {string} data.lloji - Leave type enum value
 * @param {string} data.data_fillimit - Start date YYYY-MM-DD
 * @param {string} data.data_perfundimit - End date YYYY-MM-DD
 * @param {string} [data.arsyeja] - Reason
 * @returns {Promise<number>} Inserted request ID
 */
const create = async (data) => {
  const [result] = await db.query(
    `INSERT INTO LeaveRequests
       (employee_id, lloji, data_fillimit, data_perfundimit, arsyeja, statusi)
     VALUES (?, ?, ?, ?, ?, 'pending')`,
    [
      data.employee_id,
      data.lloji,
      data.data_fillimit,
      data.data_perfundimit,
      data.arsyeja || null,
    ]
  );
  return result.insertId;
};

/**
 * List leave requests with pagination, filters, and sort.
 *
 * @param {Object} [opts]
 * @param {number} [opts.page=1]
 * @param {number} [opts.limit=10]
 * @param {number} [opts.employee_id]
 * @param {number} [opts.department_id]
 * @param {string} [opts.statusi]
 * @param {string} [opts.lloji]
 * @param {string} [opts.from_date]
 * @param {string} [opts.to_date]
 * @param {string} [opts.sortBy='data_kerkeses']
 * @param {string} [opts.sortOrder='DESC']
 * @returns {Promise<{ data: Object[], pagination: Object }>}
 */
const findAll = async ({
  page = 1,
  limit = 10,
  employee_id,
  department_id,
  statusi,
  lloji,
  from_date,
  to_date,
  sortBy = 'data_kerkeses',
  sortOrder = 'DESC',
} = {}) => {
  const conditions = [];
  const params = [];

  if (employee_id) {
    conditions.push('lr.employee_id = ?');
    params.push(employee_id);
  }
  if (department_id) {
    conditions.push('e.department_id = ?');
    params.push(department_id);
  }
  if (statusi) {
    conditions.push('lr.statusi = ?');
    params.push(statusi);
  }
  if (lloji) {
    conditions.push('lr.lloji = ?');
    params.push(lloji);
  }
  if (from_date) {
    conditions.push('lr.data_fillimit >= ?');
    params.push(from_date);
  }
  if (to_date) {
    conditions.push('lr.data_perfundimit <= ?');
    params.push(to_date);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const [countRows] = await db.query(
    `SELECT COUNT(*) AS total
     FROM LeaveRequests lr
     LEFT JOIN Employees e ON lr.employee_id = e.id
     ${where}`,
    params
  );
  const total = countRows[0].total;

  const { limit: perPage, offset, pagination } = buildPaginationQuery({ page, limit, total });

  const safeSortBy = ALLOWED_SORT_COLUMNS.includes(sortBy) ? sortBy : 'data_kerkeses';
  const safeSortOrder = String(sortOrder).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

  const [rows] = await db.query(
    `${BASE_SELECT}
     ${where}
     ORDER BY lr.${safeSortBy} ${safeSortOrder}
     LIMIT ? OFFSET ?`,
    [...params, perPage, offset]
  );

  return { data: rows, pagination };
};

/**
 * Find a single leave request by ID with all related info.
 *
 * @param {number} id
 * @returns {Promise<Object|null>}
 */
const findById = async (id) => {
  const [rows] = await db.query(
    `${BASE_SELECT}
     WHERE lr.id = ?`,
    [id]
  );
  return rows[0] || null;
};

/**
 * Get all leave requests for a specific employee (any status).
 *
 * @param {number} employeeId
 * @returns {Promise<Object[]>}
 */
const findByEmployee = async (employeeId) => {
  const [rows] = await db.query(
    `${BASE_SELECT}
     WHERE lr.employee_id = ?
     ORDER BY lr.data_fillimit DESC`,
    [employeeId]
  );
  return rows;
};

/**
 * List all pending leave requests (optionally filtered to a department).
 *
 * @param {Object} [opts]
 * @param {number} [opts.department_id] - Scope to employees in a department
 * @returns {Promise<Object[]>}
 */
const findPending = async ({ department_id } = {}) => {
  const params = [];
  let deptFilter = '';
  if (department_id) {
    deptFilter = 'AND e.department_id = ?';
    params.push(department_id);
  }

  const [rows] = await db.query(
    `${BASE_SELECT}
     WHERE lr.statusi = 'pending'
     ${deptFilter}
     ORDER BY lr.data_kerkeses ASC`,
    params
  );
  return rows;
};

/**
 * Check whether a new leave range overlaps with any existing non-cancelled
 * request for the same employee.
 *
 * Two ranges [a1, a2] and [b1, b2] overlap iff (a1 <= b2 AND b1 <= a2).
 *
 * @param {number} employeeId
 * @param {string} startDate - YYYY-MM-DD
 * @param {string} endDate - YYYY-MM-DD
 * @param {number} [excludeRequestId] - Ignore this request (useful on update)
 * @returns {Promise<Object|null>} The conflicting request, or null if none
 */
const checkOverlap = async (employeeId, startDate, endDate, excludeRequestId) => {
  const params = [employeeId, endDate, startDate];
  let excludeClause = '';
  if (excludeRequestId) {
    excludeClause = 'AND id <> ?';
    params.push(excludeRequestId);
  }

  const [rows] = await db.query(
    `SELECT id, lloji, data_fillimit, data_perfundimit, statusi
     FROM LeaveRequests
     WHERE employee_id = ?
       AND statusi IN ('pending', 'approved')
       AND data_fillimit <= ?
       AND data_perfundimit >= ?
       ${excludeClause}
     LIMIT 1`,
    params
  );
  return rows[0] || null;
};

/**
 * Approve or reject a leave request by updating status + approver.
 *
 * @param {number} id
 * @param {'approved'|'rejected'} status
 * @param {number} approverId - Employee ID of the approver
 * @returns {Promise<boolean>}
 */
const setApprovalStatus = async (id, status, approverId) => {
  const [result] = await db.query(
    `UPDATE LeaveRequests
     SET statusi = ?, aprovuar_nga = ?
     WHERE id = ?`,
    [status, approverId, id]
  );
  return result.affectedRows > 0;
};

/**
 * Cancel a pending leave request (employee self-service).
 *
 * @param {number} id
 * @returns {Promise<boolean>}
 */
const cancel = async (id) => {
  const [result] = await db.query(
    `UPDATE LeaveRequests
     SET statusi = 'cancelled'
     WHERE id = ? AND statusi = 'pending'`,
    [id]
  );
  return result.affectedRows > 0;
};

/**
 * Generic update (arsyeja / dates / lloji) for pending requests.
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
    `UPDATE LeaveRequests SET ${fields.join(', ')} WHERE id = ?`,
    values
  );
  return result.affectedRows > 0;
};

/**
 * Hard-delete a leave request.
 *
 * @param {number} id
 * @returns {Promise<boolean>}
 */
const remove = async (id) => {
  const [result] = await db.query('DELETE FROM LeaveRequests WHERE id = ?', [id]);
  return result.affectedRows > 0;
};

/**
 * Compute leave balance usage for a given employee, broken down by leave type.
 * Only 'approved' requests count toward days_used.
 *
 * @param {number} employeeId
 * @param {number} [year] - Optional year scope; defaults to current year
 * @returns {Promise<Object[]>} Array of { lloji, days_used, request_count }
 */
const getLeaveBalance = async (employeeId, year) => {
  const targetYear = year || new Date().getFullYear();

  const [rows] = await db.query(
    `SELECT
       lloji,
       COUNT(*) AS request_count,
       COALESCE(SUM(DATEDIFF(data_perfundimit, data_fillimit) + 1), 0) AS days_used
     FROM LeaveRequests
     WHERE employee_id = ?
       AND statusi = 'approved'
       AND YEAR(data_fillimit) = ?
     GROUP BY lloji`,
    [employeeId, targetYear]
  );

  return rows;
};

module.exports = {
  create,
  findAll,
  findById,
  findByEmployee,
  findPending,
  checkOverlap,
  setApprovalStatus,
  cancel,
  update,
  remove,
  getLeaveBalance,
};
