/**
 * @file backend/src/middleware/rateLimiter.js
 * @description Rate limiting middleware with tiered limits for auth and general endpoints
 * @author Dev A
 */

const rateLimit = require('express-rate-limit');

/**
 * Default window length for all rate limiters (15 minutes).
 * Configurable via the RATE_LIMIT_WINDOW_MS env var.
 */
const WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000;

/**
 * Shared response body for all 429 responses.
 */
const standardHeaders = true;
const legacyHeaders = false;

/**
 * Strict rate limiter for authentication endpoints (login, register, refresh).
 * Limits to 5 requests per 15 minutes per IP to mitigate brute-force attacks.
 * Successful requests are not counted to avoid locking out legitimate users
 * during high-traffic sign-in scenarios.
 */
const authLimiter = rateLimit({
  windowMs: WINDOW_MS,
  max: parseInt(process.env.RATE_LIMIT_AUTH_MAX, 10) || 5,
  standardHeaders,
  legacyHeaders,
  skipSuccessfulRequests: true,
  message: {
    success: false,
    message: 'Too many authentication attempts. Please try again after 15 minutes.',
  },
});

/**
 * Standard rate limiter for general API endpoints.
 * Limits to 100 requests per 15 minutes per IP.
 */
const apiLimiter = rateLimit({
  windowMs: WINDOW_MS,
  max: parseInt(process.env.RATE_LIMIT_API_MAX, 10) || 100,
  standardHeaders,
  legacyHeaders,
  message: {
    success: false,
    message: 'Too many requests from this IP. Please slow down.',
  },
});

/**
 * Relaxed rate limiter for read-heavy endpoints (e.g., reporting, dashboards).
 * Limits to 300 requests per 15 minutes per IP.
 */
const readLimiter = rateLimit({
  windowMs: WINDOW_MS,
  max: parseInt(process.env.RATE_LIMIT_READ_MAX, 10) || 300,
  standardHeaders,
  legacyHeaders,
  message: {
    success: false,
    message: 'Too many read requests. Please slow down.',
  },
});

module.exports = { authLimiter, apiLimiter, readLimiter };
