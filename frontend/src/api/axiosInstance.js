/**
 * @file frontend/src/api/axiosInstance.js
 * @description Axios instance with automatic token refresh, request queueing during refresh, replay-on-success, error-code-driven logout, and request-ID tracing
 * @author Dev B
 *
 * Refresh flow:
 *   1. Request returns 401
 *   2. If a refresh is already in flight, the request joins a waiter
 *      queue and resolves once the refresh settles
 *   3. Otherwise, this request becomes the refresh pioneer — it calls
 *      `/auth/refresh-token`, then notifies every queued waiter with
 *      the new token, then retries itself
 *   4. On refresh failure, every waiter rejects, the in-memory token
 *      is cleared, and the user is redirected to `/login`
 *
 * Backend error codes consumed (per Day 36 commits 193–195):
 *   - `ERR_TOKEN_EXPIRED`           → trigger silent refresh
 *   - `ERR_TOKEN_REVOKED`           → forced logout (don't bother refreshing)
 *   - `ERR_TOKEN_FINGERPRINT_MISMATCH` → forced logout
 *   - `ERR_REFRESH_REUSE_DETECTED`  → forced logout (token theft suspected)
 *   - `ERR_REFRESH_EXPIRED` / `_INVALID` / `_MISSING` → forced logout
 *
 * Request ID:
 *   Every outgoing request gets an `x-request-id` header (random hex)
 *   so backend access logs and frontend network panel rows can be
 *   correlated when chasing a bug. The middleware echoes it back on the
 *   response — listeners can see the round-trip ID in dev tools.
 */

import axios from 'axios';

/** Base URL of the HRMS backend API (from Vite env with local fallback). */
const BASE_URL =
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

/** Header name shared with the backend (`backend/src/middleware/auth.js`). */
const REQUEST_ID_HEADER = 'x-request-id';

/**
 * Backend error codes that should NOT trigger a refresh attempt — they
 * indicate the user's session is permanently dead and refreshing would
 * just make things worse. Any of these → forced logout.
 */
const FORCED_LOGOUT_CODES = new Set([
  'ERR_TOKEN_REVOKED',
  'ERR_TOKEN_FINGERPRINT_MISMATCH',
  'ERR_REFRESH_REUSE_DETECTED',
  'ERR_REFRESH_EXPIRED',
  'ERR_REFRESH_INVALID',
  'ERR_REFRESH_USER_GONE',
]);

/* ──────────────────────────────────────────────────────────────────── */
/* In-memory access token                                                */
/* ──────────────────────────────────────────────────────────────────── */

/**
 * Module-level access-token storage. Kept in memory rather than
 * localStorage to reduce the XSS attack surface — `AuthContext` is the
 * source of truth and pushes updates here on login / refresh.
 */
let accessToken = null;

/** Set the in-memory access token. */
export const setAccessToken = (token) => {
  accessToken = token;
};

/** Read the current in-memory access token (rarely needed by app code). */
export const getAccessToken = () => accessToken;

/* ──────────────────────────────────────────────────────────────────── */
/* Optional auth-failure callback                                        */
/* ──────────────────────────────────────────────────────────────────── */

/**
 * Optional callback invoked when authentication is permanently lost
 * (refresh failed, server forced a logout, reuse detected, etc.).
 * Components like `AuthContext` register it to clear their local state
 * before the redirect fires. Set to `null` (default) for a plain redirect.
 *
 * @type {(reason: string) => void | null}
 */
let onAuthFailure = null;

/**
 * Register a callback to run on permanent auth failure. Pass `null` to
 * unregister.
 *
 * @param {(reason: string) => void | null} callback
 */
export const setOnAuthFailure = (callback) => {
  onAuthFailure = typeof callback === 'function' ? callback : null;
};

/* ──────────────────────────────────────────────────────────────────── */
/* Refresh-flow concurrency primitives                                   */
/* ──────────────────────────────────────────────────────────────────── */

/** True while a refresh request is in flight. */
let isRefreshing = false;

/** Queued waiters: `(token | null) => void` — token on success, null on failure. */
let refreshSubscribers = [];

/** Push a waiter onto the queue. */
const subscribeTokenRefresh = (cb) => {
  refreshSubscribers.push(cb);
};

