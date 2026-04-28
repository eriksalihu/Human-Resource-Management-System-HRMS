/**
 * @file frontend/src/api/trainingApi.js
 * @description Training API service — CRUD, calendar/upcoming/ongoing feeds, enrollment/withdrawal, roster, per-employee history, and participant status/rating updates
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

/* ──────────────────────────────────────────────────────────────────── */
/* Training catalog                                                      */
/* ──────────────────────────────────────────────────────────────────── */

/**
 * Fetch a paginated list of trainings with filters.
 *
 * @param {Object} [params]
 * @param {number} [params.page=1]
 * @param {number} [params.limit=10]
 * @param {string} [params.statusi] - upcoming|ongoing|completed|cancelled
 * @param {string} [params.trajner] - Trainer name (partial match)
 * @param {string} [params.from_date] - data_fillimit >= from_date
 * @param {string} [params.to_date] - data_fillimit <= to_date
 * @param {string} [params.search] - LIKE over title / description / location
 * @param {string} [params.sortBy]
 * @param {string} [params.sortOrder]
 * @returns {Promise<{ data: Object[], pagination: Object }>}
 */
export const getAll = async (params = {}) => {
  const { data } = await axiosInstance.get('/trainings', {
    params: cleanParams(params),
  });
  return { data: data.data, pagination: data.pagination };
};

/**
 * Fetch a single training by ID (with live participant_count).
 *
 * @param {number} id
 * @returns {Promise<Object>}
 */
export const getById = async (id) => {
  const { data } = await axiosInstance.get(`/trainings/${id}`);
  return data.data.training || data.data;
};

/**
 * Fetch upcoming trainings (status='upcoming' AND start date in future).
 * Useful for dashboards / calendar previews.
 *
 * @param {Object} [params]
 * @param {number} [params.limit=50]
 * @returns {Promise<Object[]>}
 */
export const getUpcoming = async (params = {}) => {
  const { data } = await axiosInstance.get('/trainings/upcoming', {
    params: cleanParams(params),
  });
  return data.data.trainings || data.data;
};

/**
 * Fetch trainings currently in progress (status='ongoing' or date window
 * covers today).
 *
 * @returns {Promise<Object[]>}
 */
export const getOngoing = async () => {
  const { data } = await axiosInstance.get('/trainings/ongoing');
  return data.data.trainings || data.data;
};

/**
 * Fetch a calendar-friendly event feed for a date range.
 *
 * @param {Object} [params]
 * @param {string} [params.from_date] - YYYY-MM-DD
 * @param {string} [params.to_date] - YYYY-MM-DD
 * @returns {Promise<Object[]>} Compact event objects (id, title, dates, capacity)
 */
export const getCalendar = async (params = {}) => {
  const { data } = await axiosInstance.get('/trainings/calendar', {
    params: cleanParams(params),
  });
  return data.data.events || data.data;
};

/**
 * Fetch the authenticated employee's own training history (enrolled + completed).
 *
 * @returns {Promise<Object[]>}
 */
export const getMyTrainings = async () => {
  const { data } = await axiosInstance.get('/trainings/my');
  return data.data.trainings || data.data;
};

/**
 * Create a new training (Admin / HR Manager only).
 *
 * @param {Object} payload
 * @param {string} payload.titulli
 * @param {string} [payload.pershkrimi]
 * @param {string} [payload.trajner]
 * @param {string} payload.data_fillimit - YYYY-MM-DD
 * @param {string} payload.data_perfundimit - YYYY-MM-DD
 * @param {string} [payload.lokacioni]
 * @param {number} [payload.kapaciteti=20]
 * @param {string} [payload.statusi='upcoming']
 * @returns {Promise<Object>} Created training
 */
export const create = async (payload) => {
  const { data } = await axiosInstance.post('/trainings', payload);
  return data.data.training || data.data;
};

/**
 * Update an existing training (Admin / HR Manager only).
 *
 * @param {number} id
 * @param {Object} payload - Any of titulli/pershkrimi/trajner/dates/lokacioni/
 *                           kapaciteti/statusi
 * @returns {Promise<Object>} Updated training
 */
export const update = async (id, payload) => {
  const { data } = await axiosInstance.put(`/trainings/${id}`, payload);
  return data.data.training || data.data;
};

/**
 * Hard-delete a training. Participants cascade via FK.
 *
 * @param {number} id
 * @returns {Promise<void>}
 */
export const remove = async (id) => {
  await axiosInstance.delete(`/trainings/${id}`);
};

/* ──────────────────────────────────────────────────────────────────── */
/* Roster + enrollment                                                   */
/* ──────────────────────────────────────────────────────────────────── */

/**
 * Fetch the participant roster for a training.
 *
 * @param {number} trainingId
 * @returns {Promise<Object[]>}
 */
export const getParticipants = async (trainingId) => {
  const { data } = await axiosInstance.get(
    `/trainings/${trainingId}/participants`
  );
  return data.data.participants || data.data;
};

/**
 * Enroll an employee in a training. Defaults to the authenticated user's
 * own employee record; HR / Admin may pass `employee_id` to enroll someone
 * else.
 *
 * @param {number} trainingId
 * @param {Object} [payload]
 * @param {number} [payload.employee_id] - HR / Admin only
 * @returns {Promise<Object>} Created participant row
 */
export const enroll = async (trainingId, payload = {}) => {
  const { data } = await axiosInstance.post(
    `/trainings/${trainingId}/enroll`,
    payload
  );
  return data.data.participant || data.data;
};

/**
 * Withdraw an employee from a training. Defaults to the authenticated user;
 * HR / Admin may pass `employee_id` to withdraw someone else.
 *
 * @param {number} trainingId
 * @param {Object} [payload]
 * @param {number} [payload.employee_id] - HR / Admin only
 * @returns {Promise<Object>}
 */
export const withdraw = async (trainingId, payload = {}) => {
  const { data } = await axiosInstance.post(
    `/trainings/${trainingId}/withdraw`,
    payload
  );
  return data.data || {};
};

/* ──────────────────────────────────────────────────────────────────── */
/* Participant updates                                                   */
/* ──────────────────────────────────────────────────────────────────── */

/**
 * Update a participant's enrollment status (Admin / HR Manager).
 * Mounted at /api/training-participants/:id/status by app.js.
 *
 * @param {number} participantId
 * @param {Object} payload
 * @param {string} payload.statusi - enrolled|completed|cancelled|no-show
 * @returns {Promise<Object>}
 */
export const updateParticipantStatus = async (participantId, payload) => {
  const { data } = await axiosInstance.put(
    `/training-participants/${participantId}/status`,
    payload
  );
  return data.data.participant || data.data;
};

/**
 * Submit a post-training rating (owner or HR / Admin).
 *
 * @param {number} participantId
 * @param {Object} payload
 * @param {number} payload.vleresimi - 1.0 – 5.0
 * @param {string} [payload.komenti] - Optional feedback comment
 * @returns {Promise<Object>}
 */
export const rateParticipation = async (participantId, payload) => {
  const { data } = await axiosInstance.post(
    `/training-participants/${participantId}/rating`,
    payload
  );
  return data.data.participant || data.data;
};

export default {
  // Training catalog
  getAll,
  getById,
  getUpcoming,
  getOngoing,
  getCalendar,
  getMyTrainings,
  create,
  update,
  remove,
  // Roster + enrollment
  getParticipants,
  enroll,
  withdraw,
  // Participant updates
  updateParticipantStatus,
  rateParticipation,
};
