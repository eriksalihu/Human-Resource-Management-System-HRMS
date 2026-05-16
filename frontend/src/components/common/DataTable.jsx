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
 *   - `cardOnMobile: boolean`          — when true, table is hidden
 *                                        below `md` and rows render
 *                                        as stacked cards (label/value
 *                                        pairs per column)
 *
 * v4 (commit 241 — Dev B) adds an opt-in CARD mode for narrow
 * viewports. When `cardOnMobile` is true the table is hidden below the
 * `md` breakpoint and each row renders as a stacked card — every
 * visible column becomes a `LABEL: value` row, columns without a label
 * (avatars, status badges, etc.) sit at the top of the card, and an
 * `actions` column slots into a divider footer.
 *
 * Existing consumers keep working unchanged — `cardOnMobile` defaults
 * to `false` so the table-only behavior is preserved. Lists that opt
 * in (EmployeeList, SalaryList, AttendanceList, LeaveRequestList) get
 * a properly mobile-readable layout instead of a horizontally-scrolling
 * table on a phone.
 *
 * v3 (commit 232 — Dev B) adds rendering memoization so the table
 * stays responsive on large pages:
 *   - Each `<tr>` is now its own `React.memo` component. Sorting,
 *     filtering, or toggling a single checkbox re-renders only the
 *     rows whose data / selection state actually changed, instead of
 *     remounting every row.
 *   - Derived values (`visibleColumns`, `allOnPageSelected`,
 *     `someOnPageSelected`, `selectedRowsOnPage`) are wrapped in
 *     `useMemo` so they aren't recomputed on every render.
 *   - Event handlers (`handleSort`, `toggleRow`, `toggleAllOnPage`,
 *     `applySelection`, `toggleColumn`) are `useCallback`-wrapped so
 *     the row components see stable function references and don't
 *     re-render on parent state changes that don't affect them.
 *
 *   Caveat for consumers: the `columns` array — including each column's
 *   `render` function — should be stable across renders (define it
 *   outside the component, or wrap in `useMemo`). Otherwise every cell
 *   re-renders every time. Most existing consumers already define
 *   their columns at module scope; the few that build columns inline
 *   would benefit from a `useMemo` wrap.
 */

import { useState, useEffect, useMemo, useRef, useCallback, memo } from 'react';
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
 * DataTableRow — single table row, memoized.
 *
 * React.memo with the default shallow comparator works here because the
 * parent passes stable references for `visibleColumns`, `onRowClick`,
 * and `onToggleSelect` (all `useCallback`/`useMemo` outputs), while
 * `row`, `isSelected`, and `rowClassString` change only when the row
 * itself genuinely changes.
 *
 * Why a custom comparator wasn't needed: passing primitive flags
 * (`isSelected`, `selectable`, `rowClassString`) avoids deep equality
 * checks on the row object. The row object reference is stable as long
 * as the parent doesn't rebuild the dataset array (which would be a
 * legitimate "new data" signal anyway).
 *
 * @param {Object} props
 */
