/**
 * @file frontend/src/api/employeeApi.js
 * @description Employee API service — CRUD, search / filters, own-profile, and subordinates
 * @author Dev B
 */

import axiosInstance from './axiosInstance';

/**
 * Fetch a paginated list of employees with optional search and filters.
 *
 * @param {Object} [params]
 * @param {number} [params.page=1]
 * @param {number} [params.limit=10]
 * @param {string} [params.search] - Matches name, email, or employee number
 * @param {number} [params.department_id]
 * @param {number} [params.position_id]
 * @param {string} [params.statusi] - active|inactive|suspended|terminated
 * @param {string} [params.lloji_kontrates] - full-time|part-time|contract|intern
 * @param {number} [params.menaxheri_id]
 * @param {string} [params.sortBy]
 * @param {string} [params.sortOrder]
 * @returns {Promise<{ data: Object[], pagination: Object }>}
 */
export const getAll = async (params = {}) => {
  // Strip empty values so the backend doesn't get `?statusi=` etc.
  const clean = Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== '' && v != null)
  );
  const { data } = await axiosInstance.get('/employees', { params: clean });
  return { data: data.data, pagination: data.pagination };
};

/**
 * Fetch a single employee by ID with full related details.
 *
 * @param {number} id
 * @returns {Promise<Object>} Employee object
 */
export const getById = async (id) => {
  const { data } = await axiosInstance.get(`/employees/${id}`);
  return data.data.employee;
};

/**
 * Fetch the currently authenticated user's own employee record.
 *
 * @returns {Promise<Object>} Employee object
 */
export const getMyProfile = async () => {
  const { data } = await axiosInstance.get('/employees/me');
  return data.data.employee;
};

/**
 * Fetch direct reports of a given manager employee ID.
 *
 * @param {number} managerId
 * @returns {Promise<Object[]>}
 */
export const getSubordinates = async (managerId) => {
  const { data } = await axiosInstance.get(
    `/employees/manager/${managerId}/subordinates`
  );
  return data.data.subordinates;
};

/**
 * Create a new employee record.
 *
 * @param {Object} payload
 * @param {number} payload.user_id
 * @param {number} payload.position_id
 * @param {number} payload.department_id
 * @param {string} payload.data_punesimit - Hire date YYYY-MM-DD
 * @param {string} payload.lloji_kontrates - Contract type enum
 * @param {string} [payload.statusi='active']
 * @param {number} [payload.menaxheri_id] - Direct manager employee ID
 * @returns {Promise<Object>} Created employee
 */
export const create = async (payload) => {
  const { data } = await axiosInstance.post('/employees', payload);
  return data.data.employee;
};

/**
 * Update an existing employee.
 *
 * @param {number} id
 * @param {Object} payload - Fields to update
 * @returns {Promise<Object>} Updated employee
 */
export const update = async (id, payload) => {
  const { data } = await axiosInstance.put(`/employees/${id}`, payload);
  return data.data.employee;
};

/**
 * Terminate (soft-delete) an employee.
 *
 * @param {number} id
 * @returns {Promise<void>}
 */
export const remove = async (id) => {
  await axiosInstance.delete(`/employees/${id}`);
};

export default {
  getAll,
  getById,
  getMyProfile,
  getSubordinates,
  create,
  update,
  remove,
};
