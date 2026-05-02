/**
 * @file frontend/src/components/dashboard/AttendanceSummary.jsx
 * @description Daily attendance summary widget — present/absent/late counts, percentage bars, recent check-ins, and prior-day delta indicators
 * @author Dev A
 *
 * The widget consumes the dashboard service's
 * `counts.attendance_today` shape (present/absent/late/half_day/remote/total).
 * Recent check-ins and the prior-day comparison are optional — if the
 * caller doesn't supply them, those sub-panels gracefully hide.
 */

import { useMemo } from 'react';
import LoadingSpinner from '../common/LoadingSpinner';

/** Visual treatment per status — color tone + label. */
const STATUS_META = [
  { key: 'present',  label: 'Present',  bar: 'bg-emerald-500', tone: 'text-emerald-700' },
  { key: 'remote',   label: 'Remote',   bar: 'bg-sky-500',     tone: 'text-sky-700'    },
  { key: 'late',     label: 'Late',     bar: 'bg-amber-500',   tone: 'text-amber-700'  },
  { key: 'half_day', label: 'Half day', bar: 'bg-orange-400',  tone: 'text-orange-700' },
  { key: 'absent',   label: 'Absent',   bar: 'bg-rose-500',    tone: 'text-rose-700'   },
];

/** Format a HH:MM:SS time as HH:MM. */
const formatTime = (value) => {
  if (!value) return '—';
  const str = String(value);
  return str.length >= 5 ? str.slice(0, 5) : str;
};

