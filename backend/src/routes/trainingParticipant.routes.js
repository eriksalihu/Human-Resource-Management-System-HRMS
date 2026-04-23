/**
 * @file backend/src/routes/trainingParticipant.routes.js
 * @description Participant-side routes — status updates and rating submission
 * @author Dev A
 *
 * Mounted at /api/trainings/participants so paths read as
 *   POST /api/trainings/participants/:participantId/rating
 *   PUT  /api/trainings/participants/:participantId/status
 */

const express = require('express');
const trainingController = require('../controllers/training.controller');
const authenticate = require('../middleware/auth');
const authorize = require('../middleware/authorize');
const { extractValidationErrors, idParamChain } = require('../middleware/validate');
const { auditLog } = require('../middleware/auditLog');

const router = express.Router();

router.use(authenticate);

/**
 * @route   PUT /api/trainings/participants/:participantId/status
 * @desc    Update a participant's enrollment status
 * @access  Private (Admin, HR Manager)
 */
router.put(
  '/:participantId/status',
  authorize(['Admin', 'HR Manager']),
  idParamChain('participantId'),
  extractValidationErrors,
  auditLog(),
  trainingController.updateParticipantStatus
);

/**
 * @route   POST /api/trainings/participants/:participantId/rating
 * @desc    Submit a post-training rating (owner or HR/Admin)
 * @access  Private (any authenticated user)
 */
router.post(
  '/:participantId/rating',
  idParamChain('participantId'),
  extractValidationErrors,
  auditLog(),
  trainingController.rateParticipation
);

module.exports = router;
