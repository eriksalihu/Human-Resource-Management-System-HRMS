/**
 * @file frontend/src/pages/LoginPage.jsx
 * @description Login page with email/password form, validation, and registration link
 * @author Dev B
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import LoginForm from '../components/auth/LoginForm';

/**
 * LoginPage - Authentication page for user login
 * Renders the login form inside the auth layout with branding,
 * error display, and a link to the registration page.
 *
 * @returns {JSX.Element} The login page
 */
const LoginPage = () => {
  const [error, setError] = useState('');

  /**
   * Handle login form submission.
   * @param {Object} credentials - { email, password, rememberMe }
   */
  const handleLogin = async (credentials) => {
    try {
      setError('');
      // TODO: Call auth API service when available
      console.log('Login attempt:', credentials.email);
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed. Please try again.');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900">HRMS</h1>
          <h2 className="mt-2 text-xl text-gray-600">Sign in to your account</h2>
          <p className="mt-1 text-sm text-gray-500">
            HR Management System — Kolegji UBT
          </p>
        </div>

        {/* Error message */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-red-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm text-red-700">{error}</p>
            </div>
          </div>
        )}

        {/* Login form */}
        <div className="bg-white shadow-md rounded-xl p-8 border border-gray-200">
          <LoginForm onSubmit={handleLogin} />
        </div>

        {/* Register link */}
        <p className="text-center text-sm text-gray-500">
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
