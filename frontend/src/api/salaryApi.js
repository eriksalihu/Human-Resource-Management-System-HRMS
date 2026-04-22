/**
 * @file frontend/src/api/salaryApi.js
 * @description Salary API service — CRUD, payroll summary, per-employee history, and bulk create
 * @author Dev B
 */

import axiosInstance from './axiosInstance';

/**
 * Strip empty / null / undefined values from a params object so the backend
 * doesn't receive `?statusi=` or similar noise.
 *
 * @param {Object} params
 * @returns {Object}
 */
const cleanParams = (params = {}) =>
  Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== '' && v != null)
  );

/**
 * Fetch a paginated list of salary records with optional filters.
 *
 * @param {Object} [params]
 * @param {number} [params.page=1]
 * @param {number} [params.limit=10]
 * @param {number} [params.employee_id]
 * @param {number} [params.muaji] - 1-12
 * @param {number} [params.viti] - YYYY
 * @param {string} [params.statusi] - pending|processed|paid|cancelled
 * @param {number} [params.department_id]
 * @param {string} [params.sortBy]
 * @param {string} [params.sortOrder]
 * @returns {Promise<{ data: Object[], pagination: Object }>}
 */
export const getAll = async (params = {}) => {
  const { data } = await axiosInstance.get('/salaries', {
    params: cleanParams(params),
  });
  return { data: data.data, pagination: data.pagination };
};

/**
 * Fetch a single salary record by ID.
 *
 * @param {number} id
 * @returns {Promise<Object>}
 */
export const getById = async (id) => {
  const { data } = await axiosInstance.get(`/salaries/${id}`);
  return data.data.salary || data.data;
};

/**
 * Fetch the full salary history for an employee (optional year filter).
 *
 * @param {number} employeeId
 * @param {Object} [params]
 * @param {number} [params.year] - YYYY
 * @returns {Promise<Object[]>}
 */
export const getEmployeeHistory = async (employeeId, params = {}) => {
  const { data } = await axiosInstance.get(`/salaries/employee/${employeeId}`, {
    params: cleanParams(params),
  });
  return data.data.salaries || data.data;
};

/**
 * Fetch payroll summary totals for a period (Admin / HR only).
 *
 * @param {Object} params
 * @param {number} params.muaji
 * @param {number} params.viti
 * @param {number} [params.department_id]
 * @returns {Promise<Object>} { headcount, total_base, total_bonuses, total_deductions, total_net, by_department }
 */
export const getPayrollSummary = async (params) => {
  const { data } = await axiosInstance.get('/salaries/payroll/summary', {
    params: cleanParams(params),
  });
  return data.data;
};

/**
 * Create a new salary record. Net pay is computed server-side.
 *
 * @param {Object} payload
 * @param {number} payload.employee_id
 * @param {number} payload.paga_baze - Gross base pay
 * @param {number} [payload.bonuse=0]
 * @param {number} [payload.zbritje=0] - Discretionary deductions (on top of statutory)
 * @param {number} payload.muaji - 1-12
 * @param {number} payload.viti - YYYY
 * @param {string} [payload.data_pageses] - Payment date (YYYY-MM-DD)
 * @param {string} [payload.statusi='pending']
 * @returns {Promise<Object>} Created salary (with server-computed paga_neto)
 */
export const create = async (payload) => {
  const { data } = await axiosInstance.post('/salaries', payload);
  return data.data.salary || data.data;
};

/**
 * Bulk create salary records for month-end payroll processing.
 *
 * @param {Object} payload
 * @param {number} payload.muaji
 * @param {number} payload.viti
 * @param {Object[]} payload.rows - [{ employee_id, paga_baze, bonuse?, zbritje? }]
 * @returns {Promise<{ created: number, skipped: Object[] }>}
 */
export const bulkCreate = async (payload) => {
  const { data } = await axiosInstance.post('/salaries/bulk', payload);
  return data.data;
};

/**
 * Update an existing salary record.
 * If `paga_baze`, `bonuse`, or `zbritje` change, the server recomputes net pay.
 *
 * @param {number} id
 * @param {Object} payload - Fields to update
 * @returns {Promise<Object>} Updated salary
 */
export const update = async (id, payload) => {
  const { data } = await axiosInstance.put(`/salaries/${id}`, payload);
  return data.data.salary || data.data;
};

/**
 * Delete a salary record (Admin only).
 *
 * @param {number} id
 * @returns {Promise<void>}
 */
export const remove = async (id) => {
  await axiosInstance.delete(`/salaries/${id}`);
};

export default {
  getAll,
  getById,
  getEmployeeHistory,
  getPayrollSummary,
  create,
  bulkCreate,
  update,
  remove,
};
