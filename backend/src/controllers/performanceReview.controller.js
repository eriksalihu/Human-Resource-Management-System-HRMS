/**
 * @file backend/src/controllers/performanceReview.controller.js
 * @description PerformanceReview controller with CRUD, self-service history, reviewer's pending queue, and statistics
 * @author Dev A
 */

const PerformanceReview = require('../models/PerformanceReview');
const Employee = require('../models/Employee');
const { AppError } = require('../middleware/errorHandler');

/** Roles that may create/edit any review (HR/Admin). */
const PRIVILEGED_ROLES = ['Admin', 'HR Manager'];

/**
 * Resolve the employee record for the authenticated user.
 * Throws 404 if the user has no linked employee row.
 */
const getRequestingEmployee = async (userId) => {
  const employee = await Employee.findByUserId(userId);
  if (!employee) {
    throw new AppError('No employee record linked to this user account', 404);
  }
  return employee;
};

/** Simple ISO date check (YYYY-MM-DD). */
const isValidDate = (s) => {
  if (!s || typeof s !== 'string') return false;
  const d = new Date(s);
  return !Number.isNaN(d.getTime());
};

/** Validate a rating is within [1.0, 5.0] and numeric. */
const isValidRating = (n) => {
  if (n === null || n === undefined || n === '') return true; // optional
  const num = Number(n);
  return !Number.isNaN(num) && num >= 1.0 && num <= 5.0;
};

/**
 * GET /api/performance-reviews
 * List reviews with filters (HR / Admin / Manager view).
 */
