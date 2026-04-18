/**
 * @file backend/src/routes/salary.routes.js
 * @description Salary CRUD + payroll routes with Admin/HR authorization
 * @author Dev A
 */

const express = require('express');
const salaryController = require('../controllers/salary.controller');
const authenticate = require('../middleware/auth');
const authorize = require('../middleware/authorize');
const { extractValidationErrors, idParamChain, paginationChain } = require('../middleware/validate');
const { auditLog } = require('../middleware/auditLog');

const router = express.Router();

// All salary routes require authentication
router.use(authenticate);

/**
 * @route   GET /api/salaries/payroll/summary
 * @desc    Aggregate payroll totals for a given month / year (optionally department-scoped)
 * @access  Private (Admin, HR Manager)
 *
 * NOTE: Must be registered BEFORE /:id so "payroll" isn't parsed as an ID.
 */
router.get(
  '/payroll/summary',
  authorize(['Admin', 'HR Manager']),
  salaryController.getPayrollSummary
);

/**
 * @route   GET /api/salaries/employee/:employeeId
 * @desc    Full salary history for one employee (optional ?year=YYYY filter)
 * @access  Private (Admin, HR Manager, Department Manager)
 */
router.get(
  '/employee/:employeeId',
  authorize(['Admin', 'HR Manager', 'Department Manager']),
  idParamChain('employeeId'),
  extractValidationErrors,
  salaryController.getEmployeeHistory
);

/**
 * @route   GET /api/salaries
 * @desc    List salaries with pagination + filters
 * @access  Private (Admin, HR Manager)
 */
router.get(
  '/',
  authorize(['Admin', 'HR Manager']),
  paginationChain(),
  extractValidationErrors,
  salaryController.getAll
);

/**
 * @route   GET /api/salaries/:id
 * @desc    Get a single salary record
 * @access  Private (Admin, HR Manager)
 */
router.get(
  '/:id',
  authorize(['Admin', 'HR Manager']),
  idParamChain('id'),
  extractValidationErrors,
  salaryController.getById
);

/**
 * @route   POST /api/salaries/bulk
 * @desc    Bulk create salary records for month-end payroll
 * @access  Private (Admin, HR Manager)
 */
router.post(
  '/bulk',
  authorize(['Admin', 'HR Manager']),
  auditLog(),
  salaryController.bulkCreate
);

/**
 * @route   POST /api/salaries
 * @desc    Create a new salary record (auto-computes net pay)
 * @access  Private (Admin, HR Manager)
 */
router.post(
  '/',
  authorize(['Admin', 'HR Manager']),
  auditLog(),
  salaryController.create
);

/**
 * @route   PUT /api/salaries/:id
 * @desc    Update a salary record; net pay is re-computed when components change
 * @access  Private (Admin, HR Manager)
 */
router.put(
  '/:id',
  authorize(['Admin', 'HR Manager']),
  idParamChain('id'),
  extractValidationErrors,
  auditLog(),
  salaryController.update
);

/**
 * @route   DELETE /api/salaries/:id
 * @desc    Delete a salary record
 * @access  Private (Admin)
 */
router.delete(
  '/:id',
  authorize(['Admin']),
  idParamChain('id'),
  extractValidationErrors,
  auditLog(),
  salaryController.remove
);

module.exports = router;
