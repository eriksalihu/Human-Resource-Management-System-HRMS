/**
 * @file frontend/src/components/attendance/AttendanceCalendar.jsx
 * @description Monthly calendar grid visualizing per-day attendance status with color-coded cells, month navigation, and legend
 * @author Dev B
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import * as attendanceApi from '../../api/attendanceApi';
import * as employeeApi from '../../api/employeeApi';
import LoadingSpinner from '../common/LoadingSpinner';
import { useToast } from '../common/Toast';

/** Tailwind cell classes per attendance status (background + text). */
const STATUS_CELL_CLASS = {
  present: 'bg-green-100 text-green-900 ring-green-200',
  absent: 'bg-red-100 text-red-900 ring-red-200',
  late: 'bg-yellow-100 text-yellow-900 ring-yellow-200',
  'half-day': 'bg-amber-100 text-amber-900 ring-amber-200',
  remote: 'bg-blue-100 text-blue-900 ring-blue-200',
};

/** Legend entries (label + cell class). */
const LEGEND = [
  { status: 'present', label: 'Present' },
  { status: 'absent', label: 'Absent' },
  { status: 'late', label: 'Late' },
  { status: 'half-day', label: 'Half day' },
  { status: 'remote', label: 'Remote' },
];

/** ISO YYYY-MM-DD for a Date object. */
const isoDate = (d) => d.toISOString().slice(0, 10);

/**
 * Build a 6×7 grid of Date objects covering the given month, padded with
 * leading/trailing days from adjacent months. Week starts on Monday.
 */
const buildMonthGrid = (year, monthIndex) => {
  const firstOfMonth = new Date(year, monthIndex, 1);
  const offset = (firstOfMonth.getDay() + 6) % 7; // Mon=0
  const start = new Date(year, monthIndex, 1 - offset);
  const cells = [];
  for (let i = 0; i < 42; i += 1) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    cells.push(d);
  }
  return cells;
};

/** Format an HH:MM:SS string back to HH:MM. */
const formatTime = (value) => {
  if (!value) return '—';
  const str = String(value);
  return str.length >= 5 ? str.slice(0, 5) : str;
};

