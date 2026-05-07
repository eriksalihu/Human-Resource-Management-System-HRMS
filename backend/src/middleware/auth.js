/**
 * @file backend/src/middleware/auth.js
 * @description Hardened JWT authentication middleware — granular error
 *   responses, in-memory access-token blacklist, request-bound fingerprint
 *   validation, and clock-skew tolerance for distributed deployments
 * @author Dev A
 *
 * Error contract:
 *   401 + ERR_TOKEN_MISSING — no Authorization header
 *   401 + ERR_TOKEN_MALFORMED — header present but not "Bearer <token>"
 *   401 + ERR_TOKEN_EXPIRED — JWT expired (within clock-skew tolerance)
 *   401 + ERR_TOKEN_INVALID — signature failed / payload malformed
 *   401 + ERR_TOKEN_REVOKED — token's jti is on the blacklist (forced logout)
 *   401 + ERR_TOKEN_FINGERPRINT_MISMATCH — UA / IP doesn't match issuance
 *
 * Each error attaches its `code` to `err.code` so the frontend can decide
 * what to do (e.g. silent refresh on expired vs. forced logout on revoked).
 */

const tokenService = require('../services/token.service');
const { AppError } = require('./errorHandler');

/** Header name override — clients can pass an opaque trace id we forward. */
const REQUEST_ID_HEADER = 'x-request-id';

/**
 * Build an AppError with a specific code attached so the frontend can
 * branch on `err.response.data.code`.
 */
const authError = (code, message, status = 401) => {
  const err = new AppError(message, status);
  err.code = code;
  return err;
};

/**
 * Extract a Bearer token from the Authorization header. Returns the raw
 * token string or throws a precise auth error so callers don't have to
 * reproduce the parsing logic.
 */
const extractBearerToken = (req) => {
  const header = req.headers.authorization;

  if (!header) {
    throw authError(
      'ERR_TOKEN_MISSING',
      'Authentication required — missing Bearer token'
    );
  }
  if (!header.startsWith('Bearer ')) {
    throw authError(
      'ERR_TOKEN_MALFORMED',
      'Authentication required — malformed Authorization header'
    );
  }

  const token = header.slice('Bearer '.length).trim();
  if (!token) {
    throw authError(
      'ERR_TOKEN_MALFORMED',
      'Authentication required — empty Bearer token'
    );
  }
  return token;
};

/**
 * Authentication middleware.
 *
 * Steps (in order, fast-fail):
 *   1. Pull the bearer token from the Authorization header
 *   2. Verify signature + expiry (with clock-skew tolerance from tokenService)
 *   3. Bail if the token's `jti` is on the blacklist
 *   4. Validate the token's bound fingerprint against the current request
 *   5. Attach a sanitized `req.user` for downstream handlers
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const authenticate = (req, res, next) => {
  try {
    // (1) — extract
    const token = extractBearerToken(req);

    // (2) — verify. tokenService.verifyAccessToken throws an AppError
    //       with `err.code` already attached for granular errors.
    const decoded = tokenService.verifyAccessToken(token);

    // (3) — blacklist check (forced-logout / password-change events)
    if (decoded.jti && tokenService.isAccessTokenBlacklisted(decoded.jti)) {
      throw authError(
        'ERR_TOKEN_REVOKED',
        'Token has been revoked — please sign in again'
      );
    }

    // (4) — fingerprint binding. If the token was issued with a fingerprint
    //       (newer logins do this; older live tokens predate the binding so
    //       they're allowed through to keep upgrades non-breaking), make
    //       sure it matches the current request.
    if (decoded.fp) {
      const expected = tokenService.generateFingerprint(req);
      if (expected !== decoded.fp) {
        throw authError(
          'ERR_TOKEN_FINGERPRINT_MISMATCH',
          'Token cannot be used from this client — please sign in again'
        );
      }
    }

    // (5) — populate req.user. Keep it small: only fields downstream
    //       handlers / authorize middleware actually read.
    req.user = {
      id: decoded.id,
      email: decoded.email,
      roles: decoded.roles || [],
      // Forward the jti so future "log this out everywhere" features can
      // blacklist by jti without re-decoding.
      jti: decoded.jti || null,
    };

    // Stash a request-id (echoed back on response) for log correlation.
    if (!req.headers[REQUEST_ID_HEADER]) {
      req.id = `${Date.now().toString(36)}-${Math.random()
        .toString(36)
        .slice(2, 10)}`;
    } else {
      req.id = req.headers[REQUEST_ID_HEADER];
    }
    res.setHeader(REQUEST_ID_HEADER, req.id);

    next();
  } catch (err) {
    next(err);
  }
};

module.exports = authenticate;
module.exports.extractBearerToken = extractBearerToken;
module.exports.authError = authError;
