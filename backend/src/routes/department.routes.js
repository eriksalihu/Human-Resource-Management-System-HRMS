/**
 * @file backend/src/routes/department.routes.js
 * @description Department CRUD routes with auth and role-based authorization
 * @author Dev A
 */

const express = require('express');
const departmentController = require('../controllers/department.controller');
const authenticate = require('../middleware/auth');
const authorize = require('../middleware/authorize');
const { extractValidationErrors, idParamChain, paginationChain } = require('../middleware/validate');
const { departmentValidation } = require('../utils/validators');
const { auditLog } = require('../middleware/auditLog');

const router = express.Router();

// All department routes require authentication
router.use(authenticate);

/**
 * @route   GET /api/departments
 * @desc    List departments with pagination and search
 * @access  Private (any authenticated user)
 */
router.get(
  '/',
  paginationChain(),
  extractValidationErrors,
  departmentController.getAll
);

/**
 * @route   GET /api/departments/:id
 * @desc    Get a department by ID with positions and employee count
 * @access  Private (any authenticated user)
 */
router.get(
  '/:id',
  idParamChain('id'),
  extractValidationErrors,
  departmentController.getById
);

/**
 * @route   POST /api/departments
 * @desc    Create a new department
 * @access  Private (Admin, HR Manager)
 */
router.post(
  '/',
  authorize(['Admin', 'HR Manager']),
  departmentValidation(),
  extractValidationErrors,
  auditLog(),
  departmentController.create
);

/**
 * @route   PUT /api/departments/:id
 * @desc    Update a department
 * @access  Private (Admin, HR Manager)
 */
router.put(
  '/:id',
  authorize(['Admin', 'HR Manager']),
  idParamChain('id'),
  extractValidationErrors,
  auditLog(),
  departmentController.update
);

/**
 * @route   DELETE /api/departments/:id
 * @desc    Delete a department (must have no active employees)
 * @access  Private (Admin)
 */
router.delete(
  '/:id',
  authorize(['Admin']),
  idParamChain('id'),
  extractValidationErrors,
  auditLog(),
  departmentController.remove
);

module.exports = router;
