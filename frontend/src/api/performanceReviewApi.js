/**
 * @file frontend/src/api/performanceReviewApi.js
 * @description PerformanceReview API service — CRUD, self-service history, reviewer queue, and aggregate statistics
 * @author Dev B
 */

import axiosInstance from './axiosInstance';

/**
 * Strip empty / null / undefined values from a params object so the backend
 * never sees `?periudha=` or similar noise from cleared filter inputs.
 *
 * @param {Object} params
 * @returns {Object}
 */
const cleanParams = (params = {}) =>
  Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== '' && v != null)
  );

/**
 * Fetch a paginated list of performance reviews with filters.
 *
 * @param {Object} [params]
 * @param {number} [params.page=1]
 * @param {number} [params.limit=10]
 * @param {number} [params.employee_id]
 * @param {number} [params.vleresues_id] - Reviewer (Employees.id)
 * @param {number} [params.department_id]
 * @param {string} [params.periudha] - Period label (e.g. '2026-Q1')
 * @param {string} [params.from_date]
 * @param {string} [params.to_date]
 * @param {string} [params.sortBy]
 * @param {string} [params.sortOrder]
 * @returns {Promise<{ data: Object[], pagination: Object }>}
 */
export const getAll = async (params = {}) => {
  const { data } = await axiosInstance.get('/performance-reviews', {
    params: cleanParams(params),
  });
  return { data: data.data, pagination: data.pagination };
};

/**
 * Fetch a single review by ID.
 *
 * @param {number} id
 * @returns {Promise<Object>}
 */
export const getById = async (id) => {
  const { data } = await axiosInstance.get(`/performance-reviews/${id}`);
  return data.data.review || data.data;
};

/**
 * Fetch the authenticated employee's own reviews + average rating.
 *
 * @returns {Promise<{
 *   employee_id: number,
 *   reviews: Object[],
 *   average_rating: { average: number|null, review_count: number }
 * }>}
 */
export const getMyReviews = async () => {
  const { data } = await axiosInstance.get('/performance-reviews/me');
  return data.data;
};

/**
 * Fetch the reviewer queue for the authenticated user.
 * Returns reviews they've authored plus direct reports missing a review
 * for the (optional) given period.
 *
 * @param {Object} [params]
 * @param {string} [params.periudha] - Filter `missing_subordinates` to a period
 * @returns {Promise<{
 *   reviewer_id: number,
 *   written: Object[],
 *   missing_subordinates: Object[]
 * }>}
 */
export const getReviewsToComplete = async (params = {}) => {
  const { data } = await axiosInstance.get(
    '/performance-reviews/to-complete',
    { params: cleanParams(params) }
  );
  return data.data;
};

/**
 * Fetch aggregated rating statistics. All filters are optional.
 *
 * @param {Object} [params]
 * @param {string} [params.periudha]
 * @param {number} [params.department_id]
 * @param {number} [params.employee_id] - When set, response includes the
 *                                        employee's average_rating
 * @returns {Promise<{
 *   distribution: Array<{ bucket: number, count: number }>,
 *   periudha?: string,
 *   department_id?: number,
 *   employee_id?: number,
 *   average_rating?: { average: number|null, review_count: number }
 * }>}
 */
export const getStatistics = async (params = {}) => {
  const { data } = await axiosInstance.get('/performance-reviews/statistics', {
    params: cleanParams(params),
  });
  return data.data;
};

/**
 * Create a new performance review. Reviewer defaults to the authenticated
 * user; only HR / Admin may explicitly set `vleresues_id`.
 *
 * @param {Object} payload
 * @param {number} payload.employee_id - Subject of the review
 * @param {number} [payload.vleresues_id] - HR / Admin only
 * @param {string} payload.periudha - Period label (e.g. '2026-Q1')
 * @param {number} payload.nota - 1.0 – 5.0
 * @param {string} [payload.pikat_forta] - Strengths
 * @param {string} [payload.pikat_dobta] - Weaknesses
 * @param {string} [payload.objektivat] - Objectives
 * @param {string} payload.data_vleresimit - YYYY-MM-DD
 * @returns {Promise<Object>} Created review
 */
export const create = async (payload) => {
  const { data } = await axiosInstance.post(
    '/performance-reviews',
    payload
  );
  return data.data.review || data.data;
};

/**
 * Update an existing performance review. Authors may edit their own
 * reviews; only HR / Admin may re-assign the reviewer.
 *
 * @param {number} id
 * @param {Object} payload - Any of: periudha, nota, pikat_forta, pikat_dobta,
 *                          objektivat, data_vleresimit, vleresues_id (HR only)
 * @returns {Promise<Object>} Updated review
 */
export const update = async (id, payload) => {
  const { data } = await axiosInstance.put(
    `/performance-reviews/${id}`,
    payload
  );
  return data.data.review || data.data;
};

/**
 * Hard-delete a performance review (Admin / HR Manager only).
 *
 * @param {number} id
 * @returns {Promise<void>}
 */
export const remove = async (id) => {
  await axiosInstance.delete(`/performance-reviews/${id}`);
};

export default {
  getAll,
  getById,
  getMyReviews,
  getReviewsToComplete,
  getStatistics,
  create,
  update,
  remove,
};
