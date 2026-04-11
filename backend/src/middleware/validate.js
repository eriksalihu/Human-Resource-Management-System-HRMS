/**
 * @file backend/src/middleware/validate.js
 * @description Request validation middleware using express-validator
 * @author Dev A
 */

const { body, query, param, validationResult } = require('express-validator');
const { AppError } = require('./errorHandler');

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
 * Requires a valid email format and normalizes casing.
 *
 * @param {string} [field='email'] - Field name in the request body
 * @returns {import('express-validator').ValidationChain}
 */
const emailChain = (field = 'email') =>
  body(field)
    .trim()
    .notEmpty()
    .withMessage('Email is required')
    .isEmail()
    .withMessage('Please provide a valid email address')
    .normalizeEmail();

/**
 * Reusable password validation chain.
 * Enforces minimum length and complexity (uppercase, lowercase, number).
 *
 * @param {string} [field='password'] - Field name in the request body
 * @param {number} [minLength=8] - Minimum password length
 * @returns {import('express-validator').ValidationChain}
 */
const passwordChain = (field = 'password', minLength = 8) =>
  body(field)
    .notEmpty()
    .withMessage('Password is required')
    .isLength({ min: minLength })
    .withMessage(`Password must be at least ${minLength} characters`)
    .matches(/[a-z]/)
    .withMessage('Password must contain at least one lowercase letter')
    .matches(/[A-Z]/)
    .withMessage('Password must contain at least one uppercase letter')
    .matches(/\d/)
    .withMessage('Password must contain at least one number');

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
  query('sortBy').optional().isString().trim(),
  query('sortOrder')
    .optional()
    .isIn(['asc', 'desc', 'ASC', 'DESC'])
    .withMessage('Sort order must be "asc" or "desc"'),
];

/**
 * Reusable positive integer URL param validator.
 *
 * @param {string} [name='id'] - Param name
 * @returns {import('express-validator').ValidationChain}
 */
const idParamChain = (name = 'id') =>
  param(name)
    .isInt({ min: 1 })
    .withMessage(`${name} must be a positive integer`)
    .toInt();

module.exports = {
  extractValidationErrors,
  emailChain,
  passwordChain,
  paginationChain,
  idParamChain,
};
