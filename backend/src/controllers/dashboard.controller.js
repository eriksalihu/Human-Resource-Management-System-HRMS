/**
 * @file backend/src/controllers/dashboard.controller.js
 * @description Dashboard controller — overview headlines, chart-ready datasets, and recent activity feed
 * @author Dev A
 */

const dashboardService = require('../services/dashboard.service');
const { AppError } = require('../middleware/errorHandler');

/** Roles that may see the full payroll/leave breakdowns. */
const PRIVILEGED_ROLES = ['Admin', 'HR Manager'];

/** Convenience: does the caller have any privileged role? */
const isPrivileged = (req) =>
  (req.user?.roles || []).some((r) => PRIVILEGED_ROLES.includes(r));

/**
 * GET /api/dashboard/overview
 *
 * Headline counts for the dashboard hero strip plus today's attendance
 * snapshot. Privileged callers (Admin / HR Manager) also get the current
 * month's payroll totals — non-privileged callers do not, since payroll is
 * sensitive.
 */
const getOverview = async (req, res, next) => {
  try {
    const counts = await dashboardService.getTotalCounts();

    let payroll = null;
    if (isPrivileged(req)) {
      payroll = await dashboardService.getMonthlyPayroll();
    }

    res.json({
      success: true,
      data: {
        counts,
        payroll,
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/dashboard/charts
 *
 * Returns every chart-friendly dataset the dashboard needs in a single
 * round-trip. Accepted query params:
 *   - trend_days   (default 14, max 90)
 *   - leave_days   (default 90, max 365)
 */
const getCharts = async (req, res, next) => {
  try {
    const trendDays = req.query.trend_days
      ? parseInt(req.query.trend_days, 10)
      : 14;
    const leaveDays = req.query.leave_days
      ? parseInt(req.query.leave_days, 10)
      : 90;

    if (Number.isNaN(trendDays) || trendDays < 1 || trendDays > 90) {
      throw new AppError('trend_days must be an integer between 1 and 90', 400);
    }
    if (Number.isNaN(leaveDays) || leaveDays < 1 || leaveDays > 365) {
      throw new AppError(
        'leave_days must be an integer between 1 and 365',
        400
      );
    }

    const [byDepartment, attendanceTrend, leaveDistribution] =
      await Promise.all([
        dashboardService.getEmployeesByDepartment(),
        dashboardService.getAttendanceTrend({ days: trendDays }),
        dashboardService.getLeaveDistribution({ days: leaveDays }),
      ]);

    res.json({
      success: true,
      data: {
        employees_by_department: byDepartment,
        attendance_trend: {
          window_days: trendDays,
          series: attendanceTrend,
        },
        leave_distribution: {
          window_days: leaveDays,
          series: leaveDistribution,
        },
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/dashboard/recent-activities?limit=10
 *
 * Audit-log feed for the dashboard's "Recent activity" widget. Cap of 50
 * is enforced inside the service to keep payloads small.
 */
const getRecentActivities = async (req, res, next) => {
  try {
    const rawLimit = parseInt(req.query.limit, 10);
    const limit = Number.isFinite(rawLimit) ? rawLimit : 10;

    const activities = await dashboardService.getRecentActivities({ limit });
    res.json({
      success: true,
      data: { count: activities.length, activities },
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getOverview,
  getCharts,
  getRecentActivities,
};
