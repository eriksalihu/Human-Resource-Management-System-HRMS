/**
 * @file frontend/src/pages/AttendancePage.jsx
 * @description Attendance page with list / calendar view toggle, quick check-in & check-out, and monthly report CSV export
 * @author Dev B
 */

import { useState, useEffect, useCallback } from 'react';
import * as attendanceApi from '../api/attendanceApi';
import AttendanceList from '../components/attendance/AttendanceList';
import AttendanceForm from '../components/attendance/AttendanceForm';
import AttendanceCalendar from '../components/attendance/AttendanceCalendar';
import Modal from '../components/common/Modal';
import { useToast } from '../components/common/Toast';
import useAuth from '../hooks/useAuth';

/** Roles allowed to create / edit / delete attendance records. */
const HR_ROLES = ['Admin', 'HR Manager'];

/** Top-level view modes. */
const VIEWS = {
  LIST: 'list',
  CALENDAR: 'calendar',
};

const VIEW_META = [
  { id: VIEWS.LIST, label: 'List' },
  { id: VIEWS.CALENDAR, label: 'Calendar' },
];

/** Month options for the report exporter. */
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

/** Year options — current year and the five previous years. */
const buildYearOptions = () => {
  const now = new Date().getFullYear();
  const years = [];
  for (let y = now; y >= now - 5; y -= 1) {
    years.push(y);
  }
  return years;
};

/** Escape a CSV cell (wrap in quotes if it contains delimiters). */
const csvCell = (value) => {
  if (value == null) return '';
  const str = String(value);
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
};

/**
 * AttendancePage — main attendance module orchestrator.
 *
 * - Quick check-in / check-out for the authenticated employee
 * - View toggle: list (DataTable) vs. calendar (color-coded grid)
 * - Modal create / edit for HR / Admin
 * - Monthly report CSV export for HR / Admin
 *
 * @returns {JSX.Element}
 */
