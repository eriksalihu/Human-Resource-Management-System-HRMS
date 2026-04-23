/**
 * @file backend/src/controllers/training.controller.js
 * @description Training controller — CRUD, enrollment/withdrawal with capacity checks, roster, history, and calendar feed
 * @author Dev A
 */

const Training = require('../models/Training');
const TrainingParticipant = require('../models/TrainingParticipant');
const Employee = require('../models/Employee');
const { AppError } = require('../middleware/errorHandler');

/** Roles that may create/edit/delete trainings. */
const PRIVILEGED_ROLES = ['Admin', 'HR Manager'];

/** Simple ISO date check (YYYY-MM-DD). */
const isValidDate = (s) => {
  if (!s || typeof s !== 'string') return false;
  const d = new Date(s);
  return !Number.isNaN(d.getTime());
};

/** Rating must be numeric in [1.0, 5.0]. */
const isValidRating = (n) => {
  const num = Number(n);
  return !Number.isNaN(num) && num >= 1.0 && num <= 5.0;
};

/** Look up the employee row for a given user (or throw 404). */
const getRequestingEmployee = async (userId) => {
  const employee = await Employee.findByUserId(userId);
  if (!employee) {
    throw new AppError('No employee record linked to this user account', 404);
  }
  return employee;
};

/**
 * GET /api/trainings
 * List trainings with pagination and filters.
 */
