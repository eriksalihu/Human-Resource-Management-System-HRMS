/**
 * @file frontend/src/types/index.js
 * @description Project-wide JSDoc typedef registry (commit 290).
 *
 * The project never adopted `prop-types` (no runtime cost, but heavy
 * setup) — instead every component already documents its props via
 * JSDoc `@param` blocks. This file gathers the *cross-component*
 * domain shapes (Employee, Department, the standard API envelope, …)
 * as `@typedef`s so a JSDoc reference like `@param {Employee} emp`
 * lights up in editors (VS Code, JetBrains) without duplicating the
 * shape in every consumer.
 *
 * Nothing is exported at runtime — the file is pure documentation. Pull
 * it in with a `///` reference or by importing this module's typedefs:
 *
 *   /** @typedef {import('../../types').Employee} Employee *\/
 *
 * Then `@param {Employee} ...` resolves to the structure below.
 *
 * Keep shapes in sync with:
 *   - backend MySQL columns (see database/migrations/*.sql)
 *   - backend response envelopes (controllers/* — `res.json(...)`)
 *
 * @author Dev B
 */

/**
 * Standard API success envelope used by every controller.
 *
 * @typedef {Object} ApiSuccess
 * @property {true} success
 * @property {*} [data] - Payload (object / array — controller-specific)
 * @property {ApiPagination} [pagination] - On list endpoints
 * @property {string} [message] - Optional human-readable note
 */

/**
 * Standard API error envelope (commit 273). Every error response —
 * AppError, MySQL driver code, validator failure, 404 fallback — is
 * shaped like this.
 *
 * @typedef {Object} ApiError
 * @property {false} success
 * @property {string} message - Human-readable
 * @property {number} statusCode - Mirrors the HTTP status
 * @property {Array<{ field: string, message: string }>} [errors] -
 *   Field-level validation errors
 * @property {string} [code] - Machine-readable (ERR_*) for branching
 */

/**
 * Pagination envelope returned with every list endpoint.
 *
 * @typedef {Object} ApiPagination
 * @property {number} currentPage
 * @property {number} perPage
 * @property {number} total
 * @property {number} totalPages
 * @property {boolean} hasNextPage
 * @property {boolean} hasPrevPage
 */

/**
 * User account record (Users table). The `password_hash` is NEVER
 * shipped to the client, so it's intentionally absent here.
 *
 * @typedef {Object} User
 * @property {number} id
 * @property {string} email
 * @property {string} first_name
 * @property {string} last_name
 * @property {string|null} phone
 * @property {string|null} profile_image
 * @property {boolean} is_active
 * @property {boolean} email_verified
 * @property {Date|string|null} last_login_at
 * @property {string|null} last_login_ip
 * @property {Date|string} created_at
 * @property {Date|string} updated_at
 * @property {string[]} [roles] - Role names, when joined in
 */

/**
 * Employee record (Employees table) joined with Users + Position +
 * Department + manager-employee. Mirrors `models/Employee.js`'s
 * `BASE_SELECT`.
 *
 * @typedef {Object} Employee
 * @property {number} id
 * @property {number} user_id
 * @property {number|null} position_id
 * @property {number|null} department_id
 * @property {string} numri_punonjesit - Employee number (auto-gen)
 * @property {Date|string|null} data_punesimit - Hire date
 * @property {'full-time'|'part-time'|'contract'|'intern'} lloji_kontrates
 * @property {'active'|'inactive'|'suspended'|'terminated'} statusi
 * @property {number|null} menaxheri_id - Manager (self-FK on Employees)
 * @property {Date|string} created_at
 * @property {Date|string} updated_at
 *
 * @property {string} [first_name] - From Users join
 * @property {string} [last_name]
 * @property {string} [email]
 * @property {string|null} [phone]
 * @property {string|null} [profile_image]
 * @property {string} [position_emertimi] - From Positions join
 * @property {string} [position_niveli]
 * @property {string} [department_emertimi] - From Departments join
 * @property {string} [department_lokacioni]
 * @property {string} [menaxheri_first_name]
 * @property {string} [menaxheri_last_name]
 */

/**
 * Department record (Departments table).
 *
 * @typedef {Object} Department
 * @property {number} id
 * @property {string} emertimi - Name (VARCHAR(100))
 * @property {string|null} pershkrimi - Description (TEXT)
 * @property {string|null} lokacioni - Location (VARCHAR(255))
 * @property {number|null} buxheti - Annual budget (DECIMAL)
 * @property {number|null} menaxheri_id - Manager employee FK
 * @property {Date|string} created_at
 * @property {Date|string} updated_at
 */

/**
 * Position record (Positions table).
 *
 * @typedef {Object} Position
 * @property {number} id
 * @property {number} department_id
 * @property {string} emertimi - Title (VARCHAR(100))
 * @property {string|null} pershkrimi
 * @property {'junior'|'mid'|'senior'|'lead'|null} niveli
 * @property {number|null} paga_min
 * @property {number|null} paga_max
 * @property {Date|string} created_at
 * @property {Date|string} updated_at
 */

/**
 * Salary record (Salaries table). `paga_neto` is server-computed from
 * `paga_baze + bonuse − zbritje − statutory deductions`.
 *
 * @typedef {Object} Salary
 * @property {number} id
 * @property {number} employee_id
 * @property {number} muaji - Month 1-12
 * @property {number} viti - Year
 * @property {number} paga_baze - Gross base
 * @property {number} bonuse
 * @property {number} zbritje - Discretionary deductions
 * @property {number} paga_neto - Computed net
 * @property {Date|string|null} data_pageses - Pay date
 * @property {'pending'|'processed'|'paid'} statusi
 */

/**
 * Leave request record (LeaveRequests table).
 *
 * @typedef {Object} LeaveRequest
 * @property {number} id
 * @property {number} employee_id
 * @property {'annual'|'sick'|'personal'|'maternity'|'paternity'|'unpaid'} lloji
 * @property {Date|string} data_fillimit - Start date
 * @property {Date|string} data_perfundimit - End date
 * @property {string|null} arsyeja - Reason (TEXT)
 * @property {'pending'|'approved'|'rejected'|'cancelled'} statusi
 * @property {number|null} aprovuesi_id - Approver employee id
 * @property {Date|string|null} data_aprovimit
 */

/**
 * Toast variants surfaced by `useToast`.
 *
 * @typedef {'info'|'success'|'warning'|'error'} ToastVariant
 */

/**
 * DataTable column descriptor (see components/common/DataTable.jsx).
 *
 * @typedef {Object} DataTableColumn
 * @property {string} key - Either a row property or a synthetic id
 * @property {string} label - Header label (omit for icon-only columns)
 * @property {boolean} [sortable=false]
 * @property {(value:*, row:Object) => React.ReactNode} [render] -
 *   Custom cell renderer
 */

// This module exports nothing at runtime — it's pure JSDoc.
export {};
