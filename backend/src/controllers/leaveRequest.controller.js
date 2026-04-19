/**
 * @file backend/src/controllers/leaveRequest.controller.js
 * @description LeaveRequest controller with overlap validation, approval workflow, and self-service cancel
 * @author Dev A
 */

const LeaveRequest = require('../models/LeaveRequest');
const Employee = require('../models/Employee');
const { AppError } = require('../middleware/errorHandler');

/** Valid leave types — must match the ENUM in the LeaveRequests table. */
const VALID_TYPES = ['annual', 'sick', 'personal', 'maternity', 'paternity', 'unpaid'];

/** Valid status values — must match the ENUM. */
const VALID_STATUSES = ['pending', 'approved', 'rejected', 'cancelled'];

/**
 * Utility: parse a YYYY-MM-DD string into a Date (midnight UTC).
 * Returns null if invalid.
 */
const parseDate = (s) => {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
};

/**
 * Resolve the employee record for the authenticated user. Throws 404 if the
 * user has no linked employee row (e.g., an Admin with no employee profile).
 */
const getRequestingEmployee = async (userId) => {
  const employee = await Employee.findByUserId(userId);
  if (!employee) {
    throw new AppError('No employee record linked to this user account', 404);
  }
  return employee;
};

/**
 * GET /api/leave-requests
 * List leave requests with filters (HR / Admin view).
 */
