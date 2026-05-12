/**
 * @file frontend/src/components/employees/EmployeeList.jsx
 * @description Employee listing with search, multi-filter (department/status/contract), avatar column, and CRUD actions
 *
 *   v2 (commit 215): adds an expandable "Advanced filters" panel with
 *   hire-date range pickers, multi-select contract / status, an
 *   active-filter count badge, and a one-click clear. When ANY advanced
 *   filter is engaged the list switches to the `/api/employees/search`
 *   endpoint (introduced in commit 213); otherwise it stays on the
 *   simpler `/api/employees` listing.
 *
 * @author Dev B
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import * as employeeApi from '../../api/employeeApi';
import * as departmentApi from '../../api/departmentApi';
import axiosInstance from '../../api/axiosInstance';
import DataTable from '../common/DataTable';
import Pagination from '../common/Pagination';
import SearchBar from '../common/SearchBar';
import FilterDropdown from '../common/FilterDropdown';
import ConfirmDialog from '../common/ConfirmDialog';
import { useToast } from '../common/Toast';

/** Status filter options (values must match the Employees.statusi ENUM) */
const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'terminated', label: 'Terminated' },
];

/** Contract-type filter options (values must match the lloji_kontrates ENUM) */
const CONTRACT_OPTIONS = [
  { value: 'full-time', label: 'Full-time' },
  { value: 'part-time', label: 'Part-time' },
  { value: 'contract', label: 'Contract' },
  { value: 'intern', label: 'Intern' },
];

/** Tailwind color classes per status for the status badge. */
const STATUS_BADGE_CLASS = {
  active: 'bg-green-50 text-green-700 ring-green-600/20',
  inactive: 'bg-gray-50 text-gray-700 ring-gray-600/20',
  suspended: 'bg-yellow-50 text-yellow-800 ring-yellow-600/20',
  terminated: 'bg-red-50 text-red-700 ring-red-600/20',
};

/**
 * Render a circular avatar. Uses the user's profile image if available,
 * otherwise falls back to initials on a coloured background.
 *
 * @param {Object} props
 * @param {string} [props.src] - Image URL
 * @param {string} [props.firstName]
 * @param {string} [props.lastName]
 * @returns {JSX.Element}
 */
