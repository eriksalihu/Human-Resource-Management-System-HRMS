/**
 * @file backend/src/services/auth.service.js
 * @description Authentication service with registration, login, and password management
 * @author Dev A
 */

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Role = require('../models/Role');
const PasswordResetToken = require('../models/PasswordResetToken');
const RefreshToken = require('../models/RefreshToken');
const { AppError } = require('../middleware/errorHandler');

/** Number of bcrypt salt rounds — balance between security and performance */
const SALT_ROUNDS = 12;

/** Default role name assigned to new registrations */
const DEFAULT_ROLE = 'Employee';

/** How long a password-reset token stays valid. */
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

/** SHA-256 hex digest — used to hash reset tokens before storage. */
const sha256 = (value) =>
  crypto.createHash('sha256').update(value).digest('hex');

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
    // 403, not 401 — the user IS authenticated (valid JWT), but the
    // supplied current password doesn't match.  Using 401 here would
    // trick the axios interceptor into thinking the access token is
    // expired, triggering a refresh-and-retry loop that ends in a
    // forced logout instead of a friendly validation error.
    const err = new AppError('Current password is incorrect', 403);
    err.code = 'ERR_PASSWORD_MISMATCH';
    throw err;
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

/* ──────────────────────────────────────────────────────────────────── */
/* Password reset (commit 292)                                          */
/* ──────────────────────────────────────────────────────────────────── */

/**
 * Begin a password reset.
 *
 * Generates a cryptographically-random raw token, stores ONLY its
 * SHA-256 hash (single-use, 1-hour expiry), invalidates any prior
 * outstanding tokens for the user, and returns the RAW token so the
 * caller can email it.
 *
 * Anti-enumeration: when no account matches the email this resolves
 * `{ user: null }` WITHOUT touching the DB further — the controller
 * returns the same neutral message either way, so an attacker can't
 * use the endpoint to discover which emails are registered.
 *
 * @param {string} email
 * @returns {Promise<{ user: Object|null, rawToken: string|null, expiresAt: Date|null }>}
 */
const requestPasswordReset = async (email) => {
  const user = await User.findByEmail(email);
  if (!user) {
    return { user: null, rawToken: null, expiresAt: null };
  }

  // Only the newest link should work — burn any earlier ones.
  await PasswordResetToken.invalidateAllForUser(user.id);

  const rawToken = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);
  await PasswordResetToken.create({
    user_id: user.id,
    token_hash: sha256(rawToken),
    expires_at: expiresAt,
  });

  // Strip the hash before handing the user object back.
  const { password_hash, ...safeUser } = user;
  return { user: safeUser, rawToken, expiresAt };
};

/**
 * Complete a password reset.
 *
 * Validates the raw token against its stored hash (must be unused +
 * unexpired), sets the new password, then BURNS the token, invalidates
 * any sibling tokens, and revokes the user's refresh tokens so a
 * thief who triggered the reset can't keep a stale session alive.
 *
 * @param {string} rawToken - The token from the reset link
 * @param {string} newPassword - New plain-text password
 * @returns {Promise<{ userId: number }>}
 * @throws {AppError} 400 with code ERR_RESET_TOKEN_INVALID when the
 *   token is missing / unknown / expired / already used
 */
const resetPassword = async (rawToken, newPassword) => {
  if (!rawToken || !newPassword) {
    throw new AppError('Reset token and new password are required', 400);
  }

  const record = await PasswordResetToken.findValidByHash(sha256(rawToken));
  if (!record) {
    throw new AppError(
      'This password reset link is invalid or has expired. Please request a new one.',
      400,
      { code: 'ERR_RESET_TOKEN_INVALID' }
    );
  }

  const newHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  await User.update(record.user_id, { password_hash: newHash });

  // Single-use: consume this token and any siblings.
  await PasswordResetToken.markUsed(record.id);
  await PasswordResetToken.invalidateAllForUser(record.user_id);

  // Force re-authentication everywhere — a reset should evict any
  // session an attacker might have established.
  try {
    await RefreshToken.revokeAllForUser(record.user_id);
  } catch {
    // Non-fatal: the password is already changed; session eviction is
    // best-effort here.
  }

  return { userId: record.user_id };
};

module.exports = {
  register,
  login,
  changePassword,
  verifyEmail,
  requestPasswordReset,
  resetPassword,
};
