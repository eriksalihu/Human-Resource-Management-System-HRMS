/**
 * @file frontend/src/components/users/UserForm.jsx
 * @description User create / edit form — name, email, phone, role assignment, active toggle, and password (create-only)
 * @author Dev B
 *
 * Notes on role handling:
 *   - The backend `POST /api/users` accepts a single `role_id` at creation
 *     time. This form renders one checkbox per role (per the spec) but
 *     submits the first checked role's id; if zero are checked we omit
 *     `role_id` and the server defaults to "Employee".
 *   - The backend `PUT /api/users/:id` does NOT accept role changes — role
 *     re-assignment is a separate endpoint that doesn't yet exist. In edit
 *     mode the role checkboxes are shown read-only with a banner noting
 *     the limitation, so the UI is honest about what saves.
 *   - Role IDs match the seeder order in `backend/database/seeders/roles.seed.js`
 *     (Admin = 1, HR Manager = 2, Department Manager = 3, Employee = 4).
 *     A future commit can switch to a `/api/roles` lookup once that endpoint exists.
 */

import { useState, useMemo, useEffect } from 'react';
import {
  isValidEmail,
  isValidPhoneNumber,
  isStrongPassword,
  passwordStrengthReason,
  passwordStrengthScore,
  isNonEmptyString,
} from '../../utils/validators';
import { ROLES } from '../../utils/constants';

/**
 * Roles available for assignment, ordered by privilege descending. The
 * `id` values are seeded deterministically by `roles.seed.js` so they're
 * safe to inline here for now.
 */
const ROLE_OPTIONS = [
  { id: 1, name: ROLES.ADMIN,              description: 'Full system access' },
  { id: 2, name: ROLES.HR_MANAGER,         description: 'Manage employees, payroll, and leaves' },
  { id: 3, name: ROLES.DEPARTMENT_MANAGER, description: 'Approve leaves and manage department reports' },
  { id: 4, name: ROLES.EMPLOYEE,           description: 'View own profile and submit requests' },
];

/**
 * Strength-meter color classes per score bucket. 0..4 score from
 * `passwordStrengthScore` slots into 5 visual states.
 */
const STRENGTH_TONES = [
  { label: 'Empty',     bar: 'bg-gray-200',     text: 'text-gray-500' },
  { label: 'Weak',      bar: 'bg-rose-500',     text: 'text-rose-700' },
  { label: 'Weak',      bar: 'bg-rose-500',     text: 'text-rose-700' },
  { label: 'Fair',      bar: 'bg-amber-500',    text: 'text-amber-700' },
  { label: 'Good',      bar: 'bg-emerald-500',  text: 'text-emerald-700' },
  { label: 'Strong',    bar: 'bg-emerald-600',  text: 'text-emerald-800' },
];

/**
 * UserForm — admin user create / edit.
 *
 * @param {Object} props
 * @param {Object} [props.initialData] - When provided, runs in edit mode.
 *   Should be the full user row including `roles` (array of names) when
 *   available.
 * @param {Function} props.onSubmit - Receives the payload
 * @param {Function} props.onCancel
 * @param {boolean} [props.submitting=false]
 * @returns {JSX.Element}
 */
