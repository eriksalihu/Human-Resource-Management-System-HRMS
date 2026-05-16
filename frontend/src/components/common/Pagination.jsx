/**
 * @file frontend/src/components/common/Pagination.jsx
 * @description Accessible pagination — page numbers, prev/next, per-page
 *   selector, direct "go to page" jump input, and arrow-key navigation.
 * @author Dev B (original), Dev A (page-jump + accessibility)
 *
 * v2 (commit 247 — Dev A) adds:
 *   - A "Go to page" number input (Enter or the Go button jumps; the
 *     value is clamped to the valid 1..totalPages range)
 *   - Arrow-key navigation: ← / → move one page when focus is anywhere
 *     inside the pagination `<nav>`, Home / End jump to first / last
 *   - Full ARIA: `nav[aria-label]`, `aria-current="page"` on the active
 *     button, descriptive `aria-label`s on prev/next/number buttons,
 *     and a labelled jump input
 *   - Boundary buttons get `aria-disabled` in addition to `disabled`
 *
 * Prop-name compatibility:
 *   Every call site in the app passes `total`, `perPage`, and
 *   `onPerPageChange`, but the original component only read
 *   `totalItems`, `itemsPerPage`, and `onItemsPerPageChange`. Rather
 *   than touch a dozen list components, this version accepts BOTH
 *   conventions (the `total*` names win when both are supplied). That
 *   also un-breaks the "Showing X–Y of Z" line and the per-page
 *   selector, which were silently rendering `NaN` / never wired.
 */

import { useEffect, useRef, useState } from 'react';

/**
 * Pagination — page navigation with jump + keyboard support.
 *
 * @param {Object} props
 * @param {number} props.currentPage - Active page (1-based)
 * @param {number} props.totalPages - Total number of pages
 * @param {number} [props.total] - Total record count (preferred)
 * @param {number} [props.totalItems] - Legacy alias for `total`
 * @param {number} [props.perPage] - Items per page (preferred)
 * @param {number} [props.itemsPerPage] - Legacy alias for `perPage`
 * @param {Function} props.onPageChange - `(page:number) => void`
 * @param {Function} [props.onPerPageChange] - `(n:number) => void` (preferred)
 * @param {Function} [props.onItemsPerPageChange] - Legacy alias
 * @returns {JSX.Element|null}
 */
