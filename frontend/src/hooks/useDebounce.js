/**
 * @file frontend/src/hooks/useDebounce.js
 * @description Debounce hook for optimizing rapidly-changing values
 * @author Dev B
 */

import { useState, useEffect } from 'react';

/**
 * useDebounce — returns a debounced copy of the given value.
 *
 * Typical use case: delay firing an API search request until the user
 * stops typing in a search input, to avoid one request per keystroke.
 *
 * @example
 *   const [query, setQuery] = useState('');
 *   const debouncedQuery = useDebounce(query, 500);
 *   useEffect(() => { if (debouncedQuery) search(debouncedQuery); }, [debouncedQuery]);
 *
 * @template T
 * @param {T} value - The value to debounce
 * @param {number} [delay=500] - Debounce delay in milliseconds
 * @returns {T} The debounced value (updates only after `delay` ms of stability)
 */
const useDebounce = (value, delay = 500) => {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    // Cancel the pending timer if the value changes before it fires
    return () => {
      clearTimeout(timer);
    };
  }, [value, delay]);

  return debouncedValue;
};

export default useDebounce;