const getAll = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 10,
      employee_id,
      department_id,
      statusi,
      lloji,
      from_date,
      to_date,
      sortBy = 'data_kerkeses',
      sortOrder = 'DESC',
    } = req.query;

    const result = await LeaveRequest.findAll({
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      employee_id: employee_id ? parseInt(employee_id, 10) : undefined,
      department_id: department_id ? parseInt(department_id, 10) : undefined,
      statusi,
      lloji,
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
 * GET /api/leave-requests/:id
 * Get a single leave request.
 */
const getById = async (req, res, next) => {
  try {
    const request = await LeaveRequest.findById(req.params.id);
    if (!request) {
      throw new AppError('Leave request not found', 404);
    }

    res.json({
      success: true,
      data: { request },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/leave-requests/me
 * All leave requests belonging to the authenticated employee.
 */
const getMyRequests = async (req, res, next) => {
  try {
    const employee = await getRequestingEmployee(req.user.id);
    const requests = await LeaveRequest.findByEmployee(employee.id);
    const balance = await LeaveRequest.getLeaveBalance(employee.id);

    res.json({
      success: true,
      data: { employee_id: employee.id, requests, balance },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/leave-requests/pending
 * All pending leave requests, optionally scoped to a department (for managers).
 */
const getPendingApprovals = async (req, res, next) => {
  try {
    const { department_id } = req.query;
    const pending = await LeaveRequest.findPending({
      department_id: department_id ? parseInt(department_id, 10) : undefined,
    });

    res.json({
      success: true,
      data: { pending },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/leave-requests
 * Create a new leave request for the authenticated employee.
 * Validates: date range sanity, type enum, and overlap with existing requests.
 */
const create = async (req, res, next) => {
  try {
    const { lloji, data_fillimit, data_perfundimit, arsyeja, employee_id } = req.body;

    if (!lloji || !data_fillimit || !data_perfundimit) {
      throw new AppError(
        'lloji, data_fillimit and data_perfundimit are required',
        400
      );
    }

    if (!VALID_TYPES.includes(lloji)) {
      throw new AppError(
        `Invalid lloji. Must be one of: ${VALID_TYPES.join(', ')}`,
        400
      );
    }

    const start = parseDate(data_fillimit);
    const end = parseDate(data_perfundimit);
    if (!start || !end) {
      throw new AppError('data_fillimit / data_perfundimit must be valid YYYY-MM-DD dates', 400);
    }
    if (end < start) {
      throw new AppError('data_perfundimit cannot be earlier than data_fillimit', 400);
    }

    // Resolve the employee. HR/Admin can create on behalf of any employee,
    // regular employees always create for themselves.
    let targetEmployeeId;
    const requesterRoles = req.user.roles || [];
    const isPrivileged = requesterRoles.some((r) => ['Admin', 'HR Manager'].includes(r));

    if (isPrivileged && employee_id) {
      const exists = await Employee.findById(employee_id);
      if (!exists) throw new AppError('Specified employee does not exist', 404);
      targetEmployeeId = employee_id;
    } else {
      const employee = await getRequestingEmployee(req.user.id);
      targetEmployeeId = employee.id;
    }

    // Prevent overlapping with any pending/approved request
    const conflict = await LeaveRequest.checkOverlap(
      targetEmployeeId,
      data_fillimit,
      data_perfundimit
    );
    if (conflict) {
      throw new AppError(
        `Requested dates overlap with existing request #${conflict.id} ` +
          `(${conflict.data_fillimit} – ${conflict.data_perfundimit}, ${conflict.statusi})`,
        409
      );
    }

    const requestId = await LeaveRequest.create({
      employee_id: targetEmployeeId,
      lloji,
      data_fillimit,
      data_perfundimit,
      arsyeja,
    });

    const request = await LeaveRequest.findById(requestId);

    res.status(201).json({
      success: true,
      message: 'Leave request submitted successfully',
      data: { request },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/leave-requests/:id/approve
 * Approve a pending leave request (manager / HR / admin only).
 */
const approve = async (req, res, next) => {
  try {
    const { id } = req.params;
    const existing = await LeaveRequest.findById(id);
    if (!existing) {
      throw new AppError('Leave request not found', 404);
    }
    if (existing.statusi !== 'pending') {
      throw new AppError(
        `Only pending requests can be approved (current status: ${existing.statusi})`,
        409
      );
    }

    res.locals.auditOldValues = { ...existing };

    const approver = await getRequestingEmployee(req.user.id);
    await LeaveRequest.setApprovalStatus(id, 'approved', approver.id);

    const request = await LeaveRequest.findById(id);

    res.json({
      success: true,
      message: 'Leave request approved',
      data: { request },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/leave-requests/:id/reject
 * Reject a pending leave request (manager / HR / admin only).
 */
const reject = async (req, res, next) => {
  try {
    const { id } = req.params;
    const existing = await LeaveRequest.findById(id);
    if (!existing) {
      throw new AppError('Leave request not found', 404);
    }
    if (existing.statusi !== 'pending') {
      throw new AppError(
        `Only pending requests can be rejected (current status: ${existing.statusi})`,
        409
      );
    }

    res.locals.auditOldValues = { ...existing };

    const approver = await getRequestingEmployee(req.user.id);
    await LeaveRequest.setApprovalStatus(id, 'rejected', approver.id);

    const request = await LeaveRequest.findById(id);

    res.json({
      success: true,
      message: 'Leave request rejected',
      data: { request },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/leave-requests/:id/cancel
 * Cancel a pending leave request (owner only, or HR/Admin).
 */
const cancel = async (req, res, next) => {
  try {
    const { id } = req.params;
    const existing = await LeaveRequest.findById(id);
    if (!existing) {
      throw new AppError('Leave request not found', 404);
    }
    if (existing.statusi !== 'pending') {
      throw new AppError(
        `Only pending requests can be cancelled (current status: ${existing.statusi})`,
        409
      );
    }

    // Authorisation: owner or HR/Admin
    const requesterRoles = req.user.roles || [];
    const isPrivileged = requesterRoles.some((r) => ['Admin', 'HR Manager'].includes(r));
    if (!isPrivileged) {
      const employee = await getRequestingEmployee(req.user.id);
      if (employee.id !== existing.employee_id) {
        throw new AppError('You can only cancel your own leave requests', 403);
      }
    }

    res.locals.auditOldValues = { ...existing };

    await LeaveRequest.cancel(id);
    const request = await LeaveRequest.findById(id);

    res.json({
      success: true,
      message: 'Leave request cancelled',
      data: { request },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/leave-requests/:id
 * Update a pending leave request's dates / reason / type (owner or HR/Admin).
 */
const update = async (req, res, next) => {
  try {
    const { id } = req.params;
    const existing = await LeaveRequest.findById(id);
    if (!existing) {
      throw new AppError('Leave request not found', 404);
    }
    if (existing.statusi !== 'pending') {
      throw new AppError(
        `Only pending requests can be edited (current status: ${existing.statusi})`,
        409
      );
    }

    // Authorisation: owner or HR/Admin
    const requesterRoles = req.user.roles || [];
    const isPrivileged = requesterRoles.some((r) => ['Admin', 'HR Manager'].includes(r));
    if (!isPrivileged) {
      const employee = await getRequestingEmployee(req.user.id);
      if (employee.id !== existing.employee_id) {
        throw new AppError('You can only edit your own leave requests', 403);
      }
    }

    res.locals.auditOldValues = { ...existing };

    const { lloji, data_fillimit, data_perfundimit, arsyeja } = req.body;
    const updates = {};

    if (lloji !== undefined) {
      if (!VALID_TYPES.includes(lloji)) {
        throw new AppError(
          `Invalid lloji. Must be one of: ${VALID_TYPES.join(', ')}`,
          400
        );
      }
      updates.lloji = lloji;
    }
    if (data_fillimit !== undefined) updates.data_fillimit = data_fillimit;
    if (data_perfundimit !== undefined) updates.data_perfundimit = data_perfundimit;
    if (arsyeja !== undefined) updates.arsyeja = arsyeja;

    // Revalidate date range + overlap on date changes
    const effectiveStart = updates.data_fillimit ?? existing.data_fillimit;
    const effectiveEnd = updates.data_perfundimit ?? existing.data_perfundimit;
    const s = parseDate(effectiveStart);
    const e = parseDate(effectiveEnd);
    if (!s || !e) {
      throw new AppError('Invalid date range', 400);
    }
    if (e < s) {
      throw new AppError('data_perfundimit cannot be earlier than data_fillimit', 400);
    }

    if (updates.data_fillimit || updates.data_perfundimit) {
      const conflict = await LeaveRequest.checkOverlap(
        existing.employee_id,
        effectiveStart,
        effectiveEnd,
        id
      );
      if (conflict) {
        throw new AppError(
          `Requested dates overlap with existing request #${conflict.id}`,
          409
        );
      }
    }

    if (Object.keys(updates).length === 0) {
      throw new AppError('No fields to update', 400);
    }

    await LeaveRequest.update(id, updates);
    const request = await LeaveRequest.findById(id);

    res.json({
      success: true,
      message: 'Leave request updated successfully',
      data: { request },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/leave-requests/:id
 * Hard-delete a leave request (Admin only, rarely used).
 */
const remove = async (req, res, next) => {
  try {
    const { id } = req.params;
    const existing = await LeaveRequest.findById(id);
    if (!existing) {
      throw new AppError('Leave request not found', 404);
    }

    res.locals.auditOldValues = { ...existing };
    await LeaveRequest.remove(id);

    res.json({
      success: true,
      message: 'Leave request deleted successfully',
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getAll,
  getById,
  getMyRequests,
  getPendingApprovals,
  create,
  approve,
  reject,
  cancel,
  update,
  remove,
  VALID_STATUSES,
  VALID_TYPES,
};
