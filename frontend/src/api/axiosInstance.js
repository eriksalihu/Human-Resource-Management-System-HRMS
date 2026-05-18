/**
 * @file frontend/src/api/axiosInstance.js
 * @description Axios instance with automatic token refresh, request queueing during refresh, replay-on-success, error-code-driven logout, request-ID tracing, and in-flight GET deduplication
 * @author Dev B (original), Dev A (request deduplication)
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
 *
 * Request deduplication (commit 235 — Dev A):
 *   GET requests with identical URL+params that are already in-flight
 *   share a single underlying network call. If two components mount in
 *   the same tick and both ask for `/employees?page=1`, the second one
 *   resolves with the first one's response — one round-trip instead of
 *   two. Dedup is intentionally limited to GETs (mutations must always
 *   be sent) and to calls without an `AbortSignal` (a signal-cancel by
 *   one caller would otherwise abort everyone else awaiting the shared
 *   promise). Auth endpoints are excluded too because their semantics
 *   depend on each call being its own attempt.
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
  // Drop any in-flight GETs so they don't replay onto the next user.
  inFlightGets.clear();

  if (onAuthFailure) {
    try {
      onAuthFailure(reason);
    } catch (err) {
       
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
/* In-flight GET deduplication                                           */
/* ──────────────────────────────────────────────────────────────────── */

/**
 * Map of in-flight GET requests keyed by URL+params signature. Two
 * components asking for the same endpoint in the same tick share the
 * underlying network round-trip.
 *
 * Lives at module scope so dedup applies across the entire SPA — sibling
 * components, polling timers, and one-off `axiosInstance.get` calls all
 * benefit without coordination.
 */
const inFlightGets = new Map();

/**
 * Stable JSON stringify for the dedup key. Sorts object keys so the
 * same params built in different orders across renders produce the
 * same signature — otherwise we'd miss dedup opportunities whenever a
 * caller spreads props differently.
 */
const stableStringify = (val) => {
  if (val === null || val === undefined) return '';
  if (typeof val !== 'object') return String(val);
  if (Array.isArray(val)) return `[${val.map(stableStringify).join(',')}]`;
  const keys = Object.keys(val).sort();
  return `{${keys.map((k) => `${k}:${stableStringify(val[k])}`).join(',')}}`;
};

/**
 * Decide whether a request is eligible for dedup. Excludes:
 *   - Non-GET methods (mutations must always reach the server)
 *   - Requests with `signal` (a per-caller abort would otherwise cancel
 *     every shared awaiter)
 *   - Requests with `_skipDedup === true` (escape hatch — set on a
 *     config to opt out of dedup when needed)
 *   - Auth endpoints (login / refresh / logout — semantics depend on
 *     each call being its own attempt)
 *
 * @param {Object} config
 * @returns {string|null} Dedup key, or `null` if not eligible
 */
const buildDedupKey = (config) => {
  if (!config) return null;
  const method = (config.method || 'get').toLowerCase();
  if (method !== 'get') return null;
  if (config.signal) return null;
  if (config._skipDedup) return null;
  const url = config.url || '';
  if (url.includes('/auth/')) return null;
  return `GET ${url}?${stableStringify(config.params)}`;
};

/**
 * Read the current count of in-flight deduplicated GETs. Exposed for
 * debugging + test assertions; not part of the public contract.
 */
export const __pendingGetCount = () => inFlightGets.size;

/**
 * Manually clear the dedup map. Call on logout — otherwise a request
 * issued just before logout could be replayed for a different user.
 */
export const clearInFlightRequests = () => {
  inFlightGets.clear();
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
 * Wrap the default adapter so eligible GET requests are deduplicated.
 *
 * Why an adapter wrap (vs a request interceptor): interceptors can
 * mutate the config but cannot intercept the request → response
 * fulfillment. The adapter is where the network call actually happens,
 * so wrapping it lets us return a shared promise.
 *
 * The wrapper is intentionally thin:
 *   1. Compute the dedup key (returns null when ineligible)
 *   2. If a matching in-flight promise exists, return it
 *   3. Otherwise, kick off the real request and stash the promise so
 *      concurrent callers can attach. On settle, drop from the map.
 */
const baseAdapter = axiosInstance.defaults.adapter;
axiosInstance.defaults.adapter = (config) => {
  const key = buildDedupKey(config);

  if (key && inFlightGets.has(key)) {
    return inFlightGets.get(key);
  }

  const promise = baseAdapter(config);

  if (key) {
    inFlightGets.set(key, promise);
    // Use a microtask-attached cleanup so the entry is gone before the
    // next render tick — otherwise back-to-back identical requests in
    // a finally block could still hit the cache.
    promise
      .then(
        () => {
          if (inFlightGets.get(key) === promise) inFlightGets.delete(key);
        },
        () => {
          // Always drop on failure too so the next caller can retry.
          if (inFlightGets.get(key) === promise) inFlightGets.delete(key);
        }
      );
  }

  return promise;
};

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
