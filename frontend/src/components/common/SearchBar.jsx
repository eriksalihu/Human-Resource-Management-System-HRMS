/**
 * @file frontend/src/components/common/SearchBar.jsx
 * @description Debounced search input with clear button and search icon
 * @author Dev B
 */

import { useState, useEffect } from 'react';
import useDebounce from '../../hooks/useDebounce';

/**
 * SearchBar — controlled search input with built-in debouncing.
 *
 * Calls `onSearch` only after the user pauses typing for `delay` ms, which
 * keeps API call volume low while still feeling responsive. Includes a clear
 * button that resets the input and emits an empty string immediately.
 *
 * @param {Object} props
 * @param {Function} props.onSearch - Callback invoked with the debounced value
 * @param {string} [props.placeholder='Search…'] - Input placeholder
 * @param {number} [props.delay=400] - Debounce delay in milliseconds
 * @param {string} [props.initialValue=''] - Pre-filled value
 * @param {string} [props.className=''] - Additional wrapper classes
 * @returns {JSX.Element}
 */
const SearchBar = ({
  onSearch,
  placeholder = 'Search…',
  delay = 400,
  initialValue = '',
  className = '',
}) => {
  const [value, setValue] = useState(initialValue);
  const debouncedValue = useDebounce(value, delay);

  // Fire the parent callback whenever the debounced value settles
  useEffect(() => {
    if (typeof onSearch === 'function') {
      onSearch(debouncedValue);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedValue]);

  /**
   * Clear the input and emit empty string immediately (bypass debounce).
   */
  const handleClear = () => {
    setValue('');
    if (typeof onSearch === 'function') {
      onSearch('');
    }
  };

  return (
    <div className={`relative ${className}`}>
      {/* Search icon */}
      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
        <svg
          className="h-5 w-5 text-gray-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z"
          />
        </svg>
      </div>

      {/* Input */}
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        className="block w-full pl-10 pr-10 py-2.5 border border-gray-300 rounded-lg text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
      />

      {/* Clear button (only shown when there is content) */}
      {value && (
        <button
          type="button"
          onClick={handleClear}
          className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 transition-colors"
          aria-label="Clear search"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      )}
    </div>
  );
};

export default SearchBar;
