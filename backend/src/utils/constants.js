/**
 * @file backend/src/utils/constants.js
 * @description Centralized application constants and enums
 * @author Dev A
 */

/**
 * User role names — must match rows in the Roles table.
 */
const USER_ROLES = Object.freeze({
  ADMIN: 'Admin',
  HR_MANAGER: 'HR Manager',
  DEPARTMENT_MANAGER: 'Department Manager',
  EMPLOYEE: 'Employee',
});

/**
 * Employment contract types.
 */
const CONTRACT_TYPES = Object.freeze({
  FULL_TIME: 'Full-time',
  PART_TIME: 'Part-time',
  CONTRACT: 'Contract',
  INTERN: 'Intern',
});

/**
 * Employee statuses.
 */
const EMPLOYEE_STATUSES = Object.freeze({
  ACTIVE: 'Active',
  ON_LEAVE: 'On Leave',
  TERMINATED: 'Terminated',
  SUSPENDED: 'Suspended',
});

/**
 * Leave types for leave requests.
 */
const LEAVE_TYPES = Object.freeze({
  ANNUAL: 'Annual',
  SICK: 'Sick',
  MATERNITY: 'Maternity',
  PATERNITY: 'Paternity',
  UNPAID: 'Unpaid',
  BEREAVEMENT: 'Bereavement',
});

/**
 * Leave request statuses.
 */
const LEAVE_STATUSES = Object.freeze({
  PENDING: 'Pending',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
});

/**
 * Daily attendance statuses.
 */
const ATTENDANCE_STATUSES = Object.freeze({
  PRESENT: 'Present',
  ABSENT: 'Absent',
  LATE: 'Late',
  HALF_DAY: 'Half-day',
  ON_LEAVE: 'On Leave',
});

/**
 * Document types stored in the Documents table.
 */
const DOCUMENT_TYPES = Object.freeze({
  CONTRACT: 'Contract',
  ID: 'ID',
  CV: 'CV',
  CERTIFICATE: 'Certificate',
  PAYSLIP: 'Payslip',
  OTHER: 'Other',
});

/**
 * Salary record statuses.
 */
const SALARY_STATUSES = Object.freeze({
  PENDING: 'Pending',
  PROCESSED: 'Processed',
  PAID: 'Paid',
  CANCELLED: 'Cancelled',
});

/**
 * Training statuses.
 */
const TRAINING_STATUSES = Object.freeze({
  SCHEDULED: 'Scheduled',
  IN_PROGRESS: 'In Progress',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
});

/**
 * Pagination defaults used across list endpoints.
 */
const PAGINATION_DEFAULTS = Object.freeze({
  PAGE: 1,
  LIMIT: 10,
  MAX_LIMIT: 100,
  SORT_BY: 'created_at',
  SORT_ORDER: 'DESC',
});

module.exports = {
  USER_ROLES,
  CONTRACT_TYPES,
  EMPLOYEE_STATUSES,
  LEAVE_TYPES,
  LEAVE_STATUSES,
  ATTENDANCE_STATUSES,
  DOCUMENT_TYPES,
  SALARY_STATUSES,
  TRAINING_STATUSES,
  PAGINATION_DEFAULTS,
};
