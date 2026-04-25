/**
 * @file backend/src/routes/notification.routes.js
 * @description Notification self-service routes — list, unread count, read marking, and deletion
 * @author Dev A
 */

const express = require('express');
const notificationController = require('../controllers/notification.controller');
const authenticate = require('../middleware/auth');
const { extractValidationErrors, idParamChain } = require('../middleware/validate');
const { auditLog } = require('../middleware/auditLog');

const router = express.Router();

// All notification routes require authentication
router.use(authenticate);

/**
 * @route   GET /api/notifications/me
 * @desc    Caller's notifications (?unread=true to filter, ?limit=50 default)
 * @access  Private (any authenticated user)
 *
 * NOTE: Registered before /:id-style routes so "me" isn't parsed as an ID.
 */
router.get('/me', notificationController.getMyNotifications);

/**
 * @route   GET /api/notifications/unread-count
 * @desc    Cheap endpoint for navbar badge polling
 * @access  Private (any authenticated user)
 */
router.get('/unread-count', notificationController.getUnreadCount);

/**
 * @route   PUT /api/notifications/read-all
 * @desc    Mark every unread notification for the caller as read
 * @access  Private (any authenticated user)
 *
 * NOTE: Registered before /:id/read so "read-all" isn't parsed as an ID.
 */
router.put('/read-all', notificationController.markAllAsRead);

/**
 * @route   PUT /api/notifications/:id/read
 * @desc    Mark a single notification as read
 * @access  Private (owner only — enforced inside the controller)
 */
router.put(
  '/:id/read',
  idParamChain('id'),
  extractValidationErrors,
  notificationController.markAsRead
);

/**
 * @route   DELETE /api/notifications/:id
 * @desc    Delete a single notification (owner only)
 * @access  Private
 */
router.delete(
  '/:id',
  idParamChain('id'),
  extractValidationErrors,
  auditLog(),
  notificationController.remove
);

module.exports = router;
