/**
 * @file frontend/src/components/performance/ReviewList.jsx
 * @description Performance review listing with employee / period / department filters, star-rating display, and conditional row actions
 * @author Dev B
 */

import { useState, useEffect, useCallback } from 'react';
import * as performanceReviewApi from '../../api/performanceReviewApi';
import * as employeeApi from '../../api/employeeApi';
import * as departmentApi from '../../api/departmentApi';
import DataTable from '../common/DataTable';
import Pagination from '../common/Pagination';
import FilterDropdown from '../common/FilterDropdown';
import ConfirmDialog from '../common/ConfirmDialog';
import { useToast } from '../common/Toast';

/**
 * Build period options for the filter dropdown — current quarter and the
 * eight previous quarters (2 years), plus the current and previous year.
 */
const buildPeriodOptions = () => {
  const now = new Date();
  const year = now.getFullYear();
  const quarter = Math.floor(now.getMonth() / 3) + 1;
  const periods = [];

  // Quarters back from current
  for (let i = 0; i < 8; i += 1) {
    let q = quarter - i;
    let y = year;
    while (q <= 0) {
      q += 4;
      y -= 1;
    }
    const label = `${y}-Q${q}`;
    periods.push({ value: label, label });
  }

  // Annual labels for completeness
  periods.push({ value: String(year), label: String(year) });
  periods.push({ value: String(year - 1), label: String(year - 1) });

  return periods;
};

/** Format a YYYY-MM-DD or ISO date string as DD/MM/YYYY. */
const formatDate = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-GB');
};

/**
 * Render a 5-star rating row with half-star resolution. Inline SVG keeps it
 * dependency-free and Tailwind-themable.
 *
 * @param {{ rating: number|null }} props
 */
