/**
 * @file frontend/src/pages/LoginPage.jsx
 * @description Login page with email/password form, validation, and registration link
 * @author Dev B
 */

import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import LoginForm from '../components/auth/LoginForm';
import useAuth from '../hooks/useAuth';

/**
 * LoginPage - Authentication page for user login
 * Renders the login form inside the auth layout with branding,
 * error display, and a link to the registration page.
 *
 * @returns {JSX.Element} The login page
 */
const LoginPage = () => {
  const [error, setError] = useState('');
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  /**
   * Where to land after a successful login: the page the user was
   * trying to reach before ProtectedRoute bounced them here (stashed
   * in `location.state.from` by the guard), falling back to the
   * dashboard for a direct visit to /login.
   */
  const from = location.state?.from?.pathname || '/dashboard';

  // Already signed in? Don't show the form again — this also stops the
  // back button from returning to /login after a successful login, and
  // sends a logged-in user who hits /login straight to their app.
  if (isAuthenticated) {
    return <Navigate to={from} replace />;
  }

  /**
   * Handle login form submission. On success, redirect to the intended
   * page with `replace` so /login is NOT left in history (back button
   * after login should go to wherever they were, not the form).
   *
   * @param {Object} credentials - { email, password, rememberMe }
   */
  const handleLogin = async (credentials) => {
    try {
      setError('');
      await login({
        email: credentials.email,
        password: credentials.password,
      });
      navigate(from, { replace: true });
    } catch (err) {
      setError(
        err.response?.data?.message || 'Login failed. Please try again.'
      );
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">HRMS</h1>
          <h2 className="mt-2 text-xl text-gray-600 dark:text-gray-300">Sign in to your account</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            HR Management System — Kolegji UBT
          </p>
        </div>

        {/* Error message */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 dark:bg-rose-500/10 dark:border-rose-500/30">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-red-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm text-red-700 dark:text-rose-300">{error}</p>
            </div>
          </div>
        )}

        {/* Login form */}
        <div className="bg-white shadow-md rounded-xl p-8 border border-gray-200 dark:bg-gray-900 dark:border-gray-800">
          <LoginForm onSubmit={handleLogin} />
        </div>

        {/* Register link */}
        <p className="text-center text-sm text-gray-500 dark:text-gray-400">
          Don&apos;t have an account?{' '}
          <Link
            to="/register"
            className="font-medium text-indigo-600 hover:text-indigo-500 transition-colors"
          >
            Create an account
          </Link>
        </p>
      </div>
    </div>
  );
};

export default LoginPage;