const Pagination = ({
  currentPage,
  totalPages,
  total,
  totalItems,
  perPage,
  itemsPerPage,
  onPageChange,
  onPerPageChange,
  onItemsPerPageChange,
}) => {
  // Normalize the dual prop conventions to single internal names.
  const recordCount = total ?? totalItems ?? 0;
  const pageSize = perPage ?? itemsPerPage ?? 10;
  const handlePerPage = onPerPageChange || onItemsPerPageChange;

  /** Controlled value of the "go to page" input. */
  const [jumpValue, setJumpValue] = useState('');
  const navRef = useRef(null);

  // Clear the jump field whenever the page actually changes (so a stale
  // typed value doesn't linger after navigating via the number buttons).
  useEffect(() => {
    setJumpValue('');
  }, [currentPage]);

  /**
   * Page-number model with ellipses. Shows first + last always, and a
   * window around the current page.
   * @returns {Array<number|string>}
   */
  const getPageNumbers = () => {
    const pages = [];
    const maxVisible = 5;

    if (totalPages <= maxVisible + 2) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
      return pages;
    }

    pages.push(1);
    const start = Math.max(2, currentPage - 1);
    const end = Math.min(totalPages - 1, currentPage + 1);
    if (start > 2) pages.push('...');
    for (let i = start; i <= end; i++) pages.push(i);
    if (end < totalPages - 1) pages.push('...');
    pages.push(totalPages);
    return pages;
  };

  if (totalPages <= 1) return null;

  const startItem = (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, recordCount);

  /** Clamp + commit a target page. */
  const goTo = (page) => {
    const n = Number(page);
    if (!Number.isFinite(n)) return;
    const clamped = Math.min(totalPages, Math.max(1, Math.trunc(n)));
    if (clamped !== currentPage) onPageChange(clamped);
  };

  /** Submit handler for the jump input (Enter key or Go button). */
  const submitJump = () => {
    if (jumpValue === '') return;
    goTo(jumpValue);
    setJumpValue('');
  };

  /**
   * Arrow-key navigation while focus is anywhere in the pagination nav.
   * Ignored when the user is typing in the jump input so ← / → still
   * move the text caret there.
   */
  const onNavKeyDown = (e) => {
    const tag = e.target?.tagName;
    if (tag === 'INPUT' || tag === 'SELECT') return;
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      goTo(currentPage - 1);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      goTo(currentPage + 1);
    } else if (e.key === 'Home') {
      e.preventDefault();
      goTo(1);
    } else if (e.key === 'End') {
      e.preventDefault();
      goTo(totalPages);
    }
  };

  const atFirst = currentPage === 1;
  const atLast = currentPage === totalPages;

  return (
    <nav
      ref={navRef}
      aria-label="Pagination"
      onKeyDown={onNavKeyDown}
      className="flex flex-col sm:flex-row items-center justify-between gap-4 px-2 py-3"
    >
      {/* Info text + live region so screen readers announce page changes */}
      <div className="text-sm text-gray-500" aria-live="polite">
        Showing <span className="font-medium text-gray-700">{startItem}</span> to{' '}
        <span className="font-medium text-gray-700">{endItem}</span> of{' '}
        <span className="font-medium text-gray-700">{recordCount}</span> results
      </div>

      {/* Page controls */}
      <div className="flex items-center flex-wrap gap-2">
        {/* Items per page selector */}
        {handlePerPage && (
          <label className="text-sm text-gray-600">
            <span className="sr-only">Results per page</span>
            <select
              value={pageSize}
              onChange={(e) => handlePerPage(Number(e.target.value))}
              aria-label="Results per page"
              className="text-sm border border-gray-300 rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            >
              {[5, 10, 25, 50].map((n) => (
                <option key={n} value={n}>
                  {n} / page
                </option>
              ))}
            </select>
          </label>
        )}

        {/* Previous */}
        <button
          type="button"
          onClick={() => goTo(currentPage - 1)}
          disabled={atFirst}
          aria-disabled={atFirst}
          aria-label="Go to previous page"
          className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Previous
        </button>

        {/* Page numbers */}
        <div className="flex items-center gap-1">
          {getPageNumbers().map((page, index) =>
            page === '...' ? (
              <span
                key={`ellipsis-${index}`}
                aria-hidden="true"
                className="px-2 py-1.5 text-sm text-gray-400"
              >
                ...
              </span>
            ) : (
              <button
                key={page}
                type="button"
                onClick={() => goTo(page)}
                aria-label={`Go to page ${page}`}
                aria-current={currentPage === page ? 'page' : undefined}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  currentPage === page
                    ? 'bg-indigo-600 text-white'
                    : 'text-gray-700 bg-white border border-gray-300 hover:bg-gray-50'
                }`}
              >
                {page}
              </button>
            )
          )}
        </div>

        {/* Next */}
        <button
          type="button"
          onClick={() => goTo(currentPage + 1)}
          disabled={atLast}
          aria-disabled={atLast}
          aria-label="Go to next page"
          className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Next
        </button>

        {/* Jump to page — only worth showing when there are enough pages
            that scanning the number buttons is tedious. */}
        {totalPages > 5 && (
          <div className="flex items-center gap-1.5 ml-1">
            <label htmlFor="pagination-jump" className="text-sm text-gray-500">
              Go to
            </label>
            <input
              id="pagination-jump"
              type="number"
              min={1}
              max={totalPages}
              inputMode="numeric"
              value={jumpValue}
              onChange={(e) => setJumpValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  submitJump();
                }
              }}
              placeholder={String(currentPage)}
              aria-label={`Go to page, between 1 and ${totalPages}`}
              className="w-16 text-sm border border-gray-300 rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
            <button
              type="button"
              onClick={submitJump}
              className="px-2.5 py-1.5 text-sm font-medium text-indigo-600 border border-indigo-200 rounded-md hover:bg-indigo-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
            >
              Go
            </button>
          </div>
        )}
      </div>
    </nav>
  );
};

export default Pagination;
