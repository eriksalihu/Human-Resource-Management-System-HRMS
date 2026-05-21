/**
 * @file frontend/src/pages/DashboardPage.jsx
 * @description Main dashboard composing StatCards row, charts grid, attendance summary, leave calendar, and recent activities in a responsive layout
 * @author Dev A
 *
 * Responsive grid layout (commit 239):
 *
 *                        mobile     sm (640)    md (768)    lg (1024)
 *   ─────────────────────────────────────────────────────────────────
 *   KPI strip            1 col      2 cols      2 cols      4 cols
 *   Charts row           1 col      1 col       1 col       2 cols
 *   Advanced analytics   1 col      1 col       2 cols      2 cols
 *   Lower row            1 col      1 col       2 cols      3 cols
 *
 * Widget priority on small viewports:
 *   The "Attendance today" KPI and the live AttendanceSummary widget
 *   are reordered to appear first on phone-sized screens — daily HR
 *   attendance is the most operationally-urgent surface; charts and
 *   activity feeds matter less in a quick mobile glance.
 *
 * Container width:
 *   `max-w-7xl mx-auto` caps the dashboard at ~1280px on ultra-wide
 *   monitors so the cards don't stretch into uncomfortable widths.
 *   Padding is responsive (`p-4 sm:p-6`) — phones get tighter margins.
 */

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axiosInstance from '../api/axiosInstance';
import * as dashboardApi from '../api/dashboardApi';
import * as attendanceApi from '../api/attendanceApi';
import StatCard from '../components/dashboard/StatCard';
import EmployeeChart from '../components/dashboard/EmployeeChart';
import DepartmentOverview from '../components/dashboard/DepartmentOverview';
import AttendanceSummary from '../components/dashboard/AttendanceSummary';
import LeaveCalendar from '../components/dashboard/LeaveCalendar';
import RecentActivities from '../components/dashboard/RecentActivities';
import LoadingSpinner from '../components/common/LoadingSpinner';
import { useToast } from '../components/common/Toast';
import useAuth from '../hooks/useAuth';

/** Roles that may see payroll-sensitive widgets / KPIs. */
const HR_ROLES = ['Admin', 'HR Manager'];

/** Time-of-day greeting based on the local hour. */
const greetingFor = (date = new Date()) => {
  const h = date.getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
};

/** EUR currency formatter — matches the salaries page style. */
const formatCurrency = (value) => {
  if (value == null || Number.isNaN(Number(value))) return '€0';
  const num = Number(value);
  if (Math.abs(num) >= 1_000_000) {
    return `€${(num / 1_000_000).toFixed(2)}M`;
  }
  if (Math.abs(num) >= 1_000) {
    return `€${(num / 1_000).toFixed(1)}k`;
  }
  return `€${num.toFixed(0)}`;
};

/**
 * Map a numeric month back to its English label so the payroll card has
 * a friendly subtitle.
 */
const MONTH_LABELS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/**
 * DashboardPage — top-level dashboard.
 *
 * Layout (responsive):
 *   ┌────────────────────────────────────────────────────────────┐
 *   │ Stat cards row (4 across on lg, 2 on md, 1 on mobile)       │
 *   ├──────────────────────┬─────────────────────────────────────┤
 *   │ EmployeeChart         │ DepartmentOverview                  │
 *   ├──────────────────────┴─────────────────────────────────────┤
 *   │ AttendanceSummary │ LeaveCalendar │ RecentActivities         │
 *   └────────────────────────────────────────────────────────────┘
 *
 * @returns {JSX.Element}
 */
