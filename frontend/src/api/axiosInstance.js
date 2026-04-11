/**
 * @file frontend/src/api/axiosInstance.js
 * @description Axios instance with automatic token refresh interceptors
 * @author Dev B
 */

import axios from 'axios';

/** Base URL of the HRMS backend API (from Vite env with fallback) */
const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

/**
 * In-memory access token storage.
 * Kept in a module-level variable rather than localStorage to reduce XSS attack
 * surface. The AuthContext will set this on login and clear it on logout.
 */
let accessToken = null;

/**
 * Set the in-memory access token.
 * @param {string|null} token
 */
export const setAccessToken = (token) => {
  accessToken = token;
};

/**
 * Get the current in-memory access token.
 * @returns {string|null}
 */
export const getAccessToken = () => accessToken;

/** Pre-configured Axios instance used across the app */
const axiosInstance = axios.create({
  baseURL: BASE_URL,
  withCredentials: true, // Send httpOnly refresh token cookie on cross-origin requests
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});

/**
 * Request interceptor — attach the in-memory access token as a Bearer header
 * on every outgoing request if one is set.
 */
axiosInstance.interceptors.request.use(
  (config) => {
    if (accessToken) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

/**
 * Refresh-token concurrency control.
 * Prevents multiple simultaneous refresh attempts when several requests hit 401
 * at the same time — all waiters resolve with the same new token.
 */
let isRefreshing = false;
let refreshSubscribers = [];

const subscribeTokenRefresh = (cb) => {
  refreshSubscribers.push(cb);
};

const onTokenRefreshed = (newToken) => {
  refreshSubscribers.forEach((cb) => cb(newToken));
  refreshSubscribers = [];
};

/**
 * Response interceptor — on 401 Unauthorized, attempt to refresh the access
 * token via /refresh-token (which reads the httpOnly refresh cookie). On
 * success, retry the original request. On failure, redirect to /login.
 */
axiosInstance.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Skip refresh flow for the refresh endpoint itself to avoid infinite loops
    if (
      error.response?.status === 401 &&
      !originalRequest._retry &&
      !originalRequest.url?.includes('/auth/refresh-token') &&
      !originalRequest.url?.includes('/auth/login')
    ) {
      if (isRefreshing) {
        // Queue this request until the in-flight refresh finishes
        return new Promise((resolve, reject) => {
          subscribeTokenRefresh((newToken) => {
            if (newToken) {
              originalRequest.headers.Authorization = `Bearer ${newToken}`;
              resolve(axiosInstance(originalRequest));
            } else {
              reject(error);
            }
          });
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const { data } = await axiosInstance.post('/auth/refresh-token');
        const newToken = data?.data?.accessToken;

        if (!newToken) {
          throw new Error('No access token returned from refresh');
        }

        setAccessToken(newToken);
        onTokenRefreshed(newToken);

        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return axiosInstance(originalRequest);
      } catch (refreshError) {
        // Refresh failed — clear token, notify queued waiters, redirect to login
        setAccessToken(null);
        onTokenRefreshed(null);

        if (typeof window !== 'undefined' && !window.location.pathname.includes('/login')) {
          window.location.href = '/login';
        }

        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export default axiosInstance;
