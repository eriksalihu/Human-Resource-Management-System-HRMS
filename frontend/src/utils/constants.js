/**
 * @file frontend/src/utils/constants.js
 * @description Centralised frontend constants — API URL, role names, enum value labels, pagination defaults, and status-to-color class maps for consistent display
 * @author Dev A
 *
 * Anything that's currently being re-defined inline across multiple
 * components belongs here. The point isn't to enumerate every magic
 * string in the codebase — it's to give the components that *should*
 * agree on a value (e.g. the leave-type enum mirrored from the database)
 * a single source of truth they can import.
 */

/* ──────────────────────────────────────────────────────────────────── */
/* API                                                                   */
/* ──────────────────────────────────────────────────────────────────── */

/**
 * Base URL for API calls. Reads from the `VITE_API_BASE_URL` build-time
 * env var with a sensible local fallback. Must include the `/api` prefix
 * since every router is mounted under it.
 */
export const API_BASE_URL =
  import.meta?.env?.VITE_API_BASE_URL || 'http://localhost:5000/api';

/* ──────────────────────────────────────────────────────────────────── */
/* Roles                                                                 */
/* ──────────────────────────────────────────────────────────────────── */

/**
 * Canonical role names. Backend's `Roles.name` column uses these exact
 * strings — keep in sync with `roles.seed.js`. Components testing
 * `user.roles.includes(ROLES.ADMIN)` against this object will fail loudly
 * (string mismatch → 403) if the backend names ever change.
 */
export const ROLES = Object.freeze({
  ADMIN: 'Admin',
  HR_MANAGER: 'HR Manager',
  DEPARTMENT_MANAGER: 'Department Manager',
  EMPLOYEE: 'Employee',
});

/** Convenience grouping used by route guards. */
export const ROLE_GROUPS = Object.freeze({
  HR: [ROLES.ADMIN, ROLES.HR_MANAGER],
  PRIVILEGED: [ROLES.ADMIN, ROLES.HR_MANAGER, ROLES.DEPARTMENT_MANAGER],
  ANY: [ROLES.ADMIN, ROLES.HR_MANAGER, ROLES.DEPARTMENT_MANAGER, ROLES.EMPLOYEE],
});

/* ──────────────────────────────────────────────────────────────────── */
/* Employee enums                                                        */
/* ──────────────────────────────────────────────────────────────────── */

/** Mirror of the `Employees.lloji_kontrates` ENUM. */
export const CONTRACT_TYPES = Object.freeze([
  { value: 'full-time',  label: 'Full-time' },
  { value: 'part-time',  label: 'Part-time' },
  { value: 'contract',   label: 'Contract' },
  { value: 'intern',     label: 'Intern' },
]);

/** Mirror of the `Employees.statusi` ENUM. */
export const EMPLOYEE_STATUSES = Object.freeze([
  { value: 'active',     label: 'Active' },
  { value: 'inactive',   label: 'Inactive' },
  { value: 'suspended',  label: 'Suspended' },
  { value: 'terminated', label: 'Terminated' },
]);

/* ──────────────────────────────────────────────────────────────────── */
/* Leave enums                                                           */
/* ──────────────────────────────────────────────────────────────────── */

/** Mirror of the `LeaveRequests.lloji` ENUM. */
export const LEAVE_TYPES = Object.freeze([
  { value: 'annual',    label: 'Annual' },
  { value: 'sick',      label: 'Sick' },
  { value: 'personal',  label: 'Personal' },
  { value: 'maternity', label: 'Maternity' },
  { value: 'paternity', label: 'Paternity' },
  { value: 'unpaid',    label: 'Unpaid' },
]);

/** Mirror of the `LeaveRequests.statusi` ENUM. */
export const LEAVE_STATUSES = Object.freeze([
  { value: 'pending',   label: 'Pending' },
  { value: 'approved',  label: 'Approved' },
  { value: 'rejected',  label: 'Rejected' },
  { value: 'cancelled', label: 'Cancelled' },
]);

