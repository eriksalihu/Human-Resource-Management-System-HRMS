/**
 * @file backend/src/services/token.service.js
 * @description JWT token service with DB-backed refresh token rotation
 * @author Dev A
 */

const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../config/db');
const jwtConfig = require('../config/jwt');
const { AppError } = require('../middleware/errorHandler');

/**
 * Generate a signed JWT access token for a user.
 * Payload includes user id, email, and role names for authorization checks.
 *
 * @param {Object} user - Authenticated user
 * @param {number} user.id - User ID
 * @param {string} user.email - User email
 * @param {string[]} [user.roles] - Array of role names
 * @returns {string} Signed JWT access token
 */
const generateAccessToken = (user) => {
  const payload = {
    id: user.id,
    email: user.email,
    roles: user.roles || [],
  };
  return jwt.sign(payload, jwtConfig.accessTokenSecret, {
    expiresIn: jwtConfig.accessTokenExpiry,
  });
};

/**
 * Generate a cryptographically random refresh token string.
 * Refresh tokens are opaque strings (not JWTs) to support revocation via DB lookup.
 *
 * @returns {string} 64-character hex refresh token
 */
const generateRefreshToken = () => {
  return crypto.randomBytes(64).toString('hex');
};

/**
 * Verify a JWT access token.
 *
 * @param {string} token - Access token to verify
 * @returns {Object} Decoded token payload
 * @throws {AppError} 401 if token is invalid or expired
 */
const verifyAccessToken = (token) => {
  try {
    return jwt.verify(token, jwtConfig.accessTokenSecret);
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      throw new AppError('Access token has expired', 401);
    }
    throw new AppError('Invalid access token', 401);
  }
};

/**
 * Verify a refresh token against the database.
 * Checks that the token exists, has not been revoked, and has not expired.
 *
 * @param {string} token - Refresh token to verify
 * @returns {Promise<Object>} Refresh token row from DB
 * @throws {AppError} 401 if token is invalid, revoked, or expired
 */
const verifyRefreshToken = async (token) => {
  const [rows] = await db.query(
    'SELECT * FROM RefreshTokens WHERE token = ?',
    [token]
  );
  const record = rows[0];

  if (!record) {
    throw new AppError('Invalid refresh token', 401);
  }

  if (record.revoked_at) {
    throw new AppError('Refresh token has been revoked', 401);
  }

  if (new Date(record.expires_at) < new Date()) {
    throw new AppError('Refresh token has expired', 401);
  }

  return record;
};

/**
 * Persist a refresh token to the database.
 *
 * @param {number} userId - User ID
 * @param {string} token - Refresh token string
 * @param {string} [ipAddress] - Client IP address for audit
 * @returns {Promise<number>} Inserted refresh token ID
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
 * Revoke a refresh token by marking it revoked in the database.
 *
 * @param {string} token - Refresh token to revoke
 * @param {string} [ipAddress] - Client IP address for audit
 * @param {string} [replacedByToken] - Replacement token if rotating
 * @returns {Promise<void>}
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
 * Rotate a refresh token: revoke the old one and issue a new one.
 * Used during /refresh-token flow to prevent replay attacks.
 *
 * @param {string} oldToken - Refresh token to rotate
 * @param {string} [ipAddress] - Client IP address
 * @returns {Promise<{ user: Object, newRefreshToken: string }>}
 * @throws {AppError} 401 if old token is invalid
 */
const rotateRefreshToken = async (oldToken, ipAddress) => {
  const record = await verifyRefreshToken(oldToken);

  const newRefreshToken = generateRefreshToken();
  await saveRefreshToken(record.user_id, newRefreshToken, ipAddress);
  await revokeRefreshToken(oldToken, ipAddress, newRefreshToken);

  // Fetch full user for downstream access token generation
  const User = require('../models/User');
  const Role = require('../models/Role');
  const user = await User.findById(record.user_id);
  if (!user) {
    throw new AppError('User no longer exists', 401);
  }
  const roles = await Role.getUserRoles(user.id);
  user.roles = roles.map((r) => r.name);

  return { user, newRefreshToken };
};

/**
 * Revoke all refresh tokens belonging to a user.
 * Used on password change or forced logout across devices.
 *
 * @param {number} userId - User ID
 * @returns {Promise<void>}
 */
const revokeAllUserTokens = async (userId) => {
  await db.query(
    'UPDATE RefreshTokens SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL',
    [userId]
  );
};

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  saveRefreshToken,
  revokeRefreshToken,
  rotateRefreshToken,
  revokeAllUserTokens,
};