const DashboardPage = () => {
  const { user } = useAuth() || {};
  const isHR = (user?.roles || []).some((r) => HR_ROLES.includes(r));
  const navigate = useNavigate();

  const [overview, setOverview] = useState(null);
  const [charts, setCharts] = useState(null);
  const [recentCheckIns, setRecentCheckIns] = useState([]);
  const [loading, setLoading] = useState(true);
  // System health: 'checking' | 'ok' | 'degraded'. Drives the status dot.
  const [health, setHealth] = useState('checking');

  const { addToast } = useToast();

  /**
   * One-shot system-health probe for the status indicator. Best-effort:
   * any failure (incl. the 503 the endpoint returns when the DB is
   * down) reads as "degraded".
   */
  useEffect(() => {
    let cancelled = false;
    axiosInstance
      .get('/health')
      .then((res) => {
        if (!cancelled) {
          setHealth(res.data?.database === 'connected' ? 'ok' : 'degraded');
        }
      })
      .catch(() => {
        if (!cancelled) setHealth('degraded');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /** Quick actions — role-aware. Everyone can submit leave / check in;
   *  only HR/Admin get the "Add employee" shortcut. */
  const quickActions = [
    ...(isHR
      ? [
          {
            label: 'Add employee',
            to: '/employees',
            icon: 'M12 4v16m8-8H4',
          },
        ]
      : []),
    {
      label: 'Submit leave',
      to: '/leaves',
      icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
    },
    {
      label: 'Check in',
      to: '/attendance',
      icon: 'M5 13l4 4L19 7',
    },
  ];

  /**
   * Load every read-only dashboard payload in parallel. Failures on any
   * single call don't break the others — each section degrades gracefully
   * to its empty / loading state.
   */
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);

      const [overviewRes, chartsRes, attendanceRes] = await Promise.allSettled([
        dashboardApi.getOverview(),
        dashboardApi.getCharts({ trend_days: 14, leave_days: 90 }),
        attendanceApi.getAll({
          page: 1,
          limit: 5,
          sortBy: 'created_at',
          sortOrder: 'DESC',
        }),
      ]);

      if (cancelled) return;

      if (overviewRes.status === 'fulfilled') {
        setOverview(overviewRes.value);
      } else {
        addToast(
          overviewRes.reason?.response?.data?.message ||
            'Failed to load dashboard headlines',
          'error'
        );
      }

      if (chartsRes.status === 'fulfilled') {
        setCharts(chartsRes.value);
      } else {
        addToast(
          chartsRes.reason?.response?.data?.message ||
            'Failed to load chart data',
          'error'
        );
      }

      if (attendanceRes.status === 'fulfilled') {
        setRecentCheckIns(attendanceRes.value?.data || []);
      } else {
        // Non-critical — just log; the widget hides the panel when empty.
        console.error(
          '[DashboardPage] Failed to load recent check-ins:',
          attendanceRes.reason?.message || attendanceRes.reason
        );
      }

      setLoading(false);
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [addToast]);

  const counts = overview?.counts || null;
  const attendanceToday = counts?.attendance_today || null;
  const payroll = overview?.payroll || null;

  /** Attendance % present (today) — drives the attendance card subtitle. */
  const attendancePresentPct = useMemo(() => {
    if (!attendanceToday || !attendanceToday.total) return null;
    return Math.round(
      ((attendanceToday.present + attendanceToday.remote) /
        attendanceToday.total) *
        100
    );
  }, [attendanceToday]);

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-7xl mx-auto w-full">
      {/* Header — personalized greeting, system-health dot, quick actions */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 truncate">
              {greetingFor()}
              {user?.first_name ? `, ${user.first_name}` : ''}
            </h1>
            {/* System health indicator */}
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset
                bg-gray-50 text-gray-600 ring-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:ring-gray-700"
              title={
                health === 'ok'
                  ? 'All systems operational'
                  : health === 'degraded'
                    ? 'Some services are degraded'
                    : 'Checking system status…'
              }
              aria-live="polite"
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  health === 'ok'
                    ? 'bg-emerald-500'
                    : health === 'degraded'
                      ? 'bg-rose-500'
                      : 'bg-amber-400 animate-pulse'
                }`}
                aria-hidden="true"
              />
              {health === 'ok'
                ? 'Operational'
                : health === 'degraded'
                  ? 'Degraded'
                  : 'Checking…'}
            </span>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Here's the latest across the organization.
          </p>
        </div>

        {/* Quick actions */}
        <div className="flex flex-wrap items-center gap-2">
          {quickActions.map((action) => (
            <button
              key={action.label}
              type="button"
              onClick={() => navigate(action.to)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-700 transition-colors"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d={action.icon}
                />
              </svg>
              {action.label}
            </button>
          ))}
        </div>
      </div>

      {/* KPI strip — 1 col mobile → 2 col tablet (sm/md) → 4 col desktop.
          The "Attendance today" card is reordered to first on mobile via
          `order-` utilities — it's the most time-sensitive KPI for HR on
          a phone glance. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Attendance today"
          value={
            attendanceToday
              ? `${attendanceToday.total}`
              : '—'
          }
          subtitle={
            attendancePresentPct != null
              ? `${attendancePresentPct}% present or remote`
              : undefined
          }
          icon="clock"
          variant="emerald"
          to="/attendance"
          loading={loading}
          className="order-1 lg:order-4"
        />
        <StatCard
          title="Active employees"
          value={counts?.active_employees ?? '—'}
          subtitle={
            counts?.total_employees != null
              ? `${counts.total_employees} total on record`
              : undefined
          }
          icon="users"
          variant="indigo"
          to="/employees"
          loading={loading}
          className="order-2 lg:order-1"
        />
        <StatCard
          title="Pending leaves"
          value={counts?.pending_leave_requests ?? '—'}
          subtitle="Awaiting approval"
          icon="calendar"
          variant="amber"
          to="/leaves"
          loading={loading}
          className="order-3 lg:order-3"
        />
        <StatCard
          title="Departments"
          value={counts?.total_departments ?? '—'}
          icon="briefcase"
          variant="sky"
          to="/departments"
          loading={loading}
          className="order-4 lg:order-2"
        />
      </div>

      {/* Optional payroll KPI (HR / Admin only) — same 1/2/4 grid as the
          main KPI strip so the two rows line up cleanly. */}
      {isHR && payroll && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="Payroll headcount"
            value={payroll.headcount ?? 0}
            subtitle={
              payroll.muaji && payroll.viti
                ? `${MONTH_LABELS[payroll.muaji - 1]} ${payroll.viti}`
                : undefined
            }
            icon="users"
            variant="purple"
            to="/salaries"
          />
          <StatCard
            title="Total base"
            value={formatCurrency(payroll.total_base)}
            icon="cash"
            variant="indigo"
            to="/salaries"
          />
          <StatCard
            title="Total bonuses"
            value={formatCurrency(payroll.total_bonuses)}
            icon="cash"
            variant="emerald"
            to="/salaries"
          />
          <StatCard
            title="Total net"
            value={formatCurrency(payroll.total_net)}
            subtitle="After deductions"
            icon="cash"
            variant="rose"
            to="/salaries"
          />
        </div>
      )}

      {/* Charts grid — single column on phones, 2-up from tablet (md)
          onwards. `[&>*]:min-w-0` lets the wide SVG chart widgets
          shrink to their column instead of forcing the grid track
          wider and overlapping the neighbour on tablet. */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 [&>*]:min-w-0">
        <EmployeeChart
          data={charts?.employees_by_department || []}
          loading={loading}
        />
        <DepartmentOverview
          data={charts?.employees_by_department || []}
          loading={loading}
        />
      </div>

      {/* Advanced analytics row (commit 219). HR / Admin payroll trend
          is hidden from non-privileged users since payroll totals are
          sensitive; the other three widgets show for everyone. */}
      {(isHR || charts?.training_completion || charts?.performance_by_department) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 [&>*]:min-w-0">
          {isHR && (
            <SalaryTrendChart
              data={charts?.salary_trend?.series || []}
              loading={loading}
            />
          )}
          <LeaveBalanceChart
            data={charts?.leave_balance || null}
            loading={loading}
          />
          <TrainingCompletionDonut
            data={charts?.training_completion || null}
            loading={loading}
          />
          <PerformanceByDeptChart
            data={charts?.performance_by_department?.series || []}
            loading={loading}
          />
        </div>
      )}

      {/* Lower row: attendance / leave calendar / recent activity.
          Stack on phones, 2-up on tablet (md), 3-up on desktop.
          AttendanceSummary appears first on mobile (most operational); on
          tablet (md) it spans both columns since the 3rd widget needs the
          desktop width to render meaningfully. */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 [&>*]:min-w-0">
        <AttendanceSummary
          attendance={
            attendanceToday || {
              present: 0,
              absent: 0,
              late: 0,
              half_day: 0,
              remote: 0,
              total: 0,
            }
          }
          recentCheckIns={recentCheckIns}
          loading={loading}
        />
        <LeaveCalendar />
        <div className="md:col-span-2 lg:col-span-1">
          <RecentActivities limit={8} />
        </div>
      </div>

      {/* Bottom-left fallback while top-level fetch is in flight and we
          haven't yet rendered any data. Keeps the page from looking empty
          on a very slow first load. */}
      {loading && !overview && !charts && (
        <div className="flex justify-center py-10">
          <LoadingSpinner />
        </div>
      )}
    </div>
  );
};

/* ──────────────────────────────────────────────────────────────────── */
/* Advanced chart widgets                                                */
/* ──────────────────────────────────────────────────────────────────── */

/** Tailwind palette reused by the advanced charts so colors stay coherent. */
const CHART_PALETTE = [
  '#4f46e5', // indigo
  '#10b981', // emerald
  '#f59e0b', // amber
  '#ef4444', // rose
  '#0ea5e9', // sky
  '#a855f7', // purple
  '#14b8a6', // teal
  '#f97316', // orange
];

const colorFor = (i) => CHART_PALETTE[i % CHART_PALETTE.length];

/** Tailwind-tone map for leave types — matches the LeaveRequestList palette. */
const LEAVE_TYPE_TONE = {
  annual: 'bg-indigo-500',
  sick: 'bg-rose-500',
  personal: 'bg-sky-500',
  maternity: 'bg-pink-500',
  paternity: 'bg-purple-500',
  unpaid: 'bg-gray-500',
};

/**
 * SalaryTrendChart — small line chart of total net payroll across the
 * trailing 6 months. Hand-drawn SVG polyline + dots; dependency-free.
 */
const SalaryTrendChart = ({ data = [], loading = false }) => {
  // Geometry
  const W = 360;
  const H = 200;
  const PAD = { top: 16, right: 16, bottom: 32, left: 48 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const max = Math.max(1, ...data.map((d) => Number(d.total_net) || 0));
  const niceMax = max <= 100 ? max : Math.ceil(max / 1000) * 1000;

  // Map each row to an (x, y) coordinate in the SVG viewport.
  const points = data.map((row, i) => {
    const x =
      data.length === 1
        ? PAD.left + innerW / 2
        : PAD.left + (i / (data.length - 1)) * innerW;
    const y =
      PAD.top + innerH - ((Number(row.total_net) || 0) / niceMax) * innerH;
    return { x, y, row };
  });

  const polyline = points.map((p) => `${p.x},${p.y}`).join(' ');

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-900">
          Net payroll — last {data.length || 6} months
        </h3>
      </div>

      {loading ? (
        <div className="flex justify-center items-center" style={{ height: H }}>
          <LoadingSpinner />
        </div>
      ) : data.length === 0 ? (
        <div
          className="flex items-center justify-center text-sm text-gray-500"
          style={{ height: H }}
        >
          No salary data yet.
        </div>
      ) : (
        <svg
          width="100%"
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label="Salary trend"
        >
          {/* Y-axis grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((frac, idx) => {
            const y = PAD.top + (1 - frac) * innerH;
            return (
              <g key={`grid-${idx}`}>
                <line
                  x1={PAD.left}
                  x2={PAD.left + innerW}
                  y1={y}
                  y2={y}
                  stroke="#e5e7eb"
                  strokeDasharray={idx === 0 ? '0' : '4 4'}
                />
                <text
                  x={PAD.left - 6}
                  y={y}
                  textAnchor="end"
                  dominantBaseline="middle"
                  className="fill-gray-500 text-[10px]"
                >
                  €{Math.round(niceMax * frac).toLocaleString()}
                </text>
              </g>
            );
          })}

          {/* Polyline + dots */}
          <polyline
            points={polyline}
            fill="none"
            stroke={CHART_PALETTE[0]}
            strokeWidth="2"
          />
          {points.map((p, i) => (
            <g key={`pt-${i}`}>
              <circle
                cx={p.x}
                cy={p.y}
                r="3.5"
                fill="white"
                stroke={CHART_PALETTE[0]}
                strokeWidth="2"
              >
                <title>
                  {p.row.label}: €{Number(p.row.total_net).toLocaleString()}
                </title>
              </circle>
              <text
                x={p.x}
                y={PAD.top + innerH + 16}
                textAnchor="middle"
                className="fill-gray-600 text-[10px]"
              >
                {p.row.label?.slice(5) /* MM only */}
              </text>
            </g>
          ))}
        </svg>
      )}
    </div>
  );
};

/**
 * LeaveBalanceChart — horizontal bar chart of approved leave days by
 * type for the current year. Each bar is a leave-type colour.
 */
const LeaveBalanceChart = ({ data, loading = false }) => {
  const series = data?.by_type || [];
  const max = Math.max(1, ...series.map((r) => Number(r.total_days) || 0));

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-900">
          Approved leave days — {data?.year || new Date().getFullYear()}
        </h3>
        {data?.total_employees != null && (
          <span className="text-xs text-gray-500">
            across {data.total_employees} active employees
          </span>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center items-center py-10">
          <LoadingSpinner />
        </div>
      ) : series.length === 0 ? (
        <p className="text-sm text-gray-500 py-6 text-center">
          No approved leave requests this year.
        </p>
      ) : (
        <ul className="space-y-2">
          {series.map((row) => {
            const pct = (Number(row.total_days) || 0) / max;
            const tone = LEAVE_TYPE_TONE[row.lloji] || 'bg-gray-400';
            return (
              <li key={row.lloji}>
                <div className="flex items-center justify-between text-xs">
                  <span className="capitalize text-gray-700">{row.lloji}</span>
                  <span className="text-gray-600">
                    <span className="font-semibold text-gray-900">
                      {row.total_days}
                    </span>{' '}
                    days
                    <span className="text-gray-400 ml-1">
                      · {row.approved_count} req
                      {row.pending_count > 0
                        ? ` (+${row.pending_count} pending)`
                        : ''}
                    </span>
                  </span>
                </div>
                <div className="mt-1 h-2 w-full rounded-full bg-gray-100 overflow-hidden">
                  <div
                    className={`${tone} h-2 rounded-full transition-all`}
                    style={{ width: `${Math.max(pct * 100, row.total_days > 0 ? 3 : 0)}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

/**
 * TrainingCompletionDonut — donut chart of overall participant status
 * counts (enrolled / completed / dropped / no-show), with the headline
 * completion rate centred in the hole.
 */
const TrainingCompletionDonut = ({ data, loading = false }) => {
  const overall = data?.overall || null;
  const SIZE = 200;
  const CX = SIZE / 2;
  const CY = SIZE / 2;
  const RO = SIZE / 2 - 8;
  const RI = RO * 0.6;

  const total =
    overall
      ? (overall.enrolled || 0) +
        (overall.completed || 0) +
        (overall.dropped || 0) +
        (overall.no_show || 0)
      : 0;

  // Slices with explicit colours so legend + arc match.
  const slices = overall
    ? [
        { key: 'completed', label: 'Completed', value: overall.completed || 0, color: '#10b981' },
        { key: 'enrolled', label: 'Enrolled', value: overall.enrolled || 0, color: '#0ea5e9' },
        { key: 'dropped', label: 'Dropped', value: overall.dropped || 0, color: '#f59e0b' },
        { key: 'no_show', label: 'No-show', value: overall.no_show || 0, color: '#ef4444' },
      ].filter((s) => s.value > 0)
    : [];

  // Convert each slice to an SVG arc.
  let cursor = 0;
  const arcs = slices.map((s) => {
    const start = cursor;
    const fraction = total > 0 ? s.value / total : 0;
    const end = cursor + fraction * 360;
    cursor = end;

    const polar = (deg) => {
      const rad = ((deg - 90) * Math.PI) / 180;
      return {
        x: CX + RO * Math.cos(rad),
        y: CY + RO * Math.sin(rad),
      };
    };
    const polarInner = (deg) => {
      const rad = ((deg - 90) * Math.PI) / 180;
      return {
        x: CX + RI * Math.cos(rad),
        y: CY + RI * Math.sin(rad),
      };
    };
    const safeEnd = end - start >= 360 ? start + 359.99 : end;
    const largeArc = safeEnd - start <= 180 ? 0 : 1;
    const outerStart = polar(start);
    const outerEnd = polar(safeEnd);
    const innerStart = polarInner(safeEnd);
    const innerEnd = polarInner(start);

    const d = [
      `M ${outerStart.x} ${outerStart.y}`,
      `A ${RO} ${RO} 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y}`,
      `L ${innerStart.x} ${innerStart.y}`,
      `A ${RI} ${RI} 0 ${largeArc} 0 ${innerEnd.x} ${innerEnd.y}`,
      'Z',
    ].join(' ');

    return { ...s, d };
  });

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-900">
          Training completion
        </h3>
        {data?.trainings_total != null && (
          <span className="text-xs text-gray-500">
            {data.trainings_total} training{data.trainings_total === 1 ? '' : 's'}
          </span>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center items-center py-10">
          <LoadingSpinner />
        </div>
      ) : total === 0 ? (
        <p className="text-sm text-gray-500 py-6 text-center">
          No training participants yet.
        </p>
      ) : (
        <div className="flex flex-col items-center">
          <div className="relative" style={{ width: SIZE, height: SIZE }}>
            <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
              {arcs.map((arc) => (
                <path key={arc.key} d={arc.d} fill={arc.color}>
                  <title>
                    {arc.label}: {arc.value} ({((arc.value / total) * 100).toFixed(1)}%)
                  </title>
                </path>
              ))}
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-bold text-gray-900">
                {overall.completion_rate}%
              </span>
              <span className="text-xs text-gray-500">completed</span>
            </div>
          </div>

          <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1 text-xs w-full">
            {slices.map((s) => (
              <li key={s.key} className="flex items-center gap-2 truncate">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
                  style={{ background: s.color }}
                />
                <span className="truncate text-gray-700">{s.label}</span>
                <span className="ml-auto text-gray-500 shrink-0">{s.value}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

/**
 * PerformanceByDeptChart — horizontal bar chart of average performance
 * rating per department (0..5). Tooltip shows review count.
 */
const PerformanceByDeptChart = ({ data = [], loading = false }) => {
  const filtered = data.filter((d) => Number(d.review_count) > 0);

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-900">
          Performance by department
        </h3>
        <span className="text-xs text-gray-500">average rating · last 12 mo</span>
      </div>

      {loading ? (
        <div className="flex justify-center items-center py-10">
          <LoadingSpinner />
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-gray-500 py-6 text-center">
          No performance reviews in the last year.
        </p>
      ) : (
        <ul className="space-y-2.5">
          {filtered.map((row, i) => {
            const pct = (Number(row.average) || 0) / 5;
            return (
              <li key={row.department_id}>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-700">{row.emertimi}</span>
                  <span className="text-gray-600">
                    <span className="font-semibold text-gray-900">
                      {row.average.toFixed(2)}
                    </span>
                    <span className="text-gray-400 ml-1">
                      / 5 · {row.review_count} review{row.review_count === 1 ? '' : 's'}
                    </span>
                  </span>
                </div>
                <div className="mt-1 h-2 w-full rounded-full bg-gray-100 overflow-hidden">
                  <div
                    className="h-2 rounded-full transition-all"
                    style={{
                      width: `${Math.max(pct * 100, 3)}%`,
                      background: colorFor(i),
                    }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default DashboardPage;
