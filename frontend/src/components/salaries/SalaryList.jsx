/**
 * @file frontend/src/components/salaries/SalaryList.jsx
 * @description Salary listing with employee / month / year / status filters, formatted currency, and status badges
 * @author Dev B
 */

import { useState, useEffect, useCallback } from 'react';
import * as salaryApi from '../../api/salaryApi';
import * as employeeApi from '../../api/employeeApi';
import DataTable from '../common/DataTable';
import Pagination from '../common/Pagination';
import FilterDropdown from '../common/FilterDropdown';
import ConfirmDialog from '../common/ConfirmDialog';
import { useToast } from '../common/Toast';

/** Status filter options (values must match the Salaries.statusi ENUM). */
const STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending' },
  { value: 'processed', label: 'Processed' },
  { value: 'paid', label: 'Paid' },
  { value: 'cancelled', label: 'Cancelled' },
];

/** Tailwind color classes per status for the status badge. */
const STATUS_BADGE_CLASS = {
  pending: 'bg-yellow-50 text-yellow-800 ring-yellow-600/20',
  processed: 'bg-blue-50 text-blue-700 ring-blue-600/20',
  paid: 'bg-green-50 text-green-700 ring-green-600/20',
  cancelled: 'bg-gray-50 text-gray-700 ring-gray-600/20',
};

/** Month select options. */
const MONTH_OPTIONS = [
  { value: '1', label: 'January' },
  { value: '2', label: 'February' },
  { value: '3', label: 'March' },
  { value: '4', label: 'April' },
  { value: '5', label: 'May' },
  { value: '6', label: 'June' },
  { value: '7', label: 'July' },
  { value: '8', label: 'August' },
  { value: '9', label: 'September' },
  { value: '10', label: 'October' },
  { value: '11', label: 'November' },
  { value: '12', label: 'December' },
];

/**
 * Build the year-filter options: current year and the five previous years.
 */
const buildYearOptions = () => {
  const now = new Date().getFullYear();
  const years = [];
  for (let y = now; y >= now - 5; y -= 1) {
    years.push({ value: String(y), label: String(y) });
  }
  return years;
};

/**
 * Format a monetary value as a EUR currency string with two decimals.
 */