const UserForm = ({
  initialData = null,
  onSubmit,
  onCancel,
  submitting = false,
}) => {
  const isEdit = Boolean(initialData?.id);

  /** Initial role-id selection — names → ids based on ROLE_OPTIONS. */
  const initialRoleIds = useMemo(() => {
    const set = new Set();
    if (initialData?.roles && Array.isArray(initialData.roles)) {
      for (const name of initialData.roles) {
        const match = ROLE_OPTIONS.find((r) => r.name === name);
        if (match) set.add(match.id);
      }
    }
    return set;
  }, [initialData]);

  const [form, setForm] = useState({
    first_name: initialData?.first_name || '',
    last_name: initialData?.last_name || '',
    email: initialData?.email || '',
    phone: initialData?.phone || '',
    password: '',
    confirm_password: '',
    is_active: initialData?.is_active != null ? Boolean(initialData.is_active) : true,
  });
  const [roleIds, setRoleIds] = useState(() => new Set(initialRoleIds));
  const [errors, setErrors] = useState({});

  /**
   * Sync `roleIds` if the initial data shape arrives after mount (e.g.
   * roles are fetched lazily by the parent). We deliberately overwrite —
   * if the user has already toggled something, the initialData refresh
   * shouldn't undo their work, so we only resync when our own state is
   * still empty.
   */
  useEffect(() => {
    if (roleIds.size === 0 && initialRoleIds.size > 0) {
      setRoleIds(new Set(initialRoleIds));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialRoleIds]);

  /** Generic field change handler — clears the matching error on edit. */
  const handleChange = (field) => (event) => {
    const value =
      event.target.type === 'checkbox' ? event.target.checked : event.target.value;
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => {
        const { [field]: _omit, ...rest } = prev;
        return rest;
      });
    }
  };

  /** Toggle a role checkbox by id. */
  const toggleRole = (id) => {
    setRoleIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  /** Live password-strength preview. */
  const pwScore = passwordStrengthScore(form.password);
  const pwTone = STRENGTH_TONES[pwScore] || STRENGTH_TONES[0];
  const pwReason = passwordStrengthReason(form.password);

  /** Validate the form mirroring server invariants. */
  const validate = () => {
    const next = {};

    if (!isNonEmptyString(form.first_name)) {
      next.first_name = 'First name is required';
    }
    if (!isNonEmptyString(form.last_name)) {
      next.last_name = 'Last name is required';
    }

    if (!isValidEmail(form.email)) {
      next.email = 'Enter a valid email address';
    }
    if (form.phone && !isValidPhoneNumber(form.phone)) {
      next.phone = 'Enter a valid phone number';
    }

    // Password is required only at creation. Edit mode leaves passwords
    // alone — the user changes their own via ProfileSettings, and admins
    // do password resets via a different (future) flow.
    if (!isEdit) {
      if (!isStrongPassword(form.password)) {
        next.password =
          passwordStrengthReason(form.password) ||
          'Password does not meet strength requirements';
      } else if (form.password !== form.confirm_password) {
        next.confirm_password = "Passwords don't match";
      }
    }

    return next;
  };

  /** Submit handler — POST for create, PUT for edit. */
  const handleSubmit = (event) => {
    event.preventDefault();
    const next = validate();
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    const payload = {
      first_name: form.first_name.trim(),
      last_name: form.last_name.trim(),
      email: form.email.trim(),
      phone: form.phone?.trim() || undefined,
    };

    if (!isEdit) {
      payload.password = form.password;
      // Backend's POST /api/users accepts a single role_id. We send the
      // first checked role to satisfy the contract; multi-role assignment
      // is left to a future endpoint.
      const firstRole = [...roleIds].sort((a, b) => a - b)[0];
      if (firstRole) payload.role_id = firstRole;
    }

    if (isEdit) {
      payload.is_active = form.is_active;
    }

    onSubmit?.(payload);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Personal info */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label
            htmlFor="user-first-name"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            First name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            id="user-first-name"
            value={form.first_name}
            onChange={handleChange('first_name')}
            maxLength={100}
            className={`block w-full rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 text-sm ${
              errors.first_name
                ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
                : 'border-gray-300'
            }`}
          />
          {errors.first_name && (
            <p className="mt-1 text-xs text-red-600">{errors.first_name}</p>
          )}
        </div>

        <div>
          <label
            htmlFor="user-last-name"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Last name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            id="user-last-name"
            value={form.last_name}
            onChange={handleChange('last_name')}
            maxLength={100}
            className={`block w-full rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 text-sm ${
              errors.last_name
                ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
                : 'border-gray-300'
            }`}
          />
          {errors.last_name && (
            <p className="mt-1 text-xs text-red-600">{errors.last_name}</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label
            htmlFor="user-email"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Email <span className="text-red-500">*</span>
          </label>
          <input
            type="email"
            id="user-email"
            value={form.email}
            onChange={handleChange('email')}
            autoComplete="email"
            className={`block w-full rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 text-sm ${
              errors.email
                ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
                : 'border-gray-300'
            }`}
          />
          {errors.email && (
            <p className="mt-1 text-xs text-red-600">{errors.email}</p>
          )}
        </div>

        <div>
          <label
            htmlFor="user-phone"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Phone <span className="text-gray-400 text-xs">(optional)</span>
          </label>
          <input
            type="tel"
            id="user-phone"
            value={form.phone}
            onChange={handleChange('phone')}
            placeholder="+383 44 123 456"
            autoComplete="tel"
            className={`block w-full rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 text-sm ${
              errors.phone
                ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
                : 'border-gray-300'
            }`}
          />
          {errors.phone && (
            <p className="mt-1 text-xs text-red-600">{errors.phone}</p>
          )}
        </div>
      </div>

      {/* Password (create only) */}
      {!isEdit && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label
              htmlFor="user-password"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Password <span className="text-red-500">*</span>
            </label>
            <input
              type="password"
              id="user-password"
              value={form.password}
              onChange={handleChange('password')}
              autoComplete="new-password"
              className={`block w-full rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 text-sm ${
                errors.password
                  ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
                  : 'border-gray-300'
              }`}
            />

            {/* Strength meter */}
            <div className="mt-1.5 flex items-center gap-2">
              <div className="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                <div
                  className={`${pwTone.bar} h-1.5 rounded-full transition-all`}
                  style={{ width: `${(pwScore / 5) * 100}%` }}
                />
              </div>
              <span className={`text-[10px] font-medium ${pwTone.text}`}>
                {pwTone.label}
              </span>
            </div>
            <p className="mt-1 text-xs text-gray-500">
              {pwReason || '8+ chars with upper, lower, number, special.'}
            </p>
            {errors.password && (
              <p className="mt-1 text-xs text-red-600">{errors.password}</p>
            )}
          </div>

          <div>
            <label
              htmlFor="user-confirm-password"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Confirm password <span className="text-red-500">*</span>
            </label>
            <input
              type="password"
              id="user-confirm-password"
              value={form.confirm_password}
              onChange={handleChange('confirm_password')}
              autoComplete="new-password"
              className={`block w-full rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 text-sm ${
                errors.confirm_password
                  ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
                  : 'border-gray-300'
              }`}
            />
            {errors.confirm_password && (
              <p className="mt-1 text-xs text-red-600">
                {errors.confirm_password}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Role assignment */}
      <div>
        <p className="block text-sm font-medium text-gray-700 mb-1">
          Roles
        </p>

        {isEdit && (
          <p className="text-xs text-amber-700 bg-amber-50 ring-1 ring-amber-200 rounded-md px-2 py-1.5 mb-2">
            Role changes aren't yet supported via this form. Showing the
            current roles for reference.
          </p>
        )}

        <ul
          role="group"
          aria-label="Role assignment"
          className="grid grid-cols-1 sm:grid-cols-2 gap-2"
        >
          {ROLE_OPTIONS.map((role) => {
            const checked = roleIds.has(role.id);
            return (
              <li key={role.id}>
                <label
                  className={`flex items-start gap-2 rounded-md border p-2.5 cursor-pointer transition-colors ${
                    checked
                      ? 'border-indigo-300 bg-indigo-50/40'
                      : 'border-gray-200 hover:bg-gray-50'
                  } ${isEdit ? 'cursor-default' : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => !isEdit && toggleRole(role.id)}
                    disabled={isEdit}
                    className="mt-0.5 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 disabled:opacity-60"
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900">
                      {role.name}
                    </p>
                    <p className="text-xs text-gray-500">{role.description}</p>
                  </div>
                </label>
              </li>
            );
          })}
        </ul>

        {!isEdit && (
          <p className="mt-1 text-xs text-gray-500">
            The first checked role is sent on create. Multi-role assignment
            is on the roadmap; for now the user can be promoted later.
          </p>
        )}
      </div>

      {/* Active toggle (edit only — created users are active by default) */}
      {isEdit && (
        <div>
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={handleChange('is_active')}
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            <div>
              <span className="text-sm font-medium text-gray-900">
                Account active
              </span>
              <p className="text-xs text-gray-500">
                Inactive users cannot sign in. Use this to disable access
                without losing the audit trail.
              </p>
            </div>
          </label>
        </div>
      )}

      {/* Actions — stacked w/ Submit on top on mobile, row on sm+. */}
      <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-3 pt-2 border-t border-gray-100">
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-indigo-600 border border-transparent rounded-md shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
        >
          {submitting
            ? isEdit
              ? 'Saving…'
              : 'Creating…'
            : isEdit
              ? 'Save changes'
              : 'Create user'}
        </button>
      </div>
    </form>
  );
};

export default UserForm;
