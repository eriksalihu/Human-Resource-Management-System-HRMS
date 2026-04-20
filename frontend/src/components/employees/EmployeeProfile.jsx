/**
 * @file frontend/src/components/employees/EmployeeProfile.jsx
 * @description Employee profile card with avatar, name, position/department, status badge, contract, hire date, and quick stats
 * @author Dev B
 */

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
 * Render a circular avatar (image or initials fallback).
 *
 * @param {Object} props
 * @param {string} [props.src]
 * @param {string} [props.firstName]
 * @param {string} [props.lastName]
 * @returns {JSX.Element}
 */
const Avatar = ({ src, firstName = '', lastName = '' }) => {
  const initials =
    `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase() || '?';

  if (src) {
    return (
      <img
        src={src}
        alt={`${firstName} ${lastName}`}
        className="h-20 w-20 rounded-full object-cover ring-2 ring-white shadow"
      />
    );
  }
  return (
    <div className="h-20 w-20 rounded-full bg-indigo-100 text-indigo-700 text-2xl font-semibold flex items-center justify-center ring-2 ring-white shadow">
      {initials}
    </div>
  );
};

/**
 * A single "quick stat" tile.
 */
const QuickStat = ({ label, value, tone = 'gray' }) => {
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
};

/**
 * EmployeeProfile — compact profile card.
 *
 * Used as the sticky header inside {@link EmployeeDetail}, and reusable
 * anywhere a compact representation of an employee is useful (e.g. a team
 * roster or a manager's direct-reports panel).
 *
 * @param {Object} props
 * @param {Object} props.employee - Employee object from the API
 * @param {Function} [props.onEdit]
 * @param {Function} [props.onTerminate]
 * @param {Function} [props.onClose]
 * @returns {JSX.Element|null}
 */
const EmployeeProfile = ({ employee, onEdit, onTerminate, onClose }) => {
  if (!employee) return null;

  const statusClass =
    STATUS_BADGE_CLASS[employee.statusi] || STATUS_BADGE_CLASS.inactive;
  const contractLabel =
    CONTRACT_LABEL[employee.lloji_kontrates] || employee.lloji_kontrates || '—';
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
        <QuickStat label="Hire date" value={formatDate(employee.data_punesimit)} />
        <QuickStat label="Tenure" value={formatTenure(employee.data_punesimit)} tone="green" />
        <QuickStat
          label="Manager"
          value={
            employee.manager_first_name
              ? `${employee.manager_first_name} ${employee.manager_last_name}`
              : 'None'
          }
          tone="amber"
        />
      </div>
    </div>
  );
};

export default EmployeeProfile;
