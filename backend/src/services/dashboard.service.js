/**
 * @file backend/src/services/dashboard.service.js
 * @description Dashboard aggregation service — headline counts, distributions, payroll totals, attendance trend, and recent activity feed
 * @author Dev A
 *
 * All functions are read-only aggregation queries against the live tables.
 * They intentionally bypass the per-entity model files because each shape
 * is bespoke to the dashboard widget that consumes it.
 */

const db = require('../config/db');

/** ENUM string for "active" employees in Employees.statusi. */
const STATUS_ACTIVE = 'active';

/** YYYY-MM-DD string for today (server-local). */
const todayIso = () => new Date().toISOString().slice(0, 10);

/**
 * Headline counts for the dashboard hero strip.
 *
 * @returns {Promise<{
 *   total_employees: number,
 *   active_employees: number,
 *   total_departments: number,
 *   pending_leave_requests: number,
 *   attendance_today: { present: number, absent: number, late: number, half_day: number, remote: number, total: number }
 * }>}
 */
const getTotalCounts = async () => {
  const today = todayIso();

  const [[empRow]] = await db.query(
    `SELECT
       COUNT(*) AS total,
       COALESCE(SUM(statusi = ?), 0) AS active
     FROM Employees`,
    [STATUS_ACTIVE]
  );

  const [[deptRow]] = await db.query(
    `SELECT COUNT(*) AS total FROM Departments`
  );

  const [[leaveRow]] = await db.query(
    `SELECT COUNT(*) AS total FROM LeaveRequests WHERE statusi = 'pending'`
  );

  const [attendanceRows] = await db.query(
    `SELECT statusi, COUNT(*) AS count
     FROM Attendances
     WHERE data = ?
     GROUP BY statusi`,
    [today]
  );

  const attendance = {
    present: 0,
    absent: 0,
    late: 0,
    half_day: 0,
    remote: 0,
    total: 0,
  };
  for (const r of attendanceRows) {
    const key = r.statusi === 'half-day' ? 'half_day' : r.statusi;
    if (key in attendance) attendance[key] = Number(r.count);
    attendance.total += Number(r.count);
  }

  return {
    total_employees: Number(empRow.total) || 0,
    active_employees: Number(empRow.active) || 0,
    total_departments: Number(deptRow.total) || 0,
    pending_leave_requests: Number(leaveRow.total) || 0,
    attendance_today: attendance,
  };
};

/**
 * Headcount per department, sorted by largest first.
 *
 * @returns {Promise<Array<{ department_id: number, emertimi: string, headcount: number }>>}
 */
const getEmployeesByDepartment = async () => {
  const [rows] = await db.query(
    `SELECT
       d.id AS department_id,
       d.emertimi,
       COUNT(e.id) AS headcount
     FROM Departments d
     LEFT JOIN Employees e
       ON e.department_id = d.id
       AND e.statusi = ?
     GROUP BY d.id, d.emertimi
     ORDER BY headcount DESC, d.emertimi ASC`,
    [STATUS_ACTIVE]
  );
  return rows.map((r) => ({
    department_id: r.department_id,
    emertimi: r.emertimi,
    headcount: Number(r.headcount) || 0,
  }));
};

/**
 * Monthly payroll totals (single period). Mirrors the Salary.calculatePayroll
 * shape so the dashboard widget and the salaries page stay in sync.
 *
 * @param {Object} [opts]
 * @param {number} [opts.muaji] - Defaults to current month
 * @param {number} [opts.viti]  - Defaults to current year
 * @returns {Promise<{
 *   muaji: number,
 *   viti: number,
 *   headcount: number,
 *   total_base: number,
 *   total_bonuses: number,
 *   total_deductions: number,
 *   total_net: number
 * }>}
 */
const getMonthlyPayroll = async ({ muaji, viti } = {}) => {
  const now = new Date();
  const month = muaji || now.getMonth() + 1;
  const year = viti || now.getFullYear();

  const [[row]] = await db.query(
    `SELECT
       COUNT(*) AS headcount,
       COALESCE(SUM(paga_baze), 0) AS total_base,
       COALESCE(SUM(bonuse),    0) AS total_bonuses,
       COALESCE(SUM(zbritje),   0) AS total_deductions,
       COALESCE(SUM(paga_neto), 0) AS total_net
     FROM Salaries
     WHERE muaji = ? AND viti = ?`,
    [month, year]
  );

  return {
    muaji: month,
    viti: year,
    headcount: Number(row.headcount) || 0,
    total_base: Number(row.total_base) || 0,
    total_bonuses: Number(row.total_bonuses) || 0,
    total_deductions: Number(row.total_deductions) || 0,
    total_net: Number(row.total_net) || 0,
  };
};

