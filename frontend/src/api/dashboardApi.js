/**
 * @file frontend/src/api/dashboardApi.js
 * @description Dashboard API service — overview headlines, chart datasets, and recent-activity feed
 * @author Dev B
 */

import axiosInstance from './axiosInstance';

/**
 * Strip empty / null / undefined values from a params object so the backend
 * never sees `?trend_days=` or similar noise from cleared filter inputs.
 *
 * @param {Object} params
 * @returns {Object}
 */
const cleanParams = (params = {}) =>
  Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== '' && v != null)
  );

/**
 * Fetch the dashboard overview — headline counts + today's attendance
 * snapshot, plus the current-month payroll totals when the caller has
 * Admin or HR Manager role.
 *
 * @returns {Promise<{
 *   counts: {
 *     total_employees: number,
 *     active_employees: number,
 *     total_departments: number,
 *     pending_leave_requests: number,
 *     attendance_today: {
 *       present: number,
 *       absent: number,
 *       late: number,
 *       half_day: number,
 *       remote: number,
 *       total: number
 *     }
 *   },
 *   payroll: {
 *     muaji: number,
 *     viti: number,
 *     headcount: number,
 *     total_base: number,
 *     total_bonuses: number,
 *     total_deductions: number,
 *     total_net: number
 *   }|null
 * }>}
 */
export const getOverview = async () => {
  const { data } = await axiosInstance.get('/dashboard/overview');
  return data.data;
};

/**
 * Fetch chart-friendly datasets in a single round trip:
 *   - employees_by_department
 *   - attendance_trend (for the last `trend_days` days)
 *   - leave_distribution (for the last `leave_days` days)
 *
 * @param {Object} [params]
 * @param {number} [params.trend_days] - 1..90 (default 14 server-side)
 * @param {number} [params.leave_days] - 1..365 (default 90 server-side)
 * @returns {Promise<{
 *   employees_by_department: Array<{ department_id: number, emertimi: string, headcount: number }>,
 *   attendance_trend: {
 *     window_days: number,
 *     series: Array<{
 *       date: string,
 *       present: number,
 *       absent: number,
 *       late: number,
 *       half_day: number,
 *       remote: number,
 *       total: number
 *     }>
 *   },
 *   leave_distribution: {
 *     window_days: number,
 *     series: Array<{ lloji: string, count: number, total_days: number }>
 *   }
 * }>}
 */
export const getCharts = async (params = {}) => {
  const { data } = await axiosInstance.get('/dashboard/charts', {
    params: cleanParams(params),
  });
  return data.data;
};

/**
 * Convenience alias matching the roadmap's `getChartData` naming. Some
 * existing dashboard widgets reference both — this lets callers pick
 * whichever name reads better in context.
 *
 * @param {Object} [params]
 * @returns {Promise<Object>}
 */
export const getChartData = getCharts;

/**
 * Fetch recent audit-log entries for the dashboard "Recent activity" feed.
 *
 * @param {Object} [params]
 * @param {number} [params.limit=10] - 1..50, capped server-side
 * @returns {Promise<{
 *   count: number,
 *   activities: Array<{
 *     id: number,
 *     action: string,
 *     entity: string,
 *     entity_id: number|null,
 *     user_id: number|null,
 *     user_name: string|null,
 *     created_at: string
 *   }>
 * }>}
 */
export const getRecentActivities = async (params = {}) => {
  const { data } = await axiosInstance.get('/dashboard/recent-activities', {
    params: cleanParams(params),
  });
  return data.data;
};

export default {
  getOverview,
  getCharts,
  getChartData,
  getRecentActivities,
};
