/**
 * @file frontend/src/components/common/StatusBadge.jsx
 * @description Color-coded status badge component for displaying entity statuses
 * @author Dev B
 */

/**
 * Color mappings for different status values.
 * Each status maps to Tailwind CSS classes for background and text color.
 */
/**
 * Tone palette — light + dark variants in one place (commit 281).
 * Previously every entry was a light-only `bg-X-100 text-X-800` string,
 * so badges were near-invisible (dark text on a near-white chip) in
 * dark mode. Each tone now carries a `dark:` pairing tuned for the
 * dark surface (subtle translucent bg + light text).
 */
const TONES = {
  green:
    'bg-green-100 text-green-800',
  gray: 'bg-gray-100 text-gray-800',
  orange:
    'bg-orange-100 text-orange-800',
  red: 'bg-red-100 text-red-800',
  yellow:
    'bg-yellow-100 text-yellow-800',
  blue: 'bg-blue-100 text-blue-800',
  indigo:
    'bg-indigo-100 text-indigo-800',
};

const statusColors = {
  // General statuses
  active: TONES.green,
  inactive: TONES.gray,
  suspended: TONES.orange,
  terminated: TONES.red,

  // Request/approval statuses
  pending: TONES.yellow,
  approved: TONES.green,
  rejected: TONES.red,
  cancelled: TONES.gray,

  // Salary statuses
  processed: TONES.blue,
  paid: TONES.green,

  // Attendance statuses
  present: TONES.green,
  absent: TONES.red,
  late: TONES.orange,
  'half-day': TONES.yellow,
  remote: TONES.blue,

  // Training statuses
  upcoming: TONES.blue,
  ongoing: TONES.indigo,
  completed: TONES.green,

  // Participation statuses
  enrolled: TONES.blue,
  dropped: TONES.gray,
  'no-show': TONES.red,
};

/**
 * StatusBadge - Color-coded badge for displaying status values
 * Automatically maps status strings to appropriate color schemes.
 *
 * Accessibility: color alone can't convey meaning to color-blind or
 * screen-reader users, so the badge carries an explicit `aria-label`
 * ("Status: Approved") and `role="status"`. The visible text remains
 * the source of truth; the label just disambiguates it as a *status*.
 *
 * @param {Object} props
 * @param {string} props.status - The status value to display
 * @returns {JSX.Element} The status badge
 */
const StatusBadge = ({ status }) => {
  const colorClass = statusColors[status] || TONES.gray;
  const displayText = status ? status.charAt(0).toUpperCase() + status.slice(1).replace('-', ' ') : 'Unknown';

  return (
    <span
      role="status"
      aria-label={`Status: ${displayText}`}
      title={displayText}
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${colorClass}`}
    >
      {displayText}
    </span>
  );
};

export default StatusBadge;
