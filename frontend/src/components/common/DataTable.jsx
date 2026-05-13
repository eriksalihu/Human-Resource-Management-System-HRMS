/**
 * @file frontend/src/components/common/DataTable.jsx
 * @description Reusable data table — sortable columns, loading/empty
 *   states, column-visibility toggle dropdown, optional row selection
 *   with master "select all" checkbox, and a bulk-action bar for the
 *   selected set
 * @author Dev B
 *
 * Backwards-compatible: every existing consumer (EmployeeList, SalaryList,
 * AttendanceList, etc.) keeps working without changes. The selection +
 * column-visibility features are opt-in via new props.
 *
 * New props (all optional):
 *   - `selectable: boolean`            — turn on the checkbox column
 *   - `selectedIds: Set<*> | Array`    — controlled selected-row keys
 *   - `onSelectionChange(nextSet)`     — receives the new Set<id> on toggle
 *   - `getRowId(row, idx): *`          — key resolver (defaults to `row.id ?? idx`)
 *   - `bulkActions: Array<{
 *        label: string,
 *        onClick: (selectedRows: Object[]) => void,
 *        variant?: 'primary' | 'danger' | 'neutral',
 *      }>`
 *   - `defaultHiddenColumns: string[]` — initial hidden-column keys
 *   - `storageKey: string`             — when set, hidden columns persist
 *                                        in localStorage under this key
 *   - `rowClassName(row): string`      — pass-through for row tinting
 *                                        (e.g. AttendanceList's late/absent)
 */

import { useState, useEffect, useMemo, useRef } from 'react';
import LoadingSpinner from './LoadingSpinner';

/** Default key resolver: prefer row.id, fall back to index. */
const defaultGetRowId = (row, idx) => row?.id ?? idx;

/** Variants → bg/text/hover classes for bulk-action buttons. */
const BULK_BUTTON_VARIANT = {
  primary:
    'bg-indigo-600 text-white hover:bg-indigo-700 focus:ring-indigo-500',
  danger:
    'bg-rose-600 text-white hover:bg-rose-700 focus:ring-rose-500',
  neutral:
    'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 focus:ring-indigo-500',
};

/**
 * DataTable — sortable, selectable, column-toggle-aware data grid.
 *
 * @param {Object} props
 * @returns {JSX.Element}
 */
