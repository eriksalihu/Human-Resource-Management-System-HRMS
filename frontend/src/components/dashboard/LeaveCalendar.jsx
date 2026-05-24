/**
 * @file frontend/src/components/dashboard/LeaveCalendar.jsx
 * @description Mini month-grid widget highlighting approved leaves with colored dots per leave type, upcoming-leaves list, and prev/next month navigation
 * @author Dev B
 *
 * Dashboard-sized counterpart to the larger calendar inside `LeavesPage`.
 * Pulls a 60-day window via leaveRequestApi and renders:
 *   - 6×7 month grid (Mon-first), with up to 3 colored dots per day
 *     representing the leave type(s) overlapping that day
 *   - "Upcoming this month" list — soonest leaves first
 *   - Prev / Today / Next month navigation
 *
 * Scope-aware: HR / Admin see org-wide leaves via `getAll`; everyone else
 * sees only their own via `getMyRequests`. Cancelled / rejected requests
 * are filtered out so the widget reflects "what's actually happening".
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import * as leaveRequestApi from '../../api/leaveRequestApi';
import { useToast } from '../common/Toast';
import useAuth from '../../hooks/useAuth';

/**
 * Layout-matched calendar skeleton — 6×7 grid of day cells plus a short
 * upcoming-list placeholder. Reserves the widget's footprint so the
 * dashboard doesn't shift when data arrives.
 */
const LeaveCalendarSkeleton = () => (
  <div
    className="animate-pulse space-y-3"
    aria-busy="true"
    aria-label="Loading leave calendar"
  >
    {/* Weekday row */}
    <div className="grid grid-cols-7 gap-1">
      {[0, 1, 2, 3, 4, 5, 6].map((i) => (
        <div key={i} className="h-3 rounded bg-gray-100" />
      ))}
    </div>
    {/* Day cells */}
    <div className="grid grid-cols-7 gap-1">
      {Array.from({ length: 42 }).map((_, i) => (
        <div
          key={i}
          className="aspect-square rounded bg-gray-100 flex items-center justify-center"
        >
          {/* Random-ish dots so it doesn't look uniform */}
          {(i * 7) % 11 === 0 && (
            <span className="h-1.5 w-1.5 rounded-full bg-gray-300" />
          )}
        </div>
      ))}
    </div>
    {/* "Upcoming" list */}
    <div className="pt-3 mt-3 border-t border-gray-100 space-y-2">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-gray-200" />
          <div className="h-3 flex-1 rounded bg-gray-100" />
          <div className="h-3 w-16 rounded bg-gray-100" />
        </div>
      ))}
    </div>
  </div>
);

/** Roles that get the org-wide view (everyone else sees their own). */
const HR_ROLES = ['Admin', 'HR Manager', 'Department Manager'];

/** Tailwind colors per leave type — drives the dots and the legend. */
const TYPE_COLORS = {
  annual:    { dot: 'bg-indigo-50',  text: 'text-indigo-700',  label: 'Annual' },
  sick:      { dot: 'bg-rose-50',    text: 'text-rose-700',    label: 'Sick' },
  personal:  { dot: 'bg-sky-500',     text: 'text-sky-700',     label: 'Personal' },
  maternity: { dot: 'bg-pink-500',    text: 'text-pink-700',    label: 'Maternity' },
  paternity: { dot: 'bg-purple-500',  text: 'text-purple-700',  label: 'Paternity' },
  unpaid:    { dot: 'bg-gray-50',    text: 'text-gray-700',    label: 'Unpaid' },
};

/** ISO YYYY-MM-DD for a Date object. */
const isoDate = (d) => d.toISOString().slice(0, 10);

/** Same-day-or-after / -or-before comparison on YYYY-MM-DD strings. */
const dayInRange = (day, start, end) => day >= start && day <= end;

/**
 * Build a 6×7 grid of Date objects covering a month, padded with leading
 * and trailing days. Week starts on Monday (Albania locale convention).
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

/** Format a date as DD/MM. */
const formatShort = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' });
};

/**
 * LeaveCalendar — dashboard mini-calendar widget.
 *
 * @param {Object} props
 * @param {'mine'|'all'|'auto'} [props.scope='auto'] - Data scope. 'auto'
 *   picks org-wide for HR roles and self otherwise. 'mine' / 'all' lock it.
 * @param {Date}   [props.initialMonth] - Defaults to current month
 * @param {Function} [props.onSelectDay] - Called with (YYYY-MM-DD, dayLeaves[])
 * @param {string} [props.title='Leave calendar']
 * @returns {JSX.Element}
 */
