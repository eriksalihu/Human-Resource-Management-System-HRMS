/**
 * @file frontend/src/components/salaries/PayrollSummary.jsx
 * @description Payroll summary dashboard with period selector, company totals, per-department breakdown, and CSV export
 * @author Dev B
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import * as salaryApi from '../../api/salaryApi';
import * as departmentApi from '../../api/departmentApi';
import LoadingSpinner from '../common/LoadingSpinner';
import { useToast } from '../common/Toast';

/** Month options shared with SalaryList. */
const MONTH_OPTIONS = [
  { value: 1, label: 'January' },
  { value: 2, label: 'February' },
  { value: 3, label: 'March' },
  { value: 4, label: 'April' },
  { value: 5, label: 'May' },
  { value: 6, label: 'June' },
  { value: 7, label: 'July' },
  { value: 8, label: 'August' },
  { value: 9, label: 'September' },
  { value: 10, label: 'October' },
  { value: 11, label: 'November' },
  { value: 12, label: 'December' },
];

/** Year options — current year down to five years back. */
const buildYearOptions = () => {
  const now = new Date().getFullYear();
  const years = [];
  for (let y = now; y >= now - 5; y -= 1) {
    years.push(y);
  }
  return years;
};

/** Format a number as a EUR currency string with two decimals. */
const formatCurrency = (value) => {
  if (value == null || Number.isNaN(Number(value))) return '€0.00';
  return `€${Number(value).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

/** Month label lookup. */
const monthLabel = (m) =>
  MONTH_OPTIONS.find((opt) => opt.value === Number(m))?.label || String(m);

/**
 * CSV-escape a single cell value (quote + escape double quotes).
 */
const csvCell = (value) => {
  if (value == null) return '';
  const str = String(value);
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
};

/**
 * PayrollSummary — aggregate salary totals for a selected month / year,
 * with a per-department breakdown row and CSV export of the breakdown.
 *
 * @returns {JSX.Element}
 */
const PayrollSummary = () => {
  const today = new Date();
  const [muaji, setMuaji] = useState(today.getMonth() + 1);
  const [viti, setViti] = useState(today.getFullYear());

  const [summary, setSummary] = useState(null);
  const [breakdown, setBreakdown] = useState([]);
  const [loading, setLoading] = useState(false);

  const { addToast } = useToast();

  const yearOptions = useMemo(buildYearOptions, []);

  /**
   * Load company-wide totals + per-department totals in parallel.
   */
  const loadSummary = useCallback(async () => {
    setLoading(true);
    try {
      const [companyResp, deptsResp] = await Promise.all([
        salaryApi.getPayrollSummary({ muaji, viti }),
        departmentApi.getAll({ limit: 200 }),
      ]);

      setSummary(companyResp?.summary || null);

      const departments = deptsResp?.data || [];

      // Fetch a per-department payroll summary in parallel. Missing / failed
      // requests just fall back to zeros so the table row still renders.
      const perDept = await Promise.all(
        departments.map(async (d) => {
          try {
            const resp = await salaryApi.getPayrollSummary({
              muaji,
              viti,
              department_id: d.id,
            });
            const s = resp?.summary || {};
            return {
              department_id: d.id,
              department_name: d.emertimi,
              headcount: Number(s.headcount || 0),
              total_base: Number(s.total_base || 0),
              total_bonuses: Number(s.total_bonuses || 0),
              total_deductions: Number(s.total_deductions || 0),
              total_net: Number(s.total_net || 0),
            };
          } catch {
            return {
              department_id: d.id,
              department_name: d.emertimi,
              headcount: 0,
              total_base: 0,
              total_bonuses: 0,
              total_deductions: 0,
              total_net: 0,
            };
          }
        })
      );

      // Sort breakdown by net desc so the biggest cost centers float up.
      perDept.sort((a, b) => b.total_net - a.total_net);
      setBreakdown(perDept);
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to load payroll summary';
      addToast(msg, 'error');
      setSummary(null);
      setBreakdown([]);
    } finally {
      setLoading(false);
    }
  }, [muaji, viti, addToast]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  /**
   * Export the department breakdown as a CSV file.
   */
  const handleExport = () => {
    if (!breakdown.length && !summary) {
      addToast('Nothing to export yet', 'info');
      return;
    }

    const header = [
      'Department',
      'Headcount',
      'Total Base',
      'Total Bonuses',
      'Total Deductions',
      'Total Net',
    ];

    const rows = breakdown.map((row) => [
      row.department_name,
      row.headcount,
      row.total_base.toFixed(2),
      row.total_bonuses.toFixed(2),
      row.total_deductions.toFixed(2),
      row.total_net.toFixed(2),
    ]);

    // Append a totals row at the bottom matching the top cards.
    if (summary) {
      rows.push([
        'TOTAL (company)',
        Number(summary.headcount || 0),
        Number(summary.total_base || 0).toFixed(2),
        Number(summary.total_bonuses || 0).toFixed(2),
        Number(summary.total_deductions || 0).toFixed(2),
        Number(summary.total_net || 0).toFixed(2),
      ]);
    }

    const csv = [header, ...rows]
      .map((cols) => cols.map(csvCell).join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `payroll_${viti}_${String(muaji).padStart(2, '0')}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const headcount = Number(summary?.headcount || 0);
  const totalBase = Number(summary?.total_base || 0);
  const totalBonuses = Number(summary?.total_bonuses || 0);
  const totalDeductions = Number(summary?.total_deductions || 0);
  const totalNet = Number(summary?.total_net || 0);

  return (
    <div className="space-y-6">
      {/* Period selector */}
      <div className="flex flex-wrap items-end justify-between gap-3 bg-white p-4 rounded-lg shadow-sm border border-gray-200">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label
              htmlFor="payroll-month"
              className="block text-xs font-medium text-gray-700 mb-1"
            >
              Month
            </label>
            <select
              id="payroll-month"
              value={muaji}
              onChange={(e) => setMuaji(parseInt(e.target.value, 10))}
              className="rounded-md border-gray-300 text-sm focus:border-indigo-500 focus:ring-indigo-500"
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
              htmlFor="payroll-year"
              className="block text-xs font-medium text-gray-700 mb-1"
            >
              Year
            </label>
            <select
              id="payroll-year"
              value={viti}
              onChange={(e) => setViti(parseInt(e.target.value, 10))}
              className="rounded-md border-gray-300 text-sm focus:border-indigo-500 focus:ring-indigo-500"
            >
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={loadSummary}
            disabled={loading}
            className="h-9 px-4 text-sm font-medium rounded-md bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>

        <button
          type="button"
          onClick={handleExport}
          disabled={loading || (!breakdown.length && !summary)}
          className="h-9 px-4 text-sm font-medium rounded-md bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          Export CSV
        </button>
      </div>

      {/* Period header */}
      <div className="text-sm text-gray-600">
        Showing totals for <span className="font-medium">{monthLabel(muaji)} {viti}</span>
      </div>

      {/* Company totals */}
      {loading ? (
        <div className="flex justify-center py-10">
          <LoadingSpinner />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <SummaryCard
              label="Headcount"
              value={headcount}
              tone="gray"
              isCount
            />
            <SummaryCard
              label="Total Base"
              value={formatCurrency(totalBase)}
              tone="indigo"
            />
            <SummaryCard
              label="Total Bonuses"
              value={formatCurrency(totalBonuses)}
              tone="green"
            />
            <SummaryCard
              label="Total Deductions"
              value={formatCurrency(totalDeductions)}
              tone="red"
            />
            <SummaryCard
              label="Total Net"
              value={formatCurrency(totalNet)}
              tone="emerald"
              emphasis
            />
          </div>

          {/* Per-department breakdown */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200">
              <h3 className="text-sm font-semibold text-gray-900">
                By department
              </h3>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-4 py-2 text-left">Department</th>
                    <th className="px-4 py-2 text-right">Headcount</th>
                    <th className="px-4 py-2 text-right">Base</th>
                    <th className="px-4 py-2 text-right">Bonuses</th>
                    <th className="px-4 py-2 text-right">Deductions</th>
                    <th className="px-4 py-2 text-right">Net</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {breakdown.length === 0 ? (
                    <tr>
                      <td
                        className="px-4 py-8 text-center text-gray-500"
                        colSpan={6}
                      >
                        No department data for this period.
                      </td>
                    </tr>
                  ) : (
                    breakdown.map((row) => (
                      <tr key={row.department_id} className="hover:bg-gray-50">
                        <td className="px-4 py-2 font-medium text-gray-900">
                          {row.department_name}
                        </td>
                        <td className="px-4 py-2 text-right text-gray-700">
                          {row.headcount}
                        </td>
                        <td className="px-4 py-2 text-right text-gray-700">
                          {formatCurrency(row.total_base)}
                        </td>
                        <td className="px-4 py-2 text-right text-green-700">
                          {formatCurrency(row.total_bonuses)}
                        </td>
                        <td className="px-4 py-2 text-right text-red-700">
                          {formatCurrency(row.total_deductions)}
                        </td>
                        <td className="px-4 py-2 text-right font-semibold text-gray-900">
                          {formatCurrency(row.total_net)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

/**
 * Small presentational card for top-of-dashboard metrics.
 */
const SummaryCard = ({ label, value, tone = 'gray', emphasis = false, isCount = false }) => {
  const toneClass = {
    gray: 'bg-gray-50 text-gray-800 ring-gray-200',
    indigo: 'bg-indigo-50 text-indigo-800 ring-indigo-200',
    green: 'bg-green-50 text-green-800 ring-green-200',
    red: 'bg-red-50 text-red-800 ring-red-200',
    emerald: 'bg-emerald-50 text-emerald-900 ring-emerald-200',
  }[tone];

  return (
    <div
      className={`rounded-lg ring-1 p-4 ${toneClass} ${
        emphasis ? 'shadow-sm' : ''
      }`}
    >
      <div className="text-xs uppercase tracking-wide font-medium opacity-70">
        {label}
      </div>
      <div
        className={`mt-1 ${
          emphasis ? 'text-2xl font-bold' : isCount ? 'text-2xl font-semibold' : 'text-xl font-semibold'
        }`}
      >
        {value}
      </div>
    </div>
  );
};

export default PayrollSummary;
