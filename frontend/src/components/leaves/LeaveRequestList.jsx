/**
 * @file frontend/src/components/leaves/LeaveRequestList.jsx
 * @description Leave request listing with status / type / date-range filters, color-coded badges, and conditional pending-row actions
 * @author Dev B
 */

import { useState, useEffect, useCallback } from 'react';
import * as leaveRequestApi from '../../api/leaveRequestApi';
import * as employeeApi from '../../api/employeeApi';
import DataTable from '../common/DataTable';
import Pagination from '../common/Pagination';
import FilterDropdown from '../common/FilterDropdown';
import ConfirmDialog from '../common/ConfirmDialog';
import { useToast } from '../common/Toast';

/** Status filter options (values must match LeaveRequests.statusi). */
const STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'cancelled', label: 'Cancelled' },
];

/** Type filter options (values must match LeaveRequests.lloji). */
const TYPE_OPTIONS = [
  { value: 'annual', label: 'Annual' },
  { value: 'sick', label: 'Sick' },
  { value: 'personal', label: 'Personal' },
  { value: 'maternity', label: 'Maternity' },
  { value: 'paternity', label: 'Paternity' },
  { value: 'unpaid', label: 'Unpaid' },
];

/** Tailwind classes per status for color-coded badges. */
const STATUS_BADGE_CLASS = {
  pending: 'bg-yellow-50 text-yellow-800 ring-yellow-600/20',
  approved: 'bg-green-50 text-green-700 ring-green-600/20',
  rejected: 'bg-red-50 text-red-700 ring-red-600/20',
  cancelled: 'bg-gray-50 text-gray-700 ring-gray-600/20',
};

/** Tailwind classes per leave type for colored pills in the Type column. */
const TYPE_BADGE_CLASS = {
  annual: 'bg-indigo-50 text-indigo-700 ring-indigo-600/20',
  sick: 'bg-rose-50 text-rose-700 ring-rose-600/20',
  personal: 'bg-sky-50 text-sky-700 ring-sky-600/20',
  maternity: 'bg-pink-50 text-pink-700 ring-pink-600/20',
  paternity: 'bg-purple-50 text-purple-700 ring-purple-600/20',
  unpaid: 'bg-gray-50 text-gray-700 ring-gray-600/20',
};

/** Format an ISO-like date as DD/MM/YYYY. */
const formatDate = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-GB');
};

/**
 * LeaveRequestList — paginated leave records with multi-filter support and
 * row actions. `onApprove` / `onReject` / `onCancel` are only rendered when
 * the caller wires them up, letting the parent pick the role-appropriate set.
 *
 * @param {Object} props
 * @param {Function} [props.onAdd] - Open create form
 * @param {Function} [props.onEdit] - Open edit form (pending rows only)
 * @param {Function} [props.onView] - Open detail panel
 * @param {Function} [props.onApprove] - Approve a pending row
 * @param {Function} [props.onReject] - Reject a pending row
 * @param {Function} [props.onCancel] - Cancel a pending row (owner action)
 * @param {Function} [props.onDelete] - Hard-delete a row (Admin only)
 * @param {Object}   [props.defaultFilters] - Lock-in filters (e.g. {statusi: 'pending'})
 * @param {boolean}  [props.showAddButton=true]
 * @returns {JSX.Element}
 */