/* ──────────────────────────────────────────────────────────────────── */
/* Attendance enums                                                      */
/* ──────────────────────────────────────────────────────────────────── */

/** Mirror of the `Attendances.statusi` ENUM. */
export const ATTENDANCE_STATUSES = Object.freeze([
  { value: 'present',   label: 'Present' },
  { value: 'absent',    label: 'Absent' },
  { value: 'late',      label: 'Late' },
  { value: 'half-day',  label: 'Half day' },
  { value: 'remote',    label: 'Remote' },
]);

/* ──────────────────────────────────────────────────────────────────── */
/* Document enums                                                        */
/* ──────────────────────────────────────────────────────────────────── */

/** Mirror of the `Documents.lloji` ENUM. */
export const DOCUMENT_TYPES = Object.freeze([
  { value: 'contract',    label: 'Contract' },
  { value: 'id-card',     label: 'ID card' },
  { value: 'certificate', label: 'Certificate' },
  { value: 'resume',      label: 'Resume' },
  { value: 'other',       label: 'Other' },
]);

/* ──────────────────────────────────────────────────────────────────── */
/* Salary / payroll enums                                                */
/* ──────────────────────────────────────────────────────────────────── */

/** Mirror of the `Salaries.statusi` ENUM. */
export const SALARY_STATUSES = Object.freeze([
  { value: 'pending',   label: 'Pending' },
  { value: 'processed', label: 'Processed' },
  { value: 'paid',      label: 'Paid' },
  { value: 'cancelled', label: 'Cancelled' },
]);

/* ──────────────────────────────────────────────────────────────────── */
/* Training enums                                                        */
/* ──────────────────────────────────────────────────────────────────── */

