/**
 * @file backend/src/routes/auth.routes.js
 * @description Authentication API routes
 * @author Dev A
 */

const express = require('express');
const authController = require('../controllers/auth.controller');
const authenticate = require('../middleware/auth');

const router = express.Router();

/**
 * @route   POST /api/auth/register
 * @desc    Register a new user account
 * @access  Public
 */
router.post('/register', authController.register);

/**
 * @route   POST /api/auth/login
 * @desc    Authenticate user and issue access + refresh tokens
 * @access  Public
 */
router.post('/login', authController.login);

/**
 * @route   POST /api/auth/logout
 * @desc    Revoke refresh token and clear cookie
 * @access  Public (no auth required to clear client state)
 */
router.post('/logout', authController.logout);

/**
 * @route   POST /api/auth/refresh-token
 * @desc    Rotate refresh token and issue new access token
 * @access  Public (uses httpOnly refresh cookie)
 */
router.post('/refresh-token', authController.refreshToken);

/**
 * @route   GET /api/auth/profile
 * @desc    Get authenticated user's profile with roles
 * @access  Private (Bearer token required)
 */
router.get('/profile', authenticate, authController.getProfile);

module.exports = router;