/** Lightweight relative-time fallback ("2 min ago"). */
const formatRelative = (timestamp) => {
  if (!timestamp) return '—';
  const t = new Date(timestamp).getTime();
  if (!Number.isFinite(t)) return '—';
  const diffMin = Math.round((Date.now() - t) / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  return `${diffDay}d ago`;
};

/**
 * Format a percentage delta as `+12%` / `-3%` / `0%`. Returns null when the
 * input is not finite — callers can skip rendering when null.
 */
const formatDelta = (delta) => {
  const n = Number(delta);
  if (!Number.isFinite(n) || n === 0) return n === 0 ? '0%' : null;
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(0)}%`;
};

/**
 * Compute a percentage-change number from `current` vs `previous`. Returns
 * null when comparison isn't meaningful (e.g. previous is missing or zero).
 */
const computeDelta = (current, previous) => {
  if (previous == null || Number(previous) === 0) return null;
  return ((Number(current) - Number(previous)) / Number(previous)) * 100;
};

/**
 * AttendanceSummary — today's attendance breakdown widget.
 *
 * @param {Object} props
 * @param {Object} props.attendance - shape: { present, absent, late, half_day, remote, total }
 * @param {Object} [props.previous] - optional prior-day shape, same fields, drives delta pills
 * @param {Array<Object>} [props.recentCheckIns] - optional list of latest
 *   attendance rows; each: { id, first_name, last_name, ora_hyrjes, statusi, created_at }
 * @param {boolean} [props.loading=false]
 * @param {string} [props.title='Attendance today']
 * @returns {JSX.Element}
 */
const AttendanceSummary = ({
  attendance = {
    present: 0,
    absent: 0,
    late: 0,
    half_day: 0,
    remote: 0,
    total: 0,
  },
  previous = null,
  recentCheckIns = [],
  loading = false,
  title = 'Attendance today',
}) => {
  /**
   * Derive percentage + delta-vs-previous for each status. Memoized so
   * unrelated re-renders don't recompute the math.
   */
  const rows = useMemo(() => {
    const total = Number(attendance?.total) || 0;
    return STATUS_META.map((meta) => {
      const value = Number(attendance?.[meta.key]) || 0;
      const pct = total > 0 ? (value / total) * 100 : 0;
      const delta = previous
        ? computeDelta(value, Number(previous?.[meta.key]) || 0)
        : null;
      return { ...meta, value, pct, delta };
    });
  }, [attendance, previous]);

  /** Total today vs total yesterday — headline delta pill. */
  const totalDelta = useMemo(
    () => computeDelta(Number(attendance?.total) || 0, Number(previous?.total)),
    [attendance, previous]
  );

  /** Tone for the headline delta pill. */
  const totalDeltaTone =
    totalDelta == null
      ? 'bg-gray-50 text-gray-700 ring-gray-200'
      : totalDelta > 0
        ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
        : totalDelta < 0
          ? 'bg-rose-50 text-rose-700 ring-rose-200'
          : 'bg-gray-50 text-gray-700 ring-gray-200';

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">
            {Number(attendance?.total) || 0} total
          </span>
          {totalDelta != null && formatDelta(totalDelta) && (
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ${totalDeltaTone}`}
            >
              {formatDelta(totalDelta)} vs yesterday
            </span>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <LoadingSpinner />
        </div>
      ) : (
        <>
          {/* Status breakdown rows */}
          <ul className="space-y-2.5">
            {rows.map((row) => (
              <li key={row.key} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`inline-block h-2.5 w-2.5 rounded-full shrink-0 ${row.bar}`}
                    />
                    <span className="text-gray-700">{row.label}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`font-semibold ${row.tone}`}>
                      {row.value}
                    </span>
                    <span className="text-xs text-gray-500 w-10 text-right tabular-nums">
                      {row.pct.toFixed(0)}%
                    </span>
                    {row.delta != null && formatDelta(row.delta) && (
                      <span
                        className={`text-[10px] font-medium w-10 text-right ${
                          row.delta > 0
                            ? 'text-emerald-700'
                            : row.delta < 0
                              ? 'text-rose-700'
                              : 'text-gray-500'
                        }`}
                      >
                        {formatDelta(row.delta)}
                      </span>
                    )}
                  </div>
                </div>
                <div className="h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
                  <div
                    className={`${row.bar} h-1.5 rounded-full transition-all`}
                    style={{ width: `${Math.max(row.pct, row.value > 0 ? 4 : 0)}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>

          {/* Recent check-ins (optional) */}
          {recentCheckIns.length > 0 && (
            <div className="mt-5 pt-4 border-t border-gray-100">
              <h4 className="text-xs uppercase tracking-wide font-medium text-gray-500 mb-2">
                Recent check-ins
              </h4>
              <ul className="divide-y divide-gray-100">
                {recentCheckIns.slice(0, 5).map((row) => {
                  const meta =
                    STATUS_META.find(
                      (m) =>
                        m.key === row.statusi ||
                        m.key === String(row.statusi).replace('-', '_')
                    ) || STATUS_META[0];
                  return (
                    <li
                      key={row.id || `${row.first_name}-${row.created_at}`}
                      className="py-2 flex items-center gap-3"
                    >
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-gray-700 text-xs font-semibold">
                        {(row.first_name?.[0] || '?')}
                        {(row.last_name?.[0] || '')}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {row.first_name} {row.last_name}
                        </p>
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                          <span
                            className={`inline-block h-1.5 w-1.5 rounded-full ${meta.bar}`}
                          />
                          <span className="capitalize">{row.statusi}</span>
                          {row.ora_hyrjes && (
                            <span className="font-mono">
                              · in {formatTime(row.ora_hyrjes)}
                            </span>
                          )}
                        </div>
                      </div>
                      <span className="text-[10px] text-gray-400 shrink-0">
                        {formatRelative(row.created_at)}
                      </span>
                    </li>
                  );
                })}
              </ul>
              {recentCheckIns.length > 5 && (
                <p className="mt-2 text-[11px] text-gray-500">
                  +{recentCheckIns.length - 5} more
                </p>
              )}
            </div>
          )}

          {/* Empty-state — no attendance data at all */}
          {(Number(attendance?.total) || 0) === 0 && !loading && (
            <p className="mt-3 text-xs text-gray-500 text-center">
              No attendance recorded yet today.
            </p>
          )}
        </>
      )}
    </div>
  );
};

export default AttendanceSummary;
