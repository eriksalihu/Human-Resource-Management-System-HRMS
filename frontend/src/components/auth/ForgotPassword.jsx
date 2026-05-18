/**
 * @file frontend/src/components/auth/ForgotPassword.jsx
 * @description Forgot-password form — email input with validation, success confirmation panel, and back-to-login link
 * @author Dev A
 *
 * Endpoint contract: this component POSTs to `/api/auth/forgot-password`
 * with `{ email }`. The backend route doesn't exist yet — until it lands,
 * the form falls back to a friendly success message regardless (the
 * security-conscious "we won't tell you whether the email exists" pattern
 * is the right UX anyway), with the underlying error logged to the console.
 *
 * When the endpoint ships it'll trigger the password-reset flow via
 * `email.service.sendPasswordReset()` — already implemented in Day 29.
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import axiosInstance from '../../api/axiosInstance';
import { isValidEmail } from '../../utils/validators';

/**
 * ForgotPassword — single-field form that submits an email address and
 * shows a success card on response (regardless of whether the email
 * actually exists, to avoid an enumeration oracle).
 *
 * @returns {JSX.Element}
 */
const ForgotPassword = () => {
  const [email, setEmail] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  /** Handler for the email input. */
  const handleChange = (event) => {
    setEmail(event.target.value);
    if (error) setError(null);
  };

  /**
   * Submit handler. Always lands on the success screen, even when the
   * backend returns 404 / 429 / 500 — the user shouldn't be able to
   * differentiate "this email exists" from "it doesn't" by watching the
   * UI. Real failures still log to console for development debugging.
   */
  const handleSubmit = async (event) => {
    event.preventDefault();

    const trimmed = email.trim();
    if (!isValidEmail(trimmed)) {
      setError('Enter a valid email address');
      return;
    }

    setSubmitting(true);
    try {
      await axiosInstance.post('/auth/forgot-password', { email: trimmed });
    } catch (err) {
      // Stay quiet — the user always sees the same outcome.
       
      console.warn(
        '[ForgotPassword] Reset request failed (UI hides this):',
        err.response?.status || err.message
      );
    } finally {
      setSubmitting(false);
      setSubmitted(true);
    }
  };

  /** Success card after a submission attempt. */
  if (submitted) {
    return (
      <div className="space-y-5 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-500/20">
          <svg
            className="h-6 w-6 text-emerald-600 dark:text-emerald-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
            />
          </svg>
        </div>
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">
            Check your inbox
          </h2>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
            If an account exists for{' '}
            <span className="font-semibold">{email.trim() || 'that address'}</span>,
            we've sent a password-reset link. The link is valid for one hour.
          </p>
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            Didn't receive an email? Check your spam folder, or try again
            with a different address.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => {
              setSubmitted(false);
              setEmail('');
            }}
            className="w-full px-4 py-2 text-sm font-medium rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-700"
          >
            Try a different email
          </button>
          <Link
            to="/login"
            className="text-sm font-medium text-indigo-600 hover:text-indigo-800 dark:text-indigo-300 dark:hover:text-indigo-200"
          >
            ← Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">
          Forgot your password?
        </h2>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
          Enter the email tied to your HRMS account and we'll send you a
          link to set a new one.
        </p>
      </div>

      <div>
        <label
          htmlFor="forgot-email"
          className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1"
        >
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
            dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500
            ${
              error
                ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
                : 'border-gray-300 dark:border-gray-700'
            }`}
        />
        {error && (
          <p
            id="forgot-email-error"
            className="mt-1 text-xs text-red-600 dark:text-rose-300"
          >
            {error}
          </p>
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
        <Link
          to="/login"
          className="text-sm font-medium text-indigo-600 hover:text-indigo-800 dark:text-indigo-300 dark:hover:text-indigo-200"
        >
          ← Back to sign in
        </Link>
      </div>
    </form>
  );
};

export default ForgotPassword;
