/**
 * @file backend/src/models/Role.js
 * @description Role model with CRUD operations and user-role assignment methods
 * @author Dev A
 */

const db = require('../config/db');

/**
 * Find all roles.
 * @returns {Promise<Array>} List of all roles
 */
const findAll = async () => {
  const [rows] = await db.query('SELECT * FROM Roles ORDER BY id ASC');
  return rows;
};

/**
 * Find a role by ID.
 * @param {number} id - Role ID
 * @returns {Promise<Object|null>}
 */
const findById = async (id) => {
  const [rows] = await db.query('SELECT * FROM Roles WHERE id = ?', [id]);
  return rows[0] || null;
};

/**
 * Find a role by name.
 * @param {string} name - Role name
 * @returns {Promise<Object|null>}
 */
const findByName = async (name) => {
  const [rows] = await db.query('SELECT * FROM Roles WHERE name = ?', [name]);
  return rows[0] || null;
};

/**
 * Create a new role.
 * @param {Object} data - Role data
 * @param {string} data.name - Role name
 * @param {string} [data.description] - Role description
 * @returns {Promise<number>} Inserted role ID
 */
const create = async (data) => {
  const [result] = await db.query(
    'INSERT INTO Roles (name, description) VALUES (?, ?)',
    [data.name, data.description || null]
  );
  return result.insertId;
};

/**
 * Assign a role to a user via the UserRoles junction table.
 * Uses INSERT IGNORE to prevent duplicate assignments.
 * @param {number} userId - User ID
 * @param {number} roleId - Role ID
 * @returns {Promise<void>}
 */
const assignToUser = async (userId, roleId) => {
  await db.query(
    'INSERT IGNORE INTO UserRoles (user_id, role_id) VALUES (?, ?)',
    [userId, roleId]
  );
};

/**
 * Remove a role from a user.
 * @param {number} userId - User ID
 * @param {number} roleId - Role ID
 * @returns {Promise<void>}
 */
const removeFromUser = async (userId, roleId) => {
  await db.query(
    'DELETE FROM UserRoles WHERE user_id = ? AND role_id = ?',
    [userId, roleId]
  );
};

/**
 * Get all roles assigned to a specific user.
 * @param {number} userId - User ID
 * @returns {Promise<Array>} List of roles for the user
 */
const getUserRoles = async (userId) => {
  const [rows] = await db.query(
    `SELECT r.* FROM Roles r
     INNER JOIN UserRoles ur ON r.id = ur.role_id
     WHERE ur.user_id = ?
     ORDER BY r.name ASC`,
    [userId]
  );
  return rows;
};

module.exports = { findAll, findById, findByName, create, assignToUser, removeFromUser, getUserRoles };
