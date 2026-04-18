/**
 * @file frontend/src/api/positionApi.js
 * @description Position API service functions using the shared Axios instance
 * @author Dev B
 */

import axiosInstance from './axiosInstance';

/**
 * Fetch a paginated list of positions with optional search and department filter.
 *
 * @param {Object} [params]
 * @param {number} [params.page=1]
 * @param {number} [params.limit=10]
 * @param {string} [params.search]
 * @param {number} [params.department_id] - Restrict results to a single department
 * @param {string} [params.sortBy]
 * @param {string} [params.sortOrder]
 * @returns {Promise<{ data: Object[], pagination: Object }>}
 */
export const getAll = async (params = {}) => {
  const { data } = await axiosInstance.get('/positions', { params });
  return { data: data.data, pagination: data.pagination };
};

/**
 * Fetch a single position by ID (includes department details).
 *
 * @param {number} id - Position ID
 * @returns {Promise<Object>} Position object
 */
export const getById = async (id) => {
  const { data } = await axiosInstance.get(`/positions/${id}`);
  return data.data.position;
};

/**
 * Fetch all positions belonging to a specific department.
 * Uses the dedicated /positions/department/:departmentId endpoint (no pagination).
 *
 * @param {number} departmentId - Department ID
 * @returns {Promise<Object[]>} Array of position objects
 */
export const getByDepartment = async (departmentId) => {
  const { data } = await axiosInstance.get(`/positions/department/${departmentId}`);
  return data.data.positions;
};

/**
 * Create a new position.
 *
 * @param {Object} payload
 * @param {number} payload.department_id - Parent department ID
 * @param {string} payload.emertimi - Position name
 * @param {string} [payload.pershkrimi] - Description
 * @param {string} [payload.niveli] - Level (Junior, Mid, Senior, etc.)
 * @param {number} [payload.paga_min] - Minimum salary
 * @param {number} [payload.paga_max] - Maximum salary
 * @returns {Promise<Object>} Created position
 */
export const create = async (payload) => {
  const { data } = await axiosInstance.post('/positions', payload);
  return data.data.position;
};

/**
 * Update an existing position.
 *
 * @param {number} id - Position ID
 * @param {Object} payload - Fields to update
 * @returns {Promise<Object>} Updated position
 */
export const update = async (id, payload) => {
  const { data } = await axiosInstance.put(`/positions/${id}`, payload);
  return data.data.position;
};

/**
 * Delete a position.
 *
 * @param {number} id - Position ID
 * @returns {Promise<void>}
 */
export const remove = async (id) => {
  await axiosInstance.delete(`/positions/${id}`);
};

export default { getAll, getById, getByDepartment, create, update, remove };
