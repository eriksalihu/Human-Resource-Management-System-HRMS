/**
 * @file frontend/src/hooks/useAuth.js
 * @description Custom hook wrapping AuthContext consumption with provider validation
 * @author Dev B
 */

import { useContext } from 'react';
import { AuthContext } from '../context/AuthContext';

/**
 * useAuth — convenience hook for consuming the AuthContext.
 *
 * Throws a descriptive error when used outside of an <AuthProvider> so that
 * misuse is caught at development time rather than producing cryptic null
 * reference errors at runtime.
 *
 * @returns {{ user: Object|null, loading: boolean, isAuthenticated: boolean,
 *             login: Function, logout: Function, register: Function }}
 * @throws {Error} If called outside of an AuthProvider
 */
const useAuth = () => {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error(
      'useAuth must be used within an <AuthProvider>. ' +
        'Wrap your component tree with <AuthProvider> in App.jsx.'
    );
  }

  return context;
};

export default useAuth;
