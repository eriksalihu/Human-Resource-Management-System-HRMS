/**
 * @file frontend/src/components/employees/EmployeeProfile.jsx
 * @description Employee profile card with avatar, name, position/department, status badge, contract, hire date, and quick stats
 * @author Dev B
 *
 * v2 (commit 234) adopts `LazyImage` for the avatar so the profile image
 * only downloads when the card scrolls into view; falls back to an
 * initials chip on missing/broken URLs. Also adds:
 *   - A `loading` prop with a layout-matched skeleton so the parent can
 *     reserve the card's footprint while the API call is in flight
 *     (prevents layout shift when the data arrives)
 *   - `React.memo` on the public component with a shallow-equality
 *     short-circuit on the underlying employee fields used in render
 *   - `useMemo` on the derived `statusClass`, `contractLabel`, and
 *     the formatted date / tenure / manager strings so they don't
 *     recompute when an unrelated prop (e.g. callbacks) changes
 */

import { memo, useMemo } from 'react';
import LazyImage from '../common/LazyImage';

/** Status → Tailwind badge classes (must match the Employees.statusi ENUM). */
const STATUS_BADGE_CLASS = {
  active: 'bg-green-50 text-green-700 ring-green-600/20',
  inactive: 'bg-gray-50 text-gray-700 ring-gray-600/20',
  suspended: 'bg-yellow-50 text-yellow-800 ring-yellow-600/20',
  terminated: 'bg-red-50 text-red-700 ring-red-600/20',
};

/** Contract type → human-readable label. */
const CONTRACT_LABEL = {
  'full-time': 'Full-time',
  'part-time': 'Part-time',
  contract: 'Contract',
  intern: 'Intern',
};

/**
 * Format a date string (YYYY-MM-DD or ISO) as DD/MM/YYYY.
 * @param {string|null|undefined} value
 * @returns {string}
 */
const formatDate = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-GB');
};

/**
 * Compute years + months of tenure from a hire date to now.
 * @param {string|null|undefined} hireDate
 * @returns {string}
 */
const formatTenure = (hireDate) => {
  if (!hireDate) return '—';
  const start = new Date(hireDate);
  if (Number.isNaN(start.getTime())) return '—';

  const now = new Date();
  let years = now.getFullYear() - start.getFullYear();
  let months = now.getMonth() - start.getMonth();
  if (now.getDate() < start.getDate()) months -= 1;
  if (months < 0) {
    years -= 1;
    months += 12;
  }

  if (years <= 0 && months <= 0) return 'Less than a month';
  if (years <= 0) return `${months} mo`;
  if (months <= 0) return `${years} yr`;
  return `${years} yr ${months} mo`;
};

/**
 * Initials-only avatar fallback. Used when the API row has no
 * profile_image, and as the LazyImage `fallback` when the URL 404s.
 *
 * @param {Object} props
 * @param {string} [props.firstName]
 * @param {string} [props.lastName]
 * @returns {JSX.Element}
 */
