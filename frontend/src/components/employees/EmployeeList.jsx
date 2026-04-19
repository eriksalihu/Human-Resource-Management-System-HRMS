/**
 * @file frontend/src/components/employees/EmployeeList.jsx
 * @description Employee listing with search, multi-filter (department/status/contract), avatar column, and CRUD actions
 * @author Dev B
 */

import { useState, useEffect, useCallback } from 'react';
import * as employeeApi from '../../api/employeeApi';
import * as departmentApi from '../../api/departmentApi';
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
   * Fetch employees with current filter / sort / paging state.
   */
  const fetchEmployees = useCallback(async () => {
    setLoading(true);
    try {
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
    } catch (err) {
      addToast('Failed to load employees', 'error');
    } finally {
      setLoading(false);
    }
  }, [page, limit, search, departmentId, statusi, contractType, sortBy, sortOrder, addToast]);

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

  /** Reset all filters in one click. */
  const handleClearFilters = () => {
    setSearch('');
    setDepartmentId('');
    setStatusi('');
    setContractType('');
    setPage(1);
  };

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

  const hasActiveFilters = Boolean(search || departmentId || statusi || contractType);

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
