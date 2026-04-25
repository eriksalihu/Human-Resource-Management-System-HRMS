/**
 * @file frontend/src/api/attendanceApi.js
 * @description Attendance API service — CRUD, self-service check-in/out, per-employee history, department feed, and monthly report
 * @author Dev B
 */

import axiosInstance from './axiosInstance';

/**
 * Strip empty / null / undefined values from a params object so the backend
 * never sees `?statusi=` or similar noise from cleared filter inputs.
 *
 * @param {Object} params
 * @returns {Object}
 */
const cleanParams = (params = {}) =>
  Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== '' && v != null)
  );

/**
 * Fetch a paginated list of attendance rows with filters.
 *
 * @param {Object} [params]
 * @param {number} [params.page=1]
 * @param {number} [params.limit=10]
 * @param {number} [params.employee_id]
 * @param {number} [params.department_id]
 * @param {string} [params.statusi] - present|absent|late|half-day|remote
 * @param {string} [params.from_date] - YYYY-MM-DD
 * @param {string} [params.to_date] - YYYY-MM-DD
 * @param {string} [params.sortBy]
 * @param {string} [params.sortOrder]
 * @returns {Promise<{ data: Object[], pagination: Object }>}
 */
export const getAll = async (params = {}) => {
  const { data } = await axiosInstance.get('/attendances', {
    params: cleanParams(params),
  });
  return { data: data.data, pagination: data.pagination };
};

/**
 * Fetch a single attendance row by ID.
 *
 * @param {number} id
 * @returns {Promise<Object>}
 */
export const getById = async (id) => {
  const { data } = await axiosInstance.get(`/attendances/${id}`);
  return data.data.attendance || data.data;
};

/**
 * Fetch the authenticated user's own attendance history (optional date range).
 *
 * @param {Object} [params]
 * @param {string} [params.from_date]
 * @param {string} [params.to_date]
 * @returns {Promise<{ employee_id: number, attendance: Object[] }>}
 */
export const getMyAttendance = async (params = {}) => {
  const { data } = await axiosInstance.get('/attendances/me', {
    params: cleanParams(params),
  });
  return data.data;
};

/**
 * Fetch attendance history for a specific employee (HR / Admin / Manager).
 * Wraps the generic getAll endpoint with a fixed `employee_id` filter so the
 * caller doesn't have to remember the filter shape.
 *
 * @param {number} employeeId
 * @param {Object} [params]
 * @param {string} [params.from_date]
 * @param {string} [params.to_date]
 * @param {string} [params.statusi]
 * @param {number} [params.limit=200]
 * @returns {Promise<{ data: Object[], pagination: Object }>}
 */
export const getByEmployee = async (employeeId, params = {}) => {
  const { data } = await axiosInstance.get('/attendances', {
    params: cleanParams({
      employee_id: employeeId,
      limit: 200,
      ...params,
    }),
  });
  return { data: data.data, pagination: data.pagination };
};

/**
 * Fetch attendance for a whole department on a given date / range, plus a
 * daily summary count by status (returned in `summary`).
 *
 * @param {number} departmentId
 * @param {Object} [params]
 * @param {string} [params.from_date]
 * @param {string} [params.to_date]
 * @param {string} [params.statusi]
 * @param {number} [params.page=1]
 * @param {number} [params.limit=50]
 * @returns {Promise<{ data: Object[], pagination: Object, summary: Object }>}
 */
export const getDepartmentAttendance = async (departmentId, params = {}) => {
  const { data } = await axiosInstance.get(
    `/attendances/department/${departmentId}`,
    { params: cleanParams(params) }
  );
  return {
    data: data.data,
    pagination: data.pagination,
    summary: data.summary,
  };
};

/**
 * Fetch the per-employee monthly attendance report.
 *
 * @param {Object} params
 * @param {number} params.year
 * @param {number} params.month - 1-12
 * @param {number} [params.department_id]
 * @param {number} [params.employee_id]
 * @returns {Promise<{ year: number, month: number, report: Object[] }>}
 */
export const getMonthlyReport = async (params) => {
  const { data } = await axiosInstance.get('/attendances/report/monthly', {
    params: cleanParams(params),
  });
  return data.data;
};

/**
 * Self-service check-in. Server creates today's row if missing and fills
 * `ora_hyrjes` if blank. Returns `{ id, created, alreadyCheckedIn }`.
 *
 * @returns {Promise<Object>}
 */
export const checkIn = async () => {
  const { data } = await axiosInstance.post('/attendances/check-in');
  return data.data;
};

/**
 * Self-service check-out. Server fills `ora_daljes` on today's row.
 *
 * @returns {Promise<Object>}
 */
export const checkOut = async () => {
  const { data } = await axiosInstance.post('/attendances/check-out');
  return data.data;
};

/**
 * Manually create an attendance record (HR / Admin only).
 *
 * @param {Object} payload
 * @param {number} payload.employee_id
 * @param {string} payload.data - YYYY-MM-DD
 * @param {string} [payload.ora_hyrjes] - HH:MM[:SS]
 * @param {string} [payload.ora_daljes] - HH:MM[:SS]
 * @param {string} [payload.statusi='present']
 * @param {string} [payload.shenimet]
 * @returns {Promise<Object>} Created attendance row
 */
export const create = async (payload) => {
  const { data } = await axiosInstance.post('/attendances', payload);
  return data.data.attendance || data.data;
};

/**
 * Update an existing attendance row.
 *
 * @param {number} id
 * @param {Object} payload - Any of: ora_hyrjes, ora_daljes, statusi, shenimet
 * @returns {Promise<Object>} Updated attendance row
 */
export const update = async (id, payload) => {
  const { data } = await axiosInstance.put(`/attendances/${id}`, payload);
  return data.data.attendance || data.data;
};

/**
 * Hard-delete an attendance row (HR / Admin only).
 *
 * @param {number} id
 * @returns {Promise<void>}
 */
export const remove = async (id) => {
  await axiosInstance.delete(`/attendances/${id}`);
};

export default {
  getAll,
  getById,
  getMyAttendance,
  getByEmployee,
  getDepartmentAttendance,
  getMonthlyReport,
  checkIn,
  checkOut,
  create,
  update,
  remove,
};
