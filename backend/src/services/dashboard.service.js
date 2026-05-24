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
       al.entity_type AS entity,
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

/* ──────────────────────────────────────────────────────────────────── */
/* Advanced widgets (commit 218)                                         */
/* ──────────────────────────────────────────────────────────────────── */

/**
 * Salary trend over the trailing N months. Used by the DashboardPage's
 * line chart so HR can see whether monthly payroll is creeping up.
 *
 * Builds the requested window of (year, month) pairs in JavaScript and
 * fans out one query per pair so we don't accumulate a giant GROUP BY
 * on the Salaries table — the chart only needs at most ~12 buckets, so
 * the round-trip cost is negligible.
 *
 * @param {Object} [opts]
 * @param {number} [opts.months=6] - Window length, 1..24
 * @returns {Promise<Array<{
 *   muaji: number,
 *   viti: number,
 *   label: string,           // e.g. "2026-05"
 *   headcount: number,
 *   total_base: number,
 *   total_bonuses: number,
 *   total_deductions: number,
 *   total_net: number,
 * }>>}
 */
const getSalaryTrend = async ({ months = 6 } = {}) => {
  const cap = Math.min(Math.max(parseInt(months, 10) || 6, 1), 24);

  const now = new Date();
  const buckets = [];
  for (let i = cap - 1; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    buckets.push({
      muaji: d.getMonth() + 1,
      viti: d.getFullYear(),
    });
  }

  const results = await Promise.all(
    buckets.map(async ({ muaji, viti }) => {
      const [[row]] = await db.query(
        `SELECT
           COUNT(*) AS headcount,
           COALESCE(SUM(paga_baze), 0) AS total_base,
           COALESCE(SUM(bonuse),    0) AS total_bonuses,
           COALESCE(SUM(zbritje),   0) AS total_deductions,
           COALESCE(SUM(paga_neto), 0) AS total_net
         FROM Salaries
         WHERE muaji = ? AND viti = ?`,
        [muaji, viti]
      );
      return {
        muaji,
        viti,
        label: `${viti}-${String(muaji).padStart(2, '0')}`,
        headcount: Number(row.headcount) || 0,
        total_base: Number(row.total_base) || 0,
        total_bonuses: Number(row.total_bonuses) || 0,
        total_deductions: Number(row.total_deductions) || 0,
        total_net: Number(row.total_net) || 0,
      };
    })
  );

  return results;
};

/**
 * Company-wide leave balance summary for the current year. Aggregates
 * approved leave days by type so the dashboard can render a bar chart
 * showing "annual" / "sick" / "personal" etc. totals across the org.
 *
 * Note: Returns totals per leave type — NOT per-employee balances. The
 * per-employee balance lives in `leaveRequest.controller.composeLeaveBalance`.
 *
 * @param {Object} [opts]
 * @param {number} [opts.year] - Defaults to current calendar year
 * @returns {Promise<{
 *   year: number,
 *   total_employees: number,
 *   by_type: Array<{
 *     lloji: string,
 *     approved_count: number,
 *     pending_count: number,
 *     total_days: number,
 *     avg_days_per_request: number,
 *   }>
 * }>}
 */
const getLeaveBalanceOverview = async ({ year } = {}) => {
  const targetYear = year || new Date().getFullYear();

  const [[empRow]] = await db.query(
    `SELECT COUNT(*) AS total FROM Employees WHERE statusi = ?`,
    [STATUS_ACTIVE]
  );

  const [rows] = await db.query(
    `SELECT
       lloji,
       SUM(CASE WHEN statusi = 'approved' THEN 1 ELSE 0 END) AS approved_count,
       SUM(CASE WHEN statusi = 'pending'  THEN 1 ELSE 0 END) AS pending_count,
       COALESCE(SUM(
         CASE WHEN statusi = 'approved'
              THEN DATEDIFF(data_perfundimit, data_fillimit) + 1
              ELSE 0 END
       ), 0) AS total_days
     FROM LeaveRequests
     WHERE YEAR(data_fillimit) = ?
     GROUP BY lloji
     ORDER BY total_days DESC`,
    [targetYear]
  );

  return {
    year: targetYear,
    total_employees: Number(empRow?.total) || 0,
    by_type: rows.map((r) => {
      const approved = Number(r.approved_count) || 0;
      const days = Number(r.total_days) || 0;
      return {
        lloji: r.lloji,
        approved_count: approved,
        pending_count: Number(r.pending_count) || 0,
        total_days: days,
        avg_days_per_request: approved > 0 ? +(days / approved).toFixed(1) : 0,
      };
    }),
  };
};

/**
 * Training completion rate — overall + per training. Powers the
 * dashboard's donut chart.
 *
 *   completion_rate = completed / (enrolled + completed + dropped + no-show)
 *
 * Trainings with zero participants are excluded from the per-training
 * breakdown but counted toward the trainings-total.
 *
 * @param {Object} [opts]
 * @param {number} [opts.limit=10] - Max per-training rows to return
 * @returns {Promise<{
 *   trainings_total: number,
 *   overall: {
 *     enrolled: number,
 *     completed: number,
 *     dropped: number,
 *     no_show: number,
 *     completion_rate: number,  // 0..100
 *   },
 *   per_training: Array<{
 *     training_id: number,
 *     titulli: string,
 *     statusi: string,
 *     enrolled: number,
 *     completed: number,
 *     dropped: number,
 *     no_show: number,
 *     completion_rate: number,
 *   }>
 * }>}
 */
