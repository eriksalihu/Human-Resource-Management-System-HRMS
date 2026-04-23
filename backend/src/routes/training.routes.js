/**
 * @file backend/src/routes/training.routes.js
 * @description Training routes — CRUD, enroll/withdraw self-service, roster, and calendar feed
 * @author Dev A
 */

const express = require('express');
const trainingController = require('../controllers/training.controller');
const authenticate = require('../middleware/auth');
const authorize = require('../middleware/authorize');
const { extractValidationErrors, idParamChain, paginationChain } = require('../middleware/validate');
const { auditLog } = require('../middleware/auditLog');

const router = express.Router();

// Everything below requires a valid session.
router.use(authenticate);

/**
 * @route   GET /api/trainings/my
 * @desc    Caller's own training history
 * @access  Private (any authenticated user with an employee record)
 *
 * NOTE: Registered before /:id so "my" isn't parsed as an ID.
 */
router.get('/my', trainingController.getMyTrainings);

/**
 * @route   GET /api/trainings/upcoming
 * @desc    Upcoming trainings feed
 * @access  Private (any authenticated user)
 */
router.get('/upcoming', trainingController.getUpcoming);

/**
 * @route   GET /api/trainings/ongoing
 * @desc    Trainings currently in progress
 * @access  Private (any authenticated user)
 */
router.get('/ongoing', trainingController.getOngoing);

/**
 * @route   GET /api/trainings/calendar
 * @desc    Calendar events payload (id, titulli, dates, counts)
 * @access  Private (any authenticated user)
 */
router.get('/calendar', trainingController.getCalendar);

/**
 * @route   GET /api/trainings
 * @desc    List trainings with filters
 * @access  Private (any authenticated user)
 */
router.get(
  '/',
  paginationChain(),
  extractValidationErrors,
  trainingController.getAll
);

/**
 * @route   GET /api/trainings/:id
 * @desc    Get a single training
 * @access  Private (any authenticated user)
 */
router.get(
  '/:id',
  idParamChain('id'),
  extractValidationErrors,
  trainingController.getById
);

/**
 * @route   POST /api/trainings
 * @desc    Create a training
 * @access  Private (Admin, HR Manager)
 */
router.post(
  '/',
  authorize(['Admin', 'HR Manager']),
  auditLog(),
  trainingController.create
);

/**
 * @route   PUT /api/trainings/:id
 * @desc    Update a training
 * @access  Private (Admin, HR Manager)
 */
router.put(
  '/:id',
  authorize(['Admin', 'HR Manager']),
  idParamChain('id'),
  extractValidationErrors,
  auditLog(),
  trainingController.update
);

/**
 * @route   DELETE /api/trainings/:id
 * @desc    Delete a training
 * @access  Private (Admin, HR Manager)
 */
router.delete(
  '/:id',
  authorize(['Admin', 'HR Manager']),
  idParamChain('id'),
  extractValidationErrors,
  auditLog(),
  trainingController.remove
);

/**
 * @route   POST /api/trainings/:id/enroll
 * @desc    Enroll self (or any employee if HR/Admin) in a training
 * @access  Private (any authenticated user)
 */
router.post(
  '/:id/enroll',
  idParamChain('id'),
  extractValidationErrors,
  auditLog(),
  trainingController.enroll
);

/**
 * @route   POST /api/trainings/:id/withdraw
 * @desc    Withdraw self (or any employee if HR/Admin)
 * @access  Private (any authenticated user)
 */
router.post(
  '/:id/withdraw',
  idParamChain('id'),
  extractValidationErrors,
  auditLog(),
  trainingController.withdraw
);

/**
 * @route   GET /api/trainings/:id/participants
 * @desc    Roster for a training
 * @access  Private (Admin, HR Manager, Department Manager)
 */
router.get(
  '/:id/participants',
  authorize(['Admin', 'HR Manager', 'Department Manager']),
  idParamChain('id'),
  extractValidationErrors,
  trainingController.getParticipants
);

module.exports = router;
