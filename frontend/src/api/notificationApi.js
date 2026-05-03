/**
 * @file frontend/src/api/notificationApi.js
 * @description Notification API service — self-service listing, unread badge counter, per-row + bulk read marking, and per-row deletion
 * @author Dev B
 */

import axiosInstance from './axiosInstance';

/**
 * Strip empty / null / undefined values from a params object so the backend
 * never sees `?limit=` or similar noise from cleared filter inputs.
 *
 * @param {Object} params
 * @returns {Object}
 */
const cleanParams = (params = {}) =>
  Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== '' && v != null)
  );

/**
 * Fetch the authenticated user's notifications.
 *
 * @param {Object} [params]
 * @param {boolean} [params.unread=false] - When true, server returns only unread rows
 * @param {number}  [params.limit=50] - Max rows; capped at 200 server-side
 * @returns {Promise<{
 *   unread_only: boolean,
 *   count: number,
 *   notifications: Array<{
 *     id: number,
 *     user_id: number,
 *     title: string,
 *     message: string,
 *     type: string,
 *     link: string|null,
 *     is_read: number,
 *     read_at: string|null,
 *     created_at: string,
 *   }>
 * }>}
 */
export const getMyNotifications = async (params = {}) => {
  const { data } = await axiosInstance.get('/notifications/me', {
    params: cleanParams(params),
  });
  return data.data;
};

/**
 * Fetch only the caller's unread count — a cheap polling endpoint for the
 * navbar badge so we don't pull the full list every 30 seconds when the
 * user hasn't opened the notifications panel.
 *
 * @returns {Promise<number>}
 */
export const getUnreadCount = async () => {
  const { data } = await axiosInstance.get('/notifications/unread-count');
  return Number(data?.data?.count) || 0;
};

/**
 * Mark a single notification as read. Returns the server's `{ id, read }`
 * shape so callers can confirm the row took.
 *
 * @param {number} id
 * @returns {Promise<{ id: number, read: boolean }>}
 */
export const markAsRead = async (id) => {
  const { data } = await axiosInstance.put(`/notifications/${id}/read`);
  return data?.data || { id, read: true };
};

/**
 * Mark every unread notification belonging to the caller as read.
 *
 * @returns {Promise<number>} Number of rows updated
 */
export const markAllAsRead = async () => {
  const { data } = await axiosInstance.put('/notifications/read-all');
  return Number(data?.data?.updated) || 0;
};

/**
 * Delete a single notification owned by the caller.
 *
 * @param {number} id
 * @returns {Promise<void>}
 */
export const remove = async (id) => {
  await axiosInstance.delete(`/notifications/${id}`);
};

export default {
  getMyNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  remove,
};
