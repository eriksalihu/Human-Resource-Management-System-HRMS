/**
 * @file backend/src/utils/validators.js
 * @description Comprehensive validation chains for all entity types
 * @author Dev A
 */

const { body, param } = require('express-validator');

/**
 * Validation chain for user registration.
 *
 * @returns {import('express-validator').ValidationChain[]}
 */
const registerValidation = () => [
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Please provide a valid email address')
    .normalizeEmail(),
  body('password')
    .notEmpty().withMessage('Password is required')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
    .matches(/[a-z]/).withMessage('Password must contain a lowercase letter')
    .matches(/[A-Z]/).withMessage('Password must contain an uppercase letter')
    .matches(/\d/).withMessage('Password must contain a number'),
  body('first_name')
    .trim()
    .notEmpty().withMessage('First name is required')
    .isLength({ min: 2, max: 50 }).withMessage('First name must be 2–50 characters'),
  body('last_name')
    .trim()
    .notEmpty().withMessage('Last name is required')
    .isLength({ min: 2, max: 50 }).withMessage('Last name must be 2–50 characters'),
  body('phone')
    .optional()
    .trim()
    .matches(/^[+]?[\d\s\-()]{7,20}$/).withMessage('Please provide a valid phone number'),
];

/**
 * Validation chain for user login.
 *
 * @returns {import('express-validator').ValidationChain[]}
 */
const loginValidation = () => [
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Please provide a valid email address')
    .normalizeEmail(),
  body('password')
    .notEmpty().withMessage('Password is required'),
];

/**
 * Validation chain for updating user profile fields.
 * All fields optional — only present fields are validated.
 *
 * @returns {import('express-validator').ValidationChain[]}
 */
const userUpdateValidation = () => [
  body('first_name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 }).withMessage('First name must be 2–50 characters'),
  body('last_name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 }).withMessage('Last name must be 2–50 characters'),
  body('email')
    .optional()
    .trim()
    .isEmail().withMessage('Please provide a valid email address')
    .normalizeEmail(),
  body('phone')
    .optional()
    .trim()
    .matches(/^[+]?[\d\s\-()]{7,20}$/).withMessage('Please provide a valid phone number'),
  body('is_active')
    .optional()
    .isBoolean().withMessage('is_active must be a boolean'),
];

/**
 * Validation chain for creating or updating a department.
 * Uses Albanian field names (emertimi, pershkrimi).
 *
 * @returns {import('express-validator').ValidationChain[]}
 */
const departmentValidation = () => [
  body('emertimi')
    .trim()
    .notEmpty().withMessage('Emertimi (name) is required')
    .isLength({ min: 2, max: 100 }).withMessage('Emertimi must be 2–100 characters'),
  body('pershkrimi')
    .optional()
    .trim()
    .isLength({ max: 500 }).withMessage('Pershkrimi must be at most 500 characters'),
  body('menaxheri_id')
    .optional({ nullable: true })
    .isInt({ min: 1 }).withMessage('Menaxheri_id must be a positive integer'),
];

/**
 * Validation chain for creating or updating an employee.
 *
 * @returns {import('express-validator').ValidationChain[]}
 */
const employeeValidation = () => [
  body('user_id')
    .isInt({ min: 1 }).withMessage('user_id must be a positive integer'),
  body('department_id')
    .isInt({ min: 1 }).withMessage('department_id must be a positive integer'),
  body('position_id')
    .isInt({ min: 1 }).withMessage('position_id must be a positive integer'),
  body('data_punesimit')
    .notEmpty().withMessage('Data e punesimit (hire date) is required')
    .isISO8601().withMessage('Data e punesimit must be a valid date'),
  body('lloji_kontrates')
    .notEmpty().withMessage('Lloji i kontratës (contract type) is required')
    .isIn(['Full-time', 'Part-time', 'Contract', 'Intern'])
    .withMessage('Invalid contract type'),
  body('statusi')
    .optional()
    .isIn(['Active', 'On Leave', 'Terminated', 'Suspended'])
    .withMessage('Invalid employee status'),
];

/**
 * Validation chain for creating or updating a salary record.
 *
 * @returns {import('express-validator').ValidationChain[]}
 */
const salaryValidation = () => [
  body('employee_id')
    .isInt({ min: 1 }).withMessage('employee_id must be a positive integer'),
  body('paga_baze')
    .notEmpty().withMessage('Paga baze (base salary) is required')
    .isFloat({ min: 0 }).withMessage('Paga baze must be a non-negative number'),
  body('bonus')
    .optional()
    .isFloat({ min: 0 }).withMessage('Bonus must be a non-negative number'),
  body('deduksione')
    .optional()
    .isFloat({ min: 0 }).withMessage('Deduksionet must be a non-negative number'),
  body('muaji')
    .notEmpty().withMessage('Muaji (month) is required')
    .matches(/^\d{4}-\d{2}$/).withMessage('Muaji must be in YYYY-MM format'),
];

/**
 * Validation chain for creating or updating a leave request.
 *
 * @returns {import('express-validator').ValidationChain[]}
 */
const leaveRequestValidation = () => [
  body('employee_id')
    .isInt({ min: 1 }).withMessage('employee_id must be a positive integer'),
  body('lloji_pushimit')
    .notEmpty().withMessage('Lloji i pushimit (leave type) is required')
    .isIn(['Annual', 'Sick', 'Maternity', 'Paternity', 'Unpaid', 'Bereavement'])
    .withMessage('Invalid leave type'),
  body('data_fillimit')
    .notEmpty().withMessage('Data e fillimit (start date) is required')
    .isISO8601().withMessage('Data e fillimit must be a valid date'),
  body('data_perfundimit')
    .notEmpty().withMessage('Data e perfundimit (end date) is required')
    .isISO8601().withMessage('Data e perfundimit must be a valid date')
    .custom((value, { req }) => {
      if (new Date(value) < new Date(req.body.data_fillimit)) {
        throw new Error('End date must be after start date');
      }
      return true;
    }),
  body('arsyeja')
    .optional()
    .trim()
    .isLength({ max: 500 }).withMessage('Arsyeja must be at most 500 characters'),
];

module.exports = {
  registerValidation,
  loginValidation,
  userUpdateValidation,
  departmentValidation,
  employeeValidation,
  salaryValidation,
  leaveRequestValidation,
};