/** Notify every waiter with the new token (or null on failure) and clear the queue. */
const onTokenRefreshed = (newToken) => {
  const subscribers = refreshSubscribers;
  refreshSubscribers = [];
  for (const cb of subscribers) {
    try {
      cb(newToken);
    } catch (err) {
      // A misbehaving subscriber shouldn't break the others.
      // eslint-disable-next-line no-console
      console.error('[axiosInstance] subscriber threw:', err);
    }
  }
};

/* ──────────────────────────────────────────────────────────────────── */
/* Helpers                                                               */
/* ──────────────────────────────────────────────────────────────────── */

/**
 * Generate a short request id for tracing. Time-prefixed so log lines
 * sort chronologically; random tail makes accidental collisions in a
 * single second extraordinarily unlikely.
 */
const newRequestId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/** Read the backend's `err.response.data.code` (returns `null` if missing). */
const responseCode = (error) =>
  error?.response?.data?.code || null;

/**
 * Should this 401 trigger a forced logout (skipping refresh entirely)?
 * Any error code in FORCED_LOGOUT_CODES, plus the case of a 401 from
 * the refresh endpoint itself — there's no "refresh the refresh".
 */
const isPermanentAuthFailure = (error, originalUrl) => {
  if (originalUrl?.includes('/auth/refresh-token')) return true;
  return FORCED_LOGOUT_CODES.has(responseCode(error));
};

/**
 * Hand off to the registered auth-failure callback (if any), then push
 * the user to /login unless they're already there. Used by every
 * permanent-failure branch below.
 */
const triggerForcedLogout = (reason) => {
  setAccessToken(null);
  onTokenRefreshed(null);

  if (onAuthFailure) {
    try {
      onAuthFailure(reason);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[axiosInstance] onAuthFailure callback threw:', err);
    }
  }

  if (
    typeof window !== 'undefined' &&
    !window.location.pathname.startsWith('/login')
  ) {
    window.location.href = '/login';
  }
};

/* ──────────────────────────────────────────────────────────────────── */
/* Axios instance + interceptors                                         */
/* ──────────────────────────────────────────────────────────────────── */

const axiosInstance = axios.create({
  baseURL: BASE_URL,
  // Send httpOnly refresh-token cookie on cross-origin auth requests.
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});

/**
 * Request interceptor — attach Bearer token + per-request id.
 */
axiosInstance.interceptors.request.use(
  (config) => {
    if (accessToken) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }
    // Stamp every request unless the caller already supplied one.
    if (!config.headers[REQUEST_ID_HEADER]) {
      config.headers[REQUEST_ID_HEADER] = newRequestId();
    }
    return config;
  },
  (error) => Promise.reject(error)
);

/**
 * Response interceptor — on 401, run the refresh-and-retry dance.
 *
 *   • If the failure is permanent (forced-logout codes, refresh URL
 *     itself), skip refresh and force logout.
 *   • If a refresh is already in flight, join the waiter queue.
 *   • Otherwise, this request becomes the refresh pioneer.
 */
axiosInstance.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config || {};
    const status = error.response?.status;

    // Bail fast for non-401 responses.
    if (status !== 401) {
      return Promise.reject(error);
    }

    // Don't try to refresh login attempts (it'd be silly).
    if (originalRequest.url?.includes('/auth/login')) {
      return Promise.reject(error);
    }

    // Dead-session signals — skip refresh entirely.
    if (isPermanentAuthFailure(error, originalRequest.url)) {
      triggerForcedLogout(responseCode(error) || 'permanent_auth_failure');
      return Promise.reject(error);
    }

    // Already retried once — give up to avoid loops.
    if (originalRequest._retry) {
      triggerForcedLogout('retry_exhausted');
      return Promise.reject(error);
    }

    // Concurrent refresh — queue this request and wait.
    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        subscribeTokenRefresh((newToken) => {
          if (newToken) {
            originalRequest.headers = originalRequest.headers || {};
            originalRequest.headers.Authorization = `Bearer ${newToken}`;
            // Mark so a subsequent 401 doesn't loop here.
            originalRequest._retry = true;
            resolve(axiosInstance(originalRequest));
          } else {
            reject(error);
          }
        });
      });
    }

    // Pioneer refresh.
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

      originalRequest.headers = originalRequest.headers || {};
      originalRequest.headers.Authorization = `Bearer ${newToken}`;
      return axiosInstance(originalRequest);
    } catch (refreshError) {
      triggerForcedLogout(
        responseCode(refreshError) || 'refresh_failed'
      );
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  }
);

export default axiosInstance;
