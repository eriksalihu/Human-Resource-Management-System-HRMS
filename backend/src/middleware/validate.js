/**
 * @file backend/src/middleware/validate.js
 * @description Request validation middleware using express-validator.
 *   Exposes reusable chains for email / password / pagination / id and
 *   per-field length caps that mirror MySQL column sizes (commit 284),
 *   plus a global body-string-length guard for defense-in-depth.
 * @author Dev A
 */

const { body, query, param, validationResult } = require('express-validator');
const { AppError } = require('./errorHandler');

/**
 * Field-length caps in lock-step with the MySQL schema (see
 * `database/migrations/*.sql`). Centralising them here means a future
 * schema change is one edit, not a sweep across controllers.
 *
 * Why these specific numbers:
 *   - EMAIL = 255   → matches the IETF max + Users.email column
 *   - NAME = 100    → first_name / last_name / department & position emertimi
 *   - TITLE = 200   → training emertimi / document titulli (the larger
 *                     "title" columns)
 *   - SHORT = 50    → enum-like short strings
 *   - PHONE = 20    → Users.phone — generous E.164 + separators
 *   - LOCATION = 255 → department lokacioni
 *   - LONG_TEXT = 5000 → for TEXT columns; MySQL TEXT is 64KB but
 *                        accepting a 5K payload per field is plenty for
 *                        real HR content and shrinks the attack surface
 *   - PASSWORD_MAX = 128 → bcrypt truncates at 72 anyway; cap well
 *                          under the body-string limit so an attacker
 *                          can't push pathological inputs through it
 */
const FIELD_LIMITS = Object.freeze({
  EMAIL: 255,
  NAME: 100,
  TITLE: 200,
  SHORT: 50,
  PHONE: 20,
  LOCATION: 255,
  LONG_TEXT: 5000,
  PASSWORD_MAX: 128,
});

/**
 * Global maximum for ANY string field that doesn't have an explicit
 * tighter cap. The body-string guard middleware below enforces this
 * across every endpoint without each controller having to wire it.
 */
const GLOBAL_STRING_MAX = FIELD_LIMITS.LONG_TEXT;

/**
 * Extract validation errors from the request and throw an AppError with 422.
 * Must be used as the final middleware in a validation chain.
 *
 * @example
 *   router.post('/login', validators.emailChain(), validators.passwordChain(),
 *               extractValidationErrors, loginHandler);
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const extractValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (errors.isEmpty()) {
    return next();
  }

  // Compact error format: [{ field, message }]
  const formatted = errors.array({ onlyFirstError: true }).map((err) => ({
    field: err.path || err.param,
    message: err.msg,
  }));

  const error = new AppError('Validation failed', 422);
  error.errors = formatted;
  return next(error);
};

/**
 * Reusable email validation chain.
 * Requires a valid email format, normalises casing, and enforces the
 * VARCHAR(255) DB cap so an over-long input never reaches the model.
 *
 * @param {string} [field='email']
 * @returns {import('express-validator').ValidationChain}
 */
const emailChain = (field = 'email') =>
  body(field)
    .trim()
    .notEmpty()
    .withMessage('Email is required')
    .isEmail()
    .withMessage('Please provide a valid email address')
    .isLength({ max: FIELD_LIMITS.EMAIL })
    .withMessage(`Email must be at most ${FIELD_LIMITS.EMAIL} characters`)
    .normalizeEmail();

/**
 * Reusable password validation chain.
 * Enforces minimum length and complexity (uppercase, lowercase, number),
 * plus a sensible upper bound — bcrypt truncates at 72 chars anyway, and
 * capping well below the global body-string limit prevents pathological
 * inputs from reaching the hasher.
 *
 * @param {string} [field='password']
 * @param {number} [minLength=8]
 * @returns {import('express-validator').ValidationChain}
 */
const passwordChain = (field = 'password', minLength = 8) =>
  body(field)
    .notEmpty()
    .withMessage('Password is required')
    .isLength({ min: minLength, max: FIELD_LIMITS.PASSWORD_MAX })
    .withMessage(
      `Password must be ${minLength}–${FIELD_LIMITS.PASSWORD_MAX} characters`
    )
    .matches(/[a-z]/)
    .withMessage('Password must contain at least one lowercase letter')
    .matches(/[A-Z]/)
    .withMessage('Password must contain at least one uppercase letter')
    .matches(/\d/)
    .withMessage('Password must contain at least one number');

/**
 * Reusable string-length validation chain for VARCHAR-backed fields.
 *
 *   nameChain('first_name')               // VARCHAR(100)
 *   titleChain('emertimi', { required })  // VARCHAR(200)
 *
 * @param {string} field
 * @param {Object} [opts]
 * @param {number} [opts.max] - Override the default cap
 * @param {boolean} [opts.required=false]
 * @param {number} [opts.min=1]
 * @returns {import('express-validator').ValidationChain}
 */
