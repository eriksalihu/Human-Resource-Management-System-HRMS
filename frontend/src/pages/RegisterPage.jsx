/**
 * @file frontend/src/pages/RegisterPage.jsx
 * @description Registration page — minimal, light-only design
 * @author Dev B (original), Dev A (minimal light-only redesign)
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import RegisterForm from '../components/auth/RegisterForm';
import * as authApi from '../api/authApi';

/**
 * RegisterPage — renders inside AuthLayout (which provides centering).
 * @returns {JSX.Element}
 */
const RegisterPage = () => {
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleRegister = async (data) => {
    try {
      setError('');
      setSuccess('');
      await authApi.register(data);
      setSuccess('Account created successfully! You can now sign in.');
    } catch (err) {
      setError(
        err.response?.data?.message || 'Registration failed. Please try again.'
      );
    }
  };

  return (
    <>
      {/* Header */}
      <div className="text-center">
        <h1 className="text-3xl font-bold text-gray-900">HRMS</h1>
        <h2 className="mt-2 text-xl text-gray-600">Create your account</h2>
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

      {/* Success message */}
      {success && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <p className="text-sm text-green-700">{success}</p>
          </div>
        </div>
      )}

      {/* Registration form */}
      <div className="bg-white shadow-md rounded-xl p-8 border border-gray-200">
        <RegisterForm onSubmit={handleRegister} />
      </div>

      {/* Login link */}
      <p className="text-center text-sm text-gray-500">
        Already have an account?{' '}
        <Link
          to="/login"
          className="font-medium text-indigo-600 hover:text-indigo-500 transition-colors"
        >
          Sign in
        </Link>
      </p>
    </>
  );
};

export default RegisterPage;
