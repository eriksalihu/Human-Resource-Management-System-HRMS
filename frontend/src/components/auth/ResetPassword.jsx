/**
 * @file frontend/src/components/auth/ResetPassword.jsx
 * @description Reset-password form (commit 293). Reads the `?token=`
 *   from the email link, collects + confirms a new password (with a
 *   live strength meter), submits to `/auth/reset-password`, and shows
 *   a success card that auto-redirects to login. Handles missing /
 *   expired / invalid tokens with a clear recovery path.
 * @author Dev B
 *
 * Backend contract (commit 292):
 *   - POST /auth/reset-password { token, password }
 *   - 400 + code 'ERR_RESET_TOKEN_INVALID' → link bad/expired/used
 *   - 422 + errors[] → new password failed strength rules
 */

import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import * as authApi from '../../api/authApi';
import PasswordStrengthMeter from '../common/PasswordStrengthMeter';

/** Seconds to wait on the success screen before bouncing to login. */
const REDIRECT_DELAY_SEC = 4;

/**
 * Client-side mirror of the backend strength rule (≥8 chars, upper,
 * lower, number). The server is authoritative; this just gates the
 * submit button so users get instant feedback.
 *
 * @param {string} pw
 * @returns {boolean}
 */
const isStrongEnough = (pw) =>
  pw.length >= 8 && /[a-z]/.test(pw) && /[A-Z]/.test(pw) && /\d/.test(pw);

const ResetPassword = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token') || '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [countdown, setCountdown] = useState(REDIRECT_DELAY_SEC);

  // After success, tick down and redirect to login.
  useEffect(() => {
    if (!done) return undefined;
    if (countdown <= 0) {
      navigate('/login', { replace: true });
      return undefined;
    }
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [done, countdown, navigate]);

  /** Submit the new password. */
  const handleSubmit = async (event) => {
    event.preventDefault();
    setError(null);

    if (!isStrongEnough(password)) {
      setError(
        'Password must be at least 8 characters and include an uppercase letter, a lowercase letter, and a number.'
      );
      return;
    }
    if (password !== confirm) {
      setError('The two passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      await authApi.resetPassword({ token, password });
      setDone(true);
    } catch (err) {
      const code = err.response?.data?.code;
      if (code === 'ERR_RESET_TOKEN_INVALID') {
        setError(
          'This reset link is invalid or has expired. Please request a new one.'
        );
      } else {
        // Surface the first field error from the strength validator, or
        // a generic fallback.
        const fieldErr = err.response?.data?.errors?.[0]?.message;
        setError(
          fieldErr ||
            err.response?.data?.message ||
            'Could not reset your password. Please try again.'
        );
      }
    } finally {
      setSubmitting(false);
    }
  };

  /* ── Missing-token guard ──────────────────────────────────────────── */
  if (!token) {
    return (
      <div className="space-y-5 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-100 dark:bg-rose-500/20">
          <svg
            className="h-6 w-6 text-rose-600 dark:text-rose-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">
            Reset link missing
          </h2>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
            This page needs a valid reset link. Request a new one from the
            forgot-password page.
          </p>
        </div>
        <Link
          to="/forgot-password"
          className="inline-block w-full px-4 py-2 text-sm font-medium rounded-md bg-indigo-600 text-white hover:bg-indigo-700"
        >
          Request a reset link
        </Link>
      </div>
    );
  }

  /* ── Success card ─────────────────────────────────────────────────── */
  if (done) {
    return (
      <div className="space-y-5 text-center" role="status" aria-live="polite">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-500/20">
          <svg
            className="h-6 w-6 text-emerald-600 dark:text-emerald-400"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">
            Password updated
          </h2>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
            Your password has been reset. Redirecting to sign in in{' '}
            <span className="font-semibold tabular-nums">{countdown}s</span>…
          </p>
        </div>
        <Link
          to="/login"
          className="inline-block w-full px-4 py-2 text-sm font-medium rounded-md bg-indigo-600 text-white hover:bg-indigo-700"
        >
          Go to sign in now
        </Link>
      </div>
    );
  }

  /* ── Form ─────────────────────────────────────────────────────────── */
  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      <div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">
          Set a new password
        </h2>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
          Choose a strong password you haven't used before.
        </p>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-md bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/10 dark:border-rose-500/30 dark:text-rose-300"
        >
          {error}
        </div>
      )}

      <div>
        <label
          htmlFor="reset-password"
          className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1"
        >
          New password <span className="text-red-500">*</span>
        </label>
        <input
          type="password"
          id="reset-password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            if (error) setError(null);
          }}
          autoComplete="new-password"
          autoFocus
          aria-describedby="reset-password-strength"
          className="block w-full rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 text-sm bg-white text-gray-900 placeholder-gray-400 border-gray-300 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500 dark:border-gray-700"
        />
        <PasswordStrengthMeter
          id="reset-password-strength"
          password={password}
          className="mt-2"
        />
      </div>

      <div>
        <label
          htmlFor="reset-confirm"
          className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1"
        >
          Confirm new password <span className="text-red-500">*</span>
        </label>
        <input
          type="password"
          id="reset-confirm"
          value={confirm}
          onChange={(e) => {
            setConfirm(e.target.value);
            if (error) setError(null);
          }}
          autoComplete="new-password"
          className="block w-full rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 text-sm bg-white text-gray-900 placeholder-gray-400 border-gray-300 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500 dark:border-gray-700"
        />
        {confirm && confirm !== password && (
          <p className="mt-1 text-xs text-rose-600 dark:text-rose-300">
            Passwords don't match yet.
          </p>
        )}
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="w-full inline-flex justify-center items-center px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
      >
        {submitting ? 'Resetting…' : 'Reset password'}
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

export default ResetPassword;
