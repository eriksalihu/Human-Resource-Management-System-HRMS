/**
 * @file backend/src/services/token.service.js
 * @description JWT token service with DB-backed refresh-token rotation,
 *   family-chain tracking, reuse-detection-driven family revocation,
 *   request-bound fingerprint generation, in-memory access-token
 *   blacklist, and clock-skew-tolerant verification
 * @author Dev A
 *
 * Refresh-token "family" model:
 *   The existing `RefreshTokens` table already chains rotations via
 *   `replaced_by_token` (each rotated row points at its successor).
 *   Walking that chain forward from any node yields the entire family.
 *   When a previously-revoked token is presented (a hallmark of token
 *   theft — the legitimate user moved on to a fresher token, the
 *   attacker is replaying the old one), we walk the chain and revoke
 *   every still-live descendant. The legitimate user is forced to
 *   sign in again, but the attacker's stolen token is now useless.
 *
 * Access-token blacklist:
 *   Each access token carries a `jti` claim (UUID-ish hex). The
 *   in-memory `accessBlacklist` Map<jti, expSeconds> tracks blacklisted
 *   ids until their natural expiry. A 60-second sweep evicts expired
 *   entries so the Map stays bounded. Production deployments would
 *   swap this for Redis; the call surface (`blacklistAccessToken` /
 *   `isAccessTokenBlacklisted`) doesn't change.
 *
 * Fingerprint binding:
 *   `generateFingerprint(req)` returns SHA-256(userAgent + ip).slice(0,32).
 *   Embedded in access-token payloads as `fp` so the auth middleware can
 *   reject tokens replayed from a different client.
 */

const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../config/db');
const jwtConfig = require('../config/jwt');
const { AppError } = require('../middleware/errorHandler');

/** Clock-skew tolerance in seconds. Lets a few seconds of drift between
 *  signer and verifier slide without spurious "expired" errors. */
const CLOCK_SKEW_SECONDS = 30;

/** In-memory blacklist of revoked access-token jti → exp (unix seconds). */
const accessBlacklist = new Map();

/** How often the blacklist sweep runs (ms). */
const BLACKLIST_SWEEP_INTERVAL_MS = 60 * 1000;

/* ──────────────────────────────────────────────────────────────────── */
/* Helpers                                                              */
/* ──────────────────────────────────────────────────────────────────── */

/**
 * Build an AppError with a `code` attached for the frontend to branch on.
 */
const tokenError = (code, message, status = 401) => {
  const err = new AppError(message, status);
  err.code = code;
  return err;
};

/**
 * Extract a stable client-IP string from a request, honouring the
 * X-Forwarded-For chain when behind a reverse proxy.
 */
const ipFromRequest = (req) => {
  if (!req) return '';
  const xff = req.headers?.['x-forwarded-for'];
  if (xff) {
    return String(xff).split(',')[0]?.trim() || '';
  }
  return req.ip || req.connection?.remoteAddress || '';
};

/**
 * Generate a fingerprint that binds a token to the issuing client.
 *
 * Uses SHA-256(userAgent + ip) truncated to 32 hex chars. We intentionally
 * keep this short — it's an integrity check, not a secret — so the
 * resulting JWT stays compact.
 *
 * @param {import('express').Request} req
 * @returns {string} 32-char hex fingerprint
 */
const generateFingerprint = (req) => {
  if (!req) return '';
  const ua = req.headers?.['user-agent'] || '';
  const ip = ipFromRequest(req);
  return crypto
    .createHash('sha256')
    .update(`${ua}|${ip}`)
    .digest('hex')
    .slice(0, 32);
};

/**
 * Generate a unique jti claim for each access token. Random hex is fine —
 * we just need uniqueness for blacklist lookups.
 */
const generateJti = () => crypto.randomBytes(16).toString('hex');

/* ──────────────────────────────────────────────────────────────────── */
/* Access tokens                                                        */
/* ──────────────────────────────────────────────────────────────────── */

/**
 * Generate a signed JWT access token for a user, optionally bound to the
 * issuing request via fingerprint.
 *
 * @param {Object} user - Authenticated user (id, email, roles)
 * @param {Object} [options]
 * @param {import('express').Request} [options.req] - When provided, embeds
 *   a fingerprint claim; the auth middleware will then enforce that
 *   subsequent requests come from the same UA + IP
 * @returns {string} Signed JWT
 */
const generateAccessToken = (user, options = {}) => {
  const payload = {
    id: user.id,
    email: user.email,
    roles: user.roles || [],
    jti: generateJti(),
  };
  if (options.req) {
    payload.fp = generateFingerprint(options.req);
  }
  return jwt.sign(payload, jwtConfig.accessTokenSecret, {
    expiresIn: jwtConfig.accessTokenExpiry,
  });
};

