/**
 * @file frontend/src/components/auth/LoginForm.jsx
 * @description Login form — minimal, light-only. Show/hide password toggle,
 *   animated mount, error shake on failed submit.
 * @author Dev B (original), Dev A (minimal light-only redesign)
 */

import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import LoadingSpinner from '../common/LoadingSpinner';

const REMEMBER_KEY = 'hrms.rememberLogin';

const loadRemembered = () => {
  try {
    const raw = localStorage.getItem(REMEMBER_KEY);
    if (!raw) return { email: '', rememberMe: false };
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.email === 'string') {
      return { email: parsed.email, rememberMe: true };
    }
  } catch {
    /* corrupt entry */
  }
  return { email: '', rememberMe: false };
};

/**
 * LoginForm — controlled login form (light-only).
 * @param {Object} props
 * @param {Function} props.onSubmit
 * @returns {JSX.Element}
 */
const LoginForm = ({ onSubmit }) => {
  const [formData, setFormData] = useState(() => {
    const remembered = loadRemembered();
    return {
      email: remembered.email,
      password: '',
      rememberMe: remembered.rememberMe,
    };
  });
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [shakeTick, setShakeTick] = useState(0);
  const firstRenderRef = useRef(true);

  useEffect(() => {
    if (firstRenderRef.current) {
      firstRenderRef.current = false;
      return;
    }
    const hasErrors =
      Boolean(submitError) || Object.values(errors).some(Boolean);
    if (hasErrors) setShakeTick((t) => t + 1);
  }, [errors, submitError]);

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

  const handleSubmit = async (e) => {
    e.preventDefault();
    const next = validate();
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setLoading(true);
    setSubmitError(null);
    try {
      await onSubmit(formData);
      try {
        if (formData.rememberMe) {
          localStorage.setItem(
            REMEMBER_KEY,
            JSON.stringify({ email: formData.email })
          );
        } else {
          localStorage.removeItem(REMEMBER_KEY);
        }
      } catch {
        /* storage disabled — non-fatal */
      }
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
      key={shakeTick}
      className={shakeTick > 0 ? 'animate-shake' : 'animate-fade-in'}
    >
      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        {submitError && (
          <div
            role="alert"
            className="rounded-md p-3 text-sm bg-rose-50 text-rose-800 ring-1 ring-rose-200 animate-slide-in-down"
          >
            {submitError}
          </div>
        )}

        {/* Email */}
        <div className="animate-slide-in-down">
          <label
            htmlFor="email"
            className="block text-sm font-medium text-gray-700 mb-1"
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
              ${
                errors.email
                  ? 'border-rose-300 bg-rose-50 focus:ring-rose-400 focus:border-rose-400'
                  : 'border-gray-300 focus:ring-indigo-500 focus:border-indigo-500'
              }`}
            placeholder="you@example.com"
          />
          {errors.email && (
            <p id="login-email-error" className="mt-1 text-xs text-rose-600">
              {errors.email}
            </p>
          )}
        </div>

        {/* Password */}
        <div className="animate-slide-in-down">
          <label
            htmlFor="password"
            className="block text-sm font-medium text-gray-700 mb-1"
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
                ${
                  errors.password
                    ? 'border-rose-300 bg-rose-50 focus:ring-rose-400 focus:border-rose-400'
                    : 'border-gray-300 focus:ring-indigo-500 focus:border-indigo-500'
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
              className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-400 hover:text-gray-600 disabled:opacity-50 transition-colors"
            >
              {showPassword ? (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.542-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88L3 3m6.88 6.88L21 21" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              )}
            </button>
          </div>
          {errors.password && (
            <p id="login-password-error" className="mt-1 text-xs text-rose-600">
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
              className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            <span className="text-sm text-gray-600">Remember me</span>
          </label>
          <Link
            to="/forgot-password"
            className="text-sm font-medium text-indigo-600 hover:text-indigo-500 transition-colors"
          >
            Forgot password?
          </Link>
        </div>

        {/* Submit */}
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
