/**
 * @file backend/src/routes/attendance.routes.js
 * @description Attendance routes with self-service check-in/out, manager department view, and HR full access
 * @author Dev A
 */

const express = require('express');
const attendanceController = require('../controllers/attendance.controller');
const authenticate = require('../middleware/auth');
const authorize = require('../middleware/authorize');
const { extractValidationErrors, idParamChain, paginationChain } = require('../middleware/validate');
const { auditLog } = require('../middleware/auditLog');

const router = express.Router();

// All attendance routes require authentication
router.use(authenticate);

/**
 * @route   GET /api/attendances/me
 * @desc    Own attendance history for the authenticated employee
 * @access  Private (any authenticated user with a linked employee record)
 *
 * NOTE: Registered before /:id so "me" isn't parsed as an ID.
 */
router.get('/me', attendanceController.getMyAttendance);

/**
 * @route   POST /api/attendances/check-in
 * @desc    Self-service check-in for the authenticated employee
 * @access  Private
 */
router.post('/check-in', auditLog(), attendanceController.checkIn);

/**
 * @route   POST /api/attendances/check-out
 * @desc    Self-service check-out for the authenticated employee
 * @access  Private
 */
router.post('/check-out', auditLog(), attendanceController.checkOut);

/**
 * @route   GET /api/attendances/report/monthly
 * @desc    Per-employee monthly attendance report (requires year + month)
 * @access  Private (Admin, HR Manager, Department Manager)
 *
 * NOTE: Registered before /:id so "report" isn't parsed as an ID.
 */
router.get(
  '/report/monthly',
  authorize(['Admin', 'HR Manager', 'Department Manager']),
  attendanceController.getMonthlyReport
);

/**
 * @route   GET /api/attendances/department/:departmentId
 * @desc    Attendance + daily summary for a whole department
 * @access  Private (Admin, HR Manager, Department Manager)
 *
 * NOTE: Registered before /:id so "department" isn't parsed as an ID.
 */
router.get(
  '/department/:departmentId',
  authorize(['Admin', 'HR Manager', 'Department Manager']),
  attendanceController.getDepartmentAttendance
);

/**
 * @route   GET /api/attendances
 * @desc    List attendance rows with filters
 * @access  Private (Admin, HR Manager, Department Manager)
 */
router.get(
  '/',
  authorize(['Admin', 'HR Manager', 'Department Manager']),
  paginationChain(),
  extractValidationErrors,
  attendanceController.getAll
);

/**
 * @route   GET /api/attendances/:id
 * @desc    Get a single attendance row
 * @access  Private (Admin, HR Manager, Department Manager)
 */
router.get(
  '/:id',
  authorize(['Admin', 'HR Manager', 'Department Manager']),
  idParamChain('id'),
  extractValidationErrors,
  attendanceController.getById
);

/**
 * @route   POST /api/attendances
 * @desc    Manually create an attendance row
 * @access  Private (Admin, HR Manager)
 */
router.post(
  '/',
  authorize(['Admin', 'HR Manager']),
  auditLog(),
  attendanceController.create
);

/**
 * @route   PUT /api/attendances/:id
 * @desc    Update an attendance row
 * @access  Private (Admin, HR Manager)
 */
router.put(
  '/:id',
  authorize(['Admin', 'HR Manager']),
  idParamChain('id'),
  extractValidationErrors,
  auditLog(),
  attendanceController.update
);

/**
 * @route   DELETE /api/attendances/:id
 * @desc    Hard-delete an attendance row
 * @access  Private (Admin, HR Manager)
 */
router.delete(
  '/:id',
  authorize(['Admin', 'HR Manager']),
  idParamChain('id'),
  extractValidationErrors,
  auditLog(),
  attendanceController.remove
);

module.exports = router;
