/**
 * @file frontend/src/hooks/useFetch.js
 * @description Reusable data fetching hook with loading, error, and refetch support
 * @author Dev B
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import axiosInstance from '../api/axiosInstance';

/**
 * useFetch — fetches data from the given URL and manages loading / error state.
 *
 * Features:
 * - Aborts in-flight requests on unmount or URL change to avoid setting state
 *   on unmounted components.
 * - Exposes a `refetch` function to manually re-run the request.
 * - Accepts an options object forwarded to axios (method, params, data, etc.).
 *
 * @template T
 * @param {string} url - Target URL (relative to axios baseURL)
 * @param {Object} [options] - Axios config forwarded to the request
 * @param {*} [options.params] - Query params
 * @param {*} [options.body] - Request body (for non-GET methods)
 * @param {string} [options.method='GET'] - HTTP method
 * @param {boolean} [options.skip=false] - Skip the initial fetch if true
 * @returns {{ data: T|null, loading: boolean, error: Error|null, refetch: Function }}
 */
const useFetch = (url, options = {}) => {
  const { params, body, method = 'GET', skip = false } = options;

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(!skip);
  const [error, setError] = useState(null);

  // Serialize options so the effect re-runs only on meaningful changes
  const optionsKey = JSON.stringify({ params, body, method });

  // Track mount state for safe state updates
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  /**
   * Execute the fetch request.
   * Uses an AbortController to support cancellation.
   */
  const fetchData = useCallback(
    async (signal) => {
      if (!url || skip) return;

      setLoading(true);
      setError(null);

      try {
        const response = await axiosInstance.request({
          url,
          method,
          params,
          data: body,
          signal,
        });

        if (isMountedRef.current) {
          setData(response.data?.data ?? response.data);
        }
      } catch (err) {
        // Ignore aborted requests — they are expected on unmount
        if (err.name === 'CanceledError' || err.name === 'AbortError') return;
        if (isMountedRef.current) {
          setError(err);
        }
      } finally {
        if (isMountedRef.current) {
          setLoading(false);
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [url, optionsKey, skip]
  );

  useEffect(() => {
    const controller = new AbortController();
    fetchData(controller.signal);

    return () => {
      controller.abort();
    };
  }, [fetchData]);

  /**
   * Manually re-run the request (e.g., after a mutation).
   */
  const refetch = useCallback(() => {
    const controller = new AbortController();
    fetchData(controller.signal);
  }, [fetchData]);

  return { data, loading, error, refetch };
};

export default useFetch;
