/**
 * @file frontend/src/api/leaveRequestApi.js
 * @description LeaveRequest API service — CRUD, self-service, approval/reject/cancel, and pending queue
 * @author Dev B
 */

import axiosInstance from './axiosInstance';

/**
 * Strip empty / null / undefined values from a params object.
 * @param {Object} params
 * @returns {Object}
 */
const cleanParams = (params = {}) =>
  Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== '' && v != null)
  );

/**
 * Fetch a paginated list of leave requests with filters (HR / Admin / Manager view).
 *
 * @param {Object} [params]
 * @param {number} [params.page=1]
 * @param {number} [params.limit=10]
 * @param {number} [params.employee_id]
 * @param {number} [params.department_id]
 * @param {string} [params.statusi] - pending|approved|rejected|cancelled
 * @param {string} [params.lloji] - annual|sick|personal|maternity|paternity|unpaid
 * @param {string} [params.from_date]
 * @param {string} [params.to_date]
 * @param {string} [params.sortBy]
 * @param {string} [params.sortOrder]
 * @returns {Promise<{ data: Object[], pagination: Object }>}
 */
export const getAll = async (params = {}) => {
  const { data } = await axiosInstance.get('/leave-requests', {
    params: cleanParams(params),
  });
  return { data: data.data, pagination: data.pagination };
};

/**
 * Fetch a single leave request by ID.
 *
 * @param {number} id
 * @returns {Promise<Object>}
 */
export const getById = async (id) => {
  const { data } = await axiosInstance.get(`/leave-requests/${id}`);
  return data.data.request || data.data;
};

/**
 * Fetch the authenticated employee's own leave history + balance.
 *
 * @returns {Promise<{ employee_id: number, requests: Object[], balance: Object[] }>}
 */
export const getMyRequests = async () => {
  const { data } = await axiosInstance.get('/leave-requests/me');
  return data.data;
};

/**
 * Fetch pending leave requests, optionally department-scoped.
 *
 * @param {Object} [params]
 * @param {number} [params.department_id]
 * @returns {Promise<Object[]>}
 */
export const getPendingApprovals = async (params = {}) => {
  const { data } = await axiosInstance.get('/leave-requests/pending', {
    params: cleanParams(params),
  });
  return data.data.pending || data.data;
};

/**
 * Create a new leave request. HR / Admin may pass `employee_id` to act on
 * behalf of another employee; otherwise it's created for the current user.
 *
 * @param {Object} payload
 * @param {string} payload.lloji - Leave type enum
 * @param {string} payload.data_fillimit - YYYY-MM-DD
 * @param {string} payload.data_perfundimit - YYYY-MM-DD
 * @param {string} [payload.arsyeja] - Reason
 * @param {number} [payload.employee_id] - HR/Admin only
 * @returns {Promise<Object>} Created request
 */
export const create = async (payload) => {
  const { data } = await axiosInstance.post('/leave-requests', payload);
  return data.data.request || data.data;
};

/**
 * Update a pending leave request (owner or HR/Admin).
 *
 * @param {number} id
 * @param {Object} payload - Any of: lloji, data_fillimit, data_perfundimit, arsyeja
 * @returns {Promise<Object>}
 */
export const update = async (id, payload) => {
  const { data } = await axiosInstance.put(`/leave-requests/${id}`, payload);
  return data.data.request || data.data;
};

/**
 * Approve a pending leave request (Admin / HR / Manager).
 *
 * @param {number} id
 * @returns {Promise<Object>}
 */
export const approve = async (id) => {
  const { data } = await axiosInstance.put(`/leave-requests/${id}/approve`);
  return data.data.request || data.data;
};

/**
 * Reject a pending leave request (Admin / HR / Manager).
 *
 * @param {number} id
 * @returns {Promise<Object>}
 */
export const reject = async (id) => {
  const { data } = await axiosInstance.put(`/leave-requests/${id}/reject`);
  return data.data.request || data.data;
};

/**
 * Cancel a pending leave request (owner or HR/Admin).
 *
 * @param {number} id
 * @returns {Promise<Object>}
 */
export const cancel = async (id) => {
  const { data } = await axiosInstance.put(`/leave-requests/${id}/cancel`);
  return data.data.request || data.data;
};

/**
 * Hard-delete a leave request (Admin only).
 *
 * @param {number} id
 * @returns {Promise<void>}
 */
export const remove = async (id) => {
  await axiosInstance.delete(`/leave-requests/${id}`);
};

export default {
  getAll,
  getById,
  getMyRequests,
  getPendingApprovals,
  create,
  update,
  approve,
  reject,
  cancel,
  remove,
};
