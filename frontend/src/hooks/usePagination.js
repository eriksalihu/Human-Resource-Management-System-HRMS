/**
 * @file frontend/src/hooks/usePagination.js
 * @description Pagination state management hook
 * @author Dev B
 */

import { useState, useMemo, useCallback } from 'react';

/**
 * usePagination — manages page / limit state and exposes navigation helpers.
 *
 * Provides the current page, limit, total pages, and total items along with
 * methods to navigate between pages. Meant to be used alongside a data fetching
 * hook that reads the `page` and `limit` values as query params.
 *
 * @example
 *   const pagination = usePagination({ initialLimit: 20 });
 *   const { data } = useFetch(`/api/users`, {
 *     params: { page: pagination.page, limit: pagination.limit }
 *   });
 *   useEffect(() => { pagination.setTotalItems(data?.total || 0); }, [data]);
 *
 * @param {Object} [opts]
 * @param {number} [opts.initialPage=1] - Starting page number
 * @param {number} [opts.initialLimit=10] - Starting items per page
 * @param {number} [opts.initialTotal=0] - Starting total item count
 * @returns {{
 *   page: number,
 *   limit: number,
 *   totalItems: number,
 *   totalPages: number,
 *   hasNextPage: boolean,
 *   hasPrevPage: boolean,
 *   goToPage: Function,
 *   nextPage: Function,
 *   prevPage: Function,
 *   setLimit: Function,
 *   setTotalItems: Function,
 *   reset: Function
 * }}
 */
const usePagination = ({
  initialPage = 1,
  initialLimit = 10,
  initialTotal = 0,
} = {}) => {
  const [page, setPage] = useState(initialPage);
  const [limit, setLimitState] = useState(initialLimit);
  const [totalItems, setTotalItems] = useState(initialTotal);

  /** Derived total pages (min 1 to avoid div-by-zero UI glitches) */
  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(totalItems / limit)),
    [totalItems, limit]
  );

  const hasNextPage = page < totalPages;
  const hasPrevPage = page > 1;

  /**
   * Navigate to a specific page, clamped to [1, totalPages].
   */
  const goToPage = useCallback(
    (targetPage) => {
      const clamped = Math.max(1, Math.min(totalPages, targetPage));
      setPage(clamped);
    },
    [totalPages]
  );

  const nextPage = useCallback(() => {
    setPage((p) => Math.min(totalPages, p + 1));
  }, [totalPages]);

  const prevPage = useCallback(() => {
    setPage((p) => Math.max(1, p - 1));
  }, []);

  /**
   * Update items-per-page and reset to page 1.
   */
  const setLimit = useCallback((newLimit) => {
    setLimitState(newLimit);
    setPage(1);
  }, []);

  /**
   * Reset all pagination state to initial values.
   */
  const reset = useCallback(() => {
    setPage(initialPage);
    setLimitState(initialLimit);
    setTotalItems(initialTotal);
  }, [initialPage, initialLimit, initialTotal]);

  return {
    page,
    limit,
    totalItems,
    totalPages,
    hasNextPage,
    hasPrevPage,
    goToPage,
    nextPage,
    prevPage,
    setLimit,
    setTotalItems,
    reset,
  };
};

export default usePagination;
