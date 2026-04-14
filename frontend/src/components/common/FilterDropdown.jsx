/**
 * @file frontend/src/components/common/FilterDropdown.jsx
 * @description Reusable dropdown filter with "All" option and onChange callback
 * @author Dev B
 */

/**
 * FilterDropdown — labelled select component for list filtering.
 *
 * Renders a label paired with a native <select> populated from an `options`
 * array. Always includes a leading "All" option (configurable label) that
 * emits an empty string when chosen.
 *
 * @param {Object} props
 * @param {string} props.label - Visible label text above the select
 * @param {Array<{ value: string|number, label: string }>} props.options - Selectable items
 * @param {string|number} props.value - Currently selected value (controlled)
 * @param {Function} props.onChange - Callback invoked with the new value
 * @param {string} [props.allLabel='All'] - Label for the "All" option
 * @param {string} [props.id] - Optional id for label association
 * @param {boolean} [props.disabled=false]
 * @param {string} [props.className=''] - Additional wrapper classes
 * @returns {JSX.Element}
 */
const FilterDropdown = ({
  label,
  options = [],
  value,
  onChange,
  allLabel = 'All',
  id,
  disabled = false,
  className = '',
}) => {
  const selectId = id || `filter-${label?.toLowerCase().replace(/\s+/g, '-')}`;

  return (
    <div className={`flex flex-col ${className}`}>
      {label && (
        <label
          htmlFor={selectId}
          className="text-sm font-medium text-gray-700 mb-1"
        >
          {label}
        </label>
      )}

      <div className="relative">
        <select
          id={selectId}
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="appearance-none w-full pl-3 pr-10 py-2.5 border border-gray-300 rounded-lg text-sm bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed transition-colors"
        >
          <option value="">{allLabel}</option>
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        {/* Chevron icon */}
        <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
          <svg
            className="h-4 w-4 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </div>
      </div>
    </div>
  );
};

export default FilterDropdown;
