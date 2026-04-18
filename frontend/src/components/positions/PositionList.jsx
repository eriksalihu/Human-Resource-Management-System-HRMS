/**
 * @file frontend/src/components/positions/PositionList.jsx
 * @description Position listing with search, department filter, sort, pagination, and CRUD actions
 * @author Dev B
 */

import { useState, useEffect, useCallback } from 'react';
import * as positionApi from '../../api/positionApi';
import * as departmentApi from '../../api/departmentApi';
import DataTable from '../common/DataTable';
import Pagination from '../common/Pagination';
import SearchBar from '../common/SearchBar';
import FilterDropdown from '../common/FilterDropdown';
import ConfirmDialog from '../common/ConfirmDialog';
import { useToast } from '../common/Toast';

/**
 * Format a monetary value as a EUR currency string (or "—" if null/undefined).
 * @param {number|string|null} value
 * @returns {string}
 */
const formatCurrency = (value) =>
  value != null
    ? `€${Number(value).toLocaleString('en-US', { minimumFractionDigits: 0 })}`
    : '—';

/**
 * Render a salary range cell showing min–max, min+, up to max, or "—".
 * @param {Object} row - Position row
 * @returns {string}
 */
const renderSalaryRange = (_value, row) => {
  const { paga_min, paga_max } = row;
  if (paga_min != null && paga_max != null) {
    return `${formatCurrency(paga_min)} – ${formatCurrency(paga_max)}`;
  }
  if (paga_min != null) return `from ${formatCurrency(paga_min)}`;
  if (paga_max != null) return `up to ${formatCurrency(paga_max)}`;
  return '—';
};

/**
 * PositionList — full-page position listing with search, department filter,
 * sortable columns, pagination, and inline add / edit / delete actions.
 *
 * @param {Object} props
 * @param {Function} [props.onAdd] - Callback to open the create form
 * @param {Function} [props.onEdit] - Callback to open the edit form with a position
 * @param {Function} [props.onView] - Callback to open the detail view
 * @returns {JSX.Element}
 */
const PositionList = ({ onAdd, onEdit, onView }) => {
  const [positions, setPositions] = useState([]);
  const [pagination, setPagination] = useState({});
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [sortBy, setSortBy] = useState('emertimi');
  const [sortOrder, setSortOrder] = useState('ASC');

  // Department filter options
  const [departments, setDepartments] = useState([]);

  // Delete confirmation state
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const { addToast } = useToast();

  /**
   * Table column definitions. Memoised-inline — render fns are stable across renders.
   */
  const columns = [
    { key: 'emertimi', label: 'Position', sortable: true },
    {
      key: 'department_emertimi',
      label: 'Department',
      sortable: false,
      render: (value) => value || '—',
    },
    {
      key: 'niveli',
      label: 'Level',
      sortable: true,
      render: (value) =>
        value ? (
          <span className="inline-flex items-center rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700">
            {value}
          </span>
        ) : (
          '—'
        ),
    },
    {
      key: 'salary_range',
      label: 'Salary range',
      sortable: false,
      render: renderSalaryRange,
    },
    {
      key: 'actions',
      label: 'Actions',
      sortable: false,
      render: (_value, row) => (
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

  /**
   * Load department options for the filter dropdown (once).
   */
  useEffect(() => {
    const loadDepartments = async () => {
      try {
        const result = await departmentApi.getAll({ limit: 100 });
        setDepartments(result.data || []);
      } catch {
        // Silent fail — filter just shows an empty dropdown
        setDepartments([]);
      }
    };
    loadDepartments();
  }, []);

  /**
   * Fetch positions using the current filter / sort / paging state.
   */
  const fetchPositions = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        page,
        limit,
        search,
        sortBy,
        sortOrder,
      };
      if (departmentId) params.department_id = departmentId;

      const result = await positionApi.getAll(params);
      setPositions(result.data);
      setPagination(result.pagination);
    } catch (err) {
      addToast('Failed to load positions', 'error');
    } finally {
      setLoading(false);
    }
  }, [page, limit, search, departmentId, sortBy, sortOrder, addToast]);

  useEffect(() => {
    fetchPositions();
  }, [fetchPositions]);

  /**
   * Handle column sort toggle.
   * @param {string} column
   */
  const handleSort = (column) => {
    if (sortBy === column) {
      setSortOrder((prev) => (prev === 'ASC' ? 'DESC' : 'ASC'));
    } else {
      setSortBy(column);
      setSortOrder('ASC');
    }
    setPage(1);
  };

  /**
   * Handle search input — reset to first page.
   */
  const handleSearch = (value) => {
    setSearch(value);
    setPage(1);
  };

  /**
   * Handle department filter change — reset to first page.
   */
  const handleDepartmentChange = (value) => {
    setDepartmentId(value);
    setPage(1);
  };

  /**
   * Confirm and execute position deletion.
   */
  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await positionApi.remove(deleteTarget.id);
      addToast(`Position "${deleteTarget.emertimi}" deleted`, 'success');
      setDeleteTarget(null);
      fetchPositions();
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to delete position';
      addToast(msg, 'error');
    } finally {
      setDeleting(false);
    }
  };

  // Department options for the FilterDropdown
  const departmentOptions = departments.map((d) => ({
    value: d.id,
    label: d.emertimi,
  }));

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Positions</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage job positions and salary ranges
          </p>
        </div>
        <button
          onClick={() => onAdd?.()}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Position
        </button>
      </div>

      {/* Filter bar */}
      <div className="flex flex-col sm:flex-row sm:items-end gap-3">
        <SearchBar
          onSearch={handleSearch}
          placeholder="Search positions…"
          className="flex-1 max-w-md"
        />
        <FilterDropdown
          label="Department"
          options={departmentOptions}
          value={departmentId}
          onChange={handleDepartmentChange}
          allLabel="All departments"
          className="sm:w-64"
        />
      </div>

      {/* Data table */}
      <DataTable
        columns={columns}
        data={positions}
        loading={loading}
        sortBy={sortBy}
        sortOrder={sortOrder}
        onSort={handleSort}
        onRowClick={onView ? (row) => onView(row) : undefined}
        emptyMessage="No positions found"
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
        title="Delete Position"
        message={`Are you sure you want to delete "${deleteTarget?.emertimi}"? This action cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        loading={deleting}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};

export default PositionList;