const AttendancePage = () => {
  const { user } = useAuth() || {};
  const isHR = (user?.roles || []).some((r) => HR_ROLES.includes(r));

  const [view, setView] = useState(VIEWS.LIST);

  // Quick check-in / out state
  const [punching, setPunching] = useState(false);

  // Modal form state
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState('create'); // 'create' | 'edit'
  const [formInitialData, setFormInitialData] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Monthly report exporter state
  const today = new Date();
  const [reportMonth, setReportMonth] = useState(today.getMonth() + 1);
  const [reportYear, setReportYear] = useState(today.getFullYear());
  const [exporting, setExporting] = useState(false);

  // List refresh key
  const [refreshKey, setRefreshKey] = useState(0);
  const refreshList = useCallback(() => setRefreshKey((k) => k + 1), []);

  const { addToast } = useToast();

  /**
   * Quick check-in. Server creates today's row if missing or fills the
   * `ora_hyrjes` field on an existing row.
   */
  const handleCheckIn = async () => {
    setPunching(true);
    try {
      const result = await attendanceApi.checkIn();
      if (result?.alreadyCheckedIn) {
        addToast("You're already checked in today", 'info');
      } else {
        addToast('Checked in', 'success');
      }
      refreshList();
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to check in';
      addToast(msg, 'error');
    } finally {
      setPunching(false);
    }
  };

  /**
   * Quick check-out. Server fills `ora_daljes` on today's row.
   */
  const handleCheckOut = async () => {
    setPunching(true);
    try {
      await attendanceApi.checkOut();
      addToast('Checked out', 'success');
      refreshList();
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to check out';
      addToast(msg, 'error');
    } finally {
      setPunching(false);
    }
  };

  /** Open the create modal. */
  const handleAdd = () => {
    setFormMode('create');
    setFormInitialData(null);
    setFormOpen(true);
  };

  /** Open the edit modal. */
  const handleEdit = (row) => {
    setFormMode('edit');
    setFormInitialData(row);
    setFormOpen(true);
  };

  const handleFormCancel = () => {
    setFormOpen(false);
    setFormInitialData(null);
  };

  /** Submit handler for the create / edit modal. */
  const handleFormSubmit = async (payload) => {
    setSubmitting(true);
    try {
      if (formMode === 'edit' && formInitialData?.id) {
        await attendanceApi.update(formInitialData.id, payload);
        addToast('Attendance record updated', 'success');
      } else {
        await attendanceApi.create(payload);
        addToast('Attendance record created', 'success');
      }
      setFormOpen(false);
      setFormInitialData(null);
      refreshList();
    } catch (err) {
      const msg =
        err.response?.data?.message ||
        `Failed to ${formMode === 'edit' ? 'update' : 'create'} record`;
      addToast(msg, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  /**
   * Pull the monthly report from the API and serialize it as a downloadable
   * CSV. Each row is one employee's monthly summary.
   */
  const handleExport = async () => {
    setExporting(true);
    try {
      const result = await attendanceApi.getMonthlyReport({
        year: reportYear,
        month: reportMonth,
      });
      const report = result?.report || [];

      if (report.length === 0) {
        addToast('No attendance data for the selected month', 'info');
        return;
      }

      const header = [
        'Employee #',
        'Name',
        'Department',
        'Days present',
        'Days absent',
        'Days late',
        'Half days',
        'Remote days',
        'Total hours',
      ];
      const rows = report.map((r) => [
        r.numri_punonjesit || '',
        `${r.first_name || ''} ${r.last_name || ''}`.trim(),
        r.department_emertimi || '',
        r.days_present ?? 0,
        r.days_absent ?? 0,
        r.days_late ?? 0,
        r.days_half ?? 0,
        r.days_remote ?? 0,
        r.total_hours != null ? Number(r.total_hours).toFixed(2) : '0.00',
      ]);

      const csv = [header, ...rows]
        .map((cols) => cols.map(csvCell).join(','))
        .join('\n');

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `attendance_${reportYear}_${String(reportMonth).padStart(
        2,
        '0'
      )}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      addToast(`Exported ${report.length} employee summaries`, 'success');
    } catch (err) {
      const msg =
        err.response?.data?.message || 'Failed to export monthly report';
      addToast(msg, 'error');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Attendance</h1>
          <p className="text-sm text-gray-500">
            Daily check-ins, monthly visualization, and HR reporting
          </p>
        </div>

        {/* Quick punch */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleCheckIn}
            disabled={punching}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
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
                d="M5 13l4 4L19 7"
              />
            </svg>
            Check in
          </button>
          <button
            type="button"
            onClick={handleCheckOut}
            disabled={punching}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md bg-gray-700 text-white hover:bg-gray-800 disabled:opacity-50"
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
                d="M17 16l4-4m0 0l-4-4m4 4H7"
              />
            </svg>
            Check out
          </button>
        </div>
      </div>

      {/* View toggle + HR-only export panel */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        {/* View toggle */}
        <div
          role="tablist"
          aria-label="View"
          className="inline-flex rounded-md shadow-sm bg-white border border-gray-200 p-0.5"
        >
          {VIEW_META.map((v) => {
            const isActive = view === v.id;
            return (
              <button
                key={v.id}
                role="tab"
                aria-selected={isActive}
                onClick={() => setView(v.id)}
                className={`px-3 py-1.5 text-sm font-medium rounded transition-colors ${
                  isActive
                    ? 'bg-indigo-600 text-white'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                {v.label}
              </button>
            );
          })}
        </div>

        {/* Monthly report exporter (HR / Admin only) */}
        {isHR && (
          <div className="flex flex-wrap items-end gap-2 bg-white border border-gray-200 rounded-md p-2">
            <div>
              <label
                htmlFor="report-month"
                className="block text-xs font-medium text-gray-700 mb-0.5"
              >
                Month
              </label>
              <select
                id="report-month"
                value={reportMonth}
                onChange={(e) => setReportMonth(parseInt(e.target.value, 10))}
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
                htmlFor="report-year"
                className="block text-xs font-medium text-gray-700 mb-0.5"
              >
                Year
              </label>
              <select
                id="report-year"
                value={reportYear}
                onChange={(e) => setReportYear(parseInt(e.target.value, 10))}
                className="rounded-md border-gray-300 text-sm focus:border-indigo-500 focus:ring-indigo-500"
              >
                {buildYearOptions().map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={handleExport}
              disabled={exporting}
              className="h-9 px-3 text-sm font-medium rounded-md bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {exporting ? 'Exporting…' : 'Export monthly CSV'}
            </button>
          </div>
        )}
      </div>

      {/* Body — list or calendar */}
      {view === VIEWS.LIST &&
        (isHR ? (
          <AttendanceList
            key={refreshKey}
            onAdd={handleAdd}
            onEdit={handleEdit}
          />
        ) : (
          // Non-HR: read-only list, no add/edit/delete buttons
          <AttendanceList
            key={refreshKey}
            showAddButton={false}
            onAdd={undefined}
            onEdit={undefined}
            onDelete={undefined}
          />
        ))}

      {view === VIEWS.CALENDAR && (
        <AttendanceCalendar
          key={refreshKey}
          allowEmployeePicker={isHR}
        />
      )}

      {/* Create / Edit modal */}
      <Modal
        isOpen={formOpen}
        onClose={handleFormCancel}
        title={
          formMode === 'edit'
            ? 'Edit Attendance Record'
            : 'Create Attendance Record'
        }
        size="lg"
      >
        <AttendanceForm
          initialData={formInitialData}
          onSubmit={handleFormSubmit}
          onCancel={handleFormCancel}
          submitting={submitting}
        />
      </Modal>
    </div>
  );
};

export default AttendancePage;
