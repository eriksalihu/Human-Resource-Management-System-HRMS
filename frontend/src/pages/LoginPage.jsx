/**
 * @file frontend/src/pages/LoginPage.jsx
 * @description Login page — minimal, light-only design
 * @author Dev B (original), Dev A (minimal light-only redesign)
 */

import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import LoginForm from '../components/auth/LoginForm';
import useAuth from '../hooks/useAuth';

/**
 * LoginPage — renders inside AuthLayout (which provides centering).
 * @returns {JSX.Element}
 */
const LoginPage = () => {
  const [error, setError] = useState('');
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const from = location.state?.from?.pathname || '/dashboard';

  if (isAuthenticated) {
    return <Navigate to={from} replace />;
  }

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
    <>
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
            <svg className="w-5 h-5 text-red-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
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
    </>
  );
};

export default LoginPage;