const StarRating = ({ rating }) => {
  const value = Number(rating);
  if (!Number.isFinite(value) || value <= 0) {
    return <span className="text-xs text-gray-400">—</span>;
  }

  const stars = [];
  for (let i = 1; i <= 5; i += 1) {
    let fill = 'none';
    if (value >= i) fill = 'full';
    else if (value >= i - 0.5) fill = 'half';

    stars.push(
      <span key={i} className="relative inline-block w-4 h-4 text-yellow-500">
        {/* Outline (always rendered) */}
        <svg
          className="absolute inset-0 w-4 h-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.32.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.562.562 0 01.32-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"
          />
        </svg>
        {/* Fill */}
        {fill !== 'none' && (
          <span
            className="absolute inset-0 overflow-hidden"
            style={{ width: fill === 'half' ? '50%' : '100%' }}
          >
            <svg
              className="w-4 h-4"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.32.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.562.562 0 01.32-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
            </svg>
          </span>
        )}
      </span>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <div className="flex">{stars}</div>
      <span className="text-xs font-medium text-gray-700">
        {value.toFixed(1)}
      </span>
    </div>
  );
};

/**
 * ReviewList — paginated performance reviews with multi-filter support.
 *
 * @param {Object} props
 * @param {Function} [props.onAdd]
 * @param {Function} [props.onEdit]
 * @param {Function} [props.onView]
 * @param {Function} [props.onDelete] - Custom delete (defaults to API call)
 * @param {Object}   [props.defaultFilters]
 * @param {boolean}  [props.showAddButton=true]
 * @returns {JSX.Element}
 */
const ReviewList = ({
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

  const [employeeId, setEmployeeId] = useState(
    defaultFilters.employee_id || ''
  );
  const [departmentId, setDepartmentId] = useState(
    defaultFilters.department_id || ''
  );
  const [periudha, setPeriudha] = useState(defaultFilters.periudha || '');

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [sortBy, setSortBy] = useState('data_vleresimit');
  const [sortOrder, setSortOrder] = useState('DESC');

  const [employees, setEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const { addToast } = useToast();

  /** Load employee + department options once. */
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [empResult, deptResult] = await Promise.all([
          employeeApi.getAll({ limit: 200, statusi: 'active' }),
          departmentApi.getAll({ limit: 200 }),
        ]);
        if (!cancelled) {
          setEmployees(empResult.data || []);
          setDepartments(deptResult.data || []);
        }
      } catch {
        if (!cancelled) {
          setEmployees([]);
          setDepartments([]);
        }
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  /** Fetch reviews with the current filter / sort / paging state. */
  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const result = await performanceReviewApi.getAll({
        page,
        limit,
        employee_id: employeeId || undefined,
        department_id: departmentId || undefined,
        periudha: periudha || undefined,
        sortBy,
        sortOrder,
      });
      setRows(result.data);
      setPagination(result.pagination);
    } catch (err) {
      addToast(
        err.response?.data?.message || 'Failed to load performance reviews',
        'error'
      );
    } finally {
      setLoading(false);
    }
  }, [page, limit, employeeId, departmentId, periudha, sortBy, sortOrder, addToast]);

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

  const handleClearFilters = () => {
    setEmployeeId(defaultFilters.employee_id || '');
    setDepartmentId(defaultFilters.department_id || '');
    setPeriudha(defaultFilters.periudha || '');
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
        await performanceReviewApi.remove(deleteTarget.id);
      }
      addToast('Performance review deleted', 'success');
      setDeleteTarget(null);
      fetchRows();
    } catch (err) {
      const msg =
        err.response?.data?.message || 'Failed to delete performance review';
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
          {row.department_emertimi && (
            <p className="text-xs text-gray-500">{row.department_emertimi}</p>
          )}
        </div>
      ),
    },
    {
      key: 'periudha',
      label: 'Period',
      sortable: true,
      render: (value) => (
        <span className="font-mono text-sm text-gray-700">{value || '—'}</span>
      ),
    },
    {
      key: 'nota',
      label: 'Rating',
      sortable: true,
      render: (value) => <StarRating rating={value} />,
    },
    {
      key: 'reviewer',
      label: 'Reviewer',
      sortable: false,
      render: (_v, row) =>
        row.reviewer_first_name || row.reviewer_last_name ? (
          <span className="text-sm text-gray-700">
            {row.reviewer_first_name} {row.reviewer_last_name}
          </span>
        ) : (
          <span className="text-xs text-gray-400">—</span>
        ),
    },
    {
      key: 'data_vleresimit',
      label: 'Review date',
      sortable: true,
      render: (value) => (
        <span className="text-sm text-gray-700">{formatDate(value)}</span>
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
          <button
            onClick={(e) => {
              e.stopPropagation();
              setDeleteTarget(row);
            }}
            className="text-red-600 hover:text-red-900 text-sm font-medium"
          >
            Delete
          </button>
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

  const departmentOptions = departments.map((d) => ({
    value: d.id,
    label: d.emertimi,
  }));

  const periodOptions = buildPeriodOptions();

  const hasActiveFilters = Boolean(employeeId || departmentId || periudha);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Performance Reviews</h2>
          <p className="text-sm text-gray-500 mt-1">
            Track ratings, feedback, and objectives across review periods
          </p>
        </div>
        {showAddButton && onAdd && (
          <button
            onClick={() => onAdd()}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
            New review
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 items-end">
        <FilterDropdown
          label="Employee"
          options={employeeOptions}
          value={employeeId}
          onChange={bumpPage(setEmployeeId)}
          allLabel="All employees"
        />
        <FilterDropdown
          label="Department"
          options={departmentOptions}
          value={departmentId}
          onChange={bumpPage(setDepartmentId)}
          allLabel="All departments"
        />
        <FilterDropdown
          label="Period"
          options={periodOptions}
          value={periudha}
          onChange={bumpPage(setPeriudha)}
          allLabel="Any period"
        />
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
        emptyMessage="No performance reviews found"
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
        title="Delete Performance Review"
        message={`Delete the ${
          deleteTarget?.periudha || ''
        } review for ${deleteTarget?.first_name} ${
          deleteTarget?.last_name
        }? This cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        loading={deleting}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};

export default ReviewList;
