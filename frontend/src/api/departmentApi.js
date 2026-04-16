/**
 * @file frontend/src/api/departmentApi.js
 * @description Department API service functions using the shared Axios instance
 * @author Dev B
 */

import axiosInstance from './axiosInstance';

/**
 * Fetch a paginated list of departments with optional search.
 *
 * @param {Object} [params]
 * @param {number} [params.page=1]
 * @param {number} [params.limit=10]
 * @param {string} [params.search]
 * @param {string} [params.sortBy]
 * @param {string} [params.sortOrder]
 * @returns {Promise<{ data: Object[], pagination: Object }>}
 */
export const getAll = async (params = {}) => {
  const { data } = await axiosInstance.get('/departments', { params });
  return { data: data.data, pagination: data.pagination };
};

/**
 * Fetch a single department by ID (includes positions and employee count).
 *
 * @param {number} id - Department ID
 * @returns {Promise<Object>} Department object
 */
export const getById = async (id) => {
  const { data } = await axiosInstance.get(`/departments/${id}`);
  return data.data.department;
};

/**
 * Create a new department.
 *
 * @param {Object} payload
 * @param {string} payload.emertimi - Department name
 * @param {string} [payload.pershkrimi] - Description
 * @param {number} [payload.menaxheri_id] - Manager employee ID
 * @param {string} [payload.lokacioni] - Location
 * @param {number} [payload.buxheti] - Budget
 * @returns {Promise<Object>} Created department
 */
export const create = async (payload) => {
  const { data } = await axiosInstance.post('/departments', payload);
  return data.data.department;
};

/**
 * Update an existing department.
 *
 * @param {number} id - Department ID
 * @param {Object} payload - Fields to update
 * @returns {Promise<Object>} Updated department
 */
export const update = async (id, payload) => {
  const { data } = await axiosInstance.put(`/departments/${id}`, payload);
  return data.data.department;
};

/**
 * Delete a department.
 *
 * @param {number} id - Department ID
 * @returns {Promise<void>}
 */
export const remove = async (id) => {
  await axiosInstance.delete(`/departments/${id}`);
};

export default { getAll, getById, create, update, remove };
