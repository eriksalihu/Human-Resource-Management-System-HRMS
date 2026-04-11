/**
 * @file backend/src/middleware/auth.js
 * @description JWT authentication middleware — extracts and verifies Bearer token
 * @author Dev A
 */

const tokenService = require('../services/token.service');
const { AppError } = require('./errorHandler');

/**
 * Authentication middleware.
 * Extracts a Bearer token from the Authorization header, verifies it with the
 * token service, and attaches the decoded payload to req.user.
 *
 * Responds with 401 for missing, malformed, expired, or invalid tokens.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const authenticate = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AppError('Authentication required — missing Bearer token', 401);
    }

    const token = authHeader.substring(7).trim();
    if (!token) {
      throw new AppError('Authentication required — empty Bearer token', 401);
    }

    // verifyAccessToken throws an AppError with 401 for expired/invalid tokens
    const decoded = tokenService.verifyAccessToken(token);

    // Attach user payload for downstream handlers and authorize middleware
    req.user = {
      id: decoded.id,
      email: decoded.email,
      roles: decoded.roles || [],
    };

    next();
  } catch (err) {
    next(err);
  }
};

module.exports = authenticate;