const InitialsAvatar = memo(function InitialsAvatar({
  firstName = '',
  lastName = '',
}) {
  const initials =
    `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase() || '?';
  return (
    <div
      className="absolute inset-0 flex items-center justify-center bg-indigo-100 text-indigo-700 text-2xl font-semibold"
      aria-label={`${firstName} ${lastName}`.trim() || 'Employee'}
    >
      {initials}
    </div>
  );
});

/**
 * Render a circular avatar — LazyImage when a URL is present, initials
 * chip otherwise. The wrapper sizes itself; LazyImage fills.
 *
 * @param {Object} props
 * @param {string} [props.src]
 * @param {string} [props.firstName]
 * @param {string} [props.lastName]
 * @returns {JSX.Element}
 */
const Avatar = memo(function Avatar({ src, firstName = '', lastName = '' }) {
  return (
    <LazyImage
      src={src}
      alt={`${firstName} ${lastName}`.trim() || 'Profile photo'}
      className="h-20 w-20 rounded-full ring-2 ring-white shadow flex-shrink-0"
      fallback={<InitialsAvatar firstName={firstName} lastName={lastName} />}
    />
  );
});

/**
 * A single "quick stat" tile. Memoized — the dashboard re-renders
 * frequently and these tiles don't usually change.
 */
const QuickStat = memo(function QuickStat({ label, value, tone = 'gray' }) {
  const toneClasses = {
    gray: 'bg-gray-50 text-gray-700',
    indigo: 'bg-indigo-50 text-indigo-700',
    green: 'bg-green-50 text-green-700',
    amber: 'bg-amber-50 text-amber-700',
  };

  return (
    <div
      className={`rounded-lg px-3 py-2 ${toneClasses[tone]} flex flex-col justify-center min-w-[110px]`}
    >
      <span className="text-xs uppercase tracking-wider opacity-75">{label}</span>
      <span className="text-sm font-semibold mt-0.5 truncate">{value || '—'}</span>
    </div>
  );
});

/**
 * Layout-matched skeleton — reserves the same vertical real estate as
 * a real profile card so the page doesn't jump when data arrives.
 *
 * @returns {JSX.Element}
 */
const EmployeeProfileSkeleton = () => (
  <div
    className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm animate-pulse"
    aria-busy="true"
    aria-label="Loading employee profile"
  >
    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
      <div className="flex items-start gap-4 min-w-0 flex-1">
        <div className="h-20 w-20 rounded-full bg-gray-200 flex-shrink-0" />
        <div className="flex-1 space-y-2 min-w-0">
          <div className="h-5 w-48 bg-gray-200 rounded" />
          <div className="h-3 w-64 bg-gray-100 rounded" />
          <div className="h-3 w-24 bg-gray-100 rounded" />
          <div className="h-3 w-40 bg-gray-100 rounded" />
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <div className="h-9 w-16 bg-gray-200 rounded-lg" />
        <div className="h-9 w-24 bg-gray-100 rounded-lg" />
      </div>
    </div>
    <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-2">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-12 rounded-lg bg-gray-100" />
      ))}
    </div>
  </div>
);

/**
 * EmployeeProfile — compact profile card.
 *
 * Used as the sticky header inside {@link EmployeeDetail}, and reusable
 * anywhere a compact representation of an employee is useful (e.g. a team
 * roster or a manager's direct-reports panel).
 *
 * Wrapped in `React.memo` because the surrounding EmployeeDetail re-
 * renders on every tab switch / sub-fetch — the profile header itself
 * almost never changes, so re-rendering it is pure waste.
 *
 * @param {Object} props
 * @param {Object} [props.employee] - Employee object from the API
 * @param {boolean} [props.loading=false] - Render skeleton instead
 * @param {Function} [props.onEdit]
 * @param {Function} [props.onTerminate]
 * @param {Function} [props.onClose]
 * @returns {JSX.Element|null}
 */
const EmployeeProfile = memo(function EmployeeProfile({
  employee,
  loading = false,
  onEdit,
  onTerminate,
  onClose,
}) {
  /**
   * Derived display strings, memoized so they don't recompute when an
   * unrelated prop (callbacks, etc.) changes. The expensive ones here
   * are `formatTenure` (date math) and `formatDate` (Intl call).
   *
   * Hooks must run on every render in the same order, so we compute
   * these BEFORE any conditional early-return. The optional chaining
   * makes them safe when `employee` is null.
   */
  const statusClass = useMemo(
    () =>
      STATUS_BADGE_CLASS[employee?.statusi] || STATUS_BADGE_CLASS.inactive,
    [employee?.statusi]
  );
  const contractLabel = useMemo(
    () =>
      CONTRACT_LABEL[employee?.lloji_kontrates] ||
      employee?.lloji_kontrates ||
      '—',
    [employee?.lloji_kontrates]
  );
  const hireDateText = useMemo(
    () => formatDate(employee?.data_punesimit),
    [employee?.data_punesimit]
  );
  const tenureText = useMemo(
    () => formatTenure(employee?.data_punesimit),
    [employee?.data_punesimit]
  );
  const managerText = useMemo(
    () =>
      employee?.manager_first_name
        ? `${employee.manager_first_name} ${employee.manager_last_name}`
        : 'None',
    [employee?.manager_first_name, employee?.manager_last_name]
  );

  // Skeleton path — short-circuit AFTER the hook calls so hook order
  // stays stable across renders. The parent renders the placeholder
  // while the fetch is pending.
  if (loading) return <EmployeeProfileSkeleton />;
  if (!employee) return null;

  const isTerminated = employee.statusi === 'terminated';

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        {/* Left: avatar + identity */}
        <div className="flex items-start gap-4 min-w-0">
          <Avatar
            src={employee.profile_image}
            firstName={employee.first_name}
            lastName={employee.last_name}
          />

          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-xl font-bold text-gray-900 truncate">
                {employee.first_name} {employee.last_name}
              </h2>
              {employee.statusi && (
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${statusClass}`}
                >
                  {employee.statusi}
                </span>
              )}
            </div>

            <p className="text-sm text-gray-600 mt-0.5">
              {employee.position_emertimi || 'No position'}
              {employee.department_emertimi && (
                <>
                  <span className="text-gray-400"> · </span>
                  <span className="text-gray-700">{employee.department_emertimi}</span>
                </>
              )}
            </p>

            <p className="text-xs text-gray-500 mt-1 font-mono">
              {employee.numri_punonjesit || '—'}
            </p>

            {employee.email && (
              <p className="text-xs text-gray-500 mt-0.5 truncate">{employee.email}</p>
            )}
          </div>
        </div>

        {/* Right: actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {onEdit && (
            <button
              onClick={() => onEdit(employee)}
              className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
            >
              Edit
            </button>
          )}
          {onTerminate && !isTerminated && (
            <button
              onClick={() => onTerminate(employee)}
              className="px-4 py-2 border border-red-300 text-red-700 text-sm font-medium rounded-lg hover:bg-red-50 transition-colors"
            >
              Terminate
            </button>
          )}
          {onClose && (
            <button
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
            >
              Close
            </button>
          )}
        </div>
      </div>

      {/* Quick stats */}
      <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-2">
        <QuickStat label="Contract" value={contractLabel} tone="indigo" />
        <QuickStat label="Hire date" value={hireDateText} />
        <QuickStat label="Tenure" value={tenureText} tone="green" />
        <QuickStat label="Manager" value={managerText} tone="amber" />
      </div>
    </div>
  );
});

export default EmployeeProfile;
