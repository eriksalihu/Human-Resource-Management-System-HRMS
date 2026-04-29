/**
 * @file frontend/src/components/trainings/TrainingList.jsx
 * @description Training listing with status tabs, date range filter, capacity bar, trainer info, and enroll/view/edit actions
 * @author Dev B
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import * as trainingApi from '../../api/trainingApi';
import DataTable from '../common/DataTable';
import Pagination from '../common/Pagination';
import ConfirmDialog from '../common/ConfirmDialog';
import { useToast } from '../common/Toast';

/** Status filter tabs (values must match Trainings.statusi ENUM). */
const STATUS_TABS = [
  { id: '',          label: 'All' },
  { id: 'upcoming',  label: 'Upcoming' },
  { id: 'ongoing',   label: 'Ongoing' },
  { id: 'completed', label: 'Completed' },
  { id: 'cancelled', label: 'Cancelled' },
];

/** Tailwind classes per status for badge color coding. */
const STATUS_BADGE_CLASS = {
  upcoming: 'bg-blue-50 text-blue-700 ring-blue-600/20',
  ongoing: 'bg-green-50 text-green-700 ring-green-600/20',
  completed: 'bg-gray-50 text-gray-700 ring-gray-600/20',
  cancelled: 'bg-red-50 text-red-700 ring-red-600/20',
};

/** Format an ISO-like date as DD/MM/YYYY. */
const formatDate = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-GB');
};

/**
 * Capacity progress bar — shows enrolled / total with a colored fill that
 * shifts to amber when over 80% and red when full.
 */
const CapacityBar = ({ enrolled = 0, capacity = 0 }) => {
  const taken = Number(enrolled) || 0;
  const total = Number(capacity) || 0;
  const ratio = total > 0 ? Math.min(taken / total, 1) : 0;
  const pct = Math.round(ratio * 100);

  let tone = 'bg-emerald-500';
  if (ratio >= 1) tone = 'bg-red-500';
  else if (ratio >= 0.8) tone = 'bg-amber-500';

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden min-w-[80px] max-w-[160px]">
        <div
          className={`${tone} h-2 rounded-full transition-all`}
          style={{ width: `${Math.max(pct, total === 0 ? 0 : 4)}%` }}
        />
      </div>
      <span className="text-xs font-mono text-gray-600 whitespace-nowrap">
        {taken} / {total || '∞'}
      </span>
    </div>
  );
};

/**
 * TrainingList — paginated training catalog with status tabs and date-range
 * filter. Action callbacks are caller-driven so the same component serves
 * both HR/Admin (with edit/delete) and employee views (enroll only).
 *
 * @param {Object} props
 * @param {Function} [props.onAdd]
 * @param {Function} [props.onEdit]
 * @param {Function} [props.onView]
 * @param {Function} [props.onEnroll]
 * @param {Function} [props.onDelete] - Custom delete handler (defaults to API)
 * @param {Object}   [props.defaultFilters]
 * @param {boolean}  [props.showAddButton=true]
 * @returns {JSX.Element}
 */
