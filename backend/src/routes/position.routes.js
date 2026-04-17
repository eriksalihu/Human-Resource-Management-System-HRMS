/**
 * @file backend/src/routes/position.routes.js
 * @description Position CRUD routes with auth and role-based authorization
 * @author Dev A
 */

const express = require('express');
const positionController = require('../controllers/position.controller');
const authenticate = require('../middleware/auth');
const authorize = require('../middleware/authorize');
const { extractValidationErrors, idParamChain, paginationChain } = require('../middleware/validate');
const { auditLog } = require('../middleware/auditLog');

const router = express.Router();

// All position routes require authentication
router.use(authenticate);

/**
 * @route   GET /api/positions
 * @desc    List positions with pagination, search, and optional department filter
 * @access  Private (any authenticated user)
 */
router.get(
  '/',
  paginationChain(),
  extractValidationErrors,
  positionController.getAll
);

/**
 * @route   GET /api/positions/department/:departmentId
 * @desc    Get all positions within a specific department
 * @access  Private (any authenticated user)
 */
router.get(
  '/department/:departmentId',
  idParamChain('departmentId'),
  extractValidationErrors,
  positionController.getByDepartment
);

/**
 * @route   GET /api/positions/:id
 * @desc    Get a position by ID
 * @access  Private (any authenticated user)
 */
router.get(
  '/:id',
  idParamChain('id'),
  extractValidationErrors,
  positionController.getById
);

/**
 * @route   POST /api/positions
 * @desc    Create a new position
 * @access  Private (Admin, HR Manager)
 */
router.post(
  '/',
  authorize(['Admin', 'HR Manager']),
  auditLog(),
  positionController.create
);

/**
 * @route   PUT /api/positions/:id
 * @desc    Update a position
 * @access  Private (Admin, HR Manager)
 */
router.put(
  '/:id',
  authorize(['Admin', 'HR Manager']),
  idParamChain('id'),
  extractValidationErrors,
  auditLog(),
  positionController.update
);

/**
 * @route   DELETE /api/positions/:id
 * @desc    Delete a position
 * @access  Private (Admin, HR Manager)
 */
router.delete(
  '/:id',
  authorize(['Admin', 'HR Manager']),
  idParamChain('id'),
  extractValidationErrors,
  auditLog(),
  positionController.remove
);

module.exports = router;
