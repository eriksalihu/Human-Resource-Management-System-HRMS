/**
 * @file frontend/src/hooks/useDebounce.js
 * @description Debounce hook for optimizing rapidly-changing values
 * @author Dev B (original), Dev A (useTransition + cancel/flush controls)
 *
 * v2 (commit 236 — Dev A) wraps the debounced state update in
 * `startTransition` so the debounce work is marked non-urgent and
 * React can interrupt it to keep typing responsive — important when
 * the debounced value drives an expensive downstream render (large
 * list re-sort, chart recomputation, etc.).
 *
 * Two exports:
 *
 *   1. `useDebounce(value, delay, options?)` — default export.
 *      Backwards-compatible: returns just the debounced value, same as
 *      before. Now accepts an options object for `immediate` (fire on
 *      the first call without waiting for the delay).
 *
 *   2. `useDebouncedValue(value, delay, options?)` — named export.
 *      Returns `{ debouncedValue, cancel, flush, isPending }` for
 *      callers that need fine-grained control:
 *        - `cancel()` clears the pending timer so the next value
 *          change starts a fresh debounce window
 *        - `flush()` cancels the timer AND immediately commits the
 *          current value (skips the remaining delay)
 *        - `isPending` reflects React's transition state — useful for
 *          showing a subtle "updating…" affordance
 */

import { useState, useEffect, useRef, useCallback, useTransition } from 'react';

/**
 * useDebouncedValue — full-featured debouncer with cancel + flush.
 *
 * Internally the debounced commit runs inside `startTransition` so a
 * fast-typing user keeps a responsive input even when the downstream
 * render is heavy. React 19 will yield the main thread for higher-
 * priority updates (e.g. keystroke into the input) and resume the
 * transition when idle.
 *
 * @template T
 * @param {T} value
 * @param {number} [delay=500]
 * @param {Object} [options]
 * @param {boolean} [options.immediate=false] - Commit the FIRST value
 *   synchronously without waiting for the delay. Subsequent changes
 *   still debounce normally. Useful when an initial value should
 *   appear instantly but rapid follow-up edits should be debounced.
 * @returns {{
 *   debouncedValue: T,
 *   cancel: () => void,
 *   flush: () => void,
 *   isPending: boolean
 * }}
 */
export const useDebouncedValue = (value, delay = 500, options = {}) => {
  const { immediate = false } = options;

  const [debouncedValue, setDebouncedValue] = useState(value);
  const [isPending, startTransition] = useTransition();

  // Track the pending timer ID so cancel/flush can clear it from
  // outside the effect.
  const timerRef = useRef(null);
  // Track whether this is the first effect run — `immediate` only
  // applies on the very first commit, not on every value flip.
  const isFirstRunRef = useRef(true);
  // Keep the most-recent value visible to flush() without re-rendering
  // every time it changes. Refs are the right shape here.
  const latestValueRef = useRef(value);
  latestValueRef.current = value;

  /** Clear the pending timer (no-op when nothing is queued). */
  const cancel = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  /** Cancel any pending timer AND commit the current value immediately. */
  const flush = useCallback(() => {
    cancel();
    startTransition(() => {
      setDebouncedValue(latestValueRef.current);
    });
  }, [cancel]);

  useEffect(() => {
    // Honour `immediate` on the very first effect run.
    if (immediate && isFirstRunRef.current) {
      isFirstRunRef.current = false;
      startTransition(() => {
        setDebouncedValue(value);
      });
      return undefined;
    }
    isFirstRunRef.current = false;

    // Schedule the debounced commit. Wrapping in startTransition tells
    // React this state change is non-urgent so it can keep the input
    // typing-responsive even under heavy downstream renders.
    timerRef.current = setTimeout(() => {
      startTransition(() => {
        setDebouncedValue(value);
      });
      timerRef.current = null;
    }, delay);

    // Cleanup on value/delay change OR unmount — cancel the pending
    // timer so we don't leak setTimeouts past the component lifetime.
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [value, delay, immediate]);

  return { debouncedValue, cancel, flush, isPending };
};

/**
 * useDebounce — returns just the debounced value (backward-compatible
 * default export). For cancel/flush/isPending controls use the named
 * `useDebouncedValue` export instead.
 *
 * @example
 *   const [query, setQuery] = useState('');
 *   const debouncedQuery = useDebounce(query, 500);
 *   useEffect(() => { if (debouncedQuery) search(debouncedQuery); }, [debouncedQuery]);
 *
 * @template T
 * @param {T} value - The value to debounce
 * @param {number} [delay=500] - Debounce delay in milliseconds
 * @param {Object} [options]
 * @param {boolean} [options.immediate=false] - Commit first value instantly
 * @returns {T} The debounced value (updates only after `delay` ms of stability)
 */
const useDebounce = (value, delay = 500, options = {}) => {
  return useDebouncedValue(value, delay, options).debouncedValue;
};

export default useDebounce;
