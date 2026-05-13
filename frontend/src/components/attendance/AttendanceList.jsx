/**
 * @file frontend/src/components/attendance/AttendanceList.jsx
 * @description Attendance listing with date-range / employee / status filters, color-coded status, hours-worked display, and late/absent row highlighting
 * @author Dev B
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import * as attendanceApi from '../../api/attendanceApi';
import * as employeeApi from '../../api/employeeApi';
import DataTable from '../common/DataTable';
import Pagination from '../common/Pagination';
import FilterDropdown from '../common/FilterDropdown';
import ConfirmDialog from '../common/ConfirmDialog';
import { useToast } from '../common/Toast';
import { downloadCsv, stampedFilename } from '../../utils/csv';

/** Status options must match the Attendances.statusi ENUM. */
const STATUS_OPTIONS = [
  { value: 'present', label: 'Present' },
  { value: 'absent', label: 'Absent' },
  { value: 'late', label: 'Late' },
  { value: 'half-day', label: 'Half day' },
  { value: 'remote', label: 'Remote' },
];

/** Tailwind classes per status for badge color coding. */
const STATUS_BADGE_CLASS = {
  present: 'bg-green-50 text-green-700 ring-green-600/20',
  absent: 'bg-red-50 text-red-700 ring-red-600/20',
  late: 'bg-yellow-50 text-yellow-800 ring-yellow-600/20',
  'half-day': 'bg-amber-50 text-amber-800 ring-amber-600/20',
  remote: 'bg-blue-50 text-blue-700 ring-blue-600/20',
};

/** Row-level highlight tone for problem statuses. */
const ROW_HIGHLIGHT_CLASS = {
  late: 'bg-yellow-50/40',
  absent: 'bg-red-50/40',
};

/** Format an ISO-like date as DD/MM/YYYY. */
const formatDate = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-GB');
};

/** Format an HH:MM:SS string back to HH:MM (drop seconds for readability). */
const formatTime = (value) => {
  if (!value) return '—';
  const str = String(value);
  // Accept "HH:MM:SS" or "HH:MM"
  return str.length >= 5 ? str.slice(0, 5) : str;
};

/**
 * Format the server's `hours_worked` (decimal hours) as "Hh Mm".
 * Falls back to "—" when null / negative / NaN (e.g. row missing checkout).
 */
