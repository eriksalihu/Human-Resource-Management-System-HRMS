/**
 * @file backend/src/models/RefreshToken.js
 * @description RefreshToken model — persistence, lookup, revocation, cleanup
 * @author Dev A
 */

const db = require('../config/db');

/**
 * Create a new refresh token record.
 *
 * @param {Object} data
 * @param {number} data.user_id - User ID the token belongs to
 * @param {string} data.token - Refresh token string
 * @param {Date|string} data.expires_at - Token expiration timestamp
 * @param {string} [data.created_by_ip] - IP address that created the token
 * @returns {Promise<number>} Inserted row ID
 */
const create = async (data) => {
  const [result] = await db.query(
    `INSERT INTO RefreshTokens (user_id, token, expires_at, created_by_ip)
     VALUES (?, ?, ?, ?)`,
    [data.user_id, data.token, data.expires_at, data.created_by_ip || null]
  );
  return result.insertId;
};

/**
 * Find a refresh token record by its token string.
 *
 * @param {string} token
 * @returns {Promise<Object|null>} The token row or null
 */
const findByToken = async (token) => {
  const [rows] = await db.query(
    'SELECT * FROM RefreshTokens WHERE token = ? LIMIT 1',
    [token]
  );
  return rows[0] || null;
};

/**
 * Revoke a refresh token by marking it revoked in the database.
 *
 * @param {string} token - Token to revoke
 * @param {Object} [opts]
 * @param {string} [opts.revokedByIp] - IP address revoking the token
 * @param {string} [opts.replacedByToken] - Replacement token (for rotation)
 * @returns {Promise<boolean>} True if a row was updated
 */
const revokeByToken = async (token, { revokedByIp, replacedByToken } = {}) => {
  const [result] = await db.query(
    `UPDATE RefreshTokens
     SET revoked_at = NOW(), revoked_by_ip = ?, replaced_by_token = ?
     WHERE token = ? AND revoked_at IS NULL`,
    [revokedByIp || null, replacedByToken || null, token]
  );
  return result.affectedRows > 0;
};

/**
 * Revoke all active refresh tokens belonging to a user.
 * Used on password change or forced sign-out across devices.
 *
 * @param {number} userId
 * @returns {Promise<number>} Number of rows revoked
 */
const revokeAllForUser = async (userId) => {
  const [result] = await db.query(
    `UPDATE RefreshTokens SET revoked_at = NOW()
     WHERE user_id = ? AND revoked_at IS NULL`,
    [userId]
  );
  return result.affectedRows;
};

/**
 * Delete expired refresh tokens to keep the table size manageable.
 * Safe to run as a periodic cron job.
 *
 * @returns {Promise<number>} Number of rows deleted
 */
const deleteExpired = async () => {
  const [result] = await db.query(
    'DELETE FROM RefreshTokens WHERE expires_at < NOW()'
  );
  return result.affectedRows;
};

/**
 * Check whether a refresh token is valid (exists, not revoked, not expired).
 *
 * @param {string} token
 * @returns {Promise<boolean>}
 */
const isTokenValid = async (token) => {
  const record = await findByToken(token);
  if (!record) return false;
  if (record.revoked_at) return false;
  if (new Date(record.expires_at) < new Date()) return false;
  return true;
};

module.exports = {
  create,
  findByToken,
  revokeByToken,
  revokeAllForUser,
  deleteExpired,
  isTokenValid,
};
