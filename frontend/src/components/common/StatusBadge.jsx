/**
 * @file frontend/src/components/common/StatusBadge.jsx
 * @description Color-coded status badge component for displaying entity statuses
 * @author Dev B
 */

/**
 * Color mappings for different status values.
 * Each status maps to Tailwind CSS classes for background and text color.
 */
const statusColors = {
  // General statuses
  active: 'bg-green-100 text-green-800',
  inactive: 'bg-gray-100 text-gray-800',
  suspended: 'bg-orange-100 text-orange-800',
  terminated: 'bg-red-100 text-red-800',

  // Request/approval statuses
  pending: 'bg-yellow-100 text-yellow-800',
  approved: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
  cancelled: 'bg-gray-100 text-gray-800',

  // Salary statuses
  processed: 'bg-blue-100 text-blue-800',
  paid: 'bg-green-100 text-green-800',

  // Attendance statuses
  present: 'bg-green-100 text-green-800',
  absent: 'bg-red-100 text-red-800',
  late: 'bg-orange-100 text-orange-800',
  'half-day': 'bg-yellow-100 text-yellow-800',
  remote: 'bg-blue-100 text-blue-800',

  // Training statuses
  upcoming: 'bg-blue-100 text-blue-800',
  ongoing: 'bg-indigo-100 text-indigo-800',
  completed: 'bg-green-100 text-green-800',

  // Participation statuses
  enrolled: 'bg-blue-100 text-blue-800',
  dropped: 'bg-gray-100 text-gray-800',
  'no-show': 'bg-red-100 text-red-800',
};

/**
 * StatusBadge - Color-coded badge for displaying status values
 * Automatically maps status strings to appropriate color schemes.
 *
 * @param {Object} props
 * @param {string} props.status - The status value to display
 * @returns {JSX.Element} The status badge
 */
const StatusBadge = ({ status }) => {
  const colorClass = statusColors[status] || 'bg-gray-100 text-gray-800';
  const displayText = status ? status.charAt(0).toUpperCase() + status.slice(1).replace('-', ' ') : 'Unknown';

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${colorClass}`}
    >
      {displayText}
    </span>
  );
};

export default StatusBadge;
