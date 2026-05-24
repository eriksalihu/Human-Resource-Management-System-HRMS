/**
 * @file frontend/src/context/AuthContext.jsx
 * @description Authentication context with proactive token refresh, session-timeout warning, and forced-logout coordination with the axios interceptor
 * @author Dev B
 *
 * Token lifecycle:
 *   - Login / refresh sets the in-memory access token AND its decoded
 *     `exp` so the context knows when it'll expire
 *   - A timer fires 60 seconds before expiry and silently calls
 *     `/auth/refresh-token`. Successful refresh resets the timer.
 *   - A second timer fires 30 seconds before expiry and shows a
 *     "Session expiring" warning component (consumed by `SessionTimeoutModal`)
 *     so the user can extend manually if the silent refresh hasn't
 *     completed yet (rare, but possible on flaky networks).
 *   - On any axios-instance forced-logout signal (refresh reuse, token
 *     revoked, etc.), the context clears its state and redirects.
 *
 * The `useAuth()` hook is unchanged externally — `loading` /
 * `isAuthenticated` / `user` / `login` / `logout` / `register` all
 * behave the same. Two new fields are exposed: `sessionExpiresAt`
 * (Date | null) and `extendSession()` (manually triggers an
 * out-of-band refresh — used by the timeout warning's "Stay signed in"
 * button).
 */

import {
  createContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from 'react';
import * as authApi from '../api/authApi';
import {
  setAccessToken,
  setOnAuthFailure,
} from '../api/axiosInstance';

/** ms before token expiry when we silently refresh. */
const PROACTIVE_REFRESH_LEAD_MS = 60 * 1000;

/** ms before token expiry when we show the timeout warning. */
const WARNING_LEAD_MS = 30 * 1000;

/** Minimum delay between scheduled refresh fires — guards against rapid loops. */
const MIN_REFRESH_DELAY_MS = 1_000;

/** localStorage key used by AuthContext + axios interceptor. */
const ACCESS_TOKEN_KEY = 'accessToken';

/** @type {React.Context} */
export const AuthContext = createContext(null);

/**
 * Decode a JWT payload. Returns `null` for malformed input so callers
 * can fall back to "no expiry known" rather than crashing.
 */
const decodeJwt = (token) => {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(payload);
    return JSON.parse(json);
  } catch {
    return null;
  }
};

/**
 * Resolve the token's expiry as a Date. Returns null when missing or
 * malformed (the timer logic skips scheduling in that case).
 */
const resolveExpiry = (token) => {
  const decoded = decodeJwt(token);
  if (!decoded?.exp) return null;
  const expMs = Number(decoded.exp) * 1000;
  if (!Number.isFinite(expMs)) return null;
  return new Date(expMs);
};

/**
 * AuthProvider — wraps the app and exposes auth state + methods.
 *
 * @param {{ children: React.ReactNode }} props
 * @returns {JSX.Element}
 */