const LeaveCalendar = ({
  scope = 'auto',
  initialMonth,
  onSelectDay,
  title = 'Leave calendar',
}) => {
  const { user } = useAuth() || {};
  const isHR = (user?.roles || []).some((r) => HR_ROLES.includes(r));

  /** Resolve the effective scope. */
  const effectiveScope = useMemo(() => {
    if (scope === 'mine' || scope === 'all') return scope;
    return isHR ? 'all' : 'mine';
  }, [scope, isHR]);

  const today = useMemo(() => new Date(), []);
  const start = initialMonth || today;

  const [year, setYear] = useState(start.getFullYear());
  const [monthIndex, setMonthIndex] = useState(start.getMonth());
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const { addToast } = useToast();

  /** Pre-build the grid once per month change. */
  const cells = useMemo(
    () => buildMonthGrid(year, monthIndex),
    [year, monthIndex]
  );
  const rangeStart = isoDate(cells[0]);
  const rangeEnd = isoDate(cells[cells.length - 1]);

  /** Fetch leave rows for the visible window. */
  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (effectiveScope === 'all') {
        const result = await leaveRequestApi.getAll({
          page: 1,
          limit: 100,
          from_date: rangeStart,
          to_date: rangeEnd,
        });
        setRows(result?.data || []);
      } else {
        const result = await leaveRequestApi.getMyRequests();
        setRows(result?.requests || []);
      }
    } catch (err) {
      addToast(
        err.response?.data?.message || 'Failed to load leave calendar',
        'error'
      );
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [effectiveScope, rangeStart, rangeEnd, addToast]);

  useEffect(() => {
    load();
  }, [load]);

  /**
   * Build a Map of YYYY-MM-DD → leaves overlapping that day. Filters out
   * cancelled / rejected so the widget reflects active plans.
   */
  const leavesByDay = useMemo(() => {
    const map = new Map();
    for (const cell of cells) map.set(isoDate(cell), []);

    const ignoredStatuses = new Set(['cancelled', 'rejected']);
    for (const lr of rows) {
      if (ignoredStatuses.has(lr.statusi)) continue;
      const s = String(lr.data_fillimit).slice(0, 10);
      const e = String(lr.data_perfundimit).slice(0, 10);
      for (const cell of cells) {
        const day = isoDate(cell);
        if (dayInRange(day, s, e)) {
          map.get(day).push(lr);
        }
      }
    }
    return map;
  }, [rows, cells]);

  /**
   * Distinct leave types active across the visible month — drives the
   * tiny legend and avoids showing dot colors for types that never appear.
   */
  const activeTypes = useMemo(() => {
    const set = new Set();
    for (const cell of cells) {
      if (cell.getMonth() !== monthIndex) continue;
      for (const lr of leavesByDay.get(isoDate(cell)) || []) {
        if (lr.lloji) set.add(lr.lloji);
      }
    }
    return [...set];
  }, [leavesByDay, cells, monthIndex]);

  /**
   * Upcoming leaves visible in the current month — soonest first. Filtered
   * to leaves whose start date is in the visible month and on/after today,
   * so the panel shows "what's coming up" rather than past entries.
   */
  const upcoming = useMemo(() => {
    const todayIso = isoDate(today);
    const monthStart = isoDate(new Date(year, monthIndex, 1));
    const monthEnd = isoDate(new Date(year, monthIndex + 1, 0));

    const activeStatuses = new Set(['approved', 'pending']);
    return rows
      .filter((lr) => activeStatuses.has(lr.statusi))
      .filter((lr) => {
        const s = String(lr.data_fillimit).slice(0, 10);
        // Show if it starts in this month and at-or-after today.
        return s >= monthStart && s <= monthEnd && s >= todayIso;
      })
      .sort((a, b) =>
        String(a.data_fillimit).localeCompare(String(b.data_fillimit))
      )
      .slice(0, 5);
  }, [rows, year, monthIndex, today]);

  const stepMonth = (delta) => {
    const next = new Date(year, monthIndex + delta, 1);
    setYear(next.getFullYear());
    setMonthIndex(next.getMonth());
  };
  const goToToday = () => {
    setYear(today.getFullYear());
    setMonthIndex(today.getMonth());
  };

  const monthLabel = new Date(year, monthIndex, 1).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
  });

  const weekdayLabels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

  /**
   * Click handler — surfaces the day + its leaves to the parent so the
   * dashboard can deep-link to /leaves with that day pre-filtered.
   */
  const handleDayClick = (day, dayLeaves) => {
    if (onSelectDay) onSelectDay(day, dayLeaves);
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
          <p className="text-xs text-gray-500">{monthLabel}</p>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => stepMonth(-1)}
            className="px-2 py-1 text-xs font-medium rounded-md bg-white border border-gray-300 text-gray-700 hover:bg-gray-50"
            aria-label="Previous month"
          >
            ←
          </button>
          <button
            type="button"
            onClick={goToToday}
            className="px-2 py-1 text-xs font-medium rounded-md bg-white border border-gray-300 text-gray-700 hover:bg-gray-50"
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => stepMonth(1)}
            className="px-2 py-1 text-xs font-medium rounded-md bg-white border border-gray-300 text-gray-700 hover:bg-gray-50"
            aria-label="Next month"
          >
            →
          </button>
        </div>
      </div>

      {/* Legend (only types that appear this month) */}
      {activeTypes.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {activeTypes.map((t) => {
            const meta = TYPE_COLORS[t] || TYPE_COLORS.unpaid;
            return (
              <span
                key={t}
                className="inline-flex items-center gap-1 text-[10px] text-gray-600"
              >
                <span className={`inline-block h-2 w-2 rounded-full ${meta.dot}`} />
                {meta.label}
              </span>
            );
          })}
        </div>
      )}

      {/* Body */}
      {loading ? (
        <LeaveCalendarSkeleton />
      ) : (
        <>
          {/* Weekday header */}
          <div className="grid grid-cols-7 text-[10px] font-semibold uppercase tracking-wide text-gray-500 mb-1">
            {weekdayLabels.map((d, idx) => (
              <div key={`${d}-${idx}`} className="px-0 py-1 text-center">
                {d}
              </div>
            ))}
          </div>

          {/* Day cells */}
          <div className="grid grid-cols-7 gap-px bg-gray-100 rounded-md overflow-hidden">
            {cells.map((cell) => {
              const day = isoDate(cell);
              const inMonth = cell.getMonth() === monthIndex;
              const isToday = day === isoDate(today);
              const dayLeaves = leavesByDay.get(day) || [];

              // Up to 3 distinct dots per day (one per type), then "+N" for overflow.
              const types = [];
              for (const lr of dayLeaves) {
                if (lr.lloji && !types.includes(lr.lloji)) types.push(lr.lloji);
              }
              const visibleTypes = types.slice(0, 3);
              const extra = Math.max(0, types.length - visibleTypes.length);

              return (
                <button
                  type="button"
                  key={day}
                  onClick={() => handleDayClick(day, dayLeaves)}
                  className={`relative aspect-square text-[11px] flex flex-col items-center justify-center transition-colors ${
                    inMonth ? 'bg-white' : 'bg-gray-50 text-gray-400'
                  } ${dayLeaves.length > 0 ? 'hover:bg-indigo-50' : 'hover:bg-gray-50'} focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500`}
                  aria-label={
                    dayLeaves.length > 0
                      ? `${day}: ${dayLeaves.length} leave${dayLeaves.length === 1 ? '' : 's'}`
                      : day
                  }
                  title={
                    dayLeaves.length > 0
                      ? dayLeaves
                          .slice(0, 4)
                          .map(
                            (lr) =>
                              `${lr.first_name || ''} ${lr.last_name || ''} — ${lr.lloji} (${lr.statusi})`.trim()
                          )
                          .join('\n') +
                        (dayLeaves.length > 4
                          ? `\n+${dayLeaves.length - 4} more`
                          : '')
                      : ''
                  }
                >
                  <span
                    className={`${
                      isToday
                        ? 'inline-flex items-center justify-center w-5 h-5 rounded-full bg-indigo-600 text-white font-semibold'
                        : 'font-medium'
                    } ${inMonth ? '' : 'opacity-60'}`}
                  >
                    {cell.getDate()}
                  </span>
                  {visibleTypes.length > 0 && (
                    <span className="mt-1 flex items-center gap-0.5">
                      {visibleTypes.map((t) => (
                        <span
                          key={t}
                          className={`inline-block h-1.5 w-1.5 rounded-full ${
                            (TYPE_COLORS[t] || TYPE_COLORS.unpaid).dot
                          }`}
                        />
                      ))}
                      {extra > 0 && (
                        <span className="text-[8px] text-gray-500 ml-0.5">
                          +{extra}
                        </span>
                      )}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Upcoming-this-month list */}
          <div className="mt-4 pt-3 border-t border-gray-100">
            <h4 className="text-xs uppercase tracking-wide font-medium text-gray-500 mb-2">
              Upcoming this month
            </h4>
            {upcoming.length === 0 ? (
              <p className="text-xs text-gray-500">
                Nothing on the calendar for the rest of this month.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {upcoming.map((lr) => {
                  const meta = TYPE_COLORS[lr.lloji] || TYPE_COLORS.unpaid;
                  return (
                    <li
                      key={lr.id}
                      className="flex items-center gap-2 text-xs"
                    >
                      <span
                        className={`inline-block h-2 w-2 rounded-full shrink-0 ${meta.dot}`}
                      />
                      <span className="text-gray-700 truncate flex-1">
                        {effectiveScope === 'all' && (lr.first_name || lr.last_name)
                          ? `${lr.last_name || ''}${lr.last_name ? ', ' : ''}${
                              lr.first_name || ''
                            } — `
                          : ''}
                        <span className={`capitalize font-medium ${meta.text}`}>
                          {lr.lloji}
                        </span>
                      </span>
                      <span className="text-gray-500 font-mono shrink-0">
                        {formatShort(lr.data_fillimit)} → {formatShort(lr.data_perfundimit)}
                      </span>
                      {lr.statusi === 'pending' && (
                        <span className="inline-flex items-center rounded-full px-1.5 py-0 text-[9px] font-medium bg-yellow-50 text-yellow-800 ring-1 ring-inset ring-yellow-200">
                          pending
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default LeaveCalendar;
