/**
 * @file backend/src/middleware/authorize.js
 * @description Role-based authorization middleware factory
 * @author Dev A
 */

const { AppError } = require('./errorHandler');

/**
 * Authorization middleware factory.
 * Creates a middleware that checks if the authenticated user has at least one
 * of the specified roles. Must run AFTER the authenticate middleware so that
 * req.user is populated.
 *
 * @example
 *   router.post('/users', authenticate, authorize(['Admin', 'HR Manager']), handler);
 *
 * @param {string[]|string} allowedRoles - Role name or array of allowed role names
 * @returns {import('express').RequestHandler} Express middleware function
 */
const authorize = (allowedRoles) => {
  // Normalize to array for uniform handling
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

  return (req, res, next) => {
    try {
      if (!req.user) {
        throw new AppError('Authentication required', 401);
      }

      const userRoles = req.user.roles || [];

      if (userRoles.length === 0) {
        throw new AppError('Access denied — no roles assigned', 403);
      }

      // Allow if user has at least one allowed role
      const hasAllowedRole = userRoles.some((role) => roles.includes(role));

      if (!hasAllowedRole) {
        throw new AppError(
          `Access denied — requires one of: ${roles.join(', ')}`,
          403
        );
      }

      next();
    } catch (err) {
      next(err);
    }
  };
};

module.exports = authorize;
