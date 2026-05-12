/**
 * @file backend/src/controllers/attendance.controller.js
 * @description Attendance controller with manual CRUD, self-service check-in/out, department view, and monthly reports
 * @author Dev A
 */

const Attendance = require('../models/Attendance');
const Employee = require('../models/Employee');
const db = require('../config/db');
const { AppError } = require('../middleware/errorHandler');

/** Roles permitted to view/manage any employee's attendance. */
const PRIVILEGED_ROLES = ['Admin', 'HR Manager'];

/**
 * Resolve the employee record for the authenticated user.
 * Throws 404 if the user has no linked employee row.
 */
const getRequestingEmployee = async (userId) => {
  const employee = await Employee.findByUserId(userId);
  if (!employee) {
    throw new AppError('No employee record linked to this user account', 404);
  }
  return employee;
};

/** Simple ISO date check (YYYY-MM-DD). */
const isValidDate = (s) => {
  if (!s || typeof s !== 'string') return false;
  const d = new Date(s);
  return !Number.isNaN(d.getTime());
};

/**
 * GET /api/attendances
 * List attendance rows with filters (HR / Admin / Manager view).
 */
const getAll = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 10,
      employee_id,
      department_id,
      statusi,
      from_date,
      to_date,
      sortBy = 'data',
      sortOrder = 'DESC',
    } = req.query;

    const result = await Attendance.findAll({
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      employee_id: employee_id ? parseInt(employee_id, 10) : undefined,
      department_id: department_id ? parseInt(department_id, 10) : undefined,
      statusi,
      from_date,
      to_date,
      sortBy,
      sortOrder,
    });

    res.json({
      success: true,
      data: result.data,
      pagination: result.pagination,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/attendances/:id
 * Get a single attendance row.
 */
const getById = async (req, res, next) => {
  try {
    const row = await Attendance.findById(req.params.id);
    if (!row) {
      throw new AppError('Attendance record not found', 404);
    }

    res.json({
      success: true,
      data: { attendance: row },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/attendances/me
 * Authenticated user's own attendance history (optionally date-ranged).
 */
const getMyAttendance = async (req, res, next) => {
  try {
    const employee = await getRequestingEmployee(req.user.id);
    const { from_date, to_date } = req.query;

    const rows = await Attendance.findByEmployee(employee.id, {
      from_date,
      to_date,
    });

    res.json({
      success: true,
      data: { employee_id: employee.id, attendance: rows },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/attendances/department/:departmentId
 * All attendance rows for employees in a department on a given date
 * (or date range). Managers / HR / Admin only.
 */
const getDepartmentAttendance = async (req, res, next) => {
  try {
    const departmentId = parseInt(req.params.departmentId, 10);
    if (!departmentId) {
      throw new AppError('Invalid department ID', 400);
    }

    const {
      page = 1,
      limit = 50,
      from_date,
      to_date,
      statusi,
    } = req.query;

    const result = await Attendance.findAll({
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      department_id: departmentId,
      from_date,
      to_date,
      statusi,
    });

    // Daily summary for the most recent date we can infer from the filter range.
    const summaryDate = to_date || from_date || new Date().toISOString().slice(0, 10);
    const summary = await Attendance.getDailySummary(summaryDate, {
      department_id: departmentId,
    });

    res.json({
      success: true,
      data: result.data,
      pagination: result.pagination,
      summary: { date: summaryDate, by_status: summary },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/attendances/report/monthly
 * Per-employee monthly breakdown for a given year/month (+ optional dept/emp).
 */
const getMonthlyReport = async (req, res, next) => {
  try {
    const year = parseInt(req.query.year, 10);
    const month = parseInt(req.query.month, 10);

    if (!year || !month || month < 1 || month > 12) {
      throw new AppError(
        'Valid year and month (1-12) query parameters are required',
        400
      );
    }

    const departmentId = req.query.department_id
      ? parseInt(req.query.department_id, 10)
      : undefined;
    const employeeId = req.query.employee_id
      ? parseInt(req.query.employee_id, 10)
      : undefined;

    const report = await Attendance.getMonthlyReport({
      year,
      month,
      department_id: departmentId,
      employee_id: employeeId,
    });

    res.json({
      success: true,
      data: { year, month, report },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/attendances
 * Manually create an attendance row (HR / Admin).
 */
const create = async (req, res, next) => {
  try {
    const { employee_id, data, ora_hyrjes, ora_daljes, statusi, shenimet } = req.body;

    if (!employee_id || !data) {
      throw new AppError('employee_id and data are required', 400);
    }
    if (!isValidDate(data)) {
      throw new AppError('data must be a valid YYYY-MM-DD date', 400);
    }
    if (statusi && !Attendance.VALID_STATUSES.includes(statusi)) {
      throw new AppError(
        `Invalid statusi. Must be one of: ${Attendance.VALID_STATUSES.join(', ')}`,
        400
      );
    }

    const exists = await Employee.findById(employee_id);
    if (!exists) {
      throw new AppError('Specified employee does not exist', 404);
    }

    const duplicate = await Attendance.findByEmployeeAndDate(employee_id, data);
    if (duplicate) {
      throw new AppError(
        `An attendance record already exists for employee #${employee_id} on ${data}`,
        409
      );
    }

    const id = await Attendance.create({
      employee_id,
      data,
      ora_hyrjes,
      ora_daljes,
      statusi,
      shenimet,
    });
    const attendance = await Attendance.findById(id);

    res.status(201).json({
      success: true,
      message: 'Attendance recorded successfully',
      data: { attendance },
    });
  } catch (err) {
    // Map MySQL duplicate-key (unique_attendance) into a friendly 409.
    if (err.code === 'ER_DUP_ENTRY') {
      return next(new AppError('Attendance for this employee on this date already exists', 409));
    }
    next(err);
  }
};

/**
 * POST /api/attendances/check-in
 * Self-service check-in for the authenticated employee (uses server time).
 */
const checkIn = async (req, res, next) => {
  try {
    const employee = await getRequestingEmployee(req.user.id);
    const result = await Attendance.checkIn(employee.id);

    if (result.alreadyCheckedIn) {
      throw new AppError('You have already checked in today', 409);
    }

    const attendance = await Attendance.findById(result.id);

    res.status(result.created ? 201 : 200).json({
      success: true,
      message: 'Checked in successfully',
      data: { attendance },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/attendances/check-out
 * Self-service check-out for the authenticated employee (uses server time).
 */
const checkOut = async (req, res, next) => {
  try {
    const employee = await getRequestingEmployee(req.user.id);
    const result = await Attendance.checkOut(employee.id);

    if (!result) {
      throw new AppError(
        'No check-in record for today — please check in first',
        409
      );
    }

    const attendance = await Attendance.findById(result.id);

    res.json({
      success: true,
      message: 'Checked out successfully',
      data: { attendance },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/attendances/:id
 * Update an attendance row (HR / Admin).
 */
const update = async (req, res, next) => {
  try {
    const { id } = req.params;
    const existing = await Attendance.findById(id);
    if (!existing) {
      throw new AppError('Attendance record not found', 404);
    }

    res.locals.auditOldValues = { ...existing };

    const { data, ora_hyrjes, ora_daljes, statusi, shenimet } = req.body;
    const updates = {};

    if (data !== undefined) {
      if (!isValidDate(data)) {
        throw new AppError('data must be a valid YYYY-MM-DD date', 400);
      }
      updates.data = data;
    }
    if (ora_hyrjes !== undefined) updates.ora_hyrjes = ora_hyrjes;
    if (ora_daljes !== undefined) updates.ora_daljes = ora_daljes;
    if (statusi !== undefined) {
      if (!Attendance.VALID_STATUSES.includes(statusi)) {
        throw new AppError(
          `Invalid statusi. Must be one of: ${Attendance.VALID_STATUSES.join(', ')}`,
          400
        );
      }
      updates.statusi = statusi;
    }
    if (shenimet !== undefined) updates.shenimet = shenimet;

    if (Object.keys(updates).length === 0) {
      throw new AppError('No fields to update', 400);
    }

    await Attendance.update(id, updates);
    const attendance = await Attendance.findById(id);

    res.json({
      success: true,
      message: 'Attendance updated successfully',
      data: { attendance },
    });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return next(new AppError('Attendance for this employee on this date already exists', 409));
    }
    next(err);
  }
};

/**
 * DELETE /api/attendances/:id
 * Hard-delete an attendance row (Admin / HR).
 */
const remove = async (req, res, next) => {
  try {
    const { id } = req.params;
    const existing = await Attendance.findById(id);
    if (!existing) {
      throw new AppError('Attendance record not found', 404);
    }

    res.locals.auditOldValues = { ...existing };
    await Attendance.remove(id);

    res.json({
      success: true,
      message: 'Attendance record deleted successfully',
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/attendances/report/department
 *
 * Department-level attendance report aggregated over a date range. For
 * each department, returns total counts per status, attendance rate
 * (present + remote as % of total entries), and average hours worked
 * per day-row.
 *
 * Either default response (JSON) or CSV (via `?format=csv`) so HR can
 * pull a spreadsheet for monthly reviews. The CSV path sets
 * `Content-Disposition: attachment` so the browser downloads it.
 *
 * @query {string} from_date - Required. YYYY-MM-DD inclusive lower bound
 * @query {string} to_date   - Required. YYYY-MM-DD inclusive upper bound
 * @query {number} [department_id] - Scope to a single department
 * @query {string} [format='json'] - 'json' or 'csv'
 */
const getDepartmentAttendanceReport = async (req, res, next) => {
  try {
    const { from_date, to_date, department_id, format = 'json' } = req.query;

    if (!from_date || !to_date) {
      throw new AppError(
        'from_date and to_date query params are required',
        400
      );
    }
    if (!isValidDate(from_date) || !isValidDate(to_date)) {
      throw new AppError(
        'from_date and to_date must be valid YYYY-MM-DD dates',
        400
      );
    }
    if (from_date > to_date) {
      throw new AppError('from_date must be on or before to_date', 400);
    }
    if (format !== 'json' && format !== 'csv') {
      throw new AppError("format must be 'json' or 'csv'", 400);
    }

    const params = [from_date, to_date];
    const deptFilter = department_id
      ? 'AND e.department_id = ?'
      : '';
    if (department_id) params.push(parseInt(department_id, 10));

    /**
     * Per-department aggregate: counts per status + total entries +
     * average hours worked across the period.
     *
     * `hours_worked` mirrors the formula used in the Attendance model's
     * BASE_SELECT: TIMESTAMPDIFF(MINUTE, in, out) / 60. We compute it
     * inline because the column is a derived expression, not stored.
     */
    const [rows] = await db.query(
      `SELECT
         d.id   AS department_id,
         d.emertimi,
         COUNT(a.id) AS total_entries,
         SUM(CASE WHEN a.statusi = 'present'   THEN 1 ELSE 0 END) AS present,
         SUM(CASE WHEN a.statusi = 'absent'    THEN 1 ELSE 0 END) AS absent,
         SUM(CASE WHEN a.statusi = 'late'      THEN 1 ELSE 0 END) AS late_count,
         SUM(CASE WHEN a.statusi = 'half-day'  THEN 1 ELSE 0 END) AS half_day,
         SUM(CASE WHEN a.statusi = 'remote'    THEN 1 ELSE 0 END) AS remote,
         COUNT(DISTINCT a.employee_id) AS employees_with_records,
         COALESCE(AVG(
           CASE
             WHEN a.ora_hyrjes IS NOT NULL AND a.ora_daljes IS NOT NULL
             THEN TIMESTAMPDIFF(
                    MINUTE,
                    CONCAT(a.data, ' ', a.ora_hyrjes),
                    CONCAT(a.data, ' ', a.ora_daljes)
                  ) / 60.0
             ELSE NULL
           END
         ), 0) AS avg_hours_worked
       FROM Departments d
       LEFT JOIN Employees e ON e.department_id = d.id
       LEFT JOIN Attendances a
              ON a.employee_id = e.id
             AND a.data BETWEEN ? AND ?
       WHERE 1=1 ${deptFilter}
       GROUP BY d.id, d.emertimi
       ORDER BY d.emertimi ASC`,
      params
    );

    // Decorate each row with derived metrics.
    const report = rows.map((r) => {
      const total = Number(r.total_entries) || 0;
      const present = Number(r.present) || 0;
      const remote = Number(r.remote) || 0;
      const lateC = Number(r.late_count) || 0;
      const absent = Number(r.absent) || 0;
      const halfDay = Number(r.half_day) || 0;

      // "Showed up" = present + remote (working from somewhere). Late
      // and half-day are partial attendance; counted toward the rate at
      // 0.5 weight so a half day registers as half a successful day.
      const weightedAttendance = present + remote + (lateC + halfDay) * 0.5;
      const attendance_rate =
        total > 0 ? +((weightedAttendance / total) * 100).toFixed(1) : 0;

      return {
        department_id: r.department_id,
        emertimi: r.emertimi,
        total_entries: total,
        present,
        absent,
        late: lateC,
        half_day: halfDay,
        remote,
        employees_with_records: Number(r.employees_with_records) || 0,
        avg_hours_worked: +Number(r.avg_hours_worked || 0).toFixed(2),
        attendance_rate,
      };
    });

    if (format === 'csv') {
      // Build a tidy CSV. Quote department names defensively in case of
      // commas. Everything else is numeric / safe.
      const header = [
        'Department',
        'Total entries',
        'Present',
        'Absent',
        'Late',
        'Half day',
        'Remote',
        'Employees with records',
        'Avg hours worked',
        'Attendance rate (%)',
      ];

      const rowsCsv = report.map((r) => [
        `"${(r.emertimi || '').replace(/"/g, '""')}"`,
        r.total_entries,
        r.present,
        r.absent,
        r.late,
        r.half_day,
        r.remote,
        r.employees_with_records,
        r.avg_hours_worked,
        r.attendance_rate,
      ]);

      const csv = [header, ...rowsCsv]
        .map((cols) => cols.join(','))
        .join('\n');

      const stamp = `${from_date}_to_${to_date}`;
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="attendance_report_${stamp}.csv"`
      );
      return res.send(csv);
    }

    res.json({
      success: true,
      data: {
        from_date,
        to_date,
        department_id: department_id ? parseInt(department_id, 10) : null,
        departments: report,
      },
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getAll,
  getById,
  getMyAttendance,
  getDepartmentAttendance,
  getMonthlyReport,
  getDepartmentAttendanceReport,
  create,
  checkIn,
  checkOut,
  update,
  remove,
  PRIVILEGED_ROLES,
};