const stringLengthChain = (field, opts = {}) => {
  const { max = GLOBAL_STRING_MAX, required = false, min = 1 } = opts;
  let chain = body(field).optional({ nullable: true, checkFalsy: !required });
  if (required) {
    chain = body(field).trim().notEmpty().withMessage(`${field} is required`);
  } else {
    chain = chain.trim();
  }
  return chain
    .isString()
    .withMessage(`${field} must be a string`)
    .isLength({ min: required ? min : 0, max })
    .withMessage(`${field} must be at most ${max} characters`);
};

/** VARCHAR(100) fields — names, short labels. */
const nameChain = (field, opts = {}) =>
  stringLengthChain(field, { max: FIELD_LIMITS.NAME, ...opts });

/** VARCHAR(200) fields — titles, training/document names. */
const titleChain = (field, opts = {}) =>
  stringLengthChain(field, { max: FIELD_LIMITS.TITLE, ...opts });

/** TEXT fields — long-form descriptions / reasons / notes (capped at 5K). */
const descriptionChain = (field, opts = {}) =>
  stringLengthChain(field, { max: FIELD_LIMITS.LONG_TEXT, ...opts });

/** VARCHAR(20) phone-style fields. */
const phoneChain = (field = 'phone', opts = {}) =>
  stringLengthChain(field, { max: FIELD_LIMITS.PHONE, ...opts });

/**
 * Reusable pagination query validation chain.
 * Validates ?page=N&limit=N&sortBy=col&sortOrder=asc|desc
 *
 * @returns {import('express-validator').ValidationChain[]}
 */
const paginationChain = () => [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer')
    .toInt(),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100')
    .toInt(),
  query('sortBy')
    .optional()
    .isString()
    .trim()
    .isLength({ max: FIELD_LIMITS.SHORT })
    .withMessage(
      `sortBy must be at most ${FIELD_LIMITS.SHORT} characters`
    ),
  query('sortOrder')
    .optional()
    .isIn(['asc', 'desc', 'ASC', 'DESC'])
    .withMessage('Sort order must be "asc" or "desc"'),
];

/**
 * Reusable positive integer URL param validator.
 *
 * @param {string} [name='id']
 * @returns {import('express-validator').ValidationChain}
 */
const idParamChain = (name = 'id') =>
  param(name)
    .isInt({ min: 1 })
    .withMessage(`${name} must be a positive integer`)
    .toInt();

/**
 * Global body-string length guard (commit 284).
 *
 * Belt-and-braces defense: even endpoints that haven't wired
 * per-field validation chains get a hard ceiling on any string in
 * the request body. Mounts as ordinary middleware in app.js after the
 * JSON body parser. Anything longer than `GLOBAL_STRING_MAX` (5KB)
 * returns 413 with the standard error envelope — keeping pathological
 * payloads away from controllers, models, and the DB driver.
 *
 * Recursively walks objects/arrays one level deep (sufficient for our
 * flat-ish API bodies) so a nested string is caught too.
 *
 * @param {Object} [opts]
 * @param {number} [opts.max=GLOBAL_STRING_MAX]
 * @returns {import('express').RequestHandler}
 */
const bodyStringLimit =
  ({ max = GLOBAL_STRING_MAX } = {}) =>
  (req, res, next) => {
    const body = req.body;
    if (!body || typeof body !== 'object') return next();

    const offender = findOversizeString(body, max);
    if (offender) {
      return next(
        new AppError(
          `Field "${offender.path}" exceeds the ${max}-character limit`,
          413
        )
      );
    }
    return next();
  };

/**
 * Walk a JSON-shaped value, returning `{ path, length }` for the first
 * string longer than `max`. Bounded to depth 4 to avoid pathological
 * stack growth on hostile inputs.
 */
function findOversizeString(value, max, path = '', depth = 0) {
  if (depth > 4) return null;
  if (typeof value === 'string') {
    return value.length > max ? { path: path || '<root>', length: value.length } : null;
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      const hit = findOversizeString(value[i], max, `${path}[${i}]`, depth + 1);
      if (hit) return hit;
    }
    return null;
  }
  if (value && typeof value === 'object') {
    for (const [key, v] of Object.entries(value)) {
      const hit = findOversizeString(
        v,
        max,
        path ? `${path}.${key}` : key,
        depth + 1
      );
      if (hit) return hit;
    }
  }
  return null;
}

module.exports = {
  extractValidationErrors,
  emailChain,
  passwordChain,
  paginationChain,
  idParamChain,
  // Length-capped chains (commit 284)
  stringLengthChain,
  nameChain,
  titleChain,
  descriptionChain,
  phoneChain,
  bodyStringLimit,
  FIELD_LIMITS,
  GLOBAL_STRING_MAX,
};
