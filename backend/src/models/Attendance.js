/**
 * @file backend/src/models/Attendance.js
 * @description Attendance model with CRUD, check-in/out, date-range queries, daily summary, and monthly reporting
 * @author Dev A
 */

const db = require('../config/db');
const { buildPaginationQuery } = require('../utils/helpers');

/** Whitelist of sortable columns to prevent SQL injection. */
const ALLOWED_SORT_COLUMNS = [
  'id',
  'data',
  'ora_hyrjes',
  'ora_daljes',
  'statusi',
  'created_at',
];

/** Valid attendance status values (must match the Attendances.statusi ENUM). */
const VALID_STATUSES = ['present', 'absent', 'late', 'half-day', 'remote'];

/**
 * Base SELECT / JOIN clause enriching an attendance row with employee,
 * user (for display name / email), department, and position info.
 */
const BASE_SELECT = `
  SELECT
    a.id,
    a.employee_id,
    a.data,
    a.ora_hyrjes,
    a.ora_daljes,
    a.statusi,
    a.shenimet,
    a.created_at,
    TIMESTAMPDIFF(
      MINUTE,
      CONCAT(a.data, ' ', a.ora_hyrjes),
      CONCAT(a.data, ' ', a.ora_daljes)
    ) / 60.0 AS hours_worked,
    e.numri_punonjesit,
    e.department_id,
    e.position_id,
    u.first_name,
    u.last_name,
    u.email,
    d.emertimi AS department_emertimi,
    p.emertimi AS position_emertimi
  FROM Attendances a
  LEFT JOIN Employees   e ON a.employee_id = e.id
  LEFT JOIN Users       u ON e.user_id = u.id
  LEFT JOIN Departments d ON e.department_id = d.id
  LEFT JOIN Positions   p ON e.position_id = p.id
`;

/**
 * Create a new attendance record. Date must be unique per employee
 * (enforced by the unique_attendance UNIQUE KEY).
 *
 * @param {Object} data
 * @param {number} data.employee_id
 * @param {string} data.data - Date YYYY-MM-DD
 * @param {string} [data.ora_hyrjes] - Check-in time HH:MM:SS
 * @param {string} [data.ora_daljes] - Check-out time HH:MM:SS
 * @param {string} [data.statusi='present']
 * @param {string} [data.shenimet] - Notes
 * @returns {Promise<number>} Inserted attendance ID
 */
