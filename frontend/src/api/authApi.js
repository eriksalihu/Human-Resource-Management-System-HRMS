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
 * Refresh the access token using the httpOnly refresh cookie.
 * Updates the in-memory access token on success.
 *
 * @returns {Promise<string>} The new access token
 */
export const refreshToken = async () => {
  const { data } = await axiosInstance.post('/auth/refresh-token');
  const newToken = data.data.accessToken;
  setAccessToken(newToken);
  return newToken;
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

export default { login, register, logout, refreshToken, getProfile };