const DataTableRow = memo(function DataTableRow({
  row,
  rowId,
  isSelected,
  selectable,
  visibleColumns,
  rowClassString,
  onRowClick,
  onToggleSelect,
  onRowKeyDown,
}) {
  return (
    <tr
      className={`${
        onRowClick
          ? 'cursor-pointer hover:bg-gray-50 focus:outline-none focus:bg-indigo-50 focus:ring-2 focus:ring-inset focus:ring-indigo-500'
          : ''
      } ${isSelected ? 'bg-indigo-50/40' : ''} ${rowClassString} transition-colors`}
      onClick={() => onRowClick && onRowClick(row)}
      // Interactive rows participate in keyboard navigation: they're
      // focusable (tabIndex 0) and the parent's roving handler moves
      // focus with ↑/↓ and activates with Enter/Space.
      tabIndex={onRowClick ? 0 : undefined}
      onKeyDown={
        onRowClick ? (e) => onRowKeyDown && onRowKeyDown(e, row) : undefined
      }
      aria-selected={selectable ? isSelected : undefined}
    >
      {selectable && (
        <td
          className="px-4 py-4 w-10"
          onClick={(e) => e.stopPropagation()}
        >
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => onToggleSelect(rowId)}
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
});

/**
 * DataCard — single row rendered as a stacked card for mobile.
 *
 * Layout heuristic (column.label drives the slot):
 *   - **No label** → rendered alone at the top of the card. Used by
 *     avatar / status columns so they sit prominently rather than as a
 *     boring "—: <icon>" label pair.
 *   - **`actions` key** → rendered in a divider-separated footer slot.
 *   - **Anything else** → label/value row in a 2-column grid.
 *
 * @param {Object} props
 */
const DataCard = memo(function DataCard({
  row,
  rowId,
  isSelected,
  selectable,
  visibleColumns,
  rowClassString,
  onRowClick,
  onToggleSelect,
}) {
  // Bucket columns by slot so we can render them in distinct sections.
  const headerCols = [];
  const fieldCols = [];
  const actionsCol = visibleColumns.find((c) => c.key === 'actions');
  for (const col of visibleColumns) {
    if (col.key === 'actions') continue;
    if (!col.label) headerCols.push(col);
    else fieldCols.push(col);
  }

  return (
    <div
      className={`rounded-lg border shadow-sm p-3 transition-colors ${
        isSelected
          ? 'border-indigo-300 bg-indigo-50/40'
          : 'border-gray-200 bg-white'
      } ${onRowClick ? 'cursor-pointer hover:bg-gray-50' : ''} ${rowClassString}`}
      onClick={() => onRowClick && onRowClick(row)}
      role={onRowClick ? 'button' : undefined}
      tabIndex={onRowClick ? 0 : undefined}
      onKeyDown={(e) => {
        if (onRowClick && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onRowClick(row);
        }
      }}
    >
      {/* Header band — selection checkbox + no-label columns (avatar,
          status, etc.) inline. */}
      {(selectable || headerCols.length > 0) && (
        <div className="flex items-center gap-3 mb-2">
          {selectable && (
            <input
              type="checkbox"
              checked={isSelected}
              onChange={(e) => {
                e.stopPropagation();
                onToggleSelect(rowId);
              }}
              onClick={(e) => e.stopPropagation()}
              aria-label={`Select row ${rowId}`}
              className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 flex-shrink-0"
            />
          )}
          {headerCols.map((column) => (
            <div key={column.key} className="flex-shrink-0">
              {column.render
                ? column.render(row[column.key], row)
                : row[column.key]}
            </div>
          ))}
        </div>
      )}

      {/* Field rows — label / value grid. Each row is 1/3 label, 2/3 value
          so longer values get the breathing room. */}
      <dl className="space-y-1.5">
        {fieldCols.map((column) => (
          <div
            key={column.key}
            className="grid grid-cols-3 gap-2 text-sm items-baseline"
          >
            <dt className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 col-span-1">
              {column.label}
            </dt>
            <dd className="text-gray-800 col-span-2 break-words">
              {column.render
                ? column.render(row[column.key], row)
                : (row[column.key] ?? '—')}
            </dd>
          </div>
        ))}
      </dl>

      {/* Actions footer */}
      {actionsCol && (
        <div
          className="mt-3 pt-2 border-t border-gray-100 flex items-center justify-end"
          onClick={(e) => e.stopPropagation()}
        >
          {actionsCol.render
            ? actionsCol.render(row[actionsCol.key], row)
            : null}
        </div>
      )}
    </div>
  );
});

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

  // Responsive — render as stacked cards below `md` when true
  cardOnMobile = false,
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

  const toggleColumn = useCallback((key) => {
    setHiddenSet((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

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
  const applySelection = useCallback(
    (next) => {
      if (onSelectionChange) onSelectionChange(next);
      else setInternalSelected(next);
    },
    [onSelectionChange]
  );

  /** Toggle a single row id in the selected set. */
  const toggleRow = useCallback(
    (id) => {
      const next = new Set(effectiveSelected);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      applySelection(next);
    },
    [effectiveSelected, applySelection]
  );

  /**
   * Memoized "all/some on page selected" flags. Recomputing these per
   * render was a hotspot on large pages — every toggle walks the data
   * array twice, and useMemo cuts that to once-per-state-change.
   */
  const { allOnPageSelected, someOnPageSelected } = useMemo(() => {
    if (data.length === 0) {
      return { allOnPageSelected: false, someOnPageSelected: false };
    }
    let allSelected = true;
    let anySelected = false;
    for (const [idx, row] of data.entries()) {
      const has = effectiveSelected.has(getRowId(row, idx));
      if (has) anySelected = true;
      else allSelected = false;
      // Early-exit when we know both flags
      if (anySelected && !allSelected) break;
    }
    return {
      allOnPageSelected: allSelected,
      someOnPageSelected: anySelected && !allSelected,
    };
  }, [data, effectiveSelected, getRowId]);

  const toggleAllOnPage = useCallback(() => {
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
  }, [data, effectiveSelected, getRowId, allOnPageSelected, applySelection]);

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

  const handleSort = useCallback(
    (columnKey) => {
      if (!onSort) return;
      const newOrder =
        sortBy === columnKey && sortOrder === 'ASC' ? 'DESC' : 'ASC';
      onSort(columnKey, newOrder);
    },
    [onSort, sortBy, sortOrder]
  );

  /**
   * Stable row-click + select callbacks passed down to each
   * memoized DataTableRow. Wrapping these means a parent-state
   * change (e.g. sort flip) doesn't re-render unchanged rows.
   */
  const handleRowClick = useCallback(
    (row) => {
      if (onRowClick) onRowClick(row);
    },
    [onRowClick]
  );

  /**
   * Roving keyboard navigation between rows. ↑ / ↓ move focus to the
   * adjacent row, Home / End jump to the first / last row in the body,
   * and Enter / Space activate the focused row's click handler.
   *
   * Implemented via DOM sibling traversal (vs. tracking a focus index
   * in state) so it stays O(1) and doesn't force a re-render on every
   * arrow press — important on large pages.
   */
  const handleRowKeyDown = useCallback(
    (e, row) => {
      const tr = e.currentTarget;
      switch (e.key) {
        case 'ArrowDown': {
          e.preventDefault();
          const next = tr.nextElementSibling;
          if (next && typeof next.focus === 'function') next.focus();
          break;
        }
        case 'ArrowUp': {
          e.preventDefault();
          const prev = tr.previousElementSibling;
          if (prev && typeof prev.focus === 'function') prev.focus();
          break;
        }
        case 'Home': {
          e.preventDefault();
          tr.parentElement?.firstElementChild?.focus();
          break;
        }
        case 'End': {
          e.preventDefault();
          tr.parentElement?.lastElementChild?.focus();
          break;
        }
        case 'Enter':
        case ' ': {
          e.preventDefault();
          if (onRowClick) onRowClick(row);
          break;
        }
        default:
          break;
      }
    },
    [onRowClick]
  );

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
            <div
              role="region"
              aria-label="Bulk actions"
              className="flex items-center gap-2 px-3 py-2 rounded-md bg-indigo-50 ring-1 ring-inset ring-indigo-200 text-sm"
            >
              <span
                className="font-medium text-indigo-900"
                aria-live="polite"
              >
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

      {/* Mobile card view — only when consumer opts in. Below `md` this
          renders the dataset as a stack of cards; the table below this
          block is hidden at the same breakpoint so users see one or the
          other, never both. */}
      {cardOnMobile && data.length > 0 && (
        <div className="md:hidden space-y-3" role="list">
          {data.map((row, index) => {
            const rowId = getRowId(row, index);
            const isSelected = effectiveSelected.has(rowId);
            const rowClassString =
              typeof rowClassName === 'function'
                ? rowClassName(row) || ''
                : '';
            return (
              <DataCard
                key={rowId}
                row={row}
                rowId={rowId}
                isSelected={isSelected}
                selectable={selectable}
                visibleColumns={visibleColumns}
                rowClassString={rowClassString}
                onRowClick={onRowClick ? handleRowClick : undefined}
                onToggleSelect={toggleRow}
              />
            );
          })}
        </div>
      )}

      {/* Empty state for card view (renders nothing when data has rows). */}
      {cardOnMobile && data.length === 0 && (
        <div className="md:hidden rounded-lg border border-gray-200 bg-white p-8 text-center">
          <svg
            className="mx-auto w-10 h-10 text-gray-300"
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
          <p className="mt-2 text-sm text-gray-500">{emptyMessage}</p>
        </div>
      )}

      {/* Desktop / tablet table — wrapped in `overflow-x-auto` so it
          horizontally scrolls on narrow viewports when card mode is off. */}
      <div
        className={`bg-white rounded-lg border border-gray-200 overflow-hidden ${
          cardOnMobile ? 'hidden md:block' : ''
        }`}
      >
        <div className="overflow-x-auto">
          <table
            className="min-w-full divide-y divide-gray-200"
            aria-rowcount={data.length}
          >
            <caption className="sr-only">
              Data table with {visibleColumns.length} columns and{' '}
              {data.length} rows.
              {onSort
                ? ' Sortable columns can be activated with Enter.'
                : ''}
              {onRowClick
                ? ' Use arrow keys to move between rows and Enter to open one.'
                : ''}
            </caption>
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
                {visibleColumns.map((column) => {
                  // `aria-sort` must reflect the live sort state so
                  // screen readers announce "sorted ascending", etc.
                  const ariaSort = !column.sortable
                    ? undefined
                    : sortBy === column.key
                      ? sortOrder === 'ASC'
                        ? 'ascending'
                        : 'descending'
                      : 'none';
                  return (
                    <th
                      key={column.key}
                      scope="col"
                      aria-sort={ariaSort}
                      className={`px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider ${
                        column.sortable
                          ? 'cursor-pointer select-none hover:bg-gray-100 transition-colors'
                          : ''
                      }`}
                      onClick={() => column.sortable && handleSort(column.key)}
                    >
                      {column.sortable ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSort(column.key);
                          }}
                          className="flex items-center uppercase tracking-wider focus:outline-none focus:ring-2 focus:ring-indigo-500 rounded"
                          aria-label={`Sort by ${column.label}`}
                        >
                          {column.label}
                          {renderSortIcon(column.key)}
                        </button>
                      ) : (
                        <div className="flex items-center">{column.label}</div>
                      )}
                    </th>
                  );
                })}
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
                  // Resolve the per-row class string eagerly so it's a
                  // primitive comparison in the memo'd row's prop check.
                  const rowClassString =
                    typeof rowClassName === 'function'
                      ? rowClassName(row) || ''
                      : '';
                  return (
                    <DataTableRow
                      key={rowId}
                      row={row}
                      rowId={rowId}
                      isSelected={isSelected}
                      selectable={selectable}
                      visibleColumns={visibleColumns}
                      rowClassString={rowClassString}
                      onRowClick={onRowClick ? handleRowClick : undefined}
                      onToggleSelect={toggleRow}
                      onRowKeyDown={handleRowKeyDown}
                    />
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