const getTrainingCompletionRate = async ({ limit = 10 } = {}) => {
  const cap = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 50);

  const [[totalsRow]] = await db.query(
    `SELECT
       SUM(CASE WHEN statusi = 'enrolled'  THEN 1 ELSE 0 END) AS enrolled,
       SUM(CASE WHEN statusi = 'completed' THEN 1 ELSE 0 END) AS completed,
       SUM(CASE WHEN statusi = 'dropped'   THEN 1 ELSE 0 END) AS dropped,
       SUM(CASE WHEN statusi = 'no-show'   THEN 1 ELSE 0 END) AS no_show
     FROM TrainingParticipants`
  );

  const [[countRow]] = await db.query(
    `SELECT COUNT(*) AS total FROM Trainings`
  );

  const enrolled = Number(totalsRow?.enrolled) || 0;
  const completed = Number(totalsRow?.completed) || 0;
  const dropped = Number(totalsRow?.dropped) || 0;
  const noShow = Number(totalsRow?.no_show) || 0;
  const overallDenom = enrolled + completed + dropped + noShow;

  const [perTraining] = await db.query(
    `SELECT
       t.id AS training_id,
       t.titulli,
       t.statusi,
       SUM(CASE WHEN tp.statusi = 'enrolled'  THEN 1 ELSE 0 END) AS enrolled,
       SUM(CASE WHEN tp.statusi = 'completed' THEN 1 ELSE 0 END) AS completed,
       SUM(CASE WHEN tp.statusi = 'dropped'   THEN 1 ELSE 0 END) AS dropped,
       SUM(CASE WHEN tp.statusi = 'no-show'   THEN 1 ELSE 0 END) AS no_show
     FROM Trainings t
     LEFT JOIN TrainingParticipants tp ON tp.training_id = t.id
     GROUP BY t.id, t.titulli, t.statusi
     HAVING (enrolled + completed + dropped + no_show) > 0
     ORDER BY t.data_fillimit DESC
     LIMIT ?`,
    [cap]
  );

  return {
    trainings_total: Number(countRow?.total) || 0,
    overall: {
      enrolled,
      completed,
      dropped,
      no_show: noShow,
      completion_rate:
        overallDenom > 0 ? +((completed / overallDenom) * 100).toFixed(1) : 0,
    },
    per_training: perTraining.map((r) => {
      const e = Number(r.enrolled) || 0;
      const c = Number(r.completed) || 0;
      const d = Number(r.dropped) || 0;
      const n = Number(r.no_show) || 0;
      const denom = e + c + d + n;
      return {
        training_id: r.training_id,
        titulli: r.titulli,
        statusi: r.statusi,
        enrolled: e,
        completed: c,
        dropped: d,
        no_show: n,
        completion_rate: denom > 0 ? +((c / denom) * 100).toFixed(1) : 0,
      };
    }),
  };
};

/**
 * Average performance review rating per department. Powers the
 * department-comparison bar chart. Filters by review-date window
 * (default trailing 365 days) so old reviews don't drown out recent ones.
 *
 * @param {Object} [opts]
 * @param {number} [opts.days=365]
 * @returns {Promise<Array<{
 *   department_id: number,
 *   emertimi: string,
 *   review_count: number,
 *   average: number,         // 0..5
 *   employees_reviewed: number,
 * }>>}
 */
const getPerformanceAverageByDepartment = async ({ days = 365 } = {}) => {
  const window = Math.min(Math.max(parseInt(days, 10) || 365, 1), 365 * 5);

  const [rows] = await db.query(
    `SELECT
       d.id   AS department_id,
       d.emertimi,
       COUNT(pr.id) AS review_count,
       COALESCE(AVG(pr.nota), 0) AS average,
       COUNT(DISTINCT pr.employee_id) AS employees_reviewed
     FROM Departments d
     LEFT JOIN Employees e        ON e.department_id = d.id
     LEFT JOIN PerformanceReviews pr
            ON pr.employee_id = e.id
           AND pr.nota IS NOT NULL
           AND pr.data_vleresimit >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
     GROUP BY d.id, d.emertimi
     ORDER BY average DESC, d.emertimi ASC`,
    [window]
  );

  return rows.map((r) => ({
    department_id: r.department_id,
    emertimi: r.emertimi,
    review_count: Number(r.review_count) || 0,
    average: +Number(r.average || 0).toFixed(2),
    employees_reviewed: Number(r.employees_reviewed) || 0,
  }));
};

module.exports = {
  getTotalCounts,
  getEmployeesByDepartment,
  getMonthlyPayroll,
  getAttendanceTrend,
  getLeaveDistribution,
  getRecentActivities,
  // Advanced widgets
  getSalaryTrend,
  getLeaveBalanceOverview,
  getTrainingCompletionRate,
  getPerformanceAverageByDepartment,
};
