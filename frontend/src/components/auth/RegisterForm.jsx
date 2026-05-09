/**
 * @file frontend/src/components/auth/RegisterForm.jsx
 * @description Registration form — name + email + password fields with field-level error feedback, integrated PasswordStrengthMeter, terms-of-service checkbox gate, and dark-mode styling
 * @author Dev B
 *
 * Validation strategy:
 *   - Required fields (first/last name, email, password, confirm,
 *     terms) are checked on submit
 *   - Email format + password strength + match are checked on submit
 *     too, with field-level error messages directly below the input
 *   - The strength meter is purely visual feedback while typing — it
 *     doesn't BLOCK submit at low scores, it just makes the user's
 *     decision visible. Submit gating is via the explicit
 *     `isStrongPassword` rule (all 5 checks pass) and the server
 *     enforces the same rule independently.
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import LoadingSpinner from '../common/LoadingSpinner';
import PasswordStrengthMeter from '../common/PasswordStrengthMeter';
import {
  isValidEmail,
  isStrongPassword,
  passwordStrengthReason,
  isNonEmptyString,
} from '../../utils/validators';

/**
 * RegisterForm — controlled registration form.
 *
 * @param {Object} props
 * @param {Function} props.onSubmit - Async callback receiving the
 *   sanitized payload `{ first_name, last_name, email, password }`.
 *   Confirm-password and the terms flag are NOT forwarded.
 * @returns {JSX.Element}
 */
