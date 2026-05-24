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
import * as leaveRequestApi from '../api/leaveRequestApi';
import * as trainingApi from '../api/trainingApi';
import * as documentApi from '../api/documentApi';
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

/** Roles that see org-wide dashboards (employee counts, dept charts, etc.). */
const MANAGER_ROLES = ['Admin', 'HR Manager', 'Department Manager'];

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
  const isManager = (user?.roles || []).some((r) => MANAGER_ROLES.includes(r));
  const navigate = useNavigate();

  const [overview, setOverview] = useState(null);
  const [charts, setCharts] = useState(null);
  const [recentCheckIns, setRecentCheckIns] = useState([]);
  const [loading, setLoading] = useState(true);
  // System health: 'checking' | 'ok' | 'degraded'. Drives the status dot.
  const [health, setHealth] = useState('checking');

  // Employee-only personal data
  const [myLeaves, setMyLeaves] = useState([]);
  const [myLeaveBalance, setMyLeaveBalance] = useState([]);
  const [myTrainings, setMyTrainings] = useState([]);
  const [myDocuments, setMyDocuments] = useState([]);
  const [myAttendance, setMyAttendance] = useState([]);

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
   * Load dashboard payloads in parallel. Manager+ roles get org-wide data;
   * plain Employee users get only their own personal data.
   */
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);

      if (isManager) {
        // Manager / Admin / HR — full org-wide dashboard
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
          console.error(
            '[DashboardPage] Failed to load recent check-ins:',
            attendanceRes.reason?.message || attendanceRes.reason
          );
        }
      } else {
        // Employee — personal data only
        const [leavesRes, trainingsRes, docsRes, attRes] = await Promise.allSettled([
          leaveRequestApi.getMyRequests(),
          trainingApi.getMyTrainings(),
          documentApi.getMyDocuments(),
          attendanceApi.getMyAttendance({ limit: 30 }),
        ]);

        if (cancelled) return;

        if (leavesRes.status === 'fulfilled') {
          const raw = leavesRes.value;
          setMyLeaves(raw?.requests || (Array.isArray(raw) ? raw : []));
          setMyLeaveBalance(raw?.balance || []);
        }
        if (trainingsRes.status === 'fulfilled') {
          setMyTrainings(Array.isArray(trainingsRes.value) ? trainingsRes.value : []);
        }
        if (docsRes.status === 'fulfilled') {
          setMyDocuments(docsRes.value?.documents || []);
        }
        if (attRes.status === 'fulfilled') {
          setMyAttendance(attRes.value?.attendance || attRes.value?.data || []);
        }
      }

      setLoading(false);
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [addToast, isManager]);

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
            <h1 className="text-2xl font-bold text-gray-900 truncate">
              {greetingFor()}
              {user?.first_name ? `, ${user.first_name}` : ''}
            </h1>
            {/* System health indicator */}
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset
                bg-gray-50 text-gray-600 ring-gray-200"
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
                      ? 'bg-rose-50'
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
          <p className="text-sm text-gray-500 mt-1">
            {isManager
              ? "Here's the latest across the organization."
              : 'Your personal overview at a glance.'}
          </p>
        </div>

        {/* Quick actions */}
        <div className="flex flex-wrap items-center gap-2">
          {quickActions.map((action) => (
            <button
              key={action.label}
              type="button"
              onClick={() => navigate(action.to)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors"
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

      {/* ── Manager / Admin org-wide dashboard ─────────────────────── */}
      {isManager && (
        <>
          {/* KPI strip */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              title="Attendance today"
              value={attendanceToday ? `${attendanceToday.total}` : '—'}
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

          {/* Payroll KPI (HR / Admin only) */}
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

          {/* Charts grid */}
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

          {/* Advanced analytics */}
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

          {/* Lower row: attendance / leave calendar / recent activity */}
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
        </>
      )}

      {/* ── Employee personal dashboard ────────────────────────────── */}
      {!isManager && (
        <>
          <EmployeeDashboard
            myLeaves={myLeaves}
            myLeaveBalance={myLeaveBalance}
            myTrainings={myTrainings}
            myDocuments={myDocuments}
            myAttendance={myAttendance}
            loading={loading}
            navigate={navigate}
          />
        </>
      )}

      {/* Loading fallback */}
      {loading && !overview && !charts && isManager && (
        <div className="flex justify-center py-10">
          <LoadingSpinner />
        </div>
      )}
    </div>
  );
};

/* ──────────────────────────────────────────────────────────────────── */
/* Employee personal dashboard                                           */
/* ──────────────────────────────────────────────────────────────────── */

/** Format a date as DD/MM/YYYY. */
const fmtDate = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-GB');
};

/** Short weekday label. */
const SHORT_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * EmployeeDashboard — personal view for Employee-only users showing
 * their leave requests, training enrollments, recent attendance, and
 * documents. Features donut charts, an attendance heatmap strip, and
 * list panels that mirror the Admin dashboard's visual style.
 */
const EmployeeDashboard = ({
  myLeaves = [],
  myLeaveBalance = [],
  myTrainings = [],
  myDocuments = [],
  myAttendance = [],
  loading = false,
  navigate,
}) => {
  const pendingLeaves = myLeaves.filter((l) => l.statusi === 'pending');
  const approvedLeaves = myLeaves.filter((l) => l.statusi === 'approved');
  /** Exclude dropped / withdrawn / cancelled participants everywhere. */
  const DROPPED_STATUSES = ['dropped', 'withdrawn', 'cancelled'];
  const enrolledTrainings = myTrainings.filter(
    (t) => !DROPPED_STATUSES.includes(t.statusi)
  );
  const activeTrainings = enrolledTrainings.filter(
    (t) =>
      t.statusi === 'enrolled' ||
      t.training_statusi === 'upcoming' ||
      t.training_statusi === 'ongoing'
  );

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* ── KPI strip ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Pending leaves"
          value={pendingLeaves.length}
          subtitle="Awaiting approval"
          icon="calendar"
          variant="amber"
          to="/leaves"
        />
        <StatCard
          title="Approved leaves"
          value={approvedLeaves.length}
          subtitle="This year"
          icon="calendar"
          variant="emerald"
          to="/leaves"
        />
        <StatCard
          title="My trainings"
          value={activeTrainings.length}
          subtitle="Active enrollments"
          icon="users"
          variant="indigo"
          to="/trainings"
        />
        <StatCard
          title="My documents"
          value={myDocuments.length}
          subtitle="On file"
          icon="briefcase"
          variant="sky"
          to="/documents"
        />
      </div>

      {/* ── Charts row ────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 [&>*]:min-w-0">
        <EmpLeaveDonut leaves={myLeaves} balance={myLeaveBalance} navigate={navigate} />
        <EmpTrainingDonut trainings={enrolledTrainings} navigate={navigate} />
      </div>

      {/* ── Attendance heatmap + leave requests ───────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 [&>*]:min-w-0">
        <EmpAttendanceStrip attendance={myAttendance} navigate={navigate} />
        <EmpLeaveList leaves={myLeaves} navigate={navigate} />
      </div>

      {/* ── Trainings list + Documents list ────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 [&>*]:min-w-0">
        <EmpTrainingList trainings={enrolledTrainings} navigate={navigate} />
        <EmpDocumentList documents={myDocuments} navigate={navigate} />
      </div>
    </div>
  );
};

/* ── Employee chart: Leave status donut ──────────────────────────── */

const LEAVE_STATUS_COLORS = {
  approved: '#10b981',
  pending: '#f59e0b',
  rejected: '#ef4444',
  cancelled: '#94a3b8',
};

const EmpLeaveDonut = ({ leaves = [], balance = [], navigate }) => {
  const byStatus = useMemo(() => {
    const map = {};
    leaves.forEach((l) => {
      const s = l.statusi || 'other';
      map[s] = (map[s] || 0) + 1;
    });
    return Object.entries(map)
      .map(([key, value]) => ({
        key,
        label: key.charAt(0).toUpperCase() + key.slice(1),
        value,
        color: LEAVE_STATUS_COLORS[key] || '#94a3b8',
      }))
      .sort((a, b) => b.value - a.value);
  }, [leaves]);

  const total = leaves.length;
  const SIZE = 180;
  const CX = SIZE / 2;
  const CY = SIZE / 2;
  const RO = SIZE / 2 - 6;
  const RI = RO * 0.62;

  let cursor = 0;
  const arcs = byStatus.map((s) => {
    const start = cursor;
    const frac = total > 0 ? s.value / total : 0;
    const end = cursor + frac * 360;
    cursor = end;
    const polar = (deg, r) => {
      const rad = ((deg - 90) * Math.PI) / 180;
      return { x: CX + r * Math.cos(rad), y: CY + r * Math.sin(rad) };
    };
    const safeEnd = end - start >= 360 ? start + 359.99 : end;
    const large = safeEnd - start > 180 ? 1 : 0;
    const os = polar(start, RO);
    const oe = polar(safeEnd, RO);
    const is_ = polar(safeEnd, RI);
    const ie = polar(start, RI);
    const d = `M ${os.x} ${os.y} A ${RO} ${RO} 0 ${large} 1 ${oe.x} ${oe.y} L ${is_.x} ${is_.y} A ${RI} ${RI} 0 ${large} 0 ${ie.x} ${ie.y} Z`;
    return { ...s, d };
  });

  // Leave balance summary
  const totalUsed = balance.reduce((s, b) => s + (Number(b.days_used) || 0), 0);

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-900">Leave overview</h3>
        <button
          type="button"
          onClick={() => navigate('/leaves')}
          className="text-xs font-medium text-indigo-600 hover:text-indigo-800"
        >
          View all
        </button>
      </div>

      {total === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-sm text-gray-500">
          <svg className="h-10 w-10 text-gray-300 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          No leave requests yet.
        </div>
      ) : (
        <div className="flex items-center gap-6">
          {/* Donut */}
          <div className="relative shrink-0" style={{ width: SIZE, height: SIZE }}>
            <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
              {arcs.map((a) => (
                <path key={a.key} d={a.d} fill={a.color}>
                  <title>{a.label}: {a.value}</title>
                </path>
              ))}
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-bold text-gray-900">{total}</span>
              <span className="text-[11px] text-gray-500">total</span>
            </div>
          </div>

          {/* Legend + balance */}
          <div className="flex-1 min-w-0 space-y-3">
            <ul className="space-y-1.5">
              {byStatus.map((s) => (
                <li key={s.key} className="flex items-center gap-2 text-xs">
                  <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: s.color }} />
                  <span className="text-gray-700">{s.label}</span>
                  <span className="ml-auto font-semibold text-gray-900">{s.value}</span>
                </li>
              ))}
            </ul>
            {totalUsed > 0 && (
              <div className="pt-2 border-t border-gray-100">
                <p className="text-[11px] text-gray-500 mb-1">Days used this year</p>
                {balance.filter((b) => Number(b.days_used) > 0).map((b) => (
                  <div key={b.lloji} className="flex items-center justify-between text-xs">
                    <span className="capitalize text-gray-600">{b.lloji}</span>
                    <span className="font-semibold text-gray-900">{b.days_used}d</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

/* ── Employee chart: Training progress donut ─────────────────────── */

const TRAINING_STATUS_COLORS = {
  upcoming: '#0ea5e9',
  ongoing: '#10b981',
  completed: '#6366f1',
  enrolled: '#f59e0b',
  dropped: '#94a3b8',
};

const EmpTrainingDonut = ({ trainings = [], navigate }) => {
  const byStatus = useMemo(() => {
    const map = {};
    trainings.forEach((t) => {
      const s = t.training_statusi || t.statusi || 'enrolled';
      map[s] = (map[s] || 0) + 1;
    });
    return Object.entries(map)
      .map(([key, value]) => ({
        key,
        label: key.charAt(0).toUpperCase() + key.slice(1),
        value,
        color: TRAINING_STATUS_COLORS[key] || '#94a3b8',
      }))
      .sort((a, b) => b.value - a.value);
  }, [trainings]);

  const total = trainings.length;
  const completedCount = trainings.filter(
    (t) => (t.training_statusi || t.statusi) === 'completed'
  ).length;
  const completionRate = total > 0 ? Math.round((completedCount / total) * 100) : 0;

  const SIZE = 180;
  const CX = SIZE / 2;
  const CY = SIZE / 2;
  const RO = SIZE / 2 - 6;
  const RI = RO * 0.62;

  let cursor = 0;
  const arcs = byStatus.map((s) => {
    const start = cursor;
    const frac = total > 0 ? s.value / total : 0;
    const end = cursor + frac * 360;
    cursor = end;
    const polar = (deg, r) => {
      const rad = ((deg - 90) * Math.PI) / 180;
      return { x: CX + r * Math.cos(rad), y: CY + r * Math.sin(rad) };
    };
    const safeEnd = end - start >= 360 ? start + 359.99 : end;
    const large = safeEnd - start > 180 ? 1 : 0;
    const os = polar(start, RO);
    const oe = polar(safeEnd, RO);
    const is_ = polar(safeEnd, RI);
    const ie = polar(start, RI);
    const d = `M ${os.x} ${os.y} A ${RO} ${RO} 0 ${large} 1 ${oe.x} ${oe.y} L ${is_.x} ${is_.y} A ${RI} ${RI} 0 ${large} 0 ${ie.x} ${ie.y} Z`;
    return { ...s, d };
  });

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-900">Training progress</h3>
        <button
          type="button"
          onClick={() => navigate('/trainings')}
          className="text-xs font-medium text-indigo-600 hover:text-indigo-800"
        >
          View all
        </button>
      </div>

      {total === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-sm text-gray-500">
          <svg className="h-10 w-10 text-gray-300 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          </svg>
          No training enrollments yet.
        </div>
      ) : (
        <div className="flex items-center gap-6">
          {/* Donut */}
          <div className="relative shrink-0" style={{ width: SIZE, height: SIZE }}>
            <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
              {arcs.map((a) => (
                <path key={a.key} d={a.d} fill={a.color}>
                  <title>{a.label}: {a.value}</title>
                </path>
              ))}
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-bold text-gray-900">{completionRate}%</span>
              <span className="text-[11px] text-gray-500">completed</span>
            </div>
          </div>

          {/* Legend */}
          <div className="flex-1 min-w-0">
            <ul className="space-y-1.5">
              {byStatus.map((s) => (
                <li key={s.key} className="flex items-center gap-2 text-xs">
                  <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: s.color }} />
                  <span className="text-gray-700">{s.label}</span>
                  <span className="ml-auto font-semibold text-gray-900">{s.value}</span>
                </li>
              ))}
            </ul>
            <div className="mt-3 pt-2 border-t border-gray-100 text-xs text-gray-500">
              {total} training{total !== 1 ? 's' : ''} total · {completedCount} completed
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/* ── Employee chart: Attendance heatmap strip ────────────────────── */

const ATT_STATUS_COLORS = {
  present: '#10b981',
  remote: '#0ea5e9',
  late: '#f59e0b',
  absent: '#ef4444',
  half_day: '#a855f7',
};

const EmpAttendanceStrip = ({ attendance = [], navigate }) => {
  // Build a date→status map from the last 14 days
  const { days, statusCounts } = useMemo(() => {
    const map = {};
    attendance.forEach((a) => {
      if (a.data) {
        const key = new Date(a.data).toISOString().slice(0, 10);
        map[key] = a.statusi;
      }
    });

    const result = [];
    const counts = { present: 0, remote: 0, late: 0, absent: 0, half_day: 0 };
    const today = new Date();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const iso = d.toISOString().slice(0, 10);
      const dayOfWeek = d.getDay();
      const status = map[iso] || null;
      if (status && counts[status] !== undefined) counts[status]++;
      result.push({
        date: iso,
        day: SHORT_DAYS[dayOfWeek],
        dayNum: d.getDate(),
        isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
        status,
      });
    }
    return { days: result, statusCounts: counts };
  }, [attendance]);

  const totalRecorded = Object.values(statusCounts).reduce((s, v) => s + v, 0);

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-900">Attendance — last 14 days</h3>
        <button
          type="button"
          onClick={() => navigate('/attendance')}
          className="text-xs font-medium text-indigo-600 hover:text-indigo-800"
        >
          View all
        </button>
      </div>

      {/* Heatmap grid */}
      <div className="flex gap-1.5 mb-4">
        {days.map((d) => (
          <div key={d.date} className="flex-1 min-w-0">
            <p className="text-[10px] text-gray-400 text-center mb-1 truncate">{d.day}</p>
            <div
              className={`aspect-square rounded-md flex items-center justify-center text-[10px] font-medium transition-colors ${
                d.status
                  ? 'text-white'
                  : d.isWeekend
                    ? 'bg-gray-50 text-gray-300 ring-1 ring-inset ring-gray-100'
                    : 'bg-gray-100 text-gray-400 ring-1 ring-inset ring-gray-200'
              }`}
              style={d.status ? { background: ATT_STATUS_COLORS[d.status] || '#94a3b8' } : undefined}
              title={d.status ? `${d.date}: ${d.status}` : `${d.date}: no record`}
            >
              {d.dayNum}
            </div>
          </div>
        ))}
      </div>

      {/* Status legend + counts */}
      {totalRecorded > 0 ? (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {Object.entries(ATT_STATUS_COLORS).map(([key, color]) => {
            const count = statusCounts[key] || 0;
            if (count === 0) return null;
            return (
              <span key={key} className="flex items-center gap-1.5 text-gray-600">
                <span className="h-2 w-2 rounded-full shrink-0" style={{ background: color }} />
                <span className="capitalize">{key.replace('_', ' ')}</span>
                <span className="font-semibold text-gray-900">{count}</span>
              </span>
            );
          })}
        </div>
      ) : (
        <p className="text-xs text-gray-400 text-center">No attendance data in this period.</p>
      )}
    </div>
  );
};

/* ── Employee list panel: Leave requests ─────────────────────────── */

const EmpLeaveList = ({ leaves = [], navigate }) => (
  <div className="rounded-lg border border-gray-200 bg-white p-4">
    <div className="flex items-center justify-between mb-3">
      <h3 className="text-sm font-semibold text-gray-900">My leave requests</h3>
      <button type="button" onClick={() => navigate('/leaves')} className="text-xs font-medium text-indigo-600 hover:text-indigo-800">
        View all
      </button>
    </div>
    {leaves.length === 0 ? (
      <p className="text-sm text-gray-500 py-4 text-center">No leave requests yet.</p>
    ) : (
      <ul className="divide-y divide-gray-100">
        {leaves.slice(0, 5).map((l) => {
          const cls =
            l.statusi === 'approved' ? 'bg-emerald-50 text-emerald-700'
            : l.statusi === 'pending' ? 'bg-amber-50 text-amber-700'
            : l.statusi === 'rejected' ? 'bg-red-50 text-red-700'
            : 'bg-gray-50 text-gray-700';
          return (
            <li key={l.id} className="py-2.5 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 capitalize truncate">
                  {l.lloji || 'Leave'} — {fmtDate(l.data_fillimit)} to {fmtDate(l.data_perfundimit)}
                </p>
              </div>
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ring-1 ring-inset ring-current/20 shrink-0 ${cls}`}>
                {l.statusi}
              </span>
            </li>
          );
        })}
      </ul>
    )}
  </div>
);

/* ── Employee list panel: Trainings ──────────────────────────────── */

const EmpTrainingList = ({ trainings = [], navigate }) => (
  <div className="rounded-lg border border-gray-200 bg-white p-4">
    <div className="flex items-center justify-between mb-3">
      <h3 className="text-sm font-semibold text-gray-900">My trainings</h3>
      <button type="button" onClick={() => navigate('/trainings')} className="text-xs font-medium text-indigo-600 hover:text-indigo-800">
        View all
      </button>
    </div>
    {trainings.length === 0 ? (
      <p className="text-sm text-gray-500 py-4 text-center">No training enrollments yet.</p>
    ) : (
      <ul className="divide-y divide-gray-100">
        {trainings.slice(0, 5).map((t) => {
          const status = t.training_statusi || t.statusi || 'enrolled';
          const cls =
            status === 'upcoming' ? 'bg-blue-50 text-blue-700'
            : status === 'ongoing' ? 'bg-green-50 text-green-700'
            : status === 'completed' ? 'bg-indigo-50 text-indigo-700'
            : 'bg-amber-50 text-amber-700';
          return (
            <li key={t.id} className="py-2.5 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {t.training_titulli || `Training #${t.training_id}`}
                </p>
                <p className="text-xs text-gray-500">
                  {fmtDate(t.training_data_fillimit)} - {fmtDate(t.training_data_perfundimit)}
                </p>
              </div>
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ring-1 ring-inset ring-current/20 shrink-0 ${cls}`}>
                {status}
              </span>
            </li>
          );
        })}
      </ul>
    )}
  </div>
);

/* ── Employee list panel: Documents ──────────────────────────────── */

const DOC_TYPE_CLS = {
  contract: 'bg-indigo-50 text-indigo-700',
  'id-card': 'bg-sky-50 text-sky-700',
  certificate: 'bg-emerald-50 text-emerald-700',
  resume: 'bg-purple-50 text-purple-700',
  other: 'bg-gray-50 text-gray-700',
};

const EmpDocumentList = ({ documents = [], navigate }) => (
  <div className="rounded-lg border border-gray-200 bg-white p-4">
    <div className="flex items-center justify-between mb-3">
      <h3 className="text-sm font-semibold text-gray-900">My documents</h3>
      <button type="button" onClick={() => navigate('/documents')} className="text-xs font-medium text-indigo-600 hover:text-indigo-800">
        View all
      </button>
    </div>
    {documents.length === 0 ? (
      <p className="text-sm text-gray-500 py-4 text-center">No documents on file.</p>
    ) : (
      <ul className="divide-y divide-gray-100">
        {documents.slice(0, 5).map((d) => (
          <li key={d.id} className="py-2.5 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{d.emertimi}</p>
              <p className="text-xs text-gray-500">Uploaded {fmtDate(d.data_ngarkimit)}</p>
            </div>
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ring-1 ring-inset ring-current/20 shrink-0 ${DOC_TYPE_CLS[d.lloji] || DOC_TYPE_CLS.other}`}>
              {d.lloji}
            </span>
          </li>
        ))}
      </ul>
    )}
  </div>
);

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
  annual: 'bg-indigo-50',
  sick: 'bg-rose-50',
  personal: 'bg-sky-500',
  maternity: 'bg-pink-500',
  paternity: 'bg-purple-500',
  unpaid: 'bg-gray-50',
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