/**
 * Daily attendance counts for the trailing N days (default 14). One row per
 * day with absent/present/late/remote/half-day buckets — useful for stacked
 * bar charts.
 *
 * @param {Object} [opts]
 * @param {number} [opts.days=14] - Trailing window in days (1-90)
 * @returns {Promise<Array<{
 *   date: string,
 *   present: number,
 *   absent: number,
 *   late: number,
 *   half_day: number,
 *   remote: number,
 *   total: number
 * }>>}
 */
const getAttendanceTrend = async ({ days = 14 } = {}) => {
  const window = Math.min(Math.max(parseInt(days, 10) || 14, 1), 90);

  const [rows] = await db.query(
    `SELECT
       DATE_FORMAT(data, '%Y-%m-%d') AS date,
       statusi,
       COUNT(*) AS count
     FROM Attendances
     WHERE data >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
     GROUP BY data, statusi
     ORDER BY data ASC`,
    [window]
  );

  // Pivot rows -> one entry per date with status buckets.
  const byDate = new Map();
  for (const r of rows) {
    if (!byDate.has(r.date)) {
      byDate.set(r.date, {
        date: r.date,
        present: 0,
        absent: 0,
        late: 0,
        half_day: 0,
        remote: 0,
        total: 0,
      });
    }
    const bucket = byDate.get(r.date);
    const key = r.statusi === 'half-day' ? 'half_day' : r.statusi;
    if (key in bucket) bucket[key] = Number(r.count);
    bucket.total += Number(r.count);
  }

  return [...byDate.values()];
};

/**
 * Leave distribution by type for a given window. Defaults to the trailing
 * 90 days. Pending and approved are counted; cancelled/rejected are not.
 *
 * @param {Object} [opts]
 * @param {number} [opts.days=90]
 * @returns {Promise<Array<{ lloji: string, count: number, total_days: number }>>}
 */
const getLeaveDistribution = async ({ days = 90 } = {}) => {
  const window = Math.min(Math.max(parseInt(days, 10) || 90, 1), 365);

  const [rows] = await db.query(
    `SELECT
       lloji,
       COUNT(*) AS count,
       COALESCE(SUM(DATEDIFF(data_perfundimit, data_fillimit) + 1), 0) AS total_days
     FROM LeaveRequests
     WHERE statusi IN ('pending', 'approved')
       AND data_kerkeses >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
     GROUP BY lloji
     ORDER BY count DESC`,
    [window]
  );

  return rows.map((r) => ({
    lloji: r.lloji,
    count: Number(r.count) || 0,
    total_days: Number(r.total_days) || 0,
  }));
};

/**
 * Recent system activity from the audit log. Joins to Users so the
 * dashboard can show "Erik created Employee #42" without follow-up calls.
 *
 * @param {Object} [opts]
 * @param {number} [opts.limit=10]
 * @returns {Promise<Array<{
 *   id: number,
 *   action: string,
 *   entity: string,
 *   entity_id: number|null,
 *   user_id: number|null,
 *   user_name: string|null,
 *   created_at: string
 * }>>}
 */
const getRecentActivities = async ({ limit = 10 } = {}) => {
  const cap = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 50);

  const [rows] = await db.query(
    `SELECT
       al.id,
       al.action,
       al.entity,
       al.entity_id,
       al.user_id,
       CONCAT_WS(' ', u.first_name, u.last_name) AS user_name,
       al.created_at
     FROM AuditLogs al
     LEFT JOIN Users u ON al.user_id = u.id
     ORDER BY al.created_at DESC
     LIMIT ?`,
    [cap]
  );

  return rows.map((r) => ({
    id: r.id,
    action: r.action,
    entity: r.entity,
    entity_id: r.entity_id,
    user_id: r.user_id,
    user_name: r.user_name || null,
    created_at: r.created_at,
  }));
};

module.exports = {
  getTotalCounts,
  getEmployeesByDepartment,
  getMonthlyPayroll,
  getAttendanceTrend,
  getLeaveDistribution,
  getRecentActivities,
};
