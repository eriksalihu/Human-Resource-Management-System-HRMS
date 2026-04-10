/**
 * @file backend/src/services/auth.service.js
 * @description Authentication service with registration, login, and password management
 * @author Dev A
 */

const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Role = require('../models/Role');
const { AppError } = require('../middleware/errorHandler');

/** Number of bcrypt salt rounds — balance between security and performance */
const SALT_ROUNDS = 12;

/** Default role name assigned to new registrations */
const DEFAULT_ROLE = 'Employee';

/**
 * Register a new user.
 * Hashes the password, creates the user record, and assigns the default role.
 *
 * @param {Object} data - Registration data
 * @param {string} data.email - User email
 * @param {string} data.password - Plain-text password
 * @param {string} data.first_name - First name
 * @param {string} data.last_name - Last name
 * @param {string} [data.phone] - Optional phone number
 * @returns {Promise<Object>} The newly created user (without password_hash)
 * @throws {AppError} 409 if email already exists
 */
const register = async (data) => {
  const existing = await User.findByEmail(data.email);
  if (existing) {
    throw new AppError('Email is already registered', 409);
  }

  const password_hash = await bcrypt.hash(data.password, SALT_ROUNDS);

  const userId = await User.create({
    email: data.email,
    password_hash,
    first_name: data.first_name,
    last_name: data.last_name,
    phone: data.phone,
  });

  // Assign default "Employee" role
  const defaultRole = await Role.findByName(DEFAULT_ROLE);
  if (defaultRole) {
    await Role.assignToUser(userId, defaultRole.id);
  }

  return await User.findById(userId);
};

/**
 * Authenticate a user with email and password.
 * Verifies credentials and returns the user (without password_hash) on success.
 *
 * @param {string} email - User email
 * @param {string} password - Plain-text password
 * @returns {Promise<Object>} Authenticated user with roles
 * @throws {AppError} 401 if credentials are invalid, 403 if account is inactive
 */
const login = async (email, password) => {
  const user = await User.findByEmail(email);
  if (!user) {
    throw new AppError('Invalid email or password', 401);
  }

  if (!user.is_active) {
    throw new AppError('Account is inactive. Please contact an administrator.', 403);
  }

  const isValid = await bcrypt.compare(password, user.password_hash);
  if (!isValid) {
    throw new AppError('Invalid email or password', 401);
  }

  // Strip password_hash before returning
  const { password_hash, ...safeUser } = user;

  // Attach roles for downstream token generation
  const roles = await Role.getUserRoles(user.id);
  safeUser.roles = roles.map((r) => r.name);

  return safeUser;
};

/**
 * Change a user's password after verifying the current password.
 *
 * @param {number} userId - User ID
 * @param {string} oldPassword - Current plain-text password
 * @param {string} newPassword - New plain-text password
 * @returns {Promise<void>}
 * @throws {AppError} 401 if old password is incorrect, 404 if user not found
 */
const changePassword = async (userId, oldPassword, newPassword) => {
  const [rows] = await require('../config/db').query(
    'SELECT id, password_hash FROM Users WHERE id = ?',
    [userId]
  );
  const user = rows[0];

  if (!user) {
    throw new AppError('User not found', 404);
  }

  const isValid = await bcrypt.compare(oldPassword, user.password_hash);
  if (!isValid) {
    throw new AppError('Current password is incorrect', 401);
  }

  const newHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  await User.update(userId, { password_hash: newHash });
};

/**
 * Mark a user's email as verified.
 *
 * @param {number} userId - User ID
 * @returns {Promise<void>}
 */
const verifyEmail = async (userId) => {
  await User.update(userId, { email_verified: true });
};

module.exports = { register, login, changePassword, verifyEmail };
