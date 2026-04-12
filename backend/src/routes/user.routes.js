/**
 * @file backend/src/routes/user.routes.js
 * @description User management API routes with auth and role guards
 * @author Dev A
 */

const express = require('express');
const userController = require('../controllers/user.controller');
const authenticate = require('../middleware/auth');
const authorize = require('../middleware/authorize');
const { extractValidationErrors, emailChain, passwordChain, idParamChain, paginationChain } = require('../middleware/validate');
const { auditLog } = require('../middleware/auditLog');

const router = express.Router();

// All user routes require authentication
router.use(authenticate);

/**
 * @route   GET /api/users
 * @desc    Get paginated list of users with optional search
 * @access  Private (any authenticated user)
 */
router.get(
  '/',
  paginationChain(),
  extractValidationErrors,
  userController.getAll
);

/**
 * @route   PUT /api/users/profile
 * @desc    Update own profile (first_name, last_name, phone)
 * @access  Private (authenticated user)
 */
router.put('/profile', auditLog(), userController.updateProfile);

/**
 * @route   GET /api/users/:id
 * @desc    Get a single user by ID
 * @access  Private (any authenticated user)
 */
router.get(
  '/:id',
  idParamChain('id'),
  extractValidationErrors,
  userController.getById
);

/**
 * @route   POST /api/users
 * @desc    Create a new user (admin only)
 * @access  Private (Admin)
 */
router.post(
  '/',
  authorize(['Admin']),
  emailChain(),
  passwordChain(),
  extractValidationErrors,
  auditLog(),
  userController.create
);

/**
 * @route   PUT /api/users/:id
 * @desc    Update a user's details
 * @access  Private (Admin, HR Manager)
 */
router.put(
  '/:id',
  authorize(['Admin', 'HR Manager']),
  idParamChain('id'),
  extractValidationErrors,
  auditLog(),
  userController.update
);

/**
 * @route   DELETE /api/users/:id
 * @desc    Soft-delete (deactivate) a user
 * @access  Private (Admin)
 */
router.delete(
  '/:id',
  authorize(['Admin']),
  idParamChain('id'),
  extractValidationErrors,
  auditLog(),
  userController.remove
);

module.exports = router;
