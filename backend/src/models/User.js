/**
 * @file backend/src/models/User.js
 * @description User model with parameterized SQL queries for CRUD operations
 * @author Dev A
 */

const db = require('../config/db');

/** Allowed columns for sorting to prevent SQL injection */
const ALLOWED_SORT_COLUMNS = ['id', 'email', 'first_name', 'last_name', 'is_active', 'created_at', 'updated_at'];
const ALLOWED_ORDER_DIRECTIONS = ['ASC', 'DESC'];

/**
 * Find all users with pagination, search, and sorting.
 * @param {Object} options - Query options
 * @param {number} [options.page=1] - Page number
 * @param {number} [options.limit=10] - Items per page
 * @param {string} [options.search] - Search term for email, first_name, last_name
 * @param {string} [options.sortBy='created_at'] - Column to sort by
 * @param {string} [options.order='DESC'] - Sort direction
 * @returns {Promise<{ data: Array, pagination: Object }>}
 */
const findAll = async ({ page = 1, limit = 10, search, sortBy = 'created_at', order = 'DESC' } = {}) => {
  const pageNum = parseInt(page) || 1;
  const limitNum = parseInt(limit) || 10;
  const offset = (pageNum - 1) * limitNum;

  let query = 'SELECT id, email, first_name, last_name, phone, profile_image, is_active, email_verified, created_at, updated_at FROM Users WHERE 1=1';
  const params = [];

  if (search) {
    query += ' AND (email LIKE ? OR first_name LIKE ? OR last_name LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  // Count total for pagination
  const [countResult] = await db.query(`SELECT COUNT(*) as total FROM (${query}) as t`, params);
  const total = countResult[0].total;

  // Whitelist-validate sortBy and order
  const safeSortBy = ALLOWED_SORT_COLUMNS.includes(sortBy) ? sortBy : 'created_at';
  const safeOrder = ALLOWED_ORDER_DIRECTIONS.includes(order?.toUpperCase()) ? order.toUpperCase() : 'DESC';

  query += ` ORDER BY ${safeSortBy} ${safeOrder} LIMIT ? OFFSET ?`;
  params.push(limitNum, offset);

  const [rows] = await db.query(query, params);
  return {
    data: rows,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum),
    },
  };
};

/**
 * Find a user by ID (excludes password_hash).
 * @param {number} id - User ID
 * @returns {Promise<Object|null>}
 */
const findById = async (id) => {
  const [rows] = await db.query(
    'SELECT id, email, first_name, last_name, phone, profile_image, is_active, email_verified, created_at, updated_at FROM Users WHERE id = ?',
    [id]
  );
  return rows[0] || null;
};

/**
 * Find a user by email (includes password_hash for authentication).
 * @param {string} email - User email
 * @returns {Promise<Object|null>}
 */
const findByEmail = async (email) => {
  const [rows] = await db.query('SELECT * FROM Users WHERE email = ?', [email]);
  return rows[0] || null;
};

/**
 * Create a new user.
 * @param {Object} data - User data
 * @param {string} data.email - User email
 * @param {string} data.password_hash - Hashed password
 * @param {string} data.first_name - First name
 * @param {string} data.last_name - Last name
 * @param {string} [data.phone] - Phone number
 * @returns {Promise<number>} Inserted user ID
 */
const create = async (data) => {
  const [result] = await db.query(
    'INSERT INTO Users (email, password_hash, first_name, last_name, phone) VALUES (?, ?, ?, ?, ?)',
    [data.email, data.password_hash, data.first_name, data.last_name, data.phone || null]
  );
  return result.insertId;
};

/**
 * Update a user by ID.
 * @param {number} id - User ID
 * @param {Object} data - Fields to update
 * @returns {Promise<void>}
 */
const update = async (id, data) => {
  const fields = [];
  const params = [];

  if (data.first_name !== undefined) { fields.push('first_name = ?'); params.push(data.first_name); }
  if (data.last_name !== undefined) { fields.push('last_name = ?'); params.push(data.last_name); }
  if (data.phone !== undefined) { fields.push('phone = ?'); params.push(data.phone); }
  if (data.profile_image !== undefined) { fields.push('profile_image = ?'); params.push(data.profile_image); }
  if (data.is_active !== undefined) { fields.push('is_active = ?'); params.push(data.is_active); }
  if (data.email_verified !== undefined) { fields.push('email_verified = ?'); params.push(data.email_verified); }
  if (data.password_hash !== undefined) { fields.push('password_hash = ?'); params.push(data.password_hash); }

  if (fields.length === 0) return;

  params.push(id);
  await db.query(`UPDATE Users SET ${fields.join(', ')} WHERE id = ?`, params);
};

/**
 * Delete a user by ID.
 * @param {number} id - User ID
 * @returns {Promise<void>}
 */
const remove = async (id) => {
  await db.query('DELETE FROM Users WHERE id = ?', [id]);
};