const Avatar = ({ src, firstName = '', lastName = '' }) => {
  const initials = `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase() || '?';
  if (src) {
    return (
      <img
        src={src}
        alt={`${firstName} ${lastName}`}
        className="h-9 w-9 rounded-full object-cover ring-1 ring-gray-200"
      />
    );
  }
  return (
    <div className="h-9 w-9 rounded-full bg-indigo-100 text-indigo-700 text-sm font-semibold flex items-center justify-center ring-1 ring-indigo-200">
      {initials}
    </div>
  );
};

/**
 * EmployeeList — paginated employee listing with advanced filters.
 *
 * @param {Object} props
 * @param {Function} [props.onAdd]
 * @param {Function} [props.onEdit]
 * @param {Function} [props.onView]
 * @returns {JSX.Element}
 */
const EmployeeList = ({ onAdd, onEdit, onView }) => {
  const [employees, setEmployees] = useState([]);
  const [pagination, setPagination] = useState({});
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [statusi, setStatusi] = useState('');
  const [contractType, setContractType] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [sortBy, setSortBy] = useState('id');
  const [sortOrder, setSortOrder] = useState('ASC');

  // Department filter options
  const [departments, setDepartments] = useState([]);

  // Delete confirmation state
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // ─── Advanced-filter panel state ───────────────────────────────────
  // `advancedOpen` controls visibility of the expanded section. Closed by
  // default so the list looks unchanged for users who don't need it.
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  // Multi-value: held as Sets for cheap toggle / has-checks. Sent to the
  // server as comma-joined strings on the wire.
  const [statusSet, setStatusSet] = useState(() => new Set());
  const [contractSet, setContractSet] = useState(() => new Set());

  const { addToast } = useToast();

  /** Table column definitions. */
  const columns = [
    {
      key: 'avatar',
      label: '',
      sortable: false,
      render: (_v, row) => (
        <Avatar
          src={row.profile_image}
          firstName={row.first_name}
          lastName={row.last_name}
        />
      ),
    },
    {
      key: 'full_name',
      label: 'Name',
      sortable: false,
      render: (_v, row) => (
        <div>
          <p className="text-sm font-medium text-gray-900">
            {row.first_name} {row.last_name}
          </p>
          {row.email && <p className="text-xs text-gray-500">{row.email}</p>}
        </div>
      ),
    },
    {
      key: 'numri_punonjesit',
      label: 'Employee #',
      sortable: true,
      render: (value) => (
        <span className="font-mono text-xs text-gray-600">{value || '—'}</span>
      ),
    },
    {
      key: 'position_emertimi',
      label: 'Position',
      sortable: false,
      render: (value) => value || '—',
    },
    {
      key: 'department_emertimi',
      label: 'Department',
      sortable: false,
      render: (value) => value || '—',
    },
    {
      key: 'lloji_kontrates',
      label: 'Contract',
      sortable: true,
      render: (value) => {
        const label = CONTRACT_OPTIONS.find((c) => c.value === value)?.label || value;
        return value ? (
          <span className="text-xs text-gray-700">{label}</span>
        ) : (
          '—'
        );
      },
    },
    {
      key: 'statusi',
      label: 'Status',
      sortable: true,
      render: (value) => {
        const cls = STATUS_BADGE_CLASS[value] || STATUS_BADGE_CLASS.inactive;
        return value ? (
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${cls}`}
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
            Terminate
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
        setDepartments([]);
      }
    };
    loadDepartments();
  }, []);

  /**
   * True when any advanced filter is engaged. Drives endpoint selection
   * AND the "active filter count" badge on the toggle button.
   */
  const advancedActive = useMemo(
    () => Boolean(fromDate || toDate || statusSet.size > 0 || contractSet.size > 0),
    [fromDate, toDate, statusSet, contractSet]
  );

  /**
   * Active filter count — shown on the panel header so users can tell
   * at a glance how restrictive their current query is. Top-bar filters
   * count too because they're equally part of the active query.
   */
  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (search) n += 1;
    if (departmentId) n += 1;
    if (statusi) n += 1;
    if (contractType) n += 1;
    if (fromDate) n += 1;
    if (toDate) n += 1;
    n += statusSet.size;
    n += contractSet.size;
    return n;
  }, [search, departmentId, statusi, contractType, fromDate, toDate, statusSet, contractSet]);

  /**
   * Fetch employees with current filter / sort / paging state.
   *
   * - When the advanced panel is engaged (date range or multi-select),
   *   we hit `/api/employees/search` (commit 213) directly via axios
   *   since `employeeApi.getAll` is single-value only.
   * - Otherwise we keep using the existing `getAll` for backwards
   *   compatibility and the slightly leaner endpoint contract.
   */
  const fetchEmployees = useCallback(async () => {
    setLoading(true);
    try {
      if (advancedActive) {
        // Build the advanced query. Multi-value filters go on the wire as
        // comma-separated strings (matches the controller's
        // `splitAndFilter` parser).
        const params = {
          page,
          limit,
          sortBy,
          sortOrder,
          ...(search ? { search } : {}),
          ...(departmentId ? { department_id: departmentId } : {}),
          ...(fromDate ? { from_date: fromDate } : {}),
          ...(toDate ? { to_date: toDate } : {}),
        };
        // Top-bar single + advanced multi merge: a single-value pick
        // counts as a single-value member of the multi-set so the server
        // sees a consistent list.
        const statusList = new Set(statusSet);
        if (statusi) statusList.add(statusi);
        if (statusList.size > 0) {
          params.statusi = Array.from(statusList).join(',');
        }
        const contractList = new Set(contractSet);
        if (contractType) contractList.add(contractType);
        if (contractList.size > 0) {
          params.lloji_kontrates = Array.from(contractList).join(',');
        }

        const { data } = await axiosInstance.get('/employees/search', { params });
        setEmployees(data.data || []);
        setPagination(data.pagination || {});
      } else {
        const result = await employeeApi.getAll({
          page,
          limit,
          search,
          department_id: departmentId || undefined,
          statusi: statusi || undefined,
          lloji_kontrates: contractType || undefined,
          sortBy,
          sortOrder,
        });
        setEmployees(result.data);
        setPagination(result.pagination);
      }
    } catch (err) {
      addToast(
        err.response?.data?.message || 'Failed to load employees',
        'error'
      );
    } finally {
      setLoading(false);
    }
  }, [
    advancedActive,
    page,
    limit,
    search,
    departmentId,
    statusi,
    contractType,
    fromDate,
    toDate,
    statusSet,
    contractSet,
    sortBy,
    sortOrder,
    addToast,
  ]);

  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  /** Handle column sort toggle. */
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
  const handleSearch = (value) => {
    setSearch(value);
    setPage(1);
  };

  const handleDepartmentChange = (value) => {
    setDepartmentId(value);
    setPage(1);
  };
  const handleStatusChange = (value) => {
    setStatusi(value);
    setPage(1);
  };
  const handleContractChange = (value) => {
    setContractType(value);
    setPage(1);
  };

  /** Reset all filters (basic + advanced) in one click. */
  const handleClearFilters = () => {
    setSearch('');
    setDepartmentId('');
    setStatusi('');
    setContractType('');
    setFromDate('');
    setToDate('');
    setStatusSet(new Set());
    setContractSet(new Set());
    setPage(1);
  };

  /** Toggle a value in a Set-shaped state. Bumps page back to 1. */
  const toggleInSet = (setter) => (value) => {
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
    setPage(1);
  };
  const toggleStatus = toggleInSet(setStatusSet);
  const toggleContract = toggleInSet(setContractSet);

  /**
   * Confirm and execute employee termination.
   */
  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await employeeApi.remove(deleteTarget.id);
      addToast(
        `${deleteTarget.first_name} ${deleteTarget.last_name} terminated`,
        'success'
      );
      setDeleteTarget(null);
      fetchEmployees();
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to terminate employee';
      addToast(msg, 'error');
    } finally {
      setDeleting(false);
    }
  };

  // Department options for the dropdown
  const departmentOptions = departments.map((d) => ({
    value: d.id,
    label: d.emertimi,
  }));

  const hasActiveFilters = Boolean(
    search ||
      departmentId ||
      statusi ||
      contractType ||
      fromDate ||
      toDate ||
      statusSet.size > 0 ||
      contractSet.size > 0
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Employees</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage employees, contracts, and reporting lines
          </p>
        </div>
        <button
          onClick={() => onAdd?.()}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Employee
        </button>
      </div>

      {/* Filter bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
        <SearchBar
          onSearch={handleSearch}
          placeholder="Search by name, email, or employee #…"
          className="sm:col-span-2 lg:col-span-1"
        />
        <FilterDropdown
          label="Department"
          options={departmentOptions}
          value={departmentId}
          onChange={handleDepartmentChange}
          allLabel="All departments"
        />
        <FilterDropdown
          label="Status"
          options={STATUS_OPTIONS}
          value={statusi}
          onChange={handleStatusChange}
          allLabel="Any status"
        />
        <FilterDropdown
          label="Contract"
          options={CONTRACT_OPTIONS}
          value={contractType}
          onChange={handleContractChange}
          allLabel="Any contract"
        />
      </div>

      {/* Advanced-filters toggle */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setAdvancedOpen((v) => !v)}
          aria-expanded={advancedOpen}
          aria-controls="advanced-filters-panel"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-700 hover:text-gray-900"
        >
          <svg
            className={`h-4 w-4 transition-transform ${
              advancedOpen ? 'rotate-180' : ''
            }`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
          Advanced filters
          {activeFilterCount > 0 && (
            <span className="ml-1 inline-flex items-center justify-center px-1.5 py-0.5 text-[10px] font-semibold rounded-full bg-indigo-100 text-indigo-700">
              {activeFilterCount}
            </span>
          )}
        </button>

        {hasActiveFilters && (
          <button
            onClick={handleClearFilters}
            className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
          >
            Clear all filters
          </button>
        )}
      </div>

      {/* Advanced-filters panel — collapsible */}
      {advancedOpen && (
        <div
          id="advanced-filters-panel"
          className="rounded-lg border border-gray-200 bg-gray-50/50 p-4 space-y-4 animate-slide-in-down"
        >
          {/* Hire-date range */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
              Hire date range
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="adv-from-date"
                  className="block text-xs font-medium text-gray-700 mb-1"
                >
                  From
                </label>
                <input
                  type="date"
                  id="adv-from-date"
                  value={fromDate}
                  onChange={(e) => {
                    setFromDate(e.target.value);
                    setPage(1);
                  }}
                  className="block w-full rounded-md border-gray-300 text-sm focus:border-indigo-500 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label
                  htmlFor="adv-to-date"
                  className="block text-xs font-medium text-gray-700 mb-1"
                >
                  To
                </label>
                <input
                  type="date"
                  id="adv-to-date"
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
          </div>

          {/* Multi-select contract types */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
              Contract types{' '}
              <span className="text-gray-400 normal-case font-normal">
                (multi-select)
              </span>
            </p>
            <div className="flex flex-wrap gap-2">
              {CONTRACT_OPTIONS.map((opt) => {
                const checked = contractSet.has(opt.value);
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => toggleContract(opt.value)}
                    aria-pressed={checked}
                    className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset transition-colors ${
                      checked
                        ? 'bg-indigo-600 text-white ring-indigo-600 hover:bg-indigo-700'
                        : 'bg-white text-gray-700 ring-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    {checked && (
                      <svg
                        className="h-3 w-3"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={3}
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    )}
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Multi-select statuses */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
              Statuses{' '}
              <span className="text-gray-400 normal-case font-normal">
                (multi-select)
              </span>
            </p>
            <div className="flex flex-wrap gap-2">
              {STATUS_OPTIONS.map((opt) => {
                const checked = statusSet.has(opt.value);
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => toggleStatus(opt.value)}
                    aria-pressed={checked}
                    className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset transition-colors capitalize ${
                      checked
                        ? 'bg-indigo-600 text-white ring-indigo-600 hover:bg-indigo-700'
                        : 'bg-white text-gray-700 ring-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    {checked && (
                      <svg
                        className="h-3 w-3"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={3}
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    )}
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Footer note */}
          <p className="text-[11px] text-gray-500">
            Tip: multi-selects narrow results using OR within a group
            (e.g. picking "Active" + "Suspended" returns rows matching
            either). Combining groups uses AND across groups.
          </p>
        </div>
      )}

      {/* Data table */}
      <DataTable
        columns={columns}
        data={employees}
        loading={loading}
        sortBy={sortBy}
        sortOrder={sortOrder}
        onSort={handleSort}
        onRowClick={onView ? (row) => onView(row) : undefined}
        emptyMessage="No employees found"
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

      {/* Termination confirmation */}
      <ConfirmDialog
        isOpen={!!deleteTarget}
        title="Terminate Employee"
        message={`Are you sure you want to terminate ${deleteTarget?.first_name} ${deleteTarget?.last_name}? Their record will be set to "terminated".`}
        confirmLabel="Terminate"
        variant="danger"
        loading={deleting}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};

export default EmployeeList;
