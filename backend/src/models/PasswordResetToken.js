/**
 * @file backend/src/models/PasswordResetToken.js
 * @description Model for single-use, time-limited password-reset tokens
 *   (commit 292). Only the SHA-256 HASH of a token is ever persisted —
 *   the raw token lives only in the email link, so a DB leak yields no
 *   usable reset credentials.
 * @author Dev A
 */

const db = require('../config/db');

/**
 * Insert a new reset-token row.
 *
 * @param {Object} data
 * @param {number} data.user_id
 * @param {string} data.token_hash - SHA-256 hex digest of the raw token
 * @param {Date}   data.expires_at - Absolute expiry timestamp
 * @returns {Promise<number>} Inserted row id
 */
const create = async ({ user_id, token_hash, expires_at }) => {
  const [result] = await db.query(
    `INSERT INTO PasswordResetTokens (user_id, token_hash, expires_at)
     VALUES (?, ?, ?)`,
    [user_id, token_hash, expires_at]
  );
  return result.insertId;
};

/**
 * Find a token row by its hash that is still VALID — i.e. not yet used
 * and not yet expired. Returns null otherwise (consumed, expired, or
 * never existed all look the same to the caller).
 *
 * @param {string} token_hash
 * @returns {Promise<Object|null>}
 */
const findValidByHash = async (token_hash) => {
  const [rows] = await db.query(
    `SELECT id, user_id, token_hash, expires_at, used_at, created_at
     FROM PasswordResetTokens
     WHERE token_hash = ?
       AND used_at IS NULL
       AND expires_at > NOW()
     LIMIT 1`,
    [token_hash]
  );
  return rows[0] || null;
};

/**
 * Mark a token consumed so it can never be replayed.
 *
 * @param {number} id
 * @returns {Promise<void>}
 */
const markUsed = async (id) => {
  await db.query(
    'UPDATE PasswordResetTokens SET used_at = NOW() WHERE id = ?',
    [id]
  );
};

/**
 * Invalidate every outstanding token for a user by stamping `used_at`.
 * Called when issuing a fresh token (so only the newest link works) and
 * again after a successful reset (defense in depth).
 *
 * @param {number} userId
 * @returns {Promise<void>}
 */
const invalidateAllForUser = async (userId) => {
  await db.query(
    `UPDATE PasswordResetTokens
        SET used_at = NOW()
      WHERE user_id = ? AND used_at IS NULL`,
    [userId]
  );
};

/**
 * Housekeeping: delete expired / used rows older than `days`. Not wired
 * to a scheduler here, but exposed so a future cron can keep the table
 * tidy without bespoke SQL.
 *
 * @param {number} [days=7]
 * @returns {Promise<number>} Rows deleted
 */
const purgeStale = async (days = 7) => {
  const [result] = await db.query(
    `DELETE FROM PasswordResetTokens
      WHERE (used_at IS NOT NULL OR expires_at < NOW())
        AND created_at < (NOW() - INTERVAL ? DAY)`,
    [days]
  );
  return result.affectedRows || 0;
};

module.exports = {
  create,
  findValidByHash,
  markUsed,
  invalidateAllForUser,
  purgeStale,
};