const getAll = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 10,
      employee_id,
      vleresues_id,
      department_id,
      periudha,
      from_date,
      to_date,
      sortBy = 'data_vleresimit',
      sortOrder = 'DESC',
    } = req.query;

    const result = await PerformanceReview.findAll({
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      employee_id: employee_id ? parseInt(employee_id, 10) : undefined,
      vleresues_id: vleresues_id ? parseInt(vleresues_id, 10) : undefined,
      department_id: department_id ? parseInt(department_id, 10) : undefined,
      periudha,
      from_date,
      to_date,
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
 * GET /api/performance-reviews/:id
 * Get a single review.
 */
const getById = async (req, res, next) => {
  try {
    const review = await PerformanceReview.findById(req.params.id);
    if (!review) {
      throw new AppError('Performance review not found', 404);
    }

    res.json({
      success: true,
      data: { review },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/performance-reviews/me
 * Reviews about the authenticated employee, plus their average rating.
 */
const getMyReviews = async (req, res, next) => {
  try {
    const employee = await getRequestingEmployee(req.user.id);
    const reviews = await PerformanceReview.findByEmployee(employee.id);
    const averageRating = await PerformanceReview.getAverageRating(employee.id);

    res.json({
      success: true,
      data: {
        employee_id: employee.id,
        reviews,
        average_rating: averageRating,
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/performance-reviews/to-complete
 * Reviews authored by the authenticated user (their reviewer queue).
 *
 * NOTE: Per roadmap this is "getReviewsToComplete" but since the table has no
 * draft/status column, we surface all reviews the user has written so far,
 * plus expose direct-reports who have no review for the current period via
 * a `missing_subordinates` array. Handy for a reviewer's dashboard.
 */
const getReviewsToComplete = async (req, res, next) => {
  try {
    const employee = await getRequestingEmployee(req.user.id);
    const written = await PerformanceReview.findByReviewer(employee.id);

    const subordinates = await Employee.getManagerSubordinates(employee.id);
    const { periudha } = req.query;

    let missing = subordinates;
    if (periudha) {
      const writtenForPeriod = new Set(
        written
          .filter((r) => r.periudha === periudha)
          .map((r) => r.employee_id)
      );
      missing = subordinates.filter((s) => !writtenForPeriod.has(s.id));
    }

    res.json({
      success: true,
      data: {
        reviewer_id: employee.id,
        written,
        missing_subordinates: missing,
        ...(periudha ? { periudha } : {}),
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/performance-reviews/statistics
 * Aggregated stats: average rating + bucketed rating distribution.
 * Optionally scoped by period and/or department.
 */
const getStatistics = async (req, res, next) => {
  try {
    const { periudha, department_id, employee_id } = req.query;
    const deptId = department_id ? parseInt(department_id, 10) : undefined;
    const empId = employee_id ? parseInt(employee_id, 10) : undefined;

    const distribution = await PerformanceReview.getRatingDistribution({
      periudha,
      department_id: deptId,
    });

    let averageRating = null;
    if (empId) {
      averageRating = await PerformanceReview.getAverageRating(empId);
    }

    res.json({
      success: true,
      data: {
        ...(periudha ? { periudha } : {}),
        ...(deptId ? { department_id: deptId } : {}),
        ...(empId ? { employee_id: empId, average_rating: averageRating } : {}),
        distribution,
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/performance-reviews
 * Create a new review. Reviewer defaults to the authenticated user unless
 * explicitly provided by HR/Admin acting on behalf of someone.
 */
const create = async (req, res, next) => {
  try {
    const {
      employee_id,
      vleresues_id,
      periudha,
      nota,
      pikat_forta,
      pikat_dobta,
      objektivat,
      data_vleresimit,
    } = req.body;

    if (!employee_id || !periudha || !data_vleresimit) {
      throw new AppError(
        'employee_id, periudha and data_vleresimit are required',
        400
      );
    }
    if (!isValidDate(data_vleresimit)) {
      throw new AppError('data_vleresimit must be a valid YYYY-MM-DD date', 400);
    }
    if (!isValidRating(nota)) {
      throw new AppError('nota must be a number between 1.0 and 5.0', 400);
    }

    const subject = await Employee.findById(employee_id);
    if (!subject) {
      throw new AppError('Specified employee does not exist', 404);
    }

    // Resolve reviewer. HR/Admin may explicitly set vleresues_id; everyone
    // else defaults to themselves.
    const requesterRoles = req.user.roles || [];
    const isPrivileged = requesterRoles.some((r) => PRIVILEGED_ROLES.includes(r));

    let reviewerId = null;
    if (vleresues_id !== undefined && vleresues_id !== null) {
      if (!isPrivileged) {
        // Regular users can only author reviews for themselves — force match.
        const author = await getRequestingEmployee(req.user.id);
        if (author.id !== Number(vleresues_id)) {
          throw new AppError(
            'You can only submit reviews authored by yourself',
            403
          );
        }
        reviewerId = author.id;
      } else {
        const reviewer = await Employee.findById(vleresues_id);
        if (!reviewer) {
          throw new AppError('Specified reviewer does not exist', 404);
        }
        reviewerId = reviewer.id;
      }
    } else {
      const author = await getRequestingEmployee(req.user.id);
      reviewerId = author.id;
    }

    if (Number(reviewerId) === Number(employee_id)) {
      throw new AppError('Employees cannot review themselves', 400);
    }

    const id = await PerformanceReview.create({
      employee_id,
      vleresues_id: reviewerId,
      periudha,
      nota,
      pikat_forta,
      pikat_dobta,
      objektivat,
      data_vleresimit,
    });
    const review = await PerformanceReview.findById(id);

    res.status(201).json({
      success: true,
      message: 'Performance review submitted successfully',
      data: { review },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/performance-reviews/:id
 * Update a review. Only the author reviewer may edit, unless HR/Admin.
 */
const update = async (req, res, next) => {
  try {
    const { id } = req.params;
    const existing = await PerformanceReview.findById(id);
    if (!existing) {
      throw new AppError('Performance review not found', 404);
    }

    // Authorisation: reviewer or HR/Admin
    const requesterRoles = req.user.roles || [];
    const isPrivileged = requesterRoles.some((r) => PRIVILEGED_ROLES.includes(r));
    if (!isPrivileged) {
      const author = await getRequestingEmployee(req.user.id);
      if (author.id !== existing.vleresues_id) {
        throw new AppError('You can only edit reviews you authored', 403);
      }
    }

    res.locals.auditOldValues = { ...existing };

    const {
      periudha,
      nota,
      pikat_forta,
      pikat_dobta,
      objektivat,
      data_vleresimit,
      vleresues_id,
    } = req.body;
    const updates = {};

    if (periudha !== undefined) updates.periudha = periudha;
    if (nota !== undefined) {
      if (!isValidRating(nota)) {
        throw new AppError('nota must be a number between 1.0 and 5.0', 400);
      }
      updates.nota = nota;
    }
    if (pikat_forta !== undefined) updates.pikat_forta = pikat_forta;
    if (pikat_dobta !== undefined) updates.pikat_dobta = pikat_dobta;
    if (objektivat !== undefined) updates.objektivat = objektivat;
    if (data_vleresimit !== undefined) {
      if (!isValidDate(data_vleresimit)) {
        throw new AppError('data_vleresimit must be a valid YYYY-MM-DD date', 400);
      }
      updates.data_vleresimit = data_vleresimit;
    }
    // Only HR/Admin may re-assign the reviewer.
    if (vleresues_id !== undefined && isPrivileged) {
      updates.vleresues_id = vleresues_id;
    }

    if (Object.keys(updates).length === 0) {
      throw new AppError('No fields to update', 400);
    }

    await PerformanceReview.update(id, updates);
    const review = await PerformanceReview.findById(id);

    res.json({
      success: true,
      message: 'Performance review updated successfully',
      data: { review },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/performance-reviews/:id
 * Hard-delete a review (Admin / HR only).
 */
const remove = async (req, res, next) => {
  try {
    const { id } = req.params;
    const existing = await PerformanceReview.findById(id);
    if (!existing) {
      throw new AppError('Performance review not found', 404);
    }

    res.locals.auditOldValues = { ...existing };
    await PerformanceReview.remove(id);

    res.json({
      success: true,
      message: 'Performance review deleted successfully',
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getAll,
  getById,
  getMyReviews,
  getReviewsToComplete,
  getStatistics,
  create,
  update,
  remove,
  PRIVILEGED_ROLES,
};