const create = async (data) => {
  const [result] = await db.query(
    `INSERT INTO Attendances
       (employee_id, data, ora_hyrjes, ora_daljes, statusi, shenimet)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      data.employee_id,
      data.data,
      data.ora_hyrjes || null,
      data.ora_daljes || null,
      data.statusi || 'present',
      data.shenimet || null,
    ]
  );
  return result.insertId;
};

/**
 * List attendance rows with pagination, filters, and sort.
 *
 * @param {Object} [opts]
 * @param {number} [opts.page=1]
 * @param {number} [opts.limit=10]
 * @param {number} [opts.employee_id]
 * @param {number} [opts.department_id]
 * @param {string} [opts.statusi]
 * @param {string} [opts.from_date] - YYYY-MM-DD, inclusive lower bound
 * @param {string} [opts.to_date] - YYYY-MM-DD, inclusive upper bound
 * @param {string} [opts.sortBy='data']
 * @param {string} [opts.sortOrder='DESC']
 * @returns {Promise<{ data: Object[], pagination: Object }>}
 */
const findAll = async ({
  page = 1,
  limit = 10,
  employee_id,
  department_id,
  statusi,
  from_date,
  to_date,
  sortBy = 'data',
  sortOrder = 'DESC',
} = {}) => {
  const conditions = [];
  const params = [];

  if (employee_id) {
    conditions.push('a.employee_id = ?');
    params.push(employee_id);
  }
  if (department_id) {
    conditions.push('e.department_id = ?');
    params.push(department_id);
  }
  if (statusi) {
    conditions.push('a.statusi = ?');
    params.push(statusi);
  }
  if (from_date) {
    conditions.push('a.data >= ?');
    params.push(from_date);
  }
  if (to_date) {
    conditions.push('a.data <= ?');
    params.push(to_date);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const [countRows] = await db.query(
    `SELECT COUNT(*) AS total
     FROM Attendances a
     LEFT JOIN Employees e ON a.employee_id = e.id
     ${where}`,
    params
  );
  const total = countRows[0].total;

  const { limit: perPage, offset, pagination } = buildPaginationQuery({ page, limit, total });

  const safeSortBy = ALLOWED_SORT_COLUMNS.includes(sortBy) ? sortBy : 'data';
  const safeSortOrder = String(sortOrder).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

  const [rows] = await db.query(
    `${BASE_SELECT}
     ${where}
     ORDER BY a.${safeSortBy} ${safeSortOrder}
     LIMIT ? OFFSET ?`,
    [...params, perPage, offset]
  );

  return { data: rows, pagination };
};

/**
 * Find a single attendance row by ID with full related info.
 *
 * @param {number} id
 * @returns {Promise<Object|null>}
 */
const findById = async (id) => {
  const [rows] = await db.query(
    `${BASE_SELECT}
     WHERE a.id = ?`,
    [id]
  );
  return rows[0] || null;
};

/**
 * Find the attendance row for a specific employee on a specific date
 * (useful for duplicate detection and check-in/out flows).
 *
 * @param {number} employeeId
 * @param {string} date - YYYY-MM-DD
 * @returns {Promise<Object|null>}
 */
const findByEmployeeAndDate = async (employeeId, date) => {
  const [rows] = await db.query(
    `${BASE_SELECT}
     WHERE a.employee_id = ? AND a.data = ?`,
    [employeeId, date]
  );
  return rows[0] || null;
};

/**
 * Get all attendance rows for a given employee within a date range.
 *
 * @param {number} employeeId
 * @param {Object} [opts]
 * @param {string} [opts.from_date] - YYYY-MM-DD
 * @param {string} [opts.to_date] - YYYY-MM-DD
 * @returns {Promise<Object[]>}
 */
const findByEmployee = async (employeeId, { from_date, to_date } = {}) => {
  const conditions = ['a.employee_id = ?'];
  const params = [employeeId];

  if (from_date) {
    conditions.push('a.data >= ?');
    params.push(from_date);
  }
  if (to_date) {
    conditions.push('a.data <= ?');
    params.push(to_date);
  }

  const [rows] = await db.query(
    `${BASE_SELECT}
     WHERE ${conditions.join(' AND ')}
     ORDER BY a.data DESC`,
    params
  );
  return rows;
};

/**
 * Check-in an employee: creates a row for today if none exists, otherwise
 * updates the existing row's ora_hyrjes if still empty. Returns the affected
 * row's ID.
 *
 * @param {number} employeeId
 * @param {Object} [opts]
 * @param {string} [opts.date] - Defaults to today (YYYY-MM-DD)
 * @param {string} [opts.time] - Defaults to current time (HH:MM:SS)
 * @param {string} [opts.statusi='present']
 * @returns {Promise<{ id: number, created: boolean }>}
 */
const checkIn = async (
  employeeId,
  { date, time, statusi = 'present' } = {}
) => {
  const today = date || new Date().toISOString().slice(0, 10);
  const now = time || new Date().toTimeString().slice(0, 8);

  const existing = await findByEmployeeAndDate(employeeId, today);
  if (existing) {
    if (existing.ora_hyrjes) {
      // Already checked in — do not overwrite silently.
      return { id: existing.id, created: false, alreadyCheckedIn: true };
    }
    await db.query(
      `UPDATE Attendances SET ora_hyrjes = ?, statusi = ? WHERE id = ?`,
      [now, statusi, existing.id]
    );
    return { id: existing.id, created: false };
  }

  const id = await create({
    employee_id: employeeId,
    data: today,
    ora_hyrjes: now,
    statusi,
  });
  return { id, created: true };
};

/**
 * Check-out an employee: updates ora_daljes for today's row. Returns null if
 * there is no check-in row yet (caller should handle by throwing a 409).
 *
 * @param {number} employeeId
 * @param {Object} [opts]
 * @param {string} [opts.date] - Defaults to today
 * @param {string} [opts.time] - Defaults to current time
 * @returns {Promise<{ id: number } | null>}
 */
const checkOut = async (employeeId, { date, time } = {}) => {
  const today = date || new Date().toISOString().slice(0, 10);
  const now = time || new Date().toTimeString().slice(0, 8);

  const existing = await findByEmployeeAndDate(employeeId, today);
  if (!existing) return null;

  await db.query(
    `UPDATE Attendances SET ora_daljes = ? WHERE id = ?`,
    [now, existing.id]
  );
  return { id: existing.id };
};

/**
 * Generic update for an attendance row.
 *
 * @param {number} id
 * @param {Object} data - Any of: data, ora_hyrjes, ora_daljes, statusi, shenimet
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
    `UPDATE Attendances SET ${fields.join(', ')} WHERE id = ?`,
    values
  );
  return result.affectedRows > 0;
};

/**
 * Hard-delete an attendance row.
 *
 * @param {number} id
 * @returns {Promise<boolean>}
 */
const remove = async (id) => {
  const [result] = await db.query('DELETE FROM Attendances WHERE id = ?', [id]);
  return result.affectedRows > 0;
};

/**
 * Aggregate attendance counts by status for a given date (company-wide,
 * or optionally scoped to a department).
 *
 * @param {string} date - YYYY-MM-DD
 * @param {Object} [opts]
 * @param {number} [opts.department_id]
 * @returns {Promise<Object[]>} [{ statusi, count }]
 */
const getDailySummary = async (date, { department_id } = {}) => {
  const conditions = ['a.data = ?'];
  const params = [date];

  if (department_id) {
    conditions.push('e.department_id = ?');
    params.push(department_id);
  }

  const [rows] = await db.query(
    `SELECT a.statusi, COUNT(*) AS count
     FROM Attendances a
     LEFT JOIN Employees e ON a.employee_id = e.id
     WHERE ${conditions.join(' AND ')}
     GROUP BY a.statusi
     ORDER BY a.statusi`,
    params
  );
  return rows;
};

/**
 * Build a per-employee monthly report: total days present / absent / late /
 * remote, plus total hours worked, for a given month.
 *
 * @param {Object} opts
 * @param {number} opts.year - 4-digit year
 * @param {number} opts.month - 1-12
 * @param {number} [opts.department_id] - Optional department scope
 * @param {number} [opts.employee_id] - Optional single-employee scope
 * @returns {Promise<Object[]>}
 */
const getMonthlyReport = async ({ year, month, department_id, employee_id }) => {
  const conditions = ['YEAR(a.data) = ?', 'MONTH(a.data) = ?'];
  const params = [year, month];

  if (department_id) {
    conditions.push('e.department_id = ?');
    params.push(department_id);
  }
  if (employee_id) {
    conditions.push('a.employee_id = ?');
    params.push(employee_id);
  }

  const [rows] = await db.query(
    `SELECT
       a.employee_id,
       e.numri_punonjesit,
       u.first_name,
       u.last_name,
       d.emertimi AS department_emertimi,
       COUNT(*) AS total_days,
       SUM(CASE WHEN a.statusi = 'present'  THEN 1 ELSE 0 END) AS days_present,
       SUM(CASE WHEN a.statusi = 'absent'   THEN 1 ELSE 0 END) AS days_absent,
       SUM(CASE WHEN a.statusi = 'late'     THEN 1 ELSE 0 END) AS days_late,
       SUM(CASE WHEN a.statusi = 'half-day' THEN 1 ELSE 0 END) AS days_half,
       SUM(CASE WHEN a.statusi = 'remote'   THEN 1 ELSE 0 END) AS days_remote,
       COALESCE(SUM(
         TIMESTAMPDIFF(
           MINUTE,
           CONCAT(a.data, ' ', a.ora_hyrjes),
           CONCAT(a.data, ' ', a.ora_daljes)
         ) / 60.0
       ), 0) AS total_hours
     FROM Attendances a
     LEFT JOIN Employees   e ON a.employee_id = e.id
     LEFT JOIN Users       u ON e.user_id = u.id
     LEFT JOIN Departments d ON e.department_id = d.id
     WHERE ${conditions.join(' AND ')}
     GROUP BY a.employee_id, e.numri_punonjesit, u.first_name, u.last_name, d.emertimi
     ORDER BY u.last_name, u.first_name`,
    params
  );
  return rows;
};

module.exports = {
  create,
  findAll,
  findById,
  findByEmployeeAndDate,
  findByEmployee,
  checkIn,
  checkOut,
  update,
  remove,
  getDailySummary,
  getMonthlyReport,
  VALID_STATUSES,
};