export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sessionExpiresAt, setSessionExpiresAt] = useState(null);
  const [showWarning, setShowWarning] = useState(false);

  /** Active timers — refs so re-renders don't reset them. */
  const refreshTimerRef = useRef(null);
  const warningTimerRef = useRef(null);

  /** Clear both timers (idempotent). */
  const clearTimers = useCallback(() => {
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
    if (warningTimerRef.current) {
      clearTimeout(warningTimerRef.current);
      warningTimerRef.current = null;
    }
  }, []);

  /**
   * Persist / clear the access token in both localStorage and the axios
   * in-memory store + decode the new expiry for timer scheduling.
   */
  const persistToken = useCallback((token) => {
    if (token) {
      try {
        localStorage.setItem(ACCESS_TOKEN_KEY, token);
      } catch {
        /* private mode / quota — silently ignore */
      }
      setAccessToken(token);
      setSessionExpiresAt(resolveExpiry(token));
    } else {
      try {
        localStorage.removeItem(ACCESS_TOKEN_KEY);
      } catch {
        /* swallow */
      }
      setAccessToken(null);
      setSessionExpiresAt(null);
    }
  }, []);

  /**
   * Tear down session state — used by both manual logout and the
   * forced-logout signal from the axios interceptor.
   */
  const clearSession = useCallback(() => {
    clearTimers();
    persistToken(null);
    setUser(null);
    setShowWarning(false);
  }, [clearTimers, persistToken]);

  /**
   * Out-of-band token refresh. Used by both the proactive timer and the
   * "Stay signed in" button on the timeout warning.
   *
   * Returns the new access token on success. Resolves `null` on failure
   * (the axios interceptor will have already kicked off a forced logout
   * via the auth-failure callback).
   */
  const refreshSession = useCallback(async () => {
    try {
      const newToken = await authApi.refreshToken();
      persistToken(newToken);
      setShowWarning(false);
      return newToken;
    } catch {
      // Don't fire forced-logout from here — the axios interceptor will
      // handle it via the registered onAuthFailure callback. Just bail.
      return null;
    }
  }, [persistToken]);

  /**
   * Schedule the proactive-refresh + warning timers based on the current
   * `sessionExpiresAt`. Re-runs whenever `sessionExpiresAt` changes
   * (i.e. after every successful login / refresh).
   */
  useEffect(() => {
    clearTimers();
    if (!sessionExpiresAt) {
      setShowWarning(false);
      return undefined;
    }

    const now = Date.now();
    const expiresIn = sessionExpiresAt.getTime() - now;

    if (expiresIn <= 0) {
      // Already expired — refresh now (best-effort).
      refreshSession();
      return undefined;
    }

    const refreshDelay = Math.max(
      expiresIn - PROACTIVE_REFRESH_LEAD_MS,
      MIN_REFRESH_DELAY_MS
    );
    const warningDelay = Math.max(
      expiresIn - WARNING_LEAD_MS,
      MIN_REFRESH_DELAY_MS
    );

    refreshTimerRef.current = setTimeout(() => {
      refreshSession();
    }, refreshDelay);

    // Only schedule the warning if it'd fire BEFORE the silent refresh
    // would (otherwise the silent refresh succeeds first and the warning
    // never needs to appear). When networks are slow the warning becomes
    // the user's safety hatch.
    if (warningDelay > refreshDelay) {
      warningTimerRef.current = setTimeout(() => {
        setShowWarning(true);
      }, warningDelay);
    }

    return clearTimers;
  }, [sessionExpiresAt, clearTimers, refreshSession]);

  /**
   * Register a callback so the axios interceptor can tell us when a
   * permanent auth failure happens (refresh reuse, token revoked, etc.).
   * Single subscription per provider lifetime.
   */
  useEffect(() => {
    setOnAuthFailure(() => {
      clearSession();
    });
    return () => setOnAuthFailure(null);
  }, [clearSession]);

  /**
   * Attempt to restore the session on initial mount. Tries the httpOnly
   * refresh cookie first; falls back to the localStorage access token.
   */
  useEffect(() => {
    const initAuth = async () => {
      try {
        // Restore in-memory token from localStorage so any in-flight
        // request during initialization has *something* to send.
        let storedToken = null;
        try {
          storedToken = localStorage.getItem(ACCESS_TOKEN_KEY);
        } catch {
          /* swallow */
        }
        if (storedToken) {
          setAccessToken(storedToken);
          setSessionExpiresAt(resolveExpiry(storedToken));
        }

        // Try refreshing via the httpOnly cookie.
        const newToken = await authApi.refreshToken();
        persistToken(newToken);

        // Fetch full user profile with roles.
        const profile = await authApi.getProfile();
        setUser(profile);
      } catch {
        // Session expired / no cookie — clear everything quietly.
        persistToken(null);
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    initAuth();
  }, [persistToken]);

  /**
   * Log in with email and password.
   * @param {{ email: string, password: string }} credentials
   * @returns {Promise<Object>} Authenticated user
   */
  const login = useCallback(
    async (credentials) => {
      const { user: authUser, accessToken: token } =
        await authApi.login(credentials);
      persistToken(token);
      setUser(authUser);
      setShowWarning(false);
      return authUser;
    },
    [persistToken]
  );

  /**
   * Register a new account. Does NOT auto-login — the user is sent to
   * the login page to complete a fresh sign-in.
   */
  const register = useCallback(async (data) => {
    return await authApi.register(data);
  }, []);

  /**
   * Log out the current user. Best-effort revoke on the server, then
   * always clear local state.
   */
  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      clearSession();
    }
  }, [clearSession]);

  /**
   * Manually extend the session (used by the "Stay signed in" button).
   * Returns true on success.
   */
  const extendSession = useCallback(async () => {
    const token = await refreshSession();
    return Boolean(token);
  }, [refreshSession]);

  /**
   * Re-fetch the user profile from the server and update context state.
   * Useful after a profile save so the navbar, sidebar, and any other
   * auth-derived UI reflects the updated data without a page reload.
   *
   * @returns {Promise<Object|null>} The refreshed user, or null on failure
   */
  const refreshUser = useCallback(async () => {
    try {
      const profile = await authApi.getProfile();
      setUser(profile);
      return profile;
    } catch {
      return null;
    }
  }, []);

  /** Dismiss the warning without refreshing — user picks "Sign out". */
  const dismissWarning = useCallback(() => {
    setShowWarning(false);
  }, []);

  const isAuthenticated = !!user;

  const value = useMemo(
    () => ({
      // Original surface
      user,
      loading,
      isAuthenticated,
      login,
      logout,
      register,
      refreshUser,

      // New: session-timeout helpers
      sessionExpiresAt,
      showSessionWarning: showWarning,
      extendSession,
      dismissSessionWarning: dismissWarning,
    }),
    [
      user,
      loading,
      isAuthenticated,
      login,
      logout,
      register,
      refreshUser,
      sessionExpiresAt,
      showWarning,
      extendSession,
      dismissWarning,
    ]
  );

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
};

export default AuthContext;
