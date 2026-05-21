/**
 * @file frontend/src/api/authApi.js
 * @description Auth API service functions using the shared Axios instance
 * @author Dev B
 */

import axiosInstance, { setAccessToken } from './axiosInstance';

/**
 * Log in with email and password.
 * On success, stores the returned access token in the in-memory axios instance.
 *
 * @param {{ email: string, password: string }} credentials
 * @returns {Promise<{ user: Object, accessToken: string }>} User and access token
 */
export const login = async ({ email, password }) => {
  const { data } = await axiosInstance.post('/auth/login', { email, password });
  const { user, accessToken } = data.data;
  setAccessToken(accessToken);
  return { user, accessToken };
};

/**
 * Register a new user account.
 *
 * @param {Object} payload
 * @param {string} payload.email
 * @param {string} payload.password
 * @param {string} payload.first_name
 * @param {string} payload.last_name
 * @param {string} [payload.phone]
 * @returns {Promise<Object>} The newly created user
 */
export const register = async (payload) => {
  const { data } = await axiosInstance.post('/auth/register', payload);
  return data.data.user;
};

/**
 * Log out the current user.
 * Clears the in-memory access token after the server revokes the refresh token.
 *
 * @returns {Promise<void>}
 */
export const logout = async () => {
  try {
    await axiosInstance.post('/auth/logout');
  } finally {
    // Always clear client state even if the server call fails
    setAccessToken(null);
  }
};

/**
 * Single-flight guard for the refresh call.
 *
 * Race fixed (commit 276): three independent triggers can ask for a
 * refresh at nearly the same moment —
 *   1. AuthContext's proactive pre-expiry timer
 *   2. the axios interceptor reacting to a 401
 *   3. AuthContext init on a cold load
 * Each `POST /auth/refresh-token` ROTATES the refresh token, so two
 * concurrent calls mean the 2nd presents an already-rotated token →
 * the backend's theft/reuse detection fires and force-logs-out a
 * perfectly valid session. Sharing one in-flight promise collapses
 * the burst into a single rotation; everyone awaits the same result.
 *
 * @type {Promise<string>|null}
 */
let inFlightRefresh = null;

/**
 * Refresh the access token using the httpOnly refresh cookie.
 * Updates the in-memory access token on success. Concurrent callers
 * share a single underlying request (see `inFlightRefresh`).
 *
 * @returns {Promise<string>} The new access token
 */
export const refreshToken = async () => {
  if (inFlightRefresh) return inFlightRefresh;

  inFlightRefresh = (async () => {
    try {
      const { data } = await axiosInstance.post('/auth/refresh-token');
      const newToken = data.data.accessToken;
      setAccessToken(newToken);
      return newToken;
    } finally {
      // Clear the gate regardless of outcome so the NEXT genuine
      // expiry can refresh again.
      inFlightRefresh = null;
    }
  })();

  return inFlightRefresh;
};

/**
 * Fetch the authenticated user's profile with roles.
 *
 * @returns {Promise<Object>} The user profile
 */
export const getProfile = async () => {
  const { data } = await axiosInstance.get('/auth/profile');
  return data.data.user;
};

/**
 * Begin a password reset. The backend always responds with the same
 * neutral message (no account-enumeration), so callers should show a
 * single "check your inbox" state regardless of the result.
 *
 * @param {string} email
 * @returns {Promise<Object>} The (neutral) response body
 */
export const forgotPassword = async (email) => {
  const { data } = await axiosInstance.post('/auth/forgot-password', {
    email,
  });
  return data;
};

/**
 * Complete a password reset with the token from the email link.
 * Rejects (4xx) with `code: 'ERR_RESET_TOKEN_INVALID'` when the token
 * is missing / expired / already used, or a 422 with field errors when
 * the new password fails the strength rules.
 *
 * @param {{ token: string, password: string }} args
 * @returns {Promise<Object>} The success response body
 */
export const resetPassword = async ({ token, password }) => {
  const { data } = await axiosInstance.post('/auth/reset-password', {
    token,
    password,
  });
  return data;
};

export default {
  login,
  register,
  logout,
  refreshToken,
  getProfile,
  forgotPassword,
  resetPassword,
};
