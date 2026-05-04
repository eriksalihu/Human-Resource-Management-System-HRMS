/**
 * @file frontend/src/utils/validators.js
 * @description Reusable client-side validation primitives — email, password strength, phone, date comparisons, numeric ranges
 * @author Dev A
 *
 * Each validator returns a boolean for "is this valid" and is paired with
 * a `*Reason()` companion that returns the first failing-rule label (or
 * `null` when valid). Components can use the boolean for gating submit
 * and the reason string for inline error messages.
 *
 * The server is always the source of truth — these helpers exist purely
 * for fast UX feedback before round-tripping a doomed payload.
 */

/* ──────────────────────────────────────────────────────────────────── */
/* Email                                                                 */
/* ──────────────────────────────────────────────────────────────────── */

/**
 * Pragmatic email regex. We don't try to be RFC-5322-compliant — that
 * regex is famously huge and forbids almost nothing useful. This pattern
 * catches the obvious mistakes (no @, no TLD, whitespace) while accepting
 * everything a typical user will actually type.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Returns true when `value` looks like a plausible email address.
 *
 * @param {string|null|undefined} value
 * @returns {boolean}
 */
export const isValidEmail = (value) => {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 254) return false;
  return EMAIL_RE.test(trimmed);
};

/* ──────────────────────────────────────────────────────────────────── */
/* Password strength                                                     */
/* ──────────────────────────────────────────────────────────────────── */

/** Minimum length enforced by both this validator and the backend. */
const MIN_PASSWORD_LENGTH = 8;

/**
 * Per-rule check used by both `isStrongPassword` and `passwordStrengthReason`.
 *
 * @param {string} value
 * @returns {{ ok: boolean, failed: Array<string> }}
 */
