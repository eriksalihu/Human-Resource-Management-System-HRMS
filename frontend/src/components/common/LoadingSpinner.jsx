/**
 * @file frontend/src/components/common/LoadingSpinner.jsx
 * @description Reusable loading spinner with Tailwind CSS animation
 * @author Dev B
 */

/**
 * LoadingSpinner - Animated SVG spinner component
 * Displays a spinning circle animation for loading states.
 *
 * @param {Object} props
 * @param {string} [props.size='md'] - Size variant: 'sm', 'md', 'lg'
 * @param {string} [props.color='indigo'] - Color theme for the spinner
 * @param {string} [props.message] - Optional loading message below spinner
 * @returns {JSX.Element} The loading spinner
 */
const LoadingSpinner = ({ size = 'md', color = 'indigo', message }) => {
  const sizeClasses = {
    sm: 'w-5 h-5',
    md: 'w-8 h-8',
    lg: 'w-12 h-12',
  };

  const colorClasses = {
    indigo: 'text-indigo-600',
    gray: 'text-gray-600',
    white: 'text-white',
  };

  return (
    <div className="flex flex-col items-center justify-center gap-3">
      <svg
        className={`animate-spin ${sizeClasses[size]} ${colorClasses[color]}`}
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        aria-label="Loading"
      >
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
        />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        />
      </svg>
      {message && (
        <p className="text-sm text-gray-500">{message}</p>
      )}
    </div>
  );
};

export default LoadingSpinner;