const LeaveRequestList = ({
  onAdd,
  onEdit,
  onView,
  onApprove,
  onReject,
  onCancel,
  onDelete,
  defaultFilters = {},
  showAddButton = true,
}) => {
  const [rows, setRows] = useState([]);
  const [pagination, setPagination] = useState({});
  const [loading, setLoading] = useState(true);

  const [employeeId, setEmployeeId] = useState('');
  const [statusi, setStatusi] = useState(defaultFilters.statusi || '');
  const [lloji, setLloji] = useState(defaultFilters.lloji || '');
  const [fromDate, setFromDate] = useState(defaultFilters.from_date || '');
  const [toDate, setToDate] = useState(defaultFilters.to_date || '');

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [sortBy, setSortBy] = useState('data_kerkeses');
  const [sortOrder, setSortOrder] = useState('DESC');

  const [employees, setEmployees] = useState([]);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const { addToast } = useToast();

  /**
   * Load employees once for the filter dropdown.
   */
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const result = await employeeApi.getAll({ limit: 200, statusi: 'active' });
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
   * Fetch leave requests with the current filter/sort/paging state.
   */
  const fetchRequests = useCallback(async () => {
    setLoading(true);
    try {
      const result = await leaveRequestApi.getAll({
        page,
        limit,
        employee_id: employeeId || undefined,
        statusi: statusi || undefined,
        lloji: lloji || undefined,
        from_date: fromDate || undefined,
        to_date: toDate || undefined,
        sortBy,
        sortOrder,
      });
      setRows(result.data);
      setPagination(result.pagination);
    } catch (err) {
      addToast(
        err.response?.data?.message || 'Failed to load leave requests',
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
    lloji,
    fromDate,
    toDate,
    sortBy,
    sortOrder,
    addToast,
  ]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

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
      key: 'lloji',
      label: 'Type',
      sortable: true,
      render: (value) => {
        const cls = TYPE_BADGE_CLASS[value] || TYPE_BADGE_CLASS.unpaid;
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
      key: 'data_fillimit',
      label: 'From',
      sortable: true,
      render: (value) => (
        <span className="text-sm text-gray-700">{formatDate(value)}</span>
      ),
    },
    {
      key: 'data_perfundimit',
      label: 'To',
      sortable: true,
      render: (value) => (
        <span className="text-sm text-gray-700">{formatDate(value)}</span>
      ),
    },
    {
      key: 'total_days',
      label: 'Days',
      sortable: false,
      render: (value) => (
        <span className="text-sm font-medium text-gray-900">
          {value != null ? value : '—'}
        </span>
      ),
    },
    {
      key: 'statusi',
      label: 'Status',
      sortable: true,
      render: (value) => {
        const cls = STATUS_BADGE_CLASS[value] || STATUS_BADGE_CLASS.pending;
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
      key: 'actions',
      label: 'Actions',
      sortable: false,
      render: (_v, row) => {
        const isPending = row.statusi === 'pending';
        return (
          <div className="flex flex-wrap items-center gap-3">
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
            {onEdit && isPending && (
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
            {onApprove && isPending && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onApprove(row);
                }}
                className="text-green-600 hover:text-green-800 text-sm font-medium"
              >
                Approve
              </button>
            )}
            {onReject && isPending && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onReject(row);
                }}
                className="text-red-600 hover:text-red-800 text-sm font-medium"
              >
                Reject
              </button>
            )}
            {onCancel && isPending && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onCancel(row);
                }}
                className="text-amber-600 hover:text-amber-800 text-sm font-medium"
              >
                Cancel
              </button>
            )}
            {onDelete && (
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
        );
      },
    },
  ];

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

  /** Reset to page 1 on any filter change. */
  const bumpPage = (setter) => (value) => {
    setter(value);
    setPage(1);
  };

  const handleClearFilters = () => {
    setEmployeeId('');
    setStatusi(defaultFilters.statusi || '');
    setLloji(defaultFilters.lloji || '');
    setFromDate(defaultFilters.from_date || '');
    setToDate(defaultFilters.to_date || '');
    setPage(1);
  };

  /**
   * Confirm and execute deletion (Admin only — route gated server-side).
   */
  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      if (onDelete) {
        await onDelete(deleteTarget);
      } else {
        await leaveRequestApi.remove(deleteTarget.id);
      }
      addToast('Leave request deleted', 'success');
      setDeleteTarget(null);
      fetchRequests();
    } catch (err) {
      const msg =
        err.response?.data?.message || 'Failed to delete leave request';
      addToast(msg, 'error');
    } finally {
      setDeleting(false);
    }
  };

  const employeeOptions = employees.map((e) => ({
    value: e.id,
    label: `${e.first_name} ${e.last_name}${
      e.numri_punonjesit ? ` (${e.numri_punonjesit})` : ''
    }`,
  }));

  const hasActiveFilters = Boolean(
    employeeId || statusi || lloji || fromDate || toDate
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Leave Requests</h2>
          <p className="text-sm text-gray-500 mt-1">
            Track time-off requests and approval status
          </p>
        </div>
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
            New Request
          </button>
        )}
      </div>

      {/* Filter bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
        <FilterDropdown
          label="Employee"
          options={employeeOptions}
          value={employeeId}
          onChange={bumpPage(setEmployeeId)}
          allLabel="All employees"
        />
        <FilterDropdown
          label="Type"
          options={TYPE_OPTIONS}
          value={lloji}
          onChange={bumpPage(setLloji)}
          allLabel="Any type"
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

      {/* Table */}
      <DataTable
        columns={columns}
        data={rows}
        loading={loading}
        sortBy={sortBy}
        sortOrder={sortOrder}
        onSort={handleSort}
        onRowClick={onView ? (row) => onView(row) : undefined}
        emptyMessage="No leave requests found"
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
        title="Delete Leave Request"
        message={`Delete the leave request for ${deleteTarget?.first_name} ${
          deleteTarget?.last_name
        } (${formatDate(deleteTarget?.data_fillimit)} – ${formatDate(
          deleteTarget?.data_perfundimit
        )})? This cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        loading={deleting}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};

export default LeaveRequestList;