/** Mirror of the `Trainings.statusi` ENUM. */
export const TRAINING_STATUSES = Object.freeze([
  { value: 'upcoming',  label: 'Upcoming' },
  { value: 'ongoing',   label: 'Ongoing' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
]);

/** Mirror of the `TrainingParticipants.statusi` ENUM. */
export const PARTICIPANT_STATUSES = Object.freeze([
  { value: 'enrolled',  label: 'Enrolled' },
  { value: 'completed', label: 'Completed' },
  { value: 'dropped',   label: 'Dropped' },
  { value: 'no-show',   label: 'No-show' },
]);

/* ──────────────────────────────────────────────────────────────────── */
/* Notification enums                                                    */
/* ──────────────────────────────────────────────────────────────────── */

/** Mirror of the `Notifications.type` ENUM. */
export const NOTIFICATION_TYPES = Object.freeze([
  { value: 'info',    label: 'Info' },
  { value: 'success', label: 'Success' },
  { value: 'warning', label: 'Warning' },
  { value: 'error',   label: 'Error' },
]);

/* ──────────────────────────────────────────────────────────────────── */
/* Pagination defaults                                                   */
/* ──────────────────────────────────────────────────────────────────── */

/**
 * Pagination defaults shared between list views. Server caps `limit` at
 * 100 (validate middleware), so PAGE_SIZE_OPTIONS reflects that ceiling.
 */
export const PAGINATION = Object.freeze({
  DEFAULT_PAGE: 1,
  DEFAULT_PAGE_SIZE: 10,
  PAGE_SIZE_OPTIONS: [10, 25, 50, 100],
  MAX_PAGE_SIZE: 100,
});

/* ──────────────────────────────────────────────────────────────────── */
/* Status → Tailwind class maps                                          */
/* ──────────────────────────────────────────────────────────────────── */

/**
 * Tailwind classes per status string for badge rendering.
 * Each map returns ring + bg + text classes you can splat into a
 * `<span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${cls}">`
 *
 * Components that already inline these shouldn't be retro-fitted in this
 * commit — that's a future cleanup. New components should pull from here
 * to keep colors consistent across the app.
 */
export const STATUS_COLORS = Object.freeze({
  // Leave statuses
  leave: {
    pending:   'bg-yellow-50 text-yellow-800 ring-yellow-600/20',
    approved:  'bg-green-50 text-green-700 ring-green-600/20',
    rejected:  'bg-red-50 text-red-700 ring-red-600/20',
    cancelled: 'bg-gray-50 text-gray-700 ring-gray-600/20',
  },

  // Salary statuses
  salary: {
    pending:   'bg-yellow-50 text-yellow-800 ring-yellow-600/20',
    processed: 'bg-blue-50 text-blue-700 ring-blue-600/20',
    paid:      'bg-green-50 text-green-700 ring-green-600/20',
    cancelled: 'bg-gray-50 text-gray-700 ring-gray-600/20',
  },

  // Attendance statuses
  attendance: {
    present:    'bg-green-50 text-green-700 ring-green-600/20',
    absent:     'bg-red-50 text-red-700 ring-red-600/20',
    late:       'bg-yellow-50 text-yellow-800 ring-yellow-600/20',
    'half-day': 'bg-amber-50 text-amber-800 ring-amber-600/20',
    remote:     'bg-blue-50 text-blue-700 ring-blue-600/20',
  },

  // Training statuses
  training: {
    upcoming:  'bg-blue-50 text-blue-700 ring-blue-600/20',
    ongoing:   'bg-green-50 text-green-700 ring-green-600/20',
    completed: 'bg-gray-50 text-gray-700 ring-gray-600/20',
    cancelled: 'bg-red-50 text-red-700 ring-red-600/20',
  },

  // Participant statuses
  participant: {
    enrolled:  'bg-blue-50 text-blue-700 ring-blue-600/20',
    completed: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
    dropped:   'bg-amber-50 text-amber-800 ring-amber-600/20',
    'no-show': 'bg-red-50 text-red-700 ring-red-600/20',
  },

  // Employee statuses
  employee: {
    active:     'bg-green-50 text-green-700 ring-green-600/20',
    inactive:   'bg-gray-50 text-gray-700 ring-gray-600/20',
    suspended:  'bg-amber-50 text-amber-800 ring-amber-600/20',
    terminated: 'bg-red-50 text-red-700 ring-red-600/20',
  },

  // Generic notification types
  notification: {
    info:    'bg-sky-50 text-sky-700 ring-sky-600/20',
    success: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
    warning: 'bg-amber-50 text-amber-800 ring-amber-600/20',
    error:   'bg-rose-50 text-rose-700 ring-rose-600/20',
  },
});

/**
 * Helper: look up a status color from the map with a graceful neutral
 * fallback so an unknown status never crashes a render.
 *
 * @param {keyof typeof STATUS_COLORS} domain - 'leave', 'salary', etc.
 * @param {string} value - The status value
 * @returns {string} Tailwind classes
 */
export const statusColor = (domain, value) => {
  const map = STATUS_COLORS[domain] || {};
  return (
    map[value] || 'bg-gray-50 text-gray-700 ring-gray-200'
  );
};

/* ──────────────────────────────────────────────────────────────────── */
/* Date / locale defaults                                                */
/* ──────────────────────────────────────────────────────────────────── */

/**
 * Locale used by formatters across the app. Kept here so a future i18n
 * effort has one place to read from.
 */
export const DEFAULT_LOCALE = 'en-GB';

/** Currency code used by salary / payroll formatters. */
export const DEFAULT_CURRENCY = 'EUR';

/**
 * Default export bundles every constant for callers who prefer
 * `import C from '../utils/constants'` over named imports.
 */
export default {
  API_BASE_URL,
  ROLES,
  ROLE_GROUPS,
  CONTRACT_TYPES,
  EMPLOYEE_STATUSES,
  LEAVE_TYPES,
  LEAVE_STATUSES,
  ATTENDANCE_STATUSES,
  DOCUMENT_TYPES,
  SALARY_STATUSES,
  TRAINING_STATUSES,
  PARTICIPANT_STATUSES,
  NOTIFICATION_TYPES,
  PAGINATION,
  STATUS_COLORS,
  statusColor,
  DEFAULT_LOCALE,
  DEFAULT_CURRENCY,
};
