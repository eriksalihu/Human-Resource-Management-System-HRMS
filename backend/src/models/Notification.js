/**
 * @file backend/src/models/Notification.js
 * @description Notification model with user-scoped queries and read tracking
 * @author Dev A
 */

const db = require('../config/db');

/**
 * Create a new notification for a user.
 *
 * @param {Object} data
 * @param {number} data.user_id - Recipient user ID
 * @param {string} data.title - Notification title
 * @param {string} data.message - Notification body
 * @param {string} [data.type='info'] - Notification type ('info', 'success', 'warning', 'error')
 * @param {string} [data.link] - Optional link to navigate to
 * @returns {Promise<number>} Inserted row ID
 */
const create = async (data) => {
  const [result] = await db.query(
    `INSERT INTO Notifications (user_id, title, message, type, link)
     VALUES (?, ?, ?, ?, ?)`,
    [
      data.user_id,
      data.title,
      data.message,
      data.type || 'info',
      data.link || null,
    ]
  );
  return result.insertId;
};

/**
 * Fetch notifications for a user, optionally filtered to unread only.
 *
 * @param {number} userId
 * @param {Object} [opts]
 * @param {boolean} [opts.unreadOnly=false] - If true, only unread notifications
 * @param {number} [opts.limit=50] - Max rows to return
 * @returns {Promise<Object[]>}
 */
const findByUser = async (userId, { unreadOnly = false, limit = 50 } = {}) => {
  const conditions = ['user_id = ?'];
  const params = [userId];

  if (unreadOnly) {
    conditions.push('is_read = FALSE');
  }

  const [rows] = await db.query(
    `SELECT * FROM Notifications
     WHERE ${conditions.join(' AND ')}
     ORDER BY created_at DESC
     LIMIT ?`,
    [...params, parseInt(limit, 10)]
  );
  return rows;
};

/**
 * Mark a single notification as read.
 *
 * @param {number} notificationId
 * @param {number} userId - Used to ensure ownership
 * @returns {Promise<boolean>} True if a row was updated
 */
const markAsRead = async (notificationId, userId) => {
  const [result] = await db.query(
    `UPDATE Notifications
     SET is_read = TRUE, read_at = NOW()
     WHERE id = ? AND user_id = ? AND is_read = FALSE`,
    [notificationId, userId]
  );
  return result.affectedRows > 0;
};

/**
 * Mark all unread notifications for a user as read.
 *
 * @param {number} userId
 * @returns {Promise<number>} Number of rows updated
 */
const markAllAsRead = async (userId) => {
  const [result] = await db.query(
    `UPDATE Notifications
     SET is_read = TRUE, read_at = NOW()
     WHERE user_id = ? AND is_read = FALSE`,
    [userId]
  );
  return result.affectedRows;
};

/**
 * Delete notifications older than the specified number of days.
 * Safe to run as a periodic cleanup job.
 *
 * @param {number} [daysOld=90]
 * @returns {Promise<number>} Number of rows deleted
 */
const deleteOld = async (daysOld = 90) => {
  const [result] = await db.query(
    `DELETE FROM Notifications
     WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY)`,
    [parseInt(daysOld, 10)]
  );
  return result.affectedRows;
};

/**
 * Get the count of unread notifications for a user.
 *
 * @param {number} userId
 * @returns {Promise<number>}
 */
const getUnreadCount = async (userId) => {
  const [rows] = await db.query(
    'SELECT COUNT(*) AS count FROM Notifications WHERE user_id = ? AND is_read = FALSE',
    [userId]
  );
  return rows[0].count;
};

module.exports = {
  create,
  findByUser,
  markAsRead,
  markAllAsRead,
  deleteOld,
  getUnreadCount,
};