/* ──────────────────────────────────────────────────────────────────── */
/* Login tracking                                                       */
/* ──────────────────────────────────────────────────────────────────── */
/*
 * The methods below depend on columns added by migration 020:
 *   - failed_login_attempts INT DEFAULT 0
 *   - locked_until DATETIME NULL
 *   - last_login_at DATETIME NULL
 *   - last_login_ip VARCHAR(45) NULL
 *
 * Until that migration runs they'll throw "Unknown column" — the auth
 * controller calls them via `typeof User.fn === 'function'` guards so
 * the login flow stays usable on a pre-migrated database.
 */

/**
 * Check whether a user's account is currently locked. Returns the
 * lockout state plus the timestamp at which it'll auto-clear.
 *
 * If `locked_until` is in the past we transparently clear it as a
 * side-effect — that way the next login attempt sees a fresh slate
 * without needing a separate cleanup job.
 *
 * @param {number} userId
 * @returns {Promise<{ locked: boolean, locked_until: Date|null, failed_attempts: number }>}
 */
const isLocked = async (userId) => {
  const [rows] = await db.query(
    'SELECT failed_login_attempts, locked_until FROM Users WHERE id = ?',
    [userId]
  );
  const row = rows[0];
  if (!row) return { locked: false, locked_until: null, failed_attempts: 0 };

  const lockedUntil = row.locked_until ? new Date(row.locked_until) : null;
  const stillLocked = lockedUntil && lockedUntil.getTime() > Date.now();

  if (lockedUntil && !stillLocked) {
    // Lock has expired — clear it so subsequent calls don't have to.
    await db.query(
      'UPDATE Users SET locked_until = NULL, failed_login_attempts = 0 WHERE id = ?',
      [userId]
    );
    return {
      locked: false,
      locked_until: null,
      failed_attempts: 0,
    };
  }

  return {
    locked: Boolean(stillLocked),
    locked_until: stillLocked ? lockedUntil : null,
    failed_attempts: Number(row.failed_login_attempts) || 0,
  };
};

/**
 * Increment the failed-login counter on a user. When the resulting
 * count reaches `maxAttempts`, sets `locked_until = now + duration`
 * and returns the lockout timestamp so the caller can format an error.
 *
 * Wrapped in a single UPDATE-then-SELECT so concurrent attempts on the
 * same user can't race past the threshold (the SELECT after UPDATE
 * always reflects the post-write state).
 *
 * @param {number} userId
 * @param {Object} [options]
 * @param {number} [options.maxAttempts=5]
 * @param {number} [options.lockoutDurationMs=15*60*1000]
 * @returns {Promise<{ failed_attempts: number, locked_until: Date|null }>}
 */
const incrementFailedAttempts = async (
  userId,
  { maxAttempts = 5, lockoutDurationMs = 15 * 60 * 1000 } = {}
) => {
  // Step 1: increment.
  await db.query(
    'UPDATE Users SET failed_login_attempts = COALESCE(failed_login_attempts, 0) + 1 WHERE id = ?',
    [userId]
  );

  // Step 2: read post-increment count + decide on lockout.
  const [rows] = await db.query(
    'SELECT failed_login_attempts FROM Users WHERE id = ?',
    [userId]
  );
  const attempts = Number(rows[0]?.failed_login_attempts) || 0;

  let lockedUntil = null;
  if (attempts >= maxAttempts) {
    lockedUntil = new Date(Date.now() + lockoutDurationMs);
    await db.query('UPDATE Users SET locked_until = ? WHERE id = ?', [
      lockedUntil,
      userId,
    ]);
  }

  return { failed_attempts: attempts, locked_until: lockedUntil };
};

/**
 * Reset the failed-login counter (and clear any stale lock). Called
 * by `recordSuccessfulLogin` and from admin-initiated unlock flows.
 *
 * @param {number} userId
 */
const resetFailedAttempts = async (userId) => {
  await db.query(
    'UPDATE Users SET failed_login_attempts = 0, locked_until = NULL WHERE id = ?',
    [userId]
  );
};

/**
 * Record a successful login: zero the failed-attempts counter, clear
 * any lock, and stamp `last_login_at` / `last_login_ip` so HR / Admin
 * can review who used the system and from where.
 *
 * @param {number} userId
 * @param {string|null} ip - Client IP from `x-forwarded-for` / req.ip
 */
const recordSuccessfulLogin = async (userId, ip) => {
  await db.query(
    `UPDATE Users
     SET failed_login_attempts = 0,
         locked_until = NULL,
         last_login_at = NOW(),
         last_login_ip = ?
     WHERE id = ?`,
    [ip || null, userId]
  );
};

/**
 * Manual admin unlock — clears the counter + lock without recording a
 * login. Used by a future admin "Unlock account" action.
 *
 * @param {number} userId
 */
const unlockAccount = async (userId) => {
  await db.query(
    'UPDATE Users SET failed_login_attempts = 0, locked_until = NULL WHERE id = ?',
    [userId]
  );
};

module.exports = {
  findAll,
  findById,
  findByEmail,
  create,
  update,
  remove,
  // Login tracking (depend on migration 020)
  isLocked,
  incrementFailedAttempts,
  resetFailedAttempts,
  recordSuccessfulLogin,
  unlockAccount,
};
