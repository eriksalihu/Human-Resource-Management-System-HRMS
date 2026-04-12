/**
 * @file frontend/src/context/AuthContext.jsx
 * @description Authentication context with token management and auto-refresh
 * @author Dev B
 */

import { createContext, useState, useEffect, useCallback, useMemo } from 'react';
import * as authApi from '../api/authApi';
import { setAccessToken } from '../api/axiosInstance';

/** @type {React.Context} */
export const AuthContext = createContext(null);

/**
 * AuthProvider — wraps the app and exposes auth state + methods.
 *
 * - Stores the access token in localStorage for persistence across reloads
 *   (consistent with the Axios interceptor pattern).
 * - On mount, attempts to refresh the session via the httpOnly refresh cookie.
 * - Exposes login, logout, register, user, isAuthenticated, and loading.
 *
 * @param {{ children: React.ReactNode }} props
 * @returns {JSX.Element}
 */
export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  /**
   * Persist / clear the access token in both localStorage and the axios
   * in-memory store so that both mechanisms stay in sync.
   */
  const persistToken = useCallback((token) => {
    if (token) {
      localStorage.setItem('accessToken', token);
    } else {
      localStorage.removeItem('accessToken');
    }
    setAccessToken(token);
  }, []);

  /**
   * Attempt to restore the session on initial mount.
   * Tries the httpOnly refresh cookie first; falls back to the
   * localStorage access token to fetch the profile.
   */
  useEffect(() => {
    const initAuth = async () => {
      try {
        // Restore in-memory token from localStorage
        const storedToken = localStorage.getItem('accessToken');
        if (storedToken) {
          setAccessToken(storedToken);
        }

        // Try refreshing via the httpOnly cookie
        const newToken = await authApi.refreshToken();
        persistToken(newToken);

        // Fetch full user profile with roles
        const profile = await authApi.getProfile();
        setUser(profile);
      } catch {
        // Session expired or no cookie — clear everything
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
      const { user: authUser, accessToken } = await authApi.login(credentials);
      persistToken(accessToken);
      setUser(authUser);
      return authUser;
    },
    [persistToken]
  );

  /**
   * Register a new account.
   * Does NOT auto-login — the user should be redirected to the login page.
   *
   * @param {Object} data - Registration payload
   * @returns {Promise<Object>} Created user
   */
  const register = useCallback(async (data) => {
    return await authApi.register(data);
  }, []);

  /**
   * Log out the current user.
   * Revokes the refresh token on the server and clears all client state.
   */
  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      persistToken(null);
      setUser(null);
    }
  }, [persistToken]);

  /** Whether the user is authenticated */
  const isAuthenticated = !!user;

  const value = useMemo(
    () => ({
      user,
      loading,
      isAuthenticated,
      login,
      logout,
      register,
    }),
    [user, loading, isAuthenticated, login, logout, register]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export default AuthContext;