/**
 * Verify a JWT access token. Maps jsonwebtoken's various error names to
 * granular AppError + code combinations the frontend can branch on.
 *
 * @param {string} token
 * @returns {Object} Decoded payload (includes jti / fp when present)
 * @throws {AppError} 401 with err.code set for the failure mode
 */
const verifyAccessToken = (token) => {
  try {
    return jwt.verify(token, jwtConfig.accessTokenSecret, {
      clockTolerance: CLOCK_SKEW_SECONDS,
    });
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      throw tokenError('ERR_TOKEN_EXPIRED', 'Access token has expired');
    }
    if (err.name === 'NotBeforeError') {
      throw tokenError('ERR_TOKEN_NOT_YET_VALID', 'Token is not yet valid');
    }
    // JsonWebTokenError covers signature failures, malformed payloads, etc.
    throw tokenError('ERR_TOKEN_INVALID', 'Invalid access token');
  }
};

/**
 * Add an access-token jti to the blacklist with its expiry. Subsequent
 * requests presenting that jti will be rejected by the auth middleware.
 *
 * @param {string} jti
 * @param {number} expSeconds - Unix timestamp (seconds) when the token
 *   would naturally expire — used to purge the entry on schedule
 */
const blacklistAccessToken = (jti, expSeconds) => {
  if (!jti) return;
  accessBlacklist.set(jti, Number(expSeconds) || 0);
};

/**
 * Check whether a given jti has been blacklisted.
 *
 * @param {string} jti
 * @returns {boolean}
 */
const isAccessTokenBlacklisted = (jti) => {
  if (!jti) return false;
  const exp = accessBlacklist.get(jti);
  if (exp == null) return false;
  // Lazy-expire: drop entries that have aged out so the Map doesn't
  // accumulate forever between sweeps.
  if (exp > 0 && exp < Math.floor(Date.now() / 1000)) {
    accessBlacklist.delete(jti);
    return false;
  }
  return true;
};

/**
 * Periodic sweep that drops blacklist entries past their `exp`. Held in
 * a module-level interval so we only register the sweeper once per process.
 */
let blacklistSweeper = null;
const startBlacklistSweeper = () => {
  if (blacklistSweeper) return;
  blacklistSweeper = setInterval(() => {
    const now = Math.floor(Date.now() / 1000);
    for (const [jti, exp] of accessBlacklist.entries()) {
      if (exp > 0 && exp < now) accessBlacklist.delete(jti);
    }
  }, BLACKLIST_SWEEP_INTERVAL_MS);
  // Don't keep the event loop alive just for the sweeper.
  if (typeof blacklistSweeper.unref === 'function') {
    blacklistSweeper.unref();
  }
};
startBlacklistSweeper();

/* ──────────────────────────────────────────────────────────────────── */
/* Refresh tokens                                                       */
/* ──────────────────────────────────────────────────────────────────── */

/**
 * Generate a cryptographically random refresh-token string. Refresh
 * tokens are opaque (not JWTs) so we can revoke them by DB lookup.
 */
const generateRefreshToken = () => crypto.randomBytes(64).toString('hex');

/**
 * Verify a refresh token against the database AND detect reuse: if the
 * token has been revoked, presenting it again is a strong signal of
 * theft and triggers a family-wide revocation.
 *
 * @param {string} token
 * @param {string} [ipAddress] - Used as the actor on cascade revokes
 * @returns {Promise<Object>} The valid refresh-token DB row
 * @throws {AppError} 401 if token is invalid, expired, or reused
 */
const verifyRefreshToken = async (token, ipAddress) => {
  const [rows] = await db.query(
    'SELECT * FROM RefreshTokens WHERE token = ?',
    [token]
  );
  const record = rows[0];

  if (!record) {
    throw tokenError('ERR_REFRESH_INVALID', 'Invalid refresh token');
  }

  // Reuse detection — a revoked token presented again means either:
  //   (a) the legitimate user kept a stale tab open and just hit the
  //       race between rotate and refresh, or
  //   (b) an attacker stole the token and is now trying to use it after
  //       we'd already rotated it.
  // We can't tell which is which from the server side, and (b) is the
  // dangerous case — so we err on the side of safety and revoke the
  // entire family, forcing the legitimate user to sign in again.
  if (record.revoked_at) {
    await revokeRefreshTokenFamily(record, ipAddress);
    throw tokenError(
      'ERR_REFRESH_REUSE_DETECTED',
      'Token reuse detected — entire session family has been revoked. Please sign in again.'
    );
  }

  if (new Date(record.expires_at) < new Date()) {
    throw tokenError('ERR_REFRESH_EXPIRED', 'Refresh token has expired');
  }

  return record;
};

