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

module.exports = { findAll, findById, findByEmail, create, update, remove };
