/**
 * @file backend/src/controllers/notification.controller.js
 * @description Notification controller — user-scoped listing, unread count, per-row + bulk read marking, and per-row deletion
 * @author Dev A
 */

const db = require('../config/db');
const Notification = require('../models/Notification');
const { AppError } = require('../middleware/errorHandler');

/**
 * GET /api/notifications/me
 * Fetch the caller's notifications. Optional `unread=true` filters to unread
 * only; `limit` caps the response (default 50, max 200).
 */
const getMyNotifications = async (req, res, next) => {
  try {
    const unreadOnly = String(req.query.unread || '').toLowerCase() === 'true';
    const rawLimit = parseInt(req.query.limit, 10);
    const limit = Number.isFinite(rawLimit)
      ? Math.min(Math.max(rawLimit, 1), 200)
      : 50;

    const rows = await Notification.findByUser(req.user.id, {
      unreadOnly,
      limit,
    });

    res.json({
      success: true,
      data: {
        unread_only: unreadOnly,
        count: rows.length,
        notifications: rows,
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/notifications/unread-count
 * Lightweight endpoint for navbar badge polling.
 */
const getUnreadCount = async (req, res, next) => {
  try {
    const count = await Notification.getUnreadCount(req.user.id);
    res.json({ success: true, data: { count: Number(count) || 0 } });
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/notifications/:id/read
 * Mark a single notification as read. Ownership is enforced inside the
 * model's UPDATE (`WHERE id = ? AND user_id = ?`), so a foreign user's
 * notification id silently no-ops — we surface that as 404.
 */
const markAsRead = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      throw new AppError('Invalid notification id', 400);
    }

    const updated = await Notification.markAsRead(id, req.user.id);
    if (!updated) {
      // Either no row, not yours, or already read — distinguish lightly.
      throw new AppError(
        'Notification not found or already read',
        404
      );
    }

    res.json({ success: true, data: { id, read: true } });
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/notifications/read-all
 * Mark every unread notification belonging to the caller as read.
 */
const markAllAsRead = async (req, res, next) => {
  try {
    const updated = await Notification.markAllAsRead(req.user.id);
    res.json({
      success: true,
      data: { updated: Number(updated) || 0 },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/notifications/:id
 * Hard-delete a single notification owned by the caller. We run the
 * ownership check directly in the WHERE clause so a stale / spoofed id
 * cannot leak to another user's row.
 */
const remove = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      throw new AppError('Invalid notification id', 400);
    }

    const [result] = await db.query(
      `DELETE FROM Notifications
       WHERE id = ? AND user_id = ?`,
      [id, req.user.id]
    );

    if (result.affectedRows === 0) {
      throw new AppError('Notification not found', 404);
    }

    res.json({ success: true, data: { id } });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getMyNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  remove,
};
