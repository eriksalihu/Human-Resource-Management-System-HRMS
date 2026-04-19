/**
 * @file backend/src/routes/leaveRequest.routes.js
 * @description LeaveRequest routes with self-service create/cancel, manager approval, and HR full access
 * @author Dev A
 */

const express = require('express');
const leaveRequestController = require('../controllers/leaveRequest.controller');
const authenticate = require('../middleware/auth');
const authorize = require('../middleware/authorize');
const { extractValidationErrors, idParamChain, paginationChain } = require('../middleware/validate');
const { auditLog } = require('../middleware/auditLog');

const router = express.Router();

// All leave request routes require authentication
router.use(authenticate);

/**
 * @route   GET /api/leave-requests/me
 * @desc    Own leave request history + balance for the authenticated employee
 * @access  Private (any authenticated user with a linked employee record)
 *
 * NOTE: Registered before /:id so "me" isn't parsed as an ID.
 */
router.get('/me', leaveRequestController.getMyRequests);

/**
 * @route   GET /api/leave-requests/pending
 * @desc    List pending leave requests (optionally scoped by department)
 * @access  Private (Admin, HR Manager, Department Manager)
 */
router.get(
  '/pending',
  authorize(['Admin', 'HR Manager', 'Department Manager']),
  leaveRequestController.getPendingApprovals
);

/**
 * @route   GET /api/leave-requests
 * @desc    List leave requests with filters
 * @access  Private (Admin, HR Manager, Department Manager)
 */
router.get(
  '/',
  authorize(['Admin', 'HR Manager', 'Department Manager']),
  paginationChain(),
  extractValidationErrors,
  leaveRequestController.getAll
);

/**
 * @route   GET /api/leave-requests/:id
 * @desc    Get a single leave request
 * @access  Private (Admin, HR Manager, Department Manager)
 */
router.get(
  '/:id',
  authorize(['Admin', 'HR Manager', 'Department Manager']),
  idParamChain('id'),
  extractValidationErrors,
  leaveRequestController.getById
);

/**
 * @route   POST /api/leave-requests
 * @desc    Create a new leave request (self-service; HR/Admin may act on behalf of others)
 * @access  Private (any authenticated user with a linked employee record)
 */
router.post(
  '/',
  auditLog(),
  leaveRequestController.create
);

/**
 * @route   PUT /api/leave-requests/:id
 * @desc    Update a pending leave request (owner or HR/Admin)
 * @access  Private
 */
router.put(
  '/:id',
  idParamChain('id'),
  extractValidationErrors,
  auditLog(),
  leaveRequestController.update
);

/**
 * @route   PUT /api/leave-requests/:id/approve
 * @desc    Approve a pending leave request
 * @access  Private (Admin, HR Manager, Department Manager)
 */
router.put(
  '/:id/approve',
  authorize(['Admin', 'HR Manager', 'Department Manager']),
  idParamChain('id'),
  extractValidationErrors,
  auditLog(),
  leaveRequestController.approve
);

/**
 * @route   PUT /api/leave-requests/:id/reject
 * @desc    Reject a pending leave request
 * @access  Private (Admin, HR Manager, Department Manager)
 */
router.put(
  '/:id/reject',
  authorize(['Admin', 'HR Manager', 'Department Manager']),
  idParamChain('id'),
  extractValidationErrors,
  auditLog(),
  leaveRequestController.reject
);

/**
 * @route   PUT /api/leave-requests/:id/cancel
 * @desc    Cancel a pending leave request (owner or HR/Admin)
 * @access  Private
 */
router.put(
  '/:id/cancel',
  idParamChain('id'),
  extractValidationErrors,
  auditLog(),
  leaveRequestController.cancel
);

/**
 * @route   DELETE /api/leave-requests/:id
 * @desc    Hard-delete a leave request
 * @access  Private (Admin)
 */
router.delete(
  '/:id',
  authorize(['Admin']),
  idParamChain('id'),
  extractValidationErrors,
  auditLog(),
  leaveRequestController.remove
);

module.exports = router;