/**
 * Persist a refresh token. Returns the inserted row id.
 *
 * @param {number} userId
 * @param {string} token
 * @param {string} [ipAddress]
 * @returns {Promise<number>}
 */
const saveRefreshToken = async (userId, token, ipAddress) => {
  const expiresAt = new Date(Date.now() + jwtConfig.refreshTokenExpiryMs);
  const [result] = await db.query(
    'INSERT INTO RefreshTokens (user_id, token, expires_at, created_by_ip) VALUES (?, ?, ?, ?)',
    [userId, token, expiresAt, ipAddress || null]
  );
  return result.insertId;
};

/**
 * Revoke a single refresh token (no-op if already revoked).
 *
 * @param {string} token
 * @param {string} [ipAddress]
 * @param {string} [replacedByToken]
 */
const revokeRefreshToken = async (token, ipAddress, replacedByToken) => {
  await db.query(
    `UPDATE RefreshTokens
     SET revoked_at = NOW(), revoked_by_ip = ?, replaced_by_token = ?
     WHERE token = ? AND revoked_at IS NULL`,
    [ipAddress || null, replacedByToken || null, token]
  );
};

/**
 * Walk the `replaced_by_token` chain forward from a starting row and
 * revoke every still-live descendant. Used by reuse-detection to nuke
 * the entire token family in one operation.
 *
 * Stops on cycles (defensive) and on missing successor rows.
 *
 * @param {Object} startRow - A RefreshTokens row to start from (revoked or not)
 * @param {string} [ipAddress]
 */
const revokeRefreshTokenFamily = async (startRow, ipAddress) => {
  if (!startRow) return;

  // Walk forward until we hit a row whose `replaced_by_token` is null
  // (the leaf) — that's the latest descendant in the family.
  const seen = new Set();
  let cursor = startRow;
  while (cursor && cursor.replaced_by_token && !seen.has(cursor.token)) {
    seen.add(cursor.token);
    const [next] = await db.query(
      'SELECT * FROM RefreshTokens WHERE token = ? LIMIT 1',
      [cursor.replaced_by_token]
    );
    cursor = next[0];
  }

  // Revoke every member of the family that's still live. We know the
  // family share a `user_id` and form a chain — the safest mass-revoke
  // is "every non-revoked token belonging to this user_id whose
  // creation timestamp is at-or-before the leaf's". That catches the
  // attacker's freshly-rotated token and all sibling chains too.
  if (cursor && cursor.user_id) {
    await db.query(
      `UPDATE RefreshTokens
       SET revoked_at = NOW(), revoked_by_ip = ?
       WHERE user_id = ? AND revoked_at IS NULL`,
      [ipAddress || null, cursor.user_id]
    );
  }
};

/**
 * Rotate a refresh token: revoke the old one and issue a new one.
 * Wired through `verifyRefreshToken` so reuse detection runs on every
 * rotation attempt.
 *
 * @param {string} oldToken
 * @param {string} [ipAddress]
 * @returns {Promise<{ user: Object, newRefreshToken: string }>}
 */
const rotateRefreshToken = async (oldToken, ipAddress) => {
  const record = await verifyRefreshToken(oldToken, ipAddress);

  const newRefreshToken = generateRefreshToken();
  await saveRefreshToken(record.user_id, newRefreshToken, ipAddress);
  await revokeRefreshToken(oldToken, ipAddress, newRefreshToken);

  // Hydrate a full user (with roles) so callers can build an access token.
  const User = require('../models/User');
  const Role = require('../models/Role');
  const user = await User.findById(record.user_id);
  if (!user) {
    throw tokenError('ERR_REFRESH_USER_GONE', 'User no longer exists');
  }
  const roles = await Role.getUserRoles(user.id);
  user.roles = roles.map((r) => r.name);

  return { user, newRefreshToken };
};

/**
 * Revoke every refresh token belonging to a user. Used on password
 * change, role demotion, or admin-initiated forced logout.
 *
 * @param {number} userId
 */
const revokeAllUserTokens = async (userId) => {
  await db.query(
    'UPDATE RefreshTokens SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL',
    [userId]
  );
};

module.exports = {
  // Access tokens
  generateAccessToken,
  verifyAccessToken,
  blacklistAccessToken,
  isAccessTokenBlacklisted,
  // Refresh tokens
  generateRefreshToken,
  verifyRefreshToken,
  saveRefreshToken,
  revokeRefreshToken,
  revokeRefreshTokenFamily,
  rotateRefreshToken,
  revokeAllUserTokens,
  // Fingerprint
  generateFingerprint,
  // Internals exposed for tests
  _internals: {
    accessBlacklist,
    CLOCK_SKEW_SECONDS,
  },
};
