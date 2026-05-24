/**
 * @file frontend/src/components/salaries/SalaryList.jsx
 * @description Salary listing with employee / month / year / status filters, formatted currency, status badges
 *
 *   v2 (commit 216): adds a "Generate payroll" button alongside "Add
 *   Salary", opening a modal that lets HR pick the period + base-pay
 *   strategy, see a dry-run preview ("12 employees, 3 skipped: already
 *   exist"), and then confirm the bulk insert against the new
 *   `/api/salaries/generate` endpoint (commit 214).
 *
 * @author Dev B
 */

import { useState, useEffect, useCallback } from 'react';
import * as salaryApi from '../../api/salaryApi';
import * as employeeApi from '../../api/employeeApi';
import axiosInstance from '../../api/axiosInstance';
import DataTable from '../common/DataTable';
import Pagination from '../common/Pagination';
import FilterDropdown from '../common/FilterDropdown';
import ConfirmDialog from '../common/ConfirmDialog';
import Modal from '../common/Modal';
import { useToast } from '../common/Toast';
import { downloadCsv, stampedFilename } from '../../utils/csv';

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

  // ─── Bulk-generate dialog state ───────────────────────────────────
  // The dialog walks the user through three steps:
  //   'form'    — pick month / year / base strategy
  //   'preview' — show dry-run result (counts + plan/skipped lists)
  //   'running' — POST without dryRun, then 'result'
  //   'result'  — show success / error summary
  const [genOpen, setGenOpen] = useState(false);
  const [genStep, setGenStep] = useState('form');
  const today = new Date();
  const [genMuaji, setGenMuaji] = useState(today.getMonth() + 1);
  const [genViti, setGenViti] = useState(today.getFullYear());
  const [genStrategy, setGenStrategy] = useState('mid');
  const [genPreview, setGenPreview] = useState(null);
  const [genResult, setGenResult] = useState(null);
  const [genLoading, setGenLoading] = useState(false);

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
        const result = await employeeApi.getAll({ limit: 100, statusi: 'active' });
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
    } catch {
      addToast('Failed to load salaries', 'error');
    } finally {
      setLoading(false);
    }
  }, [page, limit, employeeId, muaji, viti, statusi, sortBy, sortOrder, addToast]);

  useEffect(() => {
    fetchSalaries();
  }, [fetchSalaries]);

  /** Handle column sort toggle. */
  const handleSort = (column, nextOrder) => {
    // Honor the order DataTable already resolved (2nd arg) so the sort
    // indicator and the query stay in lock-step; toggle only as a
    // single-arg fallback.
    const resolved =
      nextOrder ||
      (column === sortBy ? (sortOrder === 'ASC' ? 'DESC' : 'ASC') : 'ASC');
    setSortBy(column);
    setSortOrder(resolved);
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
  /**
   * Export the current salaries page to CSV. Includes the period (month/
   * year), base / bonuses / deductions / net, payment status, and a
   * formatted paid-on date for spreadsheet-friendly downstream use.
   */
  const handleExportCsv = () => {
    if (salaries.length === 0) {
      addToast('Nothing to export — adjust filters and try again', 'info');
      return;
    }
    const headers = [
      'Employee #',
      'First name',
      'Last name',
      'Month',
      'Year',
      'Base pay',
      'Bonuses',
      'Deductions',
      'Net pay',
      'Status',
      'Paid on',
    ];
    const rows = salaries.map((s) => [
      s.numri_punonjesit || '',
      s.first_name || '',
      s.last_name || '',
      s.muaji ?? '',
      s.viti ?? '',
      Number(s.paga_baze ?? 0).toFixed(2),
      Number(s.bonuse ?? 0).toFixed(2),
      Number(s.zbritje ?? 0).toFixed(2),
      Number(s.paga_neto ?? 0).toFixed(2),
      s.statusi || '',
      s.data_pageses ? String(s.data_pageses).slice(0, 10) : '',
    ]);
    downloadCsv(stampedFilename('salaries'), headers, rows);
    addToast(`Exported ${salaries.length} salary records`, 'success');
  };

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

  /* ─── Bulk payroll generation flow ────────────────────────────── */

  /** Open the dialog reset to the form step with current month/year. */
  const handleOpenGenerate = () => {
    setGenStep('form');
    setGenPreview(null);
    setGenResult(null);
    const now = new Date();
    setGenMuaji(now.getMonth() + 1);
    setGenViti(now.getFullYear());
    setGenStrategy('mid');
    setGenOpen(true);
  };

  /** Close the dialog. Disabled while a run is in flight. */
  const handleCloseGenerate = () => {
    if (genLoading) return;
    setGenOpen(false);
  };

  /**
   * Ask the server for a dry-run preview. Updates state to step 'preview'
   * with the returned plan + skipped lists. The user can still cancel.
   */
  const handlePreview = async () => {
    setGenLoading(true);
    try {
      const { data } = await axiosInstance.post('/salaries/generate', {
        muaji: genMuaji,
        viti: genViti,
        baseStrategy: genStrategy,
        dryRun: true,
      });
      setGenPreview(data.data);
      setGenStep('preview');
    } catch (err) {
      addToast(
        err.response?.data?.message || 'Failed to preview payroll',
        'error'
      );
    } finally {
      setGenLoading(false);
    }
  };

  /**
   * Commit the bulk insert. Same payload as preview minus `dryRun`.
   * Result is captured in state so the dialog can show a "X created /
   * Y skipped" summary before the user closes.
   */
  const handleConfirmGenerate = async () => {
    setGenLoading(true);
    setGenStep('running');
    try {
      const { data } = await axiosInstance.post('/salaries/generate', {
        muaji: genMuaji,
        viti: genViti,
        baseStrategy: genStrategy,
        dryRun: false,
      });
      setGenResult(data.data);
      setGenStep('result');
      addToast(
        `Generated ${data.data?.created?.length || 0} salary records`,
        'success'
      );
      // Refresh the list so the new rows show up immediately.
      fetchSalaries();
    } catch (err) {
      const msg =
        err.response?.data?.message || 'Failed to generate payroll';
      setGenResult({ error: msg });
      setGenStep('result');
      addToast(msg, 'error');
    } finally {
      setGenLoading(false);
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
          <h1 className="text-2xl font-bold text-gray-900 truncate">Salaries</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage payroll records and payment statuses
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleOpenGenerate}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-indigo-300 text-indigo-700 text-sm font-medium rounded-lg hover:bg-indigo-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors"
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
                d="M13 10V3L4 14h7v7l9-11h-7z"
              />
            </svg>
            Generate payroll
          </button>
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={salaries.length === 0}
            className="inline-flex items-center gap-2 px-3 py-2 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V3" />
            </svg>
            Export CSV
          </button>
          <button
            onClick={() => onAdd?.()}
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
            Add Salary
          </button>
        </div>
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

      {/* Data table — switches to a stacked card layout on mobile. */}
      <DataTable
        columns={columns}
        data={salaries}
        loading={loading}
        sortBy={sortBy}
        sortOrder={sortOrder}
        onSort={handleSort}
        onRowClick={onView ? (row) => onView(row) : undefined}
        emptyMessage="No salary records found"
        cardOnMobile
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

      {/* Bulk payroll generation dialog */}
      <Modal
        isOpen={genOpen}
        onClose={handleCloseGenerate}
        title="Generate monthly payroll"
        size="lg"
      >
        {/* Step 1: form */}
        {genStep === 'form' && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Generate salary records for every active employee for the
              chosen month. Each employee's base pay is derived from their
              position's salary band.
            </p>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="gen-month"
                  className="block text-xs font-medium text-gray-700 mb-1"
                >
                  Month
                </label>
                <select
                  id="gen-month"
                  value={genMuaji}
                  onChange={(e) => setGenMuaji(parseInt(e.target.value, 10))}
                  className="block w-full rounded-md border-gray-300 text-sm focus:border-indigo-500 focus:ring-indigo-500"
                >
                  {MONTH_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  htmlFor="gen-year"
                  className="block text-xs font-medium text-gray-700 mb-1"
                >
                  Year
                </label>
                <select
                  id="gen-year"
                  value={genViti}
                  onChange={(e) => setGenViti(parseInt(e.target.value, 10))}
                  className="block w-full rounded-md border-gray-300 text-sm focus:border-indigo-500 focus:ring-indigo-500"
                >
                  {yearOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <p className="block text-xs font-medium text-gray-700 mb-2">
                Base-pay strategy
              </p>
              <div className="grid grid-cols-3 gap-2">
                {[
                  {
                    value: 'min',
                    label: 'Minimum',
                    hint: "Position's paga_min",
                  },
                  {
                    value: 'mid',
                    label: 'Midpoint',
                    hint: '(min + max) / 2',
                  },
                  {
                    value: 'max',
                    label: 'Maximum',
                    hint: "Position's paga_max",
                  },
                ].map((opt) => {
                  const picked = genStrategy === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setGenStrategy(opt.value)}
                      aria-pressed={picked}
                      className={`text-left rounded-md border p-3 transition-colors ${
                        picked
                          ? 'border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500'
                          : 'border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      <p
                        className={`text-sm font-medium ${
                          picked ? 'text-indigo-700' : 'text-gray-900'
                        }`}
                      >
                        {opt.label}
                      </p>
                      <p className="text-[11px] text-gray-500 font-mono mt-0.5">
                        {opt.hint}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
              <button
                type="button"
                onClick={handleCloseGenerate}
                disabled={genLoading}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handlePreview}
                disabled={genLoading}
                className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
              >
                {genLoading ? 'Loading preview…' : 'Preview'}
              </button>
            </div>
          </div>
        )}

        {/* Step 2: preview */}
        {genStep === 'preview' && genPreview && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-md bg-emerald-50 ring-1 ring-emerald-200 p-3">
                <p className="text-xs uppercase tracking-wide text-emerald-700">
                  Will be created
                </p>
                <p className="text-2xl font-bold text-emerald-900">
                  {genPreview.plan?.length || 0}
                </p>
              </div>
              <div className="rounded-md bg-amber-50 ring-1 ring-amber-200 p-3">
                <p className="text-xs uppercase tracking-wide text-amber-700">
                  Skipped
                </p>
                <p className="text-2xl font-bold text-amber-900">
                  {genPreview.skipped?.length || 0}
                </p>
              </div>
            </div>

            {/* Plan rows */}
            {genPreview.plan?.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
                  Plan ({MONTH_OPTIONS.find((m) => Number(m.value) === Number(genPreview.muaji))?.label}{' '}
                  {genPreview.viti})
                </p>
                <div className="max-h-56 overflow-y-auto rounded-md border border-gray-200 bg-white">
                  <table className="min-w-full text-xs">
                    <thead className="bg-gray-50 text-gray-500 text-[10px] uppercase">
                      <tr>
                        <th className="px-2 py-1 text-left">Employee</th>
                        <th className="px-2 py-1 text-left">Position</th>
                        <th className="px-2 py-1 text-right">Base</th>
                        <th className="px-2 py-1 text-right">Net</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {genPreview.plan.map((row) => (
                        <tr key={row.employee_id}>
                          <td className="px-2 py-1 text-gray-900">
                            {row.name}
                          </td>
                          <td className="px-2 py-1 text-gray-600">
                            {row.position || '—'}
                          </td>
                          <td className="px-2 py-1 text-right font-mono">
                            {formatCurrency(row.paga_baze)}
                          </td>
                          <td className="px-2 py-1 text-right font-mono font-semibold">
                            {formatCurrency(row.paga_neto)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Skipped rows */}
            {genPreview.skipped?.length > 0 && (
              <details className="text-xs">
                <summary className="cursor-pointer font-semibold text-amber-800 uppercase tracking-wide">
                  Why {genPreview.skipped.length} skipped
                </summary>
                <ul className="mt-1 space-y-0.5 max-h-32 overflow-y-auto">
                  {genPreview.skipped.map((row, i) => (
                    <li key={`${row.employee_id}-${i}`} className="text-gray-700">
                      <span className="font-medium">
                        {row.name || `Employee #${row.employee_id}`}
                      </span>
                      {' — '}
                      <span className="text-gray-500">{row.reason}</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setGenStep('form')}
                disabled={genLoading}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleConfirmGenerate}
                disabled={genLoading || (genPreview.plan?.length || 0) === 0}
                className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
              >
                Confirm &amp; create {genPreview.plan?.length || 0} salaries
              </button>
            </div>
          </div>
        )}

        {/* Step 3: running */}
        {genStep === 'running' && (
          <div className="py-10 text-center">
            <div className="inline-block h-10 w-10 rounded-full border-4 border-indigo-200 border-t-indigo-600 animate-spin" />
            <p className="mt-3 text-sm text-gray-700">
              Creating salary records — this may take a few seconds…
            </p>
          </div>
        )}

        {/* Step 4: result */}
        {genStep === 'result' && genResult && (
          <div className="space-y-4">
            {genResult.error ? (
              <div className="rounded-md bg-rose-50 ring-1 ring-rose-200 p-3 text-sm text-rose-800">
                <p className="font-semibold">Generation failed</p>
                <p className="mt-1">{genResult.error}</p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-md bg-emerald-50 ring-1 ring-emerald-200 p-3">
                    <p className="text-xs uppercase tracking-wide text-emerald-700">
                      Created
                    </p>
                    <p className="text-2xl font-bold text-emerald-900">
                      {genResult.created?.length || 0}
                    </p>
                  </div>
                  <div className="rounded-md bg-amber-50 ring-1 ring-amber-200 p-3">
                    <p className="text-xs uppercase tracking-wide text-amber-700">
                      Skipped
                    </p>
                    <p className="text-2xl font-bold text-amber-900">
                      {genResult.skipped?.length || 0}
                    </p>
                  </div>
                </div>

                {genResult.skipped?.length > 0 && (
                  <details className="text-xs">
                    <summary className="cursor-pointer font-semibold text-amber-800 uppercase tracking-wide">
                      Skipped detail
                    </summary>
                    <ul className="mt-1 space-y-0.5 max-h-32 overflow-y-auto">
                      {genResult.skipped.map((row, i) => (
                        <li key={`${row.employee_id}-${i}`} className="text-gray-700">
                          <span className="font-medium">
                            {row.name || `Employee #${row.employee_id}`}
                          </span>
                          {' — '}
                          <span className="text-gray-500">{row.reason}</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </>
            )}

            <div className="flex justify-end pt-2 border-t border-gray-100">
              <button
                type="button"
                onClick={handleCloseGenerate}
                className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default SalaryList;
