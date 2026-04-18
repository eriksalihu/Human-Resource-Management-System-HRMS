/**
 * @file backend/src/routes/employee.routes.js
 * @description Employee CRUD routes with granular role-based authorization
 * @author Dev A
 */

const express = require('express');
const employeeController = require('../controllers/employee.controller');
const authenticate = require('../middleware/auth');
const authorize = require('../middleware/authorize');
const { extractValidationErrors, idParamChain, paginationChain } = require('../middleware/validate');
const { auditLog } = require('../middleware/auditLog');

const router = express.Router();

// All employee routes require authentication
router.use(authenticate);

/**
 * @route   GET /api/employees/me
 * @desc    Get the employee profile for the currently authenticated user
 * @access  Private (any authenticated user)
 *
 * NOTE: Must be registered BEFORE /:id to prevent "me" from being parsed as an ID.
 */
router.get('/me', employeeController.getProfile);

/**
 * @route   GET /api/employees/manager/:managerId/subordinates
 * @desc    List direct reports of a given manager
 * @access  Private (Admin, HR Manager, Department Manager)
 */
router.get(
  '/manager/:managerId/subordinates',
  authorize(['Admin', 'HR Manager', 'Department Manager']),
  idParamChain('managerId'),
  extractValidationErrors,
  employeeController.getSubordinates
);

/**
 * @route   GET /api/employees
 * @desc    List employees with pagination, search, and filters
 * @access  Private (Admin, HR Manager, Department Manager)
 */
router.get(
  '/',
  authorize(['Admin', 'HR Manager', 'Department Manager']),
  paginationChain(),
  extractValidationErrors,
  employeeController.getAll
);

/**
 * @route   GET /api/employees/:id
 * @desc    Get a single employee by ID
 * @access  Private (Admin, HR Manager, Department Manager)
 *
 * NOTE: Regular employees access their own record through GET /me.
 */
router.get(
  '/:id',
  authorize(['Admin', 'HR Manager', 'Department Manager']),
  idParamChain('id'),
  extractValidationErrors,
  employeeController.getById
);

/**
 * @route   POST /api/employees
 * @desc    Create a new employee
 * @access  Private (Admin, HR Manager)
 */
router.post(
  '/',
  authorize(['Admin', 'HR Manager']),
  auditLog(),
  employeeController.create
);

/**
 * @route   PUT /api/employees/:id
 * @desc    Update an employee
 * @access  Private (Admin, HR Manager)
 */
router.put(
  '/:id',
  authorize(['Admin', 'HR Manager']),
  idParamChain('id'),
  extractValidationErrors,
  auditLog(),
  employeeController.update
);

/**
 * @route   DELETE /api/employees/:id
 * @desc    Soft-delete (terminate) an employee
 * @access  Private (Admin, HR Manager)
 */
router.delete(
  '/:id',
  authorize(['Admin', 'HR Manager']),
  idParamChain('id'),
  extractValidationErrors,
  auditLog(),
  employeeController.remove
);

module.exports = router;