/** Decimal hours → "Hh MMm". */
const formatHours = (value) => {
  if (value == null) return '—';
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) return '—';
  const totalMinutes = Math.round(num * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${String(minutes).padStart(2, '0')}m`;
};

/**
 * AttendanceCalendar — month grid showing one cell per day, color-coded
 * by attendance status. Supports a single-employee scope ("my history" or
 * "selected employee") and an optional employee picker for HR/Admin views.
 *
 * @param {Object} props
 * @param {number} [props.employeeId] - Pin to a single employee. If omitted
 *                                      and `allowEmployeePicker` is true,
 *                                      the user can choose; otherwise the
 *                                      caller's own attendance is shown.
 * @param {boolean} [props.allowEmployeePicker=false] - HR / Admin only
 * @param {Date}    [props.initialMonth] - Defaults to current month
 * @returns {JSX.Element}
 */
const AttendanceCalendar = ({
  employeeId: pinnedEmployeeId,
  allowEmployeePicker = false,
  initialMonth,
}) => {
  const today = new Date();
  const start = initialMonth || today;

  const [year, setYear] = useState(start.getFullYear());
  const [monthIndex, setMonthIndex] = useState(start.getMonth());

  const [employees, setEmployees] = useState([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(
    pinnedEmployeeId || ''
  );

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const { addToast } = useToast();

  /** Pre-build the grid (memoized so legend renders / hover don't recompute). */
  const cells = useMemo(
    () => buildMonthGrid(year, monthIndex),
    [year, monthIndex]
  );

  /** First / last visible date for the month query window. */
  const rangeStart = isoDate(cells[0]);
  const rangeEnd = isoDate(cells[cells.length - 1]);

  /**
   * Load active employees once if the picker is enabled and no employee
   * was pinned by the parent.
   */
  useEffect(() => {
    if (!allowEmployeePicker || pinnedEmployeeId) return;
    let cancelled = false;
    const load = async () => {
      try {
        const result = await employeeApi.getAll({
          limit: 200,
          statusi: 'active',
        });
        if (!cancelled) setEmployees(result.data || []);
      } catch {
        if (!cancelled) setEmployees([]);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [allowEmployeePicker, pinnedEmployeeId]);

  /**
   * Fetch attendance for the active scope. We deliberately request 200
   * rows because a 6×7 grid maxes out at 42 days, so even a busy employee
   * fits in a single page.
   */
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { from_date: rangeStart, to_date: rangeEnd, limit: 200 };

      let attendance = [];
      if (pinnedEmployeeId) {
        const result = await attendanceApi.getByEmployee(
          pinnedEmployeeId,
          params
        );
        attendance = result.data || [];
      } else if (allowEmployeePicker && selectedEmployeeId) {
        const result = await attendanceApi.getByEmployee(
          selectedEmployeeId,
          params
        );
        attendance = result.data || [];
      } else {
        const result = await attendanceApi.getMyAttendance({
          from_date: rangeStart,
          to_date: rangeEnd,
        });
        attendance = result?.attendance || [];
      }

      setRows(attendance);
    } catch (err) {
      addToast(
        err.response?.data?.message || 'Failed to load attendance calendar',
        'error'
      );
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [
    rangeStart,
    rangeEnd,
    pinnedEmployeeId,
    selectedEmployeeId,
    allowEmployeePicker,
    addToast,
  ]);

  useEffect(() => {
    load();
  }, [load]);

  /** Map of YYYY-MM-DD → first matching attendance row for that day. */
  const byDate = useMemo(() => {
    const map = new Map();
    for (const row of rows) {
      const day = String(row.data).slice(0, 10);
      // If multiple rows for the same day exist (shouldn't, due to UNIQUE
      // constraint), keep the most recent one.
      if (!map.has(day)) map.set(day, row);
    }
    return map;
  }, [rows]);

  /** Step the month forward (+1) or back (-1). */
  const stepMonth = (delta) => {
    const next = new Date(year, monthIndex + delta, 1);
    setYear(next.getFullYear());
    setMonthIndex(next.getMonth());
  };

  /** Reset to current month. */
  const goToToday = () => {
    const now = new Date();
    setYear(now.getFullYear());
    setMonthIndex(now.getMonth());
  };

  const monthLabel = new Date(year, monthIndex, 1).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
  });

  const weekdayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  /** Aggregate counts for the month header (only counts cells in this month). */
  const monthCounts = useMemo(() => {
    const totals = { present: 0, absent: 0, late: 0, 'half-day': 0, remote: 0 };
    for (const cell of cells) {
      if (cell.getMonth() !== monthIndex) continue;
      const row = byDate.get(isoDate(cell));
      if (!row) continue;
      if (totals[row.statusi] != null) totals[row.statusi] += 1;
    }
    return totals;
  }, [cells, byDate, monthIndex]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">{monthLabel}</h2>
          <p className="text-sm text-gray-500">
            {pinnedEmployeeId
              ? "Selected employee's attendance"
              : allowEmployeePicker && selectedEmployeeId
                ? "Selected employee's attendance"
                : 'Your attendance history'}
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          {allowEmployeePicker && !pinnedEmployeeId && (
            <div>
              <label
                htmlFor="cal-employee"
                className="block text-xs font-medium text-gray-700 mb-1"
              >
                Employee
              </label>
              <select
                id="cal-employee"
                value={selectedEmployeeId}
                onChange={(e) => setSelectedEmployeeId(e.target.value)}
                className="rounded-md border-gray-300 text-sm focus:border-indigo-500 focus:ring-indigo-500"
              >
                <option value="">My attendance</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.first_name} {e.last_name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => stepMonth(-1)}
              className="px-3 py-1.5 text-sm font-medium rounded-md bg-white border border-gray-300 text-gray-700 hover:bg-gray-50"
              aria-label="Previous month"
            >
              ← Prev
            </button>
            <button
              type="button"
              onClick={goToToday}
              className="px-3 py-1.5 text-sm font-medium rounded-md bg-white border border-gray-300 text-gray-700 hover:bg-gray-50"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => stepMonth(1)}
              className="px-3 py-1.5 text-sm font-medium rounded-md bg-white border border-gray-300 text-gray-700 hover:bg-gray-50"
              aria-label="Next month"
            >
              Next →
            </button>
          </div>
        </div>
      </div>

      {/* Legend + month totals */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2 text-xs">
          {LEGEND.map(({ status, label }) => (
            <span
              key={status}
              className={`inline-flex items-center px-2 py-0.5 rounded ring-1 ring-inset capitalize ${
                STATUS_CELL_CLASS[status] || ''
              }`}
            >
              {label}
            </span>
          ))}
        </div>
        <div className="flex flex-wrap gap-3 text-xs text-gray-600">
          <span>
            Present: <span className="font-semibold">{monthCounts.present}</span>
          </span>
          <span>
            Late: <span className="font-semibold">{monthCounts.late}</span>
          </span>
          <span>
            Absent: <span className="font-semibold">{monthCounts.absent}</span>
          </span>
          <span>
            Remote: <span className="font-semibold">{monthCounts.remote}</span>
          </span>
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="flex justify-center py-10">
          <LoadingSpinner />
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          {/* Weekday header */}
          <div className="grid grid-cols-7 bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
            {weekdayLabels.map((d) => (
              <div key={d} className="px-2 py-2 text-center">
                {d}
              </div>
            ))}
          </div>
          {/* Day cells */}
          <div className="grid grid-cols-7">
            {cells.map((cell) => {
              const day = isoDate(cell);
              const inMonth = cell.getMonth() === monthIndex;
              const isToday = day === isoDate(today);
              const row = byDate.get(day);
              const cellTone = row
                ? STATUS_CELL_CLASS[row.statusi] || ''
                : '';

              const tooltip = row
                ? `${row.statusi}${
                    row.ora_hyrjes
                      ? ` — in ${formatTime(row.ora_hyrjes)}`
                      : ''
                  }${
                    row.ora_daljes
                      ? `, out ${formatTime(row.ora_daljes)}`
                      : ''
                  }${
                    row.hours_worked != null
                      ? ` (${formatHours(row.hours_worked)})`
                      : ''
                  }`
                : '';

              return (
                <div
                  key={day}
                  title={tooltip || undefined}
                  className={`min-h-[78px] border-t border-l border-gray-100 p-1.5 ${
                    inMonth ? 'bg-white' : 'bg-gray-50/60'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-xs ${
                        inMonth ? 'text-gray-900' : 'text-gray-400'
                      } ${
                        isToday
                          ? 'inline-flex items-center justify-center w-5 h-5 rounded-full bg-indigo-600 text-white font-semibold'
                          : 'font-medium'
                      }`}
                    >
                      {cell.getDate()}
                    </span>
                  </div>
                  {row && inMonth ? (
                    <div
                      className={`mt-1 rounded px-1.5 py-0.5 text-[10px] font-medium capitalize ring-1 ring-inset ${cellTone}`}
                    >
                      {row.statusi}
                      {row.hours_worked != null &&
                        row.statusi !== 'absent' && (
                          <div className="text-[10px] font-mono opacity-80 mt-0.5">
                            {formatHours(row.hours_worked)}
                          </div>
                        )}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default AttendanceCalendar;