const TrainingList = ({
  onAdd,
  onEdit,
  onView,
  onEnroll,
  onDelete,
  defaultFilters = {},
  showAddButton = true,
}) => {
  const [rows, setRows] = useState([]);
  const [pagination, setPagination] = useState({});
  const [loading, setLoading] = useState(true);

  const [statusi, setStatusi] = useState(defaultFilters.statusi || '');
  const [fromDate, setFromDate] = useState(defaultFilters.from_date || '');
  const [toDate, setToDate] = useState(defaultFilters.to_date || '');
  const [search, setSearch] = useState('');

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [sortBy, setSortBy] = useState('data_fillimit');
  const [sortOrder, setSortOrder] = useState('DESC');

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [enrollingId, setEnrollingId] = useState(null);

  const { addToast } = useToast();

  /** Fetch trainings with the current filter / sort / paging state. */
  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const result = await trainingApi.getAll({
        page,
        limit,
        statusi: statusi || undefined,
        from_date: fromDate || undefined,
        to_date: toDate || undefined,
        search: search || undefined,
        sortBy,
        sortOrder,
      });
      setRows(result.data);
      setPagination(result.pagination);
    } catch (err) {
      addToast(
        err.response?.data?.message || 'Failed to load trainings',
        'error'
      );
    } finally {
      setLoading(false);
    }
  }, [page, limit, statusi, fromDate, toDate, search, sortBy, sortOrder, addToast]);

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

  /** Status tab click — also resets to page 1. */
  const handleStatusChange = (next) => {
    setStatusi(next);
    setPage(1);
  };

  const handleClearFilters = () => {
    setStatusi(defaultFilters.statusi || '');
    setFromDate(defaultFilters.from_date || '');
    setToDate(defaultFilters.to_date || '');
    setSearch('');
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
        await trainingApi.remove(deleteTarget.id);
      }
      addToast('Training deleted', 'success');
      setDeleteTarget(null);
      fetchRows();
    } catch (err) {
      const msg =
        err.response?.data?.message || 'Failed to delete training';
      addToast(msg, 'error');
    } finally {
      setDeleting(false);
    }
  };

  /**
   * Quick enrollment from the list. The parent can intercept by passing
   * `onEnroll` (e.g. to confirm via dialog or pick someone else); without
   * a callback we self-enroll the caller via the API.
   */
  const handleQuickEnroll = async (row) => {
    if (onEnroll) {
      onEnroll(row);
      return;
    }

    setEnrollingId(row.id);
    try {
      await trainingApi.enroll(row.id);
      addToast(`Enrolled in "${row.titulli}"`, 'success');
      fetchRows();
    } catch (err) {
      const msg =
        err.response?.data?.message || 'Failed to enroll in training';
      addToast(msg, 'error');
    } finally {
      setEnrollingId(null);
    }
  };

  /** Column definitions for the DataTable. */
  const columns = useMemo(
    () => [
      {
        key: 'titulli',
        label: 'Training',
        sortable: true,
        render: (_v, row) => (
          <div>
            <p className="text-sm font-medium text-gray-900">{row.titulli}</p>
            {row.lokacioni && (
              <p className="text-xs text-gray-500 mt-0.5">{row.lokacioni}</p>
            )}
          </div>
        ),
      },
      {
        key: 'trajner',
        label: 'Trainer',
        sortable: true,
        render: (value) => (
          <span className="text-sm text-gray-700">
            {value || <span className="text-gray-400">—</span>}
          </span>
        ),
      },
      {
        key: 'data_fillimit',
        label: 'Dates',
        sortable: true,
        render: (_v, row) => (
          <div className="text-sm text-gray-700">
            <p>{formatDate(row.data_fillimit)}</p>
            <p className="text-xs text-gray-500">
              → {formatDate(row.data_perfundimit)}
            </p>
          </div>
        ),
      },
      {
        key: 'kapaciteti',
        label: 'Capacity',
        sortable: true,
        render: (_v, row) => (
          <CapacityBar
            enrolled={row.participant_count}
            capacity={row.kapaciteti}
          />
        ),
      },
      {
        key: 'statusi',
        label: 'Status',
        sortable: true,
        render: (value) => {
          const cls = STATUS_BADGE_CLASS[value] || STATUS_BADGE_CLASS.completed;
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
          const canEnroll =
            row.statusi === 'upcoming' &&
            (!row.kapaciteti ||
              Number(row.participant_count) < Number(row.kapaciteti));
          return (
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
              {canEnroll && (onEnroll || true) && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleQuickEnroll(row);
                  }}
                  disabled={enrollingId === row.id}
                  className="text-emerald-600 hover:text-emerald-800 text-sm font-medium disabled:opacity-50"
                >
                  {enrollingId === row.id ? '…' : 'Enroll'}
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
          );
        },
      },
    ],
    [onView, onEdit, onEnroll, onDelete, enrollingId]
  );

  const hasActiveFilters = Boolean(statusi || fromDate || toDate || search);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Trainings</h2>
          <p className="text-sm text-gray-500 mt-1">
            Catalog of upcoming, ongoing, and past learning sessions
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
            New training
          </button>
        )}
      </div>

      {/* Status tabs */}
      <div role="tablist" aria-label="Training status" className="border-b border-gray-200">
        <nav className="-mb-px flex gap-4 overflow-x-auto">
          {STATUS_TABS.map((tab) => {
            const isActive = statusi === tab.id;
            return (
              <button
                key={tab.id || 'all'}
                role="tab"
                aria-selected={isActive}
                onClick={() => handleStatusChange(tab.id)}
                className={`whitespace-nowrap border-b-2 py-2 px-1 text-sm font-medium transition-colors ${
                  isActive
                    ? 'border-indigo-600 text-indigo-700'
                    : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Date + search filters */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 items-end">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Search
          </label>
          <input
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Title, description, or location"
            className="block w-full rounded-md border-gray-300 text-sm focus:border-indigo-500 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            From date
          </label>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => {
              setFromDate(e.target.value);
              setPage(1);
            }}
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
            onChange={(e) => {
              setToDate(e.target.value);
              setPage(1);
            }}
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

      {/* Table */}
      <DataTable
        columns={columns}
        data={rows}
        loading={loading}
        sortBy={sortBy}
        sortOrder={sortOrder}
        onSort={handleSort}
        onRowClick={onView ? (row) => onView(row) : undefined}
        emptyMessage="No trainings found"
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
        title="Delete Training"
        message={`Delete the training "${
          deleteTarget?.titulli || ''
        }"? Participants will be cascade-deleted. This cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        loading={deleting}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};

export default TrainingList;
