/**
 * @file frontend/src/components/auth/ForgotPassword.jsx
 * @description Forgot-password form — minimal, light-only
 * @author Dev A (original), Dev B (live endpoint), Dev A (light-only redesign)
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import * as authApi from '../../api/authApi';
import { isValidEmail } from '../../utils/validators';

/**
 * ForgotPassword — single-field form, light-only.
 * @returns {JSX.Element}
 */
const ForgotPassword = () => {
  const [email, setEmail] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleChange = (event) => {
    setEmail(event.target.value);
    if (error) setError(null);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const trimmed = email.trim();
    if (!isValidEmail(trimmed)) {
      setError('Enter a valid email address');
      return;
    }
    setSubmitting(true);
    try {
      await authApi.forgotPassword(trimmed);
    } catch (err) {
      console.warn(
        '[ForgotPassword] Reset request failed (UI hides this):',
        err.response?.status || err.message
      );
    } finally {
      setSubmitting(false);
      setSubmitted(true);
    }
  };

  if (submitted) {
    return (
      <div className="space-y-5 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
          <svg className="h-6 w-6 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
        <div>
          <h2 className="text-xl font-bold text-gray-900">Check your inbox</h2>
          <p className="mt-2 text-sm text-gray-600">
            If an account exists for{' '}
            <span className="font-semibold">{email.trim() || 'that address'}</span>,
            we've sent a password-reset link. The link is valid for one hour.
          </p>
          <p className="mt-2 text-xs text-gray-500">
            Didn't receive an email? Check your spam folder, or try again
            with a different address.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => { setSubmitted(false); setEmail(''); }}
            className="w-full px-4 py-2 text-sm font-medium rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
          >
            Try a different email
          </button>
          <Link to="/login" className="text-sm font-medium text-indigo-600 hover:text-indigo-800">
            ← Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Forgot your password?</h2>
        <p className="mt-1 text-sm text-gray-600">
          Enter the email tied to your HRMS account and we'll send you a
          link to set a new one.
        </p>
      </div>

      <div>
        <label htmlFor="forgot-email" className="block text-sm font-medium text-gray-700 mb-1">
          Email address <span className="text-red-500">*</span>
        </label>
        <input
          type="email"
          id="forgot-email"
          value={email}
          onChange={handleChange}
          autoComplete="email"
          autoFocus
          placeholder="you@example.com"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? 'forgot-email-error' : undefined}
          className={`block w-full rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 text-sm
            bg-white text-gray-900 placeholder-gray-400
            ${error ? 'border-red-300 focus:border-red-500 focus:ring-red-500' : 'border-gray-300'}`}
        />
        {error && (
          <p id="forgot-email-error" className="mt-1 text-xs text-red-600">{error}</p>
        )}
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="w-full inline-flex justify-center items-center px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
      >
        {submitting ? 'Sending…' : 'Send reset link'}
      </button>

      <div className="text-center">
        <Link to="/login" className="text-sm font-medium text-indigo-600 hover:text-indigo-800">
          ← Back to sign in
        </Link>
      </div>
    </form>
  );
};

export default ForgotPassword;
