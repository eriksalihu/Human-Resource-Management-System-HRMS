/**
 * @file frontend/src/components/auth/LoginForm.jsx
 * @description Enhanced login form — show/hide password toggle, animated form mount, error shake on failed submit, dark-mode styling, and improved disabled-while-loading state
 * @author Dev B
 *
 * The shake animation runs whenever a brand-new validation error or
 * server error appears (as opposed to existing errors getting cleared).
 * We attach an "errorTick" counter that bumps every time errors get set,
 * and the wrapper key swaps so React re-mounts the animated layer — this
 * makes the same error trigger a fresh shake even if the message text
 * didn't change.
 */

import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import LoadingSpinner from '../common/LoadingSpinner';

/**
 * LoginForm — controlled login form with validation, password toggle, and
 * error shake animation. Backed by Tailwind keyframes added in
 * `tailwind.config.js` (commit 190): `animate-shake` for the wrapper,
 * `animate-fade-in` for first paint, `animate-slide-in-down` for fields.
 *
 * @param {Object} props
 * @param {Function} props.onSubmit - Async callback `(formData) => Promise`.
 *   When the promise rejects, the form surfaces a generic error and shakes.
 * @returns {JSX.Element}
 */
const LoginForm = ({ onSubmit }) => {
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    rememberMe: false,
  });
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  /**
   * Counter that increments every time we want the form to shake. The
   * key on the shake-wrapper uses this so React re-mounts the element
   * and re-runs the CSS animation even when the underlying error didn't
   * change shape.
   */
  const [shakeTick, setShakeTick] = useState(0);

  /** Track whether we've ever rendered with errors so the first paint
   *  doesn't trigger an unwarranted shake. */
  const firstRenderRef = useRef(true);

  /**
   * Bump the shake tick when validation or submit errors appear. Skip
   * the very first render so an empty initial state doesn't shake.
   */
  useEffect(() => {
    if (firstRenderRef.current) {
      firstRenderRef.current = false;
      return;
    }
    const hasErrors =
      Boolean(submitError) || Object.values(errors).some(Boolean);
    if (hasErrors) {
      setShakeTick((t) => t + 1);
    }
  }, [errors, submitError]);

  /**
   * Validate fields. Returns the next-errors object so the caller can
   * decide what to do with it (we use it both to set state and to
   * inspect for a "had any error?" check).
   */
  const validate = () => {
    const newErrors = {};

    if (!formData.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Please enter a valid email address';
    }

    if (!formData.password) {
      newErrors.password = 'Password is required';
    } else if (formData.password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters';
    }

    return newErrors;
  };

  /** Controlled input change. Clears matching field error + submit error. */
  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));

    if (errors[name]) {
      setErrors((prev) => {
        const { [name]: _omit, ...rest } = prev;
        return rest;
      });
    }
    if (submitError) setSubmitError(null);
  };

  /** Form submit — runs validation, calls onSubmit, surfaces server errors. */
  const handleSubmit = async (e) => {
    e.preventDefault();
    const next = validate();
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setLoading(true);
    setSubmitError(null);
    try {
      await onSubmit(formData);
    } catch (err) {
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        'Sign-in failed. Please check your credentials and try again.';
      setSubmitError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      key={shakeTick} // forces re-mount → re-runs the shake animation
      className={shakeTick > 0 ? 'animate-shake' : 'animate-fade-in'}
    >
      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        {/* Server-side error banner */}
        {submitError && (
          <div
            role="alert"
            className="rounded-md p-3 text-sm bg-rose-50 text-rose-800 ring-1 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-500/30 animate-slide-in-down"
          >
            {submitError}
          </div>
        )}

        {/* Email field */}
        <div className="animate-slide-in-down">
          <label
            htmlFor="email"
            className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1"
          >
            Email address
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            value={formData.email}
            onChange={handleChange}
            disabled={loading}
            aria-invalid={Boolean(errors.email)}
            aria-describedby={errors.email ? 'login-email-error' : undefined}
            className={`w-full px-4 py-2.5 rounded-lg text-sm border focus:outline-none focus:ring-2 transition-all duration-200
              bg-white text-gray-900 placeholder-gray-400 disabled:opacity-50 disabled:bg-gray-50
              dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500 dark:disabled:bg-gray-800/50
              ${
                errors.email
                  ? 'border-rose-300 bg-rose-50 focus:ring-rose-400 focus:border-rose-400 dark:bg-rose-500/10 dark:border-rose-500/40'
                  : 'border-gray-300 focus:ring-indigo-500 focus:border-indigo-500 dark:border-gray-700'
              }`}
            placeholder="you@example.com"
          />
          {errors.email && (
            <p
              id="login-email-error"
              className="mt-1 text-xs text-rose-600 dark:text-rose-300"
            >
              {errors.email}
            </p>
          )}
        </div>

        {/* Password field with show/hide toggle */}
        <div className="animate-slide-in-down">
          <label
            htmlFor="password"
            className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1"
          >
            Password
          </label>
          <div className="relative">
            <input
              id="password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              value={formData.password}
              onChange={handleChange}
              disabled={loading}
              aria-invalid={Boolean(errors.password)}
              aria-describedby={
                errors.password ? 'login-password-error' : undefined
              }
              className={`w-full pl-4 pr-11 py-2.5 rounded-lg text-sm border focus:outline-none focus:ring-2 transition-all duration-200
                bg-white text-gray-900 placeholder-gray-400 disabled:opacity-50 disabled:bg-gray-50
                dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500 dark:disabled:bg-gray-800/50
                ${
                  errors.password
                    ? 'border-rose-300 bg-rose-50 focus:ring-rose-400 focus:border-rose-400 dark:bg-rose-500/10 dark:border-rose-500/40'
                    : 'border-gray-300 focus:ring-indigo-500 focus:border-indigo-500 dark:border-gray-700'
                }`}
              placeholder="Enter your password"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              disabled={loading}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              aria-pressed={showPassword}
              tabIndex={-1}
              className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-400 hover:text-gray-600 dark:text-gray-400 dark:hover:text-gray-200 disabled:opacity-50 transition-colors"
            >
              {showPassword ? (
                // eye-off icon
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.542-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88L3 3m6.88 6.88L21 21"
                  />
                </svg>
              ) : (
                // eye icon
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                  />
                </svg>
              )}
            </button>
          </div>
          {errors.password && (
            <p
              id="login-password-error"
              className="mt-1 text-xs text-rose-600 dark:text-rose-300"
            >
              {errors.password}
            </p>
          )}
        </div>

        {/* Remember me + Forgot password */}
        <div className="flex items-center justify-between animate-slide-in-down">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              name="rememberMe"
              checked={formData.rememberMe}
              onChange={handleChange}
              disabled={loading}
              className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-800"
            />
            <span className="text-sm text-gray-600 dark:text-gray-300">
              Remember me
            </span>
          </label>

          <Link
            to="/forgot-password"
            className="text-sm font-medium text-indigo-600 hover:text-indigo-500 transition-colors dark:text-indigo-300 dark:hover:text-indigo-200"
          >
            Forgot password?
          </Link>
        </div>

        {/* Submit button */}
        <button
          type="submit"
          disabled={loading}
          aria-busy={loading}
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed transition-all duration-200 animate-slide-in-down"
        >
          {loading ? (
            <>
              <LoadingSpinner size="sm" color="white" />
              <span>Signing in…</span>
            </>
          ) : (
            <span>Sign in</span>
          )}
        </button>
      </form>
    </div>
  );
};

export default LoginForm;