const DataTable = ({
  columns,
  data,
  loading = false,
  sortBy,
  sortOrder = 'ASC',
  onSort,
  onRowClick,
  rowClassName,
  emptyMessage = 'No records found',

  // Selection
  selectable = false,
  selectedIds,
  onSelectionChange,
  getRowId = defaultGetRowId,
  bulkActions = [],

  // Column visibility
  defaultHiddenColumns,
  storageKey,
}) => {
  /* ── Column visibility state ─────────────────────────────────────── */

  /**
   * Hidden-column keys held as a Set for O(1) lookups. Persisted to
   * localStorage when `storageKey` is provided so users keep their
   * column choices across navigations / reloads.
   */
  const [hiddenSet, setHiddenSet] = useState(() => {
    if (storageKey && typeof window !== 'undefined') {
      try {
        const raw = window.localStorage.getItem(`dt.hidden.${storageKey}`);
        if (raw) {
          const arr = JSON.parse(raw);
          if (Array.isArray(arr)) return new Set(arr);
        }
      } catch {
        /* swallow malformed entries */
      }
    }
    return new Set(defaultHiddenColumns || []);
  });

  useEffect(() => {
    if (!storageKey || typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(
        `dt.hidden.${storageKey}`,
        JSON.stringify(Array.from(hiddenSet))
      );
    } catch {
      /* private mode / quota — silently ignore */
    }
  }, [hiddenSet, storageKey]);

  const visibleColumns = useMemo(
    () => columns.filter((col) => !hiddenSet.has(col.key)),
    [columns, hiddenSet]
  );

  const [columnMenuOpen, setColumnMenuOpen] = useState(false);
  const columnMenuRef = useRef(null);

  /** Close the column-visibility dropdown on outside-click + Escape. */
  useEffect(() => {
    if (!columnMenuOpen) return undefined;
    const onClick = (e) => {
      if (columnMenuRef.current && !columnMenuRef.current.contains(e.target)) {
        setColumnMenuOpen(false);
      }
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setColumnMenuOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [columnMenuOpen]);

  const toggleColumn = (key) => {
    setHiddenSet((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  /* ── Selection state ─────────────────────────────────────────────── */

  /**
   * Normalize `selectedIds` (may arrive as Set or Array) into a stable
   * Set for membership checks. When the parent doesn't control selection,
   * fall back to internal state.
   */
  const [internalSelected, setInternalSelected] = useState(() => new Set());
  const externalSelectedSet = useMemo(() => {
    if (!selectedIds) return null;
    if (selectedIds instanceof Set) return selectedIds;
    return new Set(selectedIds);
  }, [selectedIds]);
  const effectiveSelected = externalSelectedSet || internalSelected;

  /** Apply a selection update — emit to parent if controlled, else local. */
  const applySelection = (next) => {
    if (onSelectionChange) onSelectionChange(next);
    else setInternalSelected(next);
  };

  /** Toggle a single row id in the selected set. */
  const toggleRow = (id) => {
    const next = new Set(effectiveSelected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    applySelection(next);
  };

  /** Master "select all visible rows" toggle. */
  const allOnPageSelected =
    data.length > 0 &&
    data.every((row, idx) => effectiveSelected.has(getRowId(row, idx)));

  const someOnPageSelected =
    !allOnPageSelected &&
    data.some((row, idx) => effectiveSelected.has(getRowId(row, idx)));

  const toggleAllOnPage = () => {
    const next = new Set(effectiveSelected);
    if (allOnPageSelected) {
      // Deselect everything that's currently visible.
      for (const [i, row] of data.entries()) {
        next.delete(getRowId(row, i));
      }
    } else {
      // Select everything visible.
      for (const [i, row] of data.entries()) {
        next.add(getRowId(row, i));
      }
    }
    applySelection(next);
  };

  /**
   * Resolve selected rows for a bulk action callback. We only include
   * rows actually present in the current page — selections persisting
   * across pages are out of scope for the v1 selection model.
   */
  const selectedRowsOnPage = useMemo(
    () =>
      data.filter((row, idx) => effectiveSelected.has(getRowId(row, idx))),
    [data, effectiveSelected, getRowId]
  );

  /** Indeterminate state on the master checkbox needs DOM access. */
  const masterCheckboxRef = useRef(null);
  useEffect(() => {
    if (masterCheckboxRef.current) {
      masterCheckboxRef.current.indeterminate = someOnPageSelected;
    }
  }, [someOnPageSelected]);

  /* ── Sort handler ────────────────────────────────────────────────── */

  const handleSort = (columnKey) => {
    if (!onSort) return;
    const newOrder = sortBy === columnKey && sortOrder === 'ASC' ? 'DESC' : 'ASC';
    onSort(columnKey, newOrder);
  };

  const renderSortIcon = (columnKey) => {
    if (sortBy !== columnKey) {
      return (
        <svg
          className="w-4 h-4 text-gray-300 ml-1"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"
          />
        </svg>
      );
    }
    return (
      <svg
        className="w-4 h-4 text-indigo-600 ml-1"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d={sortOrder === 'ASC' ? 'M5 15l7-7 7 7' : 'M19 9l-7 7-7-7'}
        />
      </svg>
    );
  };

  /* ── Rendering ──────────────────────────────────────────────────── */

  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-12">
        <LoadingSpinner size="lg" message="Loading data..." />
      </div>
    );
  }

  const selectionCount = effectiveSelected.size;
  const hasSelection = selectable && selectionCount > 0;

  return (
    <div className="space-y-2">
      {/* Toolbar — column-visibility menu + (optional) bulk action bar */}
      {(hasSelection || columns.length > 0) && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          {/* Bulk action bar (only visible when rows are selected) */}
          {hasSelection ? (
            <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-indigo-50 ring-1 ring-inset ring-indigo-200 text-sm">
              <span className="font-medium text-indigo-900">
                {selectionCount} selected
              </span>
              {bulkActions.map((action) => {
                const cls =
                  BULK_BUTTON_VARIANT[action.variant] ||
                  BULK_BUTTON_VARIANT.primary;
                return (
                  <button
                    key={action.label}
                    type="button"
                    onClick={() => action.onClick(selectedRowsOnPage)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-1 ${cls}`}
                  >
                    {action.label}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => applySelection(new Set())}
                className="ml-auto text-xs font-medium text-indigo-700 hover:text-indigo-900"
              >
                Clear selection
              </button>
            </div>
          ) : (
            <span /> /* placeholder so the column-menu stays right-aligned */
          )}

          {/* Column visibility dropdown */}
          <div className="relative" ref={columnMenuRef}>
            <button
              type="button"
              onClick={() => setColumnMenuOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={columnMenuOpen}
              className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md bg-white border border-gray-300 text-gray-700 hover:bg-gray-50"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M7 12h10M10 18h4"
                />
              </svg>
              Columns
              {hiddenSet.size > 0 && (
                <span className="inline-flex items-center justify-center px-1.5 py-0.5 text-[10px] font-semibold rounded-full bg-gray-200 text-gray-700">
                  {columns.length - hiddenSet.size}/{columns.length}
                </span>
              )}
            </button>

            {columnMenuOpen && (
              <div
                role="menu"
                className="absolute right-0 mt-1 w-56 rounded-md shadow-lg z-20 bg-white border border-gray-200 py-1"
              >
                <p className="px-3 py-1 text-[10px] uppercase tracking-wide text-gray-500">
                  Show columns
                </p>
                {columns.map((col) => {
                  if (!col.label && !col.key) return null;
                  const visible = !hiddenSet.has(col.key);
                  return (
                    <label
                      key={col.key}
                      className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={visible}
                        onChange={() => toggleColumn(col.key)}
                        className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="truncate">
                        {col.label || col.key}
                      </span>
                    </label>
                  );
                })}
                {hiddenSet.size > 0 && (
                  <button
                    type="button"
                    onClick={() => setHiddenSet(new Set())}
                    className="w-full text-left px-3 py-1.5 text-xs font-medium text-indigo-600 hover:bg-gray-50 border-t border-gray-100 mt-1"
                  >
                    Reset to default
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            {/* Table header */}
            <thead className="bg-gray-50">
              <tr>
                {selectable && (
                  <th scope="col" className="px-4 py-3 w-10">
                    <input
                      ref={masterCheckboxRef}
                      type="checkbox"
                      checked={allOnPageSelected}
                      onChange={toggleAllOnPage}
                      aria-label="Select all on this page"
                      className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    />
                  </th>
                )}
                {visibleColumns.map((column) => (
                  <th
                    key={column.key}
                    scope="col"
                    className={`px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider ${
                      column.sortable
                        ? 'cursor-pointer select-none hover:bg-gray-100 transition-colors'
                        : ''
                    }`}
                    onClick={() => column.sortable && handleSort(column.key)}
                  >
                    <div className="flex items-center">
                      {column.label}
                      {column.sortable && renderSortIcon(column.key)}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>

            {/* Table body */}
            <tbody className="bg-white divide-y divide-gray-200">
              {data.length === 0 ? (
                <tr>
                  <td
                    colSpan={visibleColumns.length + (selectable ? 1 : 0)}
                    className="px-6 py-12 text-center"
                  >
                    <div className="flex flex-col items-center gap-2">
                      <svg
                        className="w-12 h-12 text-gray-300"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.5}
                          d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
                        />
                      </svg>
                      <p className="text-sm text-gray-500">{emptyMessage}</p>
                    </div>
                  </td>
                </tr>
              ) : (
                data.map((row, index) => {
                  const rowId = getRowId(row, index);
                  const isSelected = effectiveSelected.has(rowId);
                  const customRowClass =
                    typeof rowClassName === 'function'
                      ? rowClassName(row) || ''
                      : '';
                  return (
                    <tr
                      key={rowId}
                      className={`${
                        onRowClick ? 'cursor-pointer hover:bg-gray-50' : ''
                      } ${
                        isSelected ? 'bg-indigo-50/40' : ''
                      } ${customRowClass} transition-colors`}
                      onClick={() => onRowClick && onRowClick(row)}
                    >
                      {selectable && (
                        <td
                          className="px-4 py-4 w-10"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleRow(rowId)}
                            aria-label={`Select row ${rowId}`}
                            className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                          />
                        </td>
                      )}
                      {visibleColumns.map((column) => (
                        <td
                          key={column.key}
                          className="px-6 py-4 whitespace-nowrap text-sm text-gray-700"
                        >
                          {column.render
                            ? column.render(row[column.key], row)
                            : row[column.key]}
                        </td>
                      ))}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default DataTable;