const checkPassword = (value) => {
  const failed = [];
  if (typeof value !== 'string') {
    return { ok: false, failed: ['must be a string'] };
  }
  if (value.length < MIN_PASSWORD_LENGTH) {
    failed.push(`must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }
  if (!/[A-Z]/.test(value)) {
    failed.push('must include an uppercase letter');
  }
  if (!/[a-z]/.test(value)) {
    failed.push('must include a lowercase letter');
  }
  if (!/[0-9]/.test(value)) {
    failed.push('must include a number');
  }
  if (!/[^A-Za-z0-9]/.test(value)) {
    failed.push('must include a special character');
  }
  return { ok: failed.length === 0, failed };
};

/**
 * Strong-password check matching the backend rule set:
 * ≥8 chars, at least one upper, one lower, one digit, one special.
 *
 * @param {string|null|undefined} value
 * @returns {boolean}
 */
export const isStrongPassword = (value) => checkPassword(value).ok;

/**
 * Returns the first failing rule (as a sentence) or `null` when valid.
 * Handy for inline form errors.
 *
 * @param {string|null|undefined} value
 * @returns {string|null}
 */
export const passwordStrengthReason = (value) => {
  const { ok, failed } = checkPassword(value);
  if (ok) return null;
  return failed[0];
};

/**
 * Coarse score 0..4 indicating how many of the five strength rules pass.
 * Useful for password-strength meters.
 *
 * @param {string|null|undefined} value
 * @returns {number}
 */
export const passwordStrengthScore = (value) => {
  const rules = [
    typeof value === 'string' && value.length >= MIN_PASSWORD_LENGTH,
    /[A-Z]/.test(value || ''),
    /[a-z]/.test(value || ''),
    /[0-9]/.test(value || ''),
    /[^A-Za-z0-9]/.test(value || ''),
  ];
  return rules.filter(Boolean).length;
};

/* ──────────────────────────────────────────────────────────────────── */
/* Phone numbers                                                         */
/* ──────────────────────────────────────────────────────────────────── */

/**
 * Phone-number validation — accepts an optional leading "+" plus 7 to 15
 * digits (E.164 maxes out at 15). Formatting characters (spaces, dashes,
 * parentheses, dots) are stripped before validation so users don't have
 * to type a specific shape.
 *
 * @param {string|null|undefined} value
 * @returns {boolean}
 */
export const isValidPhoneNumber = (value) => {
  if (typeof value !== 'string') return false;
  const cleaned = value.replace(/[\s\-().]/g, '');
  if (cleaned.length === 0) return false;
  return /^\+?\d{7,15}$/.test(cleaned);
};

/* ──────────────────────────────────────────────────────────────────── */
/* Dates                                                                 */
/* ──────────────────────────────────────────────────────────────────── */

/**
 * Best-effort Date parser shared with formatters.js — duplicated locally
 * so this module has no internal dependencies.
 *
 * @param {Date|string|number|null|undefined} value
 * @returns {Date|null}
 */
const parseDate = (value) => {
  if (value == null || value === '') return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

/**
 * Returns true when `a` is strictly before `b`. Both inputs are coerced
 * via parseDate. Null inputs return false.
 *
 * @param {Date|string|number} a
 * @param {Date|string|number} b
 * @returns {boolean}
 */
export const isDateBefore = (a, b) => {
  const da = parseDate(a);
  const db = parseDate(b);
  if (!da || !db) return false;
  return da.getTime() < db.getTime();
};

/**
 * Returns true when `a` is strictly after `b`.
 *
 * @param {Date|string|number} a
 * @param {Date|string|number} b
 * @returns {boolean}
 */
export const isDateAfter = (a, b) => {
  const da = parseDate(a);
  const db = parseDate(b);
  if (!da || !db) return false;
  return da.getTime() > db.getTime();
};

/**
 * Returns true when `value` is a valid date and falls within the
 * inclusive range `[from, to]`. Either bound can be omitted to make the
 * check one-sided.
 *
 * @param {Date|string|number} value
 * @param {Object} [options]
 * @param {Date|string|number} [options.from]
 * @param {Date|string|number} [options.to]
 * @returns {boolean}
 */
export const isDateInRange = (value, { from, to } = {}) => {
  const d = parseDate(value);
  if (!d) return false;
  if (from) {
    const f = parseDate(from);
    if (!f || d.getTime() < f.getTime()) return false;
  }
  if (to) {
    const t = parseDate(to);
    if (!t || d.getTime() > t.getTime()) return false;
  }
  return true;
};

/* ──────────────────────────────────────────────────────────────────── */
/* Numbers                                                               */
/* ──────────────────────────────────────────────────────────────────── */

/**
 * Returns true when `value` coerces to a finite number greater than zero.
 *
 * @param {number|string|null|undefined} value
 * @returns {boolean}
 */
export const isPositiveNumber = (value) => {
  if (value === '' || value == null) return false;
  const num = Number(value);
  return Number.isFinite(num) && num > 0;
};

/**
 * Returns true when `value` coerces to a finite non-negative number.
 *
 * @param {number|string|null|undefined} value
 * @returns {boolean}
 */
export const isNonNegativeNumber = (value) => {
  if (value === '' || value == null) return false;
  const num = Number(value);
  return Number.isFinite(num) && num >= 0;
};

/**
 * Returns true when `value` is a finite number inside `[min, max]` (both
 * inclusive). Either bound can be omitted to make the check one-sided.
 *
 * @param {number|string|null|undefined} value
 * @param {Object} [options]
 * @param {number} [options.min]
 * @param {number} [options.max]
 * @returns {boolean}
 */
export const isWithinRange = (value, { min, max } = {}) => {
  if (value === '' || value == null) return false;
  const num = Number(value);
  if (!Number.isFinite(num)) return false;
  if (min != null && num < min) return false;
  if (max != null && num > max) return false;
  return true;
};

/* ──────────────────────────────────────────────────────────────────── */
/* String / required-field                                               */
/* ──────────────────────────────────────────────────────────────────── */

/**
 * Returns true when a value is a non-empty string after trimming. Useful
 * for `required` form fields where a string of spaces should not count.
 *
 * @param {*} value
 * @returns {boolean}
 */
export const isNonEmptyString = (value) =>
  typeof value === 'string' && value.trim().length > 0;

/**
 * Default export bundles every validator for callers who prefer
 * `import v from '../utils/validators'` over named imports.
 */
export default {
  isValidEmail,
  isStrongPassword,
  passwordStrengthReason,
  passwordStrengthScore,
  isValidPhoneNumber,
  isDateBefore,
  isDateAfter,
  isDateInRange,
  isPositiveNumber,
  isNonNegativeNumber,
  isWithinRange,
  isNonEmptyString,
};