const getAll = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 10,
      statusi,
      trajner,
      from_date,
      to_date,
      search,
      sortBy = 'data_fillimit',
      sortOrder = 'DESC',
    } = req.query;

    const result = await Training.findAll({
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      statusi,
      trajner,
      from_date,
      to_date,
      search,
      sortBy,
      sortOrder,
    });

    res.json({
      success: true,
      data: result.data,
      pagination: result.pagination,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/trainings/upcoming
 * Upcoming trainings (calendar feed / dashboard widget).
 */
const getUpcoming = async (req, res, next) => {
  try {
    const { limit = 50 } = req.query;
    const rows = await Training.getUpcoming({ limit: parseInt(limit, 10) });
    res.json({ success: true, data: { trainings: rows } });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/trainings/ongoing
 * Trainings currently in progress.
 */
const getOngoing = async (_req, res, next) => {
  try {
    const rows = await Training.getOngoing();
    res.json({ success: true, data: { trainings: rows } });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/trainings/calendar
 * Lightweight calendar payload for a date range.
 */
const getCalendar = async (req, res, next) => {
  try {
    const { from_date, to_date } = req.query;

    if (from_date && !isValidDate(from_date)) {
      throw new AppError('Invalid from_date (expected YYYY-MM-DD)', 400);
    }
    if (to_date && !isValidDate(to_date)) {
      throw new AppError('Invalid to_date (expected YYYY-MM-DD)', 400);
    }

    const result = await Training.findAll({
      page: 1,
      limit: 500,
      from_date,
      to_date,
      sortBy: 'data_fillimit',
      sortOrder: 'ASC',
    });

    const events = result.data.map((t) => ({
      id: t.id,
      titulli: t.titulli,
      data_fillimit: t.data_fillimit,
      data_perfundimit: t.data_perfundimit,
      statusi: t.statusi,
      lokacioni: t.lokacioni,
      participant_count: Number(t.participant_count || 0),
      kapaciteti: t.kapaciteti,
    }));

    res.json({ success: true, data: { events } });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/trainings/:id
 * Fetch a single training.
 */
const getById = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const training = await Training.findById(id);
    if (!training) {
      throw new AppError('Training not found', 404);
    }
    res.json({ success: true, data: { training } });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/trainings
 * Create a training (Admin / HR only).
 */
const create = async (req, res, next) => {
  try {
    const {
      titulli,
      pershkrimi,
      trajner,
      data_fillimit,
      data_perfundimit,
      lokacioni,
      kapaciteti,
      statusi,
    } = req.body;

    if (!titulli || typeof titulli !== 'string') {
      throw new AppError('titulli is required', 400);
    }
    if (!isValidDate(data_fillimit)) {
      throw new AppError('data_fillimit is required (YYYY-MM-DD)', 400);
    }
    if (!isValidDate(data_perfundimit)) {
      throw new AppError('data_perfundimit is required (YYYY-MM-DD)', 400);
    }
    if (new Date(data_perfundimit) < new Date(data_fillimit)) {
      throw new AppError('data_perfundimit must be on or after data_fillimit', 400);
    }
    if (kapaciteti != null) {
      const cap = parseInt(kapaciteti, 10);
      if (Number.isNaN(cap) || cap < 1) {
        throw new AppError('kapaciteti must be a positive integer', 400);
      }
    }
    if (statusi && !Training.VALID_STATUSES.includes(statusi)) {
      throw new AppError(
        `statusi must be one of: ${Training.VALID_STATUSES.join(', ')}`,
        400
      );
    }

    const id = await Training.create({
      titulli,
      pershkrimi,
      trajner,
      data_fillimit,
      data_perfundimit,
      lokacioni,
      kapaciteti: kapaciteti != null ? parseInt(kapaciteti, 10) : undefined,
      statusi,
    });

    const training = await Training.findById(id);
    res.status(201).json({
      success: true,
      message: 'Training created',
      data: { training },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/trainings/:id
 * Update a training (Admin / HR only).
 */
const update = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);

    const existing = await Training.findById(id);
    if (!existing) {
      throw new AppError('Training not found', 404);
    }

    const allowed = [
      'titulli',
      'pershkrimi',
      'trajner',
      'data_fillimit',
      'data_perfundimit',
      'lokacioni',
      'kapaciteti',
      'statusi',
    ];

    const patch = {};
    for (const key of allowed) {
      if (Object.prototype.hasOwnProperty.call(req.body, key)) {
        patch[key] = req.body[key];
      }
    }

    if (patch.data_fillimit && !isValidDate(patch.data_fillimit)) {
      throw new AppError('Invalid data_fillimit (expected YYYY-MM-DD)', 400);
    }
    if (patch.data_perfundimit && !isValidDate(patch.data_perfundimit)) {
      throw new AppError('Invalid data_perfundimit (expected YYYY-MM-DD)', 400);
    }

    const finalStart = patch.data_fillimit || existing.data_fillimit;
    const finalEnd   = patch.data_perfundimit || existing.data_perfundimit;
    if (new Date(finalEnd) < new Date(finalStart)) {
      throw new AppError('data_perfundimit must be on or after data_fillimit', 400);
    }

    if (patch.kapaciteti != null) {
      const cap = parseInt(patch.kapaciteti, 10);
      if (Number.isNaN(cap) || cap < 1) {
        throw new AppError('kapaciteti must be a positive integer', 400);
      }
      // Don't let admins shrink capacity below the current enrolled count.
      const enrolled = await Training.getParticipantCount(id);
      if (cap < enrolled) {
        throw new AppError(
          `kapaciteti (${cap}) cannot be less than current enrolled count (${enrolled})`,
          400
        );
      }
      patch.kapaciteti = cap;
    }

    if (patch.statusi && !Training.VALID_STATUSES.includes(patch.statusi)) {
      throw new AppError(
        `statusi must be one of: ${Training.VALID_STATUSES.join(', ')}`,
        400
      );
    }

    if (Object.keys(patch).length === 0) {
      throw new AppError('No valid fields provided for update', 400);
    }

    await Training.update(id, patch);
    const training = await Training.findById(id);

    res.json({
      success: true,
      message: 'Training updated',
      data: { training },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/trainings/:id
 * Hard-delete a training (Admin / HR only).
 */
const remove = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const existing = await Training.findById(id);
    if (!existing) {
      throw new AppError('Training not found', 404);
    }
    await Training.remove(id);
    res.json({ success: true, message: 'Training deleted' });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/trainings/:id/enroll
 * Enroll the caller's own employee record; HR/Admin may enroll any employee
 * by supplying `employee_id` in the body. Rejects when capacity is full or
 * the training is already completed/cancelled.
 */
const enroll = async (req, res, next) => {
  try {
    const trainingId = parseInt(req.params.id, 10);
    const training = await Training.findById(trainingId);
    if (!training) {
      throw new AppError('Training not found', 404);
    }
    if (['completed', 'cancelled'].includes(training.statusi)) {
      throw new AppError(
        `Cannot enroll in a ${training.statusi} training`,
        400
      );
    }

    const roles = req.user?.roles || [];
    const isPrivileged = roles.some((r) => PRIVILEGED_ROLES.includes(r));

    let employeeId;
    if (isPrivileged && req.body && req.body.employee_id) {
      employeeId = parseInt(req.body.employee_id, 10);
      if (Number.isNaN(employeeId)) {
        throw new AppError('Invalid employee_id', 400);
      }
      const emp = await Employee.findById(employeeId);
      if (!emp) {
        throw new AppError('Employee not found', 404);
      }
    } else {
      const me = await getRequestingEmployee(req.user.id);
      employeeId = me.id;
    }

    const { available, capacity, taken } = await Training.isCapacityAvailable(
      trainingId
    );
    if (!available) {
      throw new AppError(
        `Training is full (capacity ${capacity}, enrolled ${taken})`,
        409
      );
    }

    const { id, alreadyEnrolled } = await TrainingParticipant.enroll({
      training_id: trainingId,
      employee_id: employeeId,
    });

    if (alreadyEnrolled) {
      // Surface the existing row so clients can display it.
      const existing = await TrainingParticipant.findByTrainingAndEmployee(
        trainingId,
        employeeId
      );
      return res.status(409).json({
        success: false,
        message: 'Employee is already enrolled in this training',
        data: { participant: existing },
      });
    }

    const participant = await TrainingParticipant.findById(id);
    res.status(201).json({
      success: true,
      message: 'Enrolled successfully',
      data: { participant },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/trainings/:id/withdraw
 * Withdraw the caller (or an arbitrary employee, if HR/Admin).
 */
const withdraw = async (req, res, next) => {
  try {
    const trainingId = parseInt(req.params.id, 10);
    const training = await Training.findById(trainingId);
    if (!training) {
      throw new AppError('Training not found', 404);
    }

    const roles = req.user?.roles || [];
    const isPrivileged = roles.some((r) => PRIVILEGED_ROLES.includes(r));

    let employeeId;
    if (isPrivileged && req.body && req.body.employee_id) {
      employeeId = parseInt(req.body.employee_id, 10);
      if (Number.isNaN(employeeId)) {
        throw new AppError('Invalid employee_id', 400);
      }
    } else {
      const me = await getRequestingEmployee(req.user.id);
      employeeId = me.id;
    }

    const existing = await TrainingParticipant.findByTrainingAndEmployee(
      trainingId,
      employeeId
    );
    if (!existing) {
      throw new AppError('Enrollment not found', 404);
    }
    if (existing.statusi === 'completed') {
      throw new AppError('Cannot withdraw from a completed training', 400);
    }

    await TrainingParticipant.withdraw(trainingId, employeeId);
    const participant = await TrainingParticipant.findByTrainingAndEmployee(
      trainingId,
      employeeId
    );

    res.json({
      success: true,
      message: 'Withdrawn successfully',
      data: { participant },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/trainings/:id/participants
 * Roster for a training (Admin / HR / Manager).
 */
const getParticipants = async (req, res, next) => {
  try {
    const trainingId = parseInt(req.params.id, 10);
    const training = await Training.findById(trainingId);
    if (!training) {
      throw new AppError('Training not found', 404);
    }
    const { statusi } = req.query;
    const participants = await TrainingParticipant.getByTraining(trainingId, {
      statusi,
    });

    res.json({
      success: true,
      data: {
        training_id: trainingId,
        count: participants.length,
        capacity: Number(training.kapaciteti || 0),
        participants,
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/trainings/participants/:participantId/status
 * Update a participant's status (Admin / HR).
 */
const updateParticipantStatus = async (req, res, next) => {
  try {
    const participantId = parseInt(req.params.participantId, 10);
    const { statusi } = req.body;

    if (!TrainingParticipant.VALID_STATUSES.includes(statusi)) {
      throw new AppError(
        `statusi must be one of: ${TrainingParticipant.VALID_STATUSES.join(', ')}`,
        400
      );
    }

    const existing = await TrainingParticipant.findById(participantId);
    if (!existing) {
      throw new AppError('Participant not found', 404);
    }

    await TrainingParticipant.updateStatus(participantId, statusi);
    const participant = await TrainingParticipant.findById(participantId);
    res.json({
      success: true,
      message: 'Participant status updated',
      data: { participant },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/trainings/participants/:participantId/rating
 * Submit a post-training rating. The rater must own the enrollment (or be
 * HR/Admin); the enrollment must not already be 'dropped' or 'no-show'.
 */
const rateParticipation = async (req, res, next) => {
  try {
    const participantId = parseInt(req.params.participantId, 10);
    const { vleresimi } = req.body;

    if (!isValidRating(vleresimi)) {
      throw new AppError('vleresimi must be a number between 1.0 and 5.0', 400);
    }

    const existing = await TrainingParticipant.findById(participantId);
    if (!existing) {
      throw new AppError('Participant not found', 404);
    }
    if (['dropped', 'no-show'].includes(existing.statusi)) {
      throw new AppError(
        `Cannot rate a ${existing.statusi} enrollment`,
        400
      );
    }

    const roles = req.user?.roles || [];
    const isPrivileged = roles.some((r) => PRIVILEGED_ROLES.includes(r));
    if (!isPrivileged) {
      const me = await getRequestingEmployee(req.user.id);
      if (me.id !== existing.employee_id) {
        throw new AppError(
          'You can only rate your own training enrollments',
          403
        );
      }
    }

    await TrainingParticipant.addRating(participantId, Number(vleresimi));
    const participant = await TrainingParticipant.findById(participantId);
    res.json({
      success: true,
      message: 'Rating submitted',
      data: { participant },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/trainings/my
 * Self-service: the caller's own training history.
 */
const getMyTrainings = async (req, res, next) => {
  try {
    const me = await getRequestingEmployee(req.user.id);
    const { statusi } = req.query;
    const trainings = await TrainingParticipant.getByEmployee(me.id, {
      statusi,
    });
    res.json({
      success: true,
      data: {
        employee_id: me.id,
        count: trainings.length,
        trainings,
      },
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getAll,
  getUpcoming,
  getOngoing,
  getCalendar,
  getById,
  create,
  update,
  remove,
  enroll,
  withdraw,
  getParticipants,
  updateParticipantStatus,
  rateParticipation,
  getMyTrainings,
};
