/**
 * @file backend/src/middleware/errorHandler.js
 * @description Centralized Express error handler with a single,
 *   standardized JSON error envelope.
 * @author Dev A
 *
 * Standard error response shape (commit 273) — every error the API
 * returns now looks exactly like this:
 *
 *   {
 *     success: false,
 *     message: string,        // human-readable
 *     statusCode: number,     // mirrors the HTTP status
 *     errors?: Array<{ field, message }>,  // field-level (validation)
 *     code?: string           // machine-readable (ERR_* / mapped DB)
 *   }
 *
 * Why this matters: the frontend's axios interceptor keys its
 * forced-logout logic off `response.data.code`, and forms render
 * `response.data.errors` inline. The previous handler returned only
 * `{ success, message }` — so validation details and auth codes never
 * reached the client, and every consumer had to special-case shapes.
 * One envelope, one parser.
 */

/**
 * Map raw MySQL driver error codes to a stable, public `code` +
 * status + message. Keeps driver internals from leaking while still
 * giving the client something deterministic to branch on.
 */
const DB_ERROR_MAP = {
  ER_DUP_ENTRY: {
    statusCode: 409,
    code: 'ERR_DUPLICATE',
    message: 'Duplicate entry — resource already exists',
  },
  ER_NO_REFERENCED_ROW_2: {
    statusCode: 400,
    code: 'ERR_FK_CONSTRAINT',
    message: 'Referenced resource does not exist',
  },
  ER_ROW_IS_REFERENCED_2: {
    statusCode: 409,
    code: 'ERR_FK_CONSTRAINT',
    message:
      'Cannot delete — other records still reference this resource',
  },
  // Connection-layer failures (commit 287). When the DB is down or
  // briefly unreachable, surface a 503 with a stable code so clients
  // can show a "service unavailable" state instead of a generic 500.
  ECONNREFUSED: {
    statusCode: 503,
    code: 'ERR_DB_UNAVAILABLE',
    message: 'Database temporarily unavailable. Please retry shortly.',
  },
  ECONNRESET: {
    statusCode: 503,
    code: 'ERR_DB_UNAVAILABLE',
    message: 'Database connection was reset. Please retry shortly.',
  },
  ETIMEDOUT: {
    statusCode: 503,
    code: 'ERR_DB_UNAVAILABLE',
    message: 'Database request timed out. Please retry shortly.',
  },
  PROTOCOL_CONNECTION_LOST: {
    statusCode: 503,
    code: 'ERR_DB_UNAVAILABLE',
    message: 'Database connection was lost. Please retry shortly.',
  },
  ER_CON_COUNT_ERROR: {
    statusCode: 503,
    code: 'ERR_DB_UNAVAILABLE',
    message: 'Database is at capacity. Please retry shortly.',
  },
};

/**
 * Global error handler middleware.
 * Distinguishes operational errors (expected) from programming bugs
 * (unexpected) and always emits the standard envelope.
 *
 * @param {Error} err
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} _next
 */
// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, _next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal Server Error';
  let isOperational = err.isOperational || false;
  // App-level machine code (e.g. ERR_REFRESH_REUSE_DETECTED) if the
  // thrower set one. DB-driver codes are handled separately below.
  let code = err.code && /^ERR_/.test(err.code) ? err.code : undefined;
  // Field-level details (express-validator → AppError.errors).
  const errors = Array.isArray(err.errors) ? err.errors : undefined;

  // Framework / library error-name normalisation.
  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = err.message;
    isOperational = true;
  }

  if (err.name === 'UnauthorizedError' || err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid or expired token';
    code = code || 'ERR_TOKEN_INVALID';
    isOperational = true;
  }

  if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Token has expired';
    code = code || 'ERR_TOKEN_EXPIRED';
    isOperational = true;
  }

  // Raw MySQL driver codes → public, stable mapping.
  const dbMapped = DB_ERROR_MAP[err.code];
  if (dbMapped) {
    statusCode = dbMapped.statusCode;
    message = dbMapped.message;
    code = dbMapped.code;
    isOperational = true;
  }

  // Log unexpected (non-operational) errors with full context — these
  // are bugs, not client mistakes.
  if (!isOperational) {
    console.error('UNEXPECTED ERROR:', {
      message: err.message,
      stack: err.stack,
      url: req.originalUrl,
      method: req.method,
      ip: req.ip,
    });
  }

  // ── The one standard envelope ──────────────────────────────────────
  const response = {
    success: false,
    message,
    statusCode,
  };
  if (errors) response.errors = errors;
  if (code) response.code = code;

  // Dev-only diagnostics. `!== 'production'` (not `=== 'development'`)
  // so `test` / unset NODE_ENV still surface the stack while debugging.
  if (process.env.NODE_ENV !== 'production') {
    response.stack = err.stack;
    response.error = err.name;
  }

  res.status(statusCode).json(response);
};

/**
 * Custom operational error for expected failures.
 *
 * Backward compatible: `new AppError(msg, status)` still works, and
 * callers that set `err.code` / `err.errors` after construction keep
 * working. The optional third arg is just a tidier way to do the same:
 *
 *   throw new AppError('Token reuse detected', 401, {
 *     code: 'ERR_REFRESH_REUSE_DETECTED',
 *   });
 *   throw new AppError('Validation failed', 422, { errors: [...] });
 */
class AppError extends Error {
  /**
   * @param {string} message
   * @param {number} statusCode
   * @param {{ code?: string, errors?: Array }} [options]
   */
  constructor(message, statusCode, options = {}) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    if (options && options.code) this.code = options.code;
    if (options && options.errors) this.errors = options.errors;
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = errorHandler;
module.exports.AppError = AppError;