const formatCurrency = (value) =>
  value != null
    ? `€${Number(value).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
    : '—';

/**
 * Format a date string (YYYY-MM-DD or ISO) as DD/MM/YYYY.
 */
const formatDate = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-GB');
};

/** Two-digit padded month for display ("04" instead of "4"). */
const formatPeriod = (month, year) => {
  if (!month || !year) return '—';
  return `${String(month).padStart(2, '0')}/${year}`;
};

/**
 * SalaryList — paginated salary records with multi-filter.
 *
 * @param {Object} props
 * @param {Function} [props.onAdd]
 * @param {Function} [props.onEdit]
 * @param {Function} [props.onView]
 * @returns {JSX.Element}
 */
const SalaryList = ({ onAdd, onEdit, onView }) => {
  const [salaries, setSalaries] = useState([]);
  const [pagination, setPagination] = useState({});
  const [loading, setLoading] = useState(true);

  const [employeeId, setEmployeeId] = useState('');
  const [muaji, setMuaji] = useState('');
  const [viti, setViti] = useState('');
  const [statusi, setStatusi] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState('DESC');

  // Employee filter options
  const [employees, setEmployees] = useState([]);

  // Delete confirmation state
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const { addToast } = useToast();

  const yearOptions = buildYearOptions();

  /** Table column definitions. */
  const columns = [
    {
      key: 'full_name',
      label: 'Employee',
      sortable: false,
      render: (_v, row) => (
        <div>
          <p className="text-sm font-medium text-gray-900">
            {row.first_name} {row.last_name}
          </p>
          {row.numri_punonjesit && (
            <p className="text-xs text-gray-500 font-mono">{row.numri_punonjesit}</p>
          )}
        </div>
      ),
    },
    {
      key: 'period',
      label: 'Period',
      sortable: false,
      render: (_v, row) => (
        <span className="font-mono text-sm text-gray-700">
          {formatPeriod(row.muaji, row.viti)}
        </span>
      ),
    },
    {
      key: 'paga_baze',
      label: 'Base pay',
      sortable: true,
      render: (value) => <span className="text-sm text-gray-700">{formatCurrency(value)}</span>,
    },
    {
      key: 'bonuse',
      label: 'Bonuses',
      sortable: false,
      render: (value) => (
        <span className="text-sm text-gray-700">{formatCurrency(value)}</span>
      ),
    },
    {
      key: 'zbritje',
      label: 'Deductions',
      sortable: false,
      render: (value) => (
        <span className="text-sm text-gray-700">{formatCurrency(value)}</span>
      ),
    },
    {
      key: 'paga_neto',
      label: 'Net pay',
      sortable: true,
      render: (value) => (
        <span className="text-sm font-semibold text-gray-900">
          {formatCurrency(value)}
        </span>
      ),
    },
    {
      key: 'data_pageses',
      label: 'Paid on',
      sortable: true,
      render: (value) => (
        <span className="text-sm text-gray-600">{formatDate(value)}</span>
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
            Delete
          </button>
        </div>
      ),
    },
  ];

  /**
   * Load employee options for the filter dropdown (once).
   */
  useEffect(() => {
    const loadEmployees = async () => {
      try {
        const result = await employeeApi.getAll({ limit: 200, statusi: 'active' });
        setEmployees(result.data || []);
      } catch {
        setEmployees([]);
      }
    };
    loadEmployees();
  }, []);

  /**
   * Fetch salaries with the current filter/sort/paging state.
   */
  const fetchSalaries = useCallback(async () => {
    setLoading(true);
    try {
      const result = await salaryApi.getAll({
        page,
        limit,
        employee_id: employeeId || undefined,
        muaji: muaji || undefined,
        viti: viti || undefined,
        statusi: statusi || undefined,
        sortBy,
        sortOrder,
      });
      setSalaries(result.data);
      setPagination(result.pagination);
    } catch (err) {
      addToast('Failed to load salaries', 'error');
    } finally {
      setLoading(false);
    }
  }, [page, limit, employeeId, muaji, viti, statusi, sortBy, sortOrder, addToast]);

  useEffect(() => {
    fetchSalaries();
  }, [fetchSalaries]);

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
  const handleEmployeeChange = (value) => {
    setEmployeeId(value);
    setPage(1);
  };
  const handleMonthChange = (value) => {
    setMuaji(value);
    setPage(1);
  };
  const handleYearChange = (value) => {
    setViti(value);
    setPage(1);
  };
  const handleStatusChange = (value) => {
    setStatusi(value);
    setPage(1);
  };

  /** Reset all filters in one click. */
  const handleClearFilters = () => {
    setEmployeeId('');
    setMuaji('');
    setViti('');
    setStatusi('');
    setPage(1);
  };

  /**
   * Confirm and execute salary deletion.
   */
  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await salaryApi.remove(deleteTarget.id);
      addToast(
        `Salary for ${deleteTarget.first_name} ${deleteTarget.last_name} deleted`,
        'success'
      );
      setDeleteTarget(null);
      fetchSalaries();
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to delete salary record';
      addToast(msg, 'error');
    } finally {
      setDeleting(false);
    }
  };

  // Employee options for the dropdown
  const employeeOptions = employees.map((e) => ({
    value: e.id,
    label: `${e.first_name} ${e.last_name}${
      e.numri_punonjesit ? ` (${e.numri_punonjesit})` : ''
    }`,
  }));

  const hasActiveFilters = Boolean(employeeId || muaji || viti || statusi);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Salaries</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage payroll records and payment statuses
          </p>
        </div>
        <button
          onClick={() => onAdd?.()}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Salary
        </button>
      </div>

      {/* Filter bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
        <FilterDropdown
          label="Employee"
          options={employeeOptions}
          value={employeeId}
          onChange={handleEmployeeChange}
          allLabel="All employees"
        />
        <FilterDropdown
          label="Month"
          options={MONTH_OPTIONS}
          value={muaji}
          onChange={handleMonthChange}
          allLabel="Any month"
        />
        <FilterDropdown
          label="Year"
          options={yearOptions}
          value={viti}
          onChange={handleYearChange}
          allLabel="Any year"
        />
        <FilterDropdown
          label="Status"
          options={STATUS_OPTIONS}
          value={statusi}
          onChange={handleStatusChange}
          allLabel="Any status"
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
        data={salaries}
        loading={loading}
        sortBy={sortBy}
        sortOrder={sortOrder}
        onSort={handleSort}
        onRowClick={onView ? (row) => onView(row) : undefined}
        emptyMessage="No salary records found"
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
        title="Delete Salary Record"
        message={`Are you sure you want to delete the ${formatPeriod(
          deleteTarget?.muaji,
          deleteTarget?.viti
        )} salary record for ${deleteTarget?.first_name} ${deleteTarget?.last_name}? This cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        loading={deleting}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};

export default SalaryList;