const RegisterForm = ({ onSubmit }) => {
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    email: '',
    password: '',
    confirm_password: '',
    accept_terms: false,
  });
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState(null);
  const [loading, setLoading] = useState(false);

  /**
   * Validate the form. Returns the next-errors object so the caller can
   * decide what to do with it (we use it for state + submit gating).
   */
  const validate = () => {
    const next = {};

    if (!isNonEmptyString(formData.first_name)) {
      next.first_name = 'First name is required';
    } else if (formData.first_name.trim().length < 2) {
      next.first_name = 'First name must be at least 2 characters';
    }

    if (!isNonEmptyString(formData.last_name)) {
      next.last_name = 'Last name is required';
    } else if (formData.last_name.trim().length < 2) {
      next.last_name = 'Last name must be at least 2 characters';
    }

    if (!isNonEmptyString(formData.email)) {
      next.email = 'Email is required';
    } else if (!isValidEmail(formData.email)) {
      next.email = 'Enter a valid email address';
    }

    if (!formData.password) {
      next.password = 'Password is required';
    } else if (!isStrongPassword(formData.password)) {
      next.password =
        passwordStrengthReason(formData.password) ||
        'Password does not meet strength requirements';
    }

    if (!formData.confirm_password) {
      next.confirm_password = 'Please confirm your password';
    } else if (formData.password !== formData.confirm_password) {
      next.confirm_password = "Passwords don't match";
    }

    if (!formData.accept_terms) {
      next.accept_terms = 'You must accept the terms to register';
    }

    return next;
  };

  /** Generic field change handler — clears matching error + submit banner. */
  const handleChange = (event) => {
    const { name, value, type, checked } = event.target;
    const nextValue = type === 'checkbox' ? checked : value;
    setFormData((prev) => ({ ...prev, [name]: nextValue }));

    if (errors[name]) {
      setErrors((prev) => {
        const { [name]: _omit, ...rest } = prev;
        return rest;
      });
    }
    if (submitError) setSubmitError(null);
  };

  /** Submit handler — validates, calls `onSubmit`, surfaces server errors. */
  const handleSubmit = async (event) => {
    event.preventDefault();
    const next = validate();
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setLoading(true);
    setSubmitError(null);
    try {
      const { confirm_password, accept_terms, ...submitData } = formData;
      // Trim leading/trailing whitespace on text fields before submit.
      submitData.first_name = submitData.first_name.trim();
      submitData.last_name = submitData.last_name.trim();
      submitData.email = submitData.email.trim();
      await onSubmit(submitData);
    } catch (err) {
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        'Registration failed. Please try again.';
      setSubmitError(msg);
    } finally {
      setLoading(false);
    }
  };

  /** Tailwind class builder for inputs — picks error vs default border. */
  const inputClass = (field) =>
    `w-full px-4 py-2.5 rounded-lg text-sm border focus:outline-none focus:ring-2 transition-all duration-200
      bg-white text-gray-900 placeholder-gray-400 disabled:opacity-50 disabled:bg-gray-50
      dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500 dark:disabled:bg-gray-800/50
      ${
        errors[field]
          ? 'border-rose-300 bg-rose-50 focus:ring-rose-400 focus:border-rose-400 dark:bg-rose-500/10 dark:border-rose-500/40'
          : 'border-gray-300 focus:ring-indigo-500 focus:border-indigo-500 dark:border-gray-700'
      }`;

  return (
    <form onSubmit={handleSubmit} className="space-y-4 animate-fade-in" noValidate>
      {/* Server / submit error banner */}
      {submitError && (
        <div
          role="alert"
          className="rounded-md p-3 text-sm bg-rose-50 text-rose-800 ring-1 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-500/30 animate-slide-in-down"
        >
          {submitError}
        </div>
      )}

      {/* Name fields side-by-side */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label
            htmlFor="first_name"
            className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1"
          >
            First name
          </label>
          <input
            id="first_name"
            name="first_name"
            type="text"
            autoComplete="given-name"
            value={formData.first_name}
            onChange={handleChange}
            disabled={loading}
            aria-invalid={Boolean(errors.first_name)}
            aria-describedby={errors.first_name ? 'first_name-error' : undefined}
            className={inputClass('first_name')}
            placeholder="John"
          />
          {errors.first_name && (
            <p
              id="first_name-error"
              className="mt-1 text-xs text-rose-600 dark:text-rose-300"
            >
              {errors.first_name}
            </p>
          )}
        </div>

        <div>
          <label
            htmlFor="last_name"
            className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1"
          >
            Last name
          </label>
          <input
            id="last_name"
            name="last_name"
            type="text"
            autoComplete="family-name"
            value={formData.last_name}
            onChange={handleChange}
            disabled={loading}
            aria-invalid={Boolean(errors.last_name)}
            aria-describedby={errors.last_name ? 'last_name-error' : undefined}
            className={inputClass('last_name')}
            placeholder="Doe"
          />
          {errors.last_name && (
            <p
              id="last_name-error"
              className="mt-1 text-xs text-rose-600 dark:text-rose-300"
            >
              {errors.last_name}
            </p>
          )}
        </div>
      </div>

      {/* Email field */}
      <div>
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
          aria-describedby={errors.email ? 'email-error' : undefined}
          className={inputClass('email')}
          placeholder="you@example.com"
        />
        {errors.email && (
          <p
            id="email-error"
            className="mt-1 text-xs text-rose-600 dark:text-rose-300"
          >
            {errors.email}
          </p>
        )}
      </div>

      {/* Password field with strength meter */}
      <div>
        <label
          htmlFor="password"
          className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1"
        >
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          value={formData.password}
          onChange={handleChange}
          disabled={loading}
          aria-invalid={Boolean(errors.password)}
          aria-describedby="password-strength password-error"
          className={inputClass('password')}
          placeholder="At least 8 characters"
        />

        {/* Strength meter — only renders when there's something to evaluate. */}
        {formData.password && (
          <div className="mt-2">
            <PasswordStrengthMeter
              id="password-strength"
              password={formData.password}
            />
          </div>
        )}

        {errors.password && (
          <p
            id="password-error"
            className="mt-1 text-xs text-rose-600 dark:text-rose-300"
          >
            {errors.password}
          </p>
        )}
      </div>

      {/* Confirm password field */}
      <div>
        <label
          htmlFor="confirm_password"
          className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1"
        >
          Confirm password
        </label>
        <input
          id="confirm_password"
          name="confirm_password"
          type="password"
          autoComplete="new-password"
          value={formData.confirm_password}
          onChange={handleChange}
          disabled={loading}
          aria-invalid={Boolean(errors.confirm_password)}
          aria-describedby={
            errors.confirm_password ? 'confirm_password-error' : undefined
          }
          className={inputClass('confirm_password')}
          placeholder="Re-enter your password"
        />
        {errors.confirm_password && (
          <p
            id="confirm_password-error"
            className="mt-1 text-xs text-rose-600 dark:text-rose-300"
          >
            {errors.confirm_password}
          </p>
        )}
      </div>

      {/* Terms-of-service checkbox */}
      <div>
        <label className="flex items-start gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            name="accept_terms"
            checked={formData.accept_terms}
            onChange={handleChange}
            disabled={loading}
            aria-invalid={Boolean(errors.accept_terms)}
            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-800"
          />
          <span className="text-xs text-gray-600 dark:text-gray-300">
            I agree to the{' '}
            <Link
              to="/terms"
              className="font-medium text-indigo-600 hover:text-indigo-800 dark:text-indigo-300 dark:hover:text-indigo-200"
            >
              Terms of Service
            </Link>{' '}
            and{' '}
            <Link
              to="/privacy"
              className="font-medium text-indigo-600 hover:text-indigo-800 dark:text-indigo-300 dark:hover:text-indigo-200"
            >
              Privacy Policy
            </Link>
            .
          </span>
        </label>
        {errors.accept_terms && (
          <p className="mt-1 text-xs text-rose-600 dark:text-rose-300">
            {errors.accept_terms}
          </p>
        )}
      </div>

      {/* Submit button */}
      <button
        type="submit"
        disabled={loading}
        aria-busy={loading}
        className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed transition-all duration-200 mt-2"
      >
        {loading ? (
          <>
            <LoadingSpinner size="sm" color="white" />
            <span>Creating account…</span>
          </>
        ) : (
          <span>Create account</span>
        )}
      </button>
    </form>
  );
};

export default RegisterForm;
