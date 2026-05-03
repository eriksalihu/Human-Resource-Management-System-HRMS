/**
 * @file frontend/src/pages/DashboardPage.jsx
 * @description Main dashboard composing StatCards row, charts grid, attendance summary, leave calendar, and recent activities in a responsive layout
 * @author Dev A
 */

import { useEffect, useMemo, useState } from 'react';
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

  const [overview, setOverview] = useState(null);
  const [charts, setCharts] = useState(null);
  const [recentCheckIns, setRecentCheckIns] = useState([]);
  const [loading, setLoading] = useState(true);

  const { addToast } = useToast();

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
    <div className="p-6 space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500">
          {user?.first_name
            ? `Welcome back, ${user.first_name}.`
            : 'Welcome back.'}{' '}
          Here's the latest across the organization.
        </p>
      </div>

      {/* KPI strip — 4 cards on lg, scaling down responsively */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
        />
        <StatCard
          title="Departments"
          value={counts?.total_departments ?? '—'}
          icon="briefcase"
          variant="sky"
          to="/departments"
          loading={loading}
        />
        <StatCard
          title="Pending leaves"
          value={counts?.pending_leave_requests ?? '—'}
          subtitle="Awaiting approval"
          icon="calendar"
          variant="amber"
          to="/leaves"
          loading={loading}
        />
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
        />
      </div>

      {/* Optional payroll KPI (HR / Admin only) */}
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

      {/* Charts grid (2x1 on lg, stack on smaller) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <EmployeeChart
          data={charts?.employees_by_department || []}
          loading={loading}
        />
        <DepartmentOverview
          data={charts?.employees_by_department || []}
          loading={loading}
        />
      </div>

      {/* Lower row: attendance / leave calendar / recent activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
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
        <RecentActivities limit={8} />
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

export default DashboardPage;
