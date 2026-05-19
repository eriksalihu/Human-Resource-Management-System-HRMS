/**
 * @file frontend/src/components/common/SearchBar.jsx
 * @description Debounced search input with clear button, search icon,
 *   and keyboard shortcuts (Enter = search now, Escape = clear).
 * @author Dev B
 *
 * v2 (commit 245) adds keyboard affordances:
 *   - **Enter** fires `onSearch` immediately with the current value,
 *     bypassing the debounce — for users who want results NOW rather
 *     than waiting out the delay timer.
 *   - **Escape** clears the field and emits an empty search (only when
 *     there's something to clear, so Escape still bubbles for closing
 *     modals/dropdowns when the box is already empty).
 *   - `role="search"` landmark + an explicit input `aria-label` so the
 *     control is announced and reachable by assistive tech.
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

  /**
   * Keyboard shortcuts on the input:
   *   - Enter  → search immediately with the current value
   *   - Escape → clear (only when non-empty, so Escape still propagates
   *              to close an enclosing modal when the field is blank)
   */
  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (typeof onSearch === 'function') onSearch(value);
    } else if (e.key === 'Escape' && value) {
      e.preventDefault();
      e.stopPropagation();
      handleClear();
    }
  };

  return (
    <div className={`relative ${className}`} role="search">
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
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        aria-label={placeholder}
        className="block w-full pl-10 pr-10 py-2.5 border border-gray-300 rounded-lg text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100 dark:placeholder-gray-500"
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
