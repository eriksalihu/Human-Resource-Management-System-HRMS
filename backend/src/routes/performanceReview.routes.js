/**
 * @file backend/src/routes/performanceReview.routes.js
 * @description PerformanceReview routes with reviewer create access, self-service history, and manager/HR management
 * @author Dev A
 */

const express = require('express');
const performanceReviewController = require('../controllers/performanceReview.controller');
const authenticate = require('../middleware/auth');
const authorize = require('../middleware/authorize');
const { extractValidationErrors, idParamChain, paginationChain } = require('../middleware/validate');
const { auditLog } = require('../middleware/auditLog');

const router = express.Router();

// All performance review routes require authentication
router.use(authenticate);

/**
 * @route   GET /api/performance-reviews/me
 * @desc    Reviews about the authenticated employee + average rating
 * @access  Private (any authenticated user with a linked employee record)
 *
 * NOTE: Registered before /:id so "me" isn't parsed as an ID.
 */
router.get('/me', performanceReviewController.getMyReviews);

/**
 * @route   GET /api/performance-reviews/to-complete
 * @desc    Reviewer's authored reviews + direct reports missing a review
 * @access  Private (Department Manager, HR Manager, Admin)
 *
 * NOTE: Registered before /:id so "to-complete" isn't parsed as an ID.
 */
router.get(
  '/to-complete',
  authorize(['Admin', 'HR Manager', 'Department Manager']),
  performanceReviewController.getReviewsToComplete
);

/**
 * @route   GET /api/performance-reviews/statistics
 * @desc    Aggregated rating statistics (HR / Admin / Manager view)
 * @access  Private (Admin, HR Manager, Department Manager)
 *
 * NOTE: Registered before /:id so "statistics" isn't parsed as an ID.
 */
router.get(
  '/statistics',
  authorize(['Admin', 'HR Manager', 'Department Manager']),
  performanceReviewController.getStatistics
);

/**
 * @route   GET /api/performance-reviews
 * @desc    List performance reviews with filters
 * @access  Private (Admin, HR Manager, Department Manager)
 */
router.get(
  '/',
  authorize(['Admin', 'HR Manager', 'Department Manager']),
  paginationChain(),
  extractValidationErrors,
  performanceReviewController.getAll
);

/**
 * @route   GET /api/performance-reviews/:id
 * @desc    Get a single performance review
 * @access  Private (Admin, HR Manager, Department Manager)
 */
router.get(
  '/:id',
  authorize(['Admin', 'HR Manager', 'Department Manager']),
  idParamChain('id'),
  extractValidationErrors,
  performanceReviewController.getById
);

/**
 * @route   POST /api/performance-reviews
 * @desc    Create a new performance review
 * @access  Private (Department Manager, HR Manager, Admin)
 */
router.post(
  '/',
  authorize(['Admin', 'HR Manager', 'Department Manager']),
  auditLog(),
  performanceReviewController.create
);

/**
 * @route   PUT /api/performance-reviews/:id
 * @desc    Update a performance review (author only, unless HR/Admin)
 * @access  Private (Department Manager, HR Manager, Admin)
 */
router.put(
  '/:id',
  authorize(['Admin', 'HR Manager', 'Department Manager']),
  idParamChain('id'),
  extractValidationErrors,
  auditLog(),
  performanceReviewController.update
);

/**
 * @route   DELETE /api/performance-reviews/:id
 * @desc    Hard-delete a performance review
 * @access  Private (Admin, HR Manager)
 */
router.delete(
  '/:id',
  authorize(['Admin', 'HR Manager']),
  idParamChain('id'),
  extractValidationErrors,
  auditLog(),
  performanceReviewController.remove
);

module.exports = router;
