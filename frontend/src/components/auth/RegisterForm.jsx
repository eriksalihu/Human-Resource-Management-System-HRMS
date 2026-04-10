/**
 * @file frontend/src/components/auth/RegisterForm.jsx
 * @description Registration form with password strength indicator and validation
 * @author Dev B
 */

import { useState, useMemo } from 'react';
import LoadingSpinner from '../common/LoadingSpinner';

/**
 * Compute a password strength score from 0 to 4.
 * Criteria: length >= 8, lowercase, uppercase, number, special char.
 *
 * @param {string} password
 * @returns {{ score: number, label: string, color: string }}
 */
const calculatePasswordStrength = (password) => {
  if (!password) return { score: 0, label: '', color: 'bg-gray-200' };

  let score = 0;
  if (password.length >= 8) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  const levels = [
    { label: 'Very weak', color: 'bg-red-500' },
    { label: 'Weak', color: 'bg-orange-500' },
    { label: 'Fair', color: 'bg-yellow-500' },
    { label: 'Good', color: 'bg-lime-500' },
    { label: 'Strong', color: 'bg-green-500' },
  ];

  return { score, ...levels[score] };
};

/**
 * RegisterForm - Controlled registration form with password strength.
 * Handles first name, last name, email, password, and password confirmation
 * with real-time validation and strength indicator.
 *
 * @param {Object} props
 * @param {Function} props.onSubmit - Callback with { first_name, last_name, email, password }
 * @returns {JSX.Element} The registration form
 */
const RegisterForm = ({ onSubmit }) => {
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    email: '',
    password: '',
    confirm_password: '',
  });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);

  const passwordStrength = useMemo(
    () => calculatePasswordStrength(formData.password),
    [formData.password]
  );

  /**
   * Validate form fields.
   * @returns {boolean} True if form is valid
   */
  const validate = () => {
    const newErrors = {};

    if (!formData.first_name.trim()) {
      newErrors.first_name = 'First name is required';
    } else if (formData.first_name.trim().length < 2) {
      newErrors.first_name = 'First name must be at least 2 characters';
    }

    if (!formData.last_name.trim()) {
      newErrors.last_name = 'Last name is required';
    } else if (formData.last_name.trim().length < 2) {
      newErrors.last_name = 'Last name must be at least 2 characters';
    }

    if (!formData.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Please enter a valid email address';
    }

    if (!formData.password) {
      newErrors.password = 'Password is required';
    } else if (formData.password.length < 8) {
      newErrors.password = 'Password must be at least 8 characters';
    } else if (passwordStrength.score < 2) {
      newErrors.password = 'Password is too weak';
    }

    if (!formData.confirm_password) {
      newErrors.confirm_password = 'Please confirm your password';
    } else if (formData.password !== formData.confirm_password) {
      newErrors.confirm_password = 'Passwords do not match';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  /**
   * Handle input field changes.
   * @param {React.ChangeEvent} e - Input change event
   */
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));

    // Clear field error on change
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: '' }));
    }
  };

  /**
   * Handle form submission.
   * @param {React.FormEvent} e - Form submit event
   */
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);
    try {
      const { confirm_password, ...submitData } = formData;
      await onSubmit(submitData);
    } finally {
      setLoading(false);
    }
  };

  const inputClass = (field) =>
    `w-full px-4 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors ${
      errors[field] ? 'border-red-300 bg-red-50' : 'border-gray-300'
    }`;

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      {/* Name fields (side by side) */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="first_name" className="block text-sm font-medium text-gray-700 mb-1">
            First name
          </label>
          <input
            id="first_name"
            name="first_name"
            type="text"
            autoComplete="given-name"
            value={formData.first_name}
            onChange={handleChange}
            className={inputClass('first_name')}
            placeholder="John"
            disabled={loading}
          />
          {errors.first_name && (
            <p className="mt-1 text-xs text-red-600">{errors.first_name}</p>
          )}
        </div>

        <div>
          <label htmlFor="last_name" className="block text-sm font-medium text-gray-700 mb-1">
            Last name
          </label>
          <input
            id="last_name"
            name="last_name"
            type="text"
            autoComplete="family-name"
            value={formData.last_name}
            onChange={handleChange}
            className={inputClass('last_name')}
            placeholder="Doe"
            disabled={loading}
          />
          {errors.last_name && (
            <p className="mt-1 text-xs text-red-600">{errors.last_name}</p>
          )}
        </div>
      </div>

      {/* Email field */}
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
          Email address
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          value={formData.email}
          onChange={handleChange}
          className={inputClass('email')}
          placeholder="you@example.com"
          disabled={loading}
        />
        {errors.email && (
          <p className="mt-1 text-xs text-red-600">{errors.email}</p>
        )}
      </div>

      {/* Password field */}
      <div>
        <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          value={formData.password}
          onChange={handleChange}
          className={inputClass('password')}
          placeholder="At least 8 characters"
          disabled={loading}
        />

        {/* Password strength indicator */}
        {formData.password && (
          <div className="mt-2">
            <div className="flex gap-1">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className={`h-1 flex-1 rounded-full transition-colors ${
                    i < passwordStrength.score ? passwordStrength.color : 'bg-gray-200'
                  }`}
                />
              ))}
            </div>
            {passwordStrength.label && (
              <p className="mt-1 text-xs text-gray-600">
                Strength: <span className="font-medium">{passwordStrength.label}</span>
              </p>
            )}
          </div>
        )}

        {errors.password && (
          <p className="mt-1 text-xs text-red-600">{errors.password}</p>
        )}
      </div>

      {/* Confirm password field */}
      <div>
        <label htmlFor="confirm_password" className="block text-sm font-medium text-gray-700 mb-1">
          Confirm password
        </label>
        <input
          id="confirm_password"
          name="confirm_password"
          type="password"
          autoComplete="new-password"
          value={formData.confirm_password}
          onChange={handleChange}
          className={inputClass('confirm_password')}
          placeholder="Re-enter your password"
          disabled={loading}
        />
        {errors.confirm_password && (
          <p className="mt-1 text-xs text-red-600">{errors.confirm_password}</p>
        )}
      </div>

      {/* Submit button */}
      <button
        type="submit"
        disabled={loading}
        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors mt-2"
      >
        {loading ? (
          <>
            <LoadingSpinner size="sm" color="white" />
            Creating account...
          </>
        ) : (
          'Create account'
        )}
      </button>
    </form>
  );
};

export default RegisterForm;