const formatHoursWorked = (value) => {
  if (value == null) return '—';
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) return '—';
  const totalMinutes = Math.round(num * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${String(minutes).padStart(2, '0')}m`;
};

/**
 * AttendanceList — paginated attendance records with multi-filter support.
 * Pure list component: action callbacks (`onAdd`, `onEdit`, `onView`,
 * `onDelete`) are wired by the parent so the same component serves both
 * the HR/Admin management view and read-only manager view.
 *
 * @param {Object} props
 * @param {Function} [props.onAdd]
 * @param {Function} [props.onEdit]
 * @param {Function} [props.onView]
 * @param {Function} [props.onDelete] - Custom delete handler (default: API call)
 * @param {Object}   [props.defaultFilters]
 * @param {boolean}  [props.showAddButton=true]
 * @returns {JSX.Element}
 */
const AttendanceList = ({
  onAdd,
  onEdit,
  onView,
  onDelete,
  defaultFilters = {},
  showAddButton = true,
}) => {
  const [rows, setRows] = useState([]);
  const [pagination, setPagination] = useState({});
  const [loading, setLoading] = useState(true);

  const [employeeId, setEmployeeId] = useState('');
  const [statusi, setStatusi] = useState(defaultFilters.statusi || '');
  const [fromDate, setFromDate] = useState(defaultFilters.from_date || '');
  const [toDate, setToDate] = useState(defaultFilters.to_date || '');

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [sortBy, setSortBy] = useState('data');
  const [sortOrder, setSortOrder] = useState('DESC');

  const [employees, setEmployees] = useState([]);

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const { addToast } = useToast();

  /**
   * Load active employees for the filter dropdown (once).
   */
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const result = await employeeApi.getAll({
          limit: 200,
          statusi: 'active',
        });
        if (!cancelled) setEmployees(result.data || []);
      } catch {
        if (!cancelled) setEmployees([]);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Fetch attendance rows with the current filter / sort / paging state.
   */
  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const result = await attendanceApi.getAll({
        page,
        limit,
        employee_id: employeeId || undefined,
        statusi: statusi || undefined,
        from_date: fromDate || undefined,
        to_date: toDate || undefined,
        sortBy,
        sortOrder,
      });
      setRows(result.data);
      setPagination(result.pagination);
    } catch (err) {
      addToast(
        err.response?.data?.message || 'Failed to load attendance',
        'error'
      );
    } finally {
      setLoading(false);
    }
  }, [
    page,
    limit,
    employeeId,
    statusi,
    fromDate,
    toDate,
    sortBy,
    sortOrder,
    addToast,
  ]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  /** Column sort toggle. */
  const handleSort = (column) => {
    if (sortBy === column) {
      setSortOrder((prev) => (prev === 'ASC' ? 'DESC' : 'ASC'));
    } else {
      setSortBy(column);
      setSortOrder('ASC');
    }
    setPage(1);
  };

  const bumpPage = (setter) => (value) => {
    setter(value);
    setPage(1);
  };

  /**
   * Export the current attendance page to CSV. Times are written in
   * HH:MM (consistent with the table) and hours_worked is rounded to two
   * decimal places. Like the other lists, only the loaded page exports.
   */
  const handleExportCsv = () => {
    if (rows.length === 0) {
      addToast('Nothing to export — adjust filters and try again', 'info');
      return;
    }
    const headers = [
      'Employee #',
      'First name',
      'Last name',
      'Date',
      'Check in',
      'Check out',
      'Hours worked',
      'Status',
      'Notes',
    ];
    const exportRows = rows.map((r) => [
      r.numri_punonjesit || '',
      r.first_name || '',
      r.last_name || '',
      r.data ? String(r.data).slice(0, 10) : '',
      formatTime(r.ora_hyrjes),
      formatTime(r.ora_daljes),
      Number.isFinite(Number(r.hours_worked))
        ? Number(r.hours_worked).toFixed(2)
        : '',
      r.statusi || '',
      r.shenimet || '',
    ]);
    downloadCsv(stampedFilename('attendance'), headers, exportRows);
    addToast(`Exported ${rows.length} attendance records`, 'success');
  };

  const handleClearFilters = () => {
    setEmployeeId('');
    setStatusi(defaultFilters.statusi || '');
    setFromDate(defaultFilters.from_date || '');
    setToDate(defaultFilters.to_date || '');
    setPage(1);
  };

  /** Confirm and execute deletion. */
  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      if (onDelete) {
        await onDelete(deleteTarget);
      } else {
        await attendanceApi.remove(deleteTarget.id);
      }
      addToast('Attendance record deleted', 'success');
      setDeleteTarget(null);
      fetchRows();
    } catch (err) {
      const msg =
        err.response?.data?.message || 'Failed to delete attendance record';
      addToast(msg, 'error');
    } finally {
      setDeleting(false);
    }
  };

  /** Column definitions for the DataTable. */
  const columns = [
    {
      key: 'employee',
      label: 'Employee',
      sortable: false,
      render: (_v, row) => (
        <div>
          <p className="text-sm font-medium text-gray-900">
            {row.first_name} {row.last_name}
          </p>
          {row.numri_punonjesit && (
            <p className="text-xs text-gray-500 font-mono">
              {row.numri_punonjesit}
            </p>
          )}
        </div>
      ),
    },
    {
      key: 'data',
      label: 'Date',
      sortable: true,
      render: (value) => (
        <span className="text-sm text-gray-700">{formatDate(value)}</span>
      ),
    },
    {
      key: 'ora_hyrjes',
      label: 'Check in',
      sortable: false,
      render: (value) => (
        <span className="text-sm font-mono text-gray-700">
          {formatTime(value)}
        </span>
      ),
    },
    {
      key: 'ora_daljes',
      label: 'Check out',
      sortable: false,
      render: (value) => (
        <span className="text-sm font-mono text-gray-700">
          {formatTime(value)}
        </span>
      ),
    },
    {
      key: 'hours_worked',
      label: 'Hours',
      sortable: false,
      render: (value) => (
        <span className="text-sm font-medium text-gray-900">
          {formatHoursWorked(value)}
        </span>
      ),
    },
    {
      key: 'statusi',
      label: 'Status',
      sortable: true,
      render: (value) => {
        const cls = STATUS_BADGE_CLASS[value] || STATUS_BADGE_CLASS.present;
        return value ? (
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ring-1 ring-inset ${cls}`}
          >
            {value}
          </span>
        ) : (
          '—'
        );
      },
    },
    {
      key: 'shenimet',
      label: 'Notes',
      sortable: false,
      render: (value) => (
        <span
          className="text-sm text-gray-600 line-clamp-1 max-w-[12rem]"
          title={value || ''}
        >
          {value || '—'}
        </span>
      ),
    },
    {
      key: 'actions',
      label: 'Actions',
      sortable: false,
      render: (_v, row) => (
        <div className="flex items-center gap-3">
          {onView && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onView(row);
              }}
              className="text-gray-600 hover:text-gray-900 text-sm font-medium"
            >
              View
            </button>
          )}
          {onEdit && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onEdit(row);
              }}
              className="text-indigo-600 hover:text-indigo-900 text-sm font-medium"
            >
              Edit
            </button>
          )}
          {(onDelete !== undefined || onDelete === undefined) && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setDeleteTarget(row);
              }}
              className="text-red-600 hover:text-red-900 text-sm font-medium"
            >
              Delete
            </button>
          )}
        </div>
      ),
    },
  ];

  const employeeOptions = employees.map((e) => ({
    value: e.id,
    label: `${e.first_name} ${e.last_name}${
      e.numri_punonjesit ? ` (${e.numri_punonjesit})` : ''
    }`,
  }));

  const hasActiveFilters = Boolean(
    employeeId || statusi || fromDate || toDate
  );

  /** Decorate rows with row-level highlight class when their status warrants it. */
  const decoratedRows = rows.map((row) => ({
    ...row,
    _rowClassName: ROW_HIGHLIGHT_CLASS[row.statusi] || '',
  }));

  /**
   * Summary statistics derived from the currently-loaded page of rows.
   *
   * Important caveat: this only summarises the **visible page**, not the
   * full server-side result set. For pages 1..N, totals will be partial.
   * The header note ("on this page") makes that clear so HR doesn't
   * mistake page totals for the whole filter window. A future commit
   * could add a `/api/attendances/summary` endpoint that returns
   * server-side totals across the whole filter — for now this delivers
   * the spec's value (at-a-glance counts) without needing new plumbing.
   */
  const summary = useMemo(() => {
    const counts = {
      present: 0,
      absent: 0,
      late: 0,
      'half-day': 0,
      remote: 0,
    };
    let totalHours = 0;
    let rowsWithHours = 0;

    for (const row of rows) {
      if (counts[row.statusi] != null) counts[row.statusi] += 1;
      const h = Number(row.hours_worked);
      if (Number.isFinite(h) && h > 0) {
        totalHours += h;
        rowsWithHours += 1;
      }
    }

    const total = rows.length;
    // Attendance rate weighs late + half-day at 0.5 (mirrors the backend
    // dept-report formula from commit 222) so partial attendance still
    // contributes proportionally.
    const weighted =
      counts.present + counts.remote + (counts.late + counts['half-day']) * 0.5;
    const rate = total > 0 ? +((weighted / total) * 100).toFixed(1) : 0;
    const avgHours = rowsWithHours > 0 ? +(totalHours / rowsWithHours).toFixed(2) : 0;

    return {
      total,
      ...counts,
      attendance_rate: rate,
      avg_hours_worked: avgHours,
    };
  }, [rows]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Attendance</h2>
          <p className="text-sm text-gray-500 mt-1">
            Daily check-in records with status and hours worked
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={rows.length === 0}
            className="inline-flex items-center gap-2 px-3 py-2 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V3" />
            </svg>
            Export CSV
          </button>
          {showAddButton && onAdd && (
            <button
              onClick={() => onAdd()}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4v16m8-8H4"
                />
              </svg>
              New entry
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
        <FilterDropdown
          label="Employee"
          options={employeeOptions}
          value={employeeId}
          onChange={bumpPage(setEmployeeId)}
          allLabel="All employees"
        />
        <FilterDropdown
          label="Status"
          options={STATUS_OPTIONS}
          value={statusi}
          onChange={bumpPage(setStatusi)}
          allLabel="Any status"
        />
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            From date
          </label>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => bumpPage(setFromDate)(e.target.value)}
            className="block w-full rounded-md border-gray-300 text-sm focus:border-indigo-500 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            To date
          </label>
          <input
            type="date"
            value={toDate}
            onChange={(e) => bumpPage(setToDate)(e.target.value)}
            min={fromDate || undefined}
            className="block w-full rounded-md border-gray-300 text-sm focus:border-indigo-500 focus:ring-indigo-500"
          />
        </div>
      </div>

      {hasActiveFilters && (
        <div className="flex justify-end">
          <button
            onClick={handleClearFilters}
            className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
          >
            Clear filters
          </button>
        </div>
      )}

      {/* Summary stats (commit 221). Hidden while loading first page or
          when there are zero rows — empty totals would be misleading. */}
      {!loading && summary.total > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Summary
            </p>
            <p className="text-[10px] text-gray-400">
              {summary.total} record{summary.total === 1 ? '' : 's'} on this page
            </p>
          </div>

          <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
            <SummaryStat
              label="Present"
              value={summary.present}
              tone="emerald"
            />
            <SummaryStat label="Remote" value={summary.remote} tone="sky" />
            <SummaryStat label="Late" value={summary.late} tone="amber" />
            <SummaryStat
              label="Half day"
              value={summary['half-day']}
              tone="orange"
            />
            <SummaryStat label="Absent" value={summary.absent} tone="rose" />
            <SummaryStat
              label="Avg hours"
              value={
                summary.avg_hours_worked > 0
                  ? `${summary.avg_hours_worked}h`
                  : '—'
              }
              tone="indigo"
            />
          </div>

          <div className="mt-2 flex items-center gap-2">
            <span className="text-xs text-gray-500">Attendance rate:</span>
            <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden max-w-xs">
              <div
                className={`h-2 rounded-full transition-all ${
                  summary.attendance_rate >= 85
                    ? 'bg-emerald-500'
                    : summary.attendance_rate >= 60
                      ? 'bg-amber-500'
                      : 'bg-rose-500'
                }`}
                style={{
                  width: `${Math.max(0, Math.min(100, summary.attendance_rate))}%`,
                }}
              />
            </div>
            <span className="text-xs font-semibold text-gray-900 tabular-nums">
              {summary.attendance_rate}%
            </span>
          </div>
        </div>
      )}

      {/* Table */}
      <DataTable
        columns={columns}
        data={decoratedRows}
        loading={loading}
        sortBy={sortBy}
        sortOrder={sortOrder}
        onSort={handleSort}
        onRowClick={onView ? (row) => onView(row) : undefined}
        rowClassName={(row) => row._rowClassName}
        emptyMessage="No attendance records found"
      />

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <Pagination
          currentPage={pagination.currentPage}
          totalPages={pagination.totalPages}
          total={pagination.total}
          perPage={limit}
          onPageChange={setPage}
          onPerPageChange={(val) => {
            setLimit(val);
            setPage(1);
          }}
        />
      )}

      {/* Delete confirmation */}
      <ConfirmDialog
        isOpen={!!deleteTarget}
        title="Delete Attendance Record"
        message={`Delete the attendance record for ${
          deleteTarget?.first_name
        } ${deleteTarget?.last_name} on ${formatDate(
          deleteTarget?.data
        )}? This cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        loading={deleting}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};

/**
 * SummaryStat — small labelled tile used in the summary row.
 * Plain function component; no state of its own.
 */
const SummaryStat = ({ label, value, tone = 'gray' }) => {
  const toneClass = {
    emerald: 'text-emerald-700',
    sky: 'text-sky-700',
    amber: 'text-amber-700',
    orange: 'text-orange-700',
    rose: 'text-rose-700',
    indigo: 'text-indigo-700',
    gray: 'text-gray-700',
  }[tone];

  return (
    <div className="text-center">
      <p className="text-[10px] uppercase tracking-wide text-gray-500">
        {label}
      </p>
      <p className={`mt-0.5 text-lg font-bold tabular-nums ${toneClass}`}>
        {value}
      </p>
    </div>
  );
};

export default AttendanceList;
