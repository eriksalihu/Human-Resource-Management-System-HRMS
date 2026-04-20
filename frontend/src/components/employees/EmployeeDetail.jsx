/**
 * @file frontend/src/components/employees/EmployeeDetail.jsx
 * @description Employee detail view with lazy-loaded tabs: Overview, Salary, Leave, Attendance, Performance, Documents
 * @author Dev B
 */

import { useState, useEffect, useMemo } from 'react';
import * as employeeApi from '../../api/employeeApi';
import axiosInstance from '../../api/axiosInstance';
import LoadingSpinner from '../common/LoadingSpinner';
import EmployeeProfile from './EmployeeProfile';

/** Tab identifiers */
const TABS = {
  OVERVIEW: 'overview',
  SALARY: 'salary',
  LEAVE: 'leave',
  ATTENDANCE: 'attendance',
  PERFORMANCE: 'performance',
  DOCUMENTS: 'documents',
};

const TAB_LIST = [
  { id: TABS.OVERVIEW, label: 'Overview' },
  { id: TABS.SALARY, label: 'Salary History' },
  { id: TABS.LEAVE, label: 'Leave History' },
  { id: TABS.ATTENDANCE, label: 'Attendance' },
  { id: TABS.PERFORMANCE, label: 'Performance' },
  { id: TABS.DOCUMENTS, label: 'Documents' },
];

/**
 * Format a monetary value as a EUR currency string with two decimals.
 * @param {number|string|null|undefined} value
 * @returns {string}
 */
const formatCurrency = (value) =>
  value != null
    ? `€${Number(value).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
    : '—';

/**
 * Format a date string (YYYY-MM-DD or ISO) as DD/MM/YYYY or "—" on bad input.
 * @param {string|null|undefined} value
 * @returns {string}
 */
const formatDate = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-GB');
};

/**
 * Small label/value field used in the overview grid.
 */
const Field = ({ label, value }) => (
  <div>
    <dt className="text-xs font-medium uppercase tracking-wider text-gray-500">
      {label}
    </dt>
    <dd className="mt-1 text-sm text-gray-900">{value || '—'}</dd>
  </div>
);

/**
 * Shared "empty state" row for tabs with no data.
 */
const EmptyState = ({ message }) => (
  <div className="text-center py-10 text-sm text-gray-500">{message}</div>
);

/**
 * Shared fetching spinner for a tab.
 */
const TabLoading = () => (
  <div className="flex items-center justify-center py-10">
    <LoadingSpinner size="md" />
  </div>
);

/**
 * Error banner for a tab-level fetch failure.
 */
const TabError = ({ message }) => (
  <div className="bg-red-50 border border-red-200 rounded-lg p-4">
    <p className="text-sm text-red-700">{message}</p>
  </div>
);

/* -------------------------------------------------------------------------- */
/*  Tab panels — each one fetches its own data on mount                       */
/* -------------------------------------------------------------------------- */

/**
 * Overview tab: core employment info grid.
 */
const OverviewTab = ({ employee }) => (
  <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-white border border-gray-200 rounded-lg p-5">
    <Field label="Employee #" value={employee.numri_punonjesit} />
    <Field label="Status" value={employee.statusi} />
    <Field label="Position" value={employee.position_emertimi} />
    <Field label="Department" value={employee.department_emertimi} />
    <Field label="Contract type" value={employee.lloji_kontrates} />
    <Field label="Hire date" value={formatDate(employee.data_punesimit)} />
    <Field
      label="Manager"
      value={
        employee.manager_first_name
          ? `${employee.manager_first_name} ${employee.manager_last_name}`
          : '—'
      }
    />
    <Field label="Email" value={employee.email} />
    <Field label="Phone" value={employee.phone} />
    <Field label="Created" value={formatDate(employee.created_at)} />
  </dl>
);

/**
 * Salary History tab.
 */
const SalaryTab = ({ employeeId }) => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const { data } = await axiosInstance.get(`/salaries/employee/${employeeId}`);
        if (cancelled) return;
        setRows(data.data?.salaries || data.data || []);
      } catch (err) {
        if (cancelled) return;
        setError(err.response?.data?.message || 'Failed to load salary history');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchData();
    return () => {
      cancelled = true;
    };
  }, [employeeId]);

  if (loading) return <TabLoading />;
  if (error) return <TabError message={error} />;
  if (!rows.length) return <EmptyState message="No salary records found for this employee." />;

  return (
    <div className="overflow-x-auto bg-white border border-gray-200 rounded-lg">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wider">
          <tr>
            <th className="px-4 py-2 text-left">Period</th>
            <th className="px-4 py-2 text-right">Base pay</th>
            <th className="px-4 py-2 text-right">Bonuses</th>
            <th className="px-4 py-2 text-right">Deductions</th>
            <th className="px-4 py-2 text-right">Net pay</th>
            <th className="px-4 py-2 text-left">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((s) => (
            <tr key={s.id}>
              <td className="px-4 py-2 text-gray-900">
                {s.muaji}/{s.viti}
              </td>
              <td className="px-4 py-2 text-right text-gray-700">
                {formatCurrency(s.paga_baze)}
              </td>
              <td className="px-4 py-2 text-right text-gray-700">
                {formatCurrency(s.bonuset)}
              </td>
              <td className="px-4 py-2 text-right text-gray-700">
                {formatCurrency(s.zbritjet)}
              </td>
              <td className="px-4 py-2 text-right font-medium text-gray-900">
                {formatCurrency(s.paga_neto)}
              </td>
              <td className="px-4 py-2 text-gray-700">{s.statusi || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

/**
 * Leave History tab.
 */
const LeaveTab = ({ employeeId }) => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const { data } = await axiosInstance.get('/leave-requests', {
          params: { employee_id: employeeId, limit: 100 },
        });
        if (cancelled) return;
        setRows(data.data || []);
      } catch (err) {
        if (cancelled) return;
        setError(err.response?.data?.message || 'Failed to load leave history');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchData();
    return () => {
      cancelled = true;
    };
  }, [employeeId]);

  if (loading) return <TabLoading />;
  if (error) return <TabError message={error} />;
  if (!rows.length) return <EmptyState message="No leave requests for this employee." />;

  return (
    <div className="overflow-x-auto bg-white border border-gray-200 rounded-lg">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wider">
          <tr>
            <th className="px-4 py-2 text-left">Type</th>
            <th className="px-4 py-2 text-left">From</th>
            <th className="px-4 py-2 text-left">To</th>
            <th className="px-4 py-2 text-right">Days</th>
            <th className="px-4 py-2 text-left">Status</th>
            <th className="px-4 py-2 text-left">Reason</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((lr) => (
            <tr key={lr.id}>
              <td className="px-4 py-2 text-gray-900 capitalize">{lr.lloji}</td>
              <td className="px-4 py-2 text-gray-700">{formatDate(lr.data_fillimit)}</td>
              <td className="px-4 py-2 text-gray-700">{formatDate(lr.data_perfundimit)}</td>
              <td className="px-4 py-2 text-right text-gray-700">{lr.total_days}</td>
              <td className="px-4 py-2 text-gray-700 capitalize">{lr.statusi}</td>
              <td className="px-4 py-2 text-gray-500 truncate max-w-xs">
                {lr.arsyeja || '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

/**
 * Attendance tab — recent entries + monthly summary for the current month.
 */
const AttendanceTab = ({ employeeId }) => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const { data } = await axiosInstance.get('/attendances', {
          params: { employee_id: employeeId, limit: 50, sortBy: 'data', sortOrder: 'DESC' },
        });
        if (cancelled) return;
        setRows(data.data || []);
      } catch (err) {
        if (cancelled) return;
        setError(err.response?.data?.message || 'Failed to load attendance');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchData();
    return () => {
      cancelled = true;
    };
  }, [employeeId]);

  if (loading) return <TabLoading />;
  if (error) return <TabError message={error} />;
  if (!rows.length) return <EmptyState message="No attendance records found." />;

  return (
    <div className="overflow-x-auto bg-white border border-gray-200 rounded-lg">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wider">
          <tr>
            <th className="px-4 py-2 text-left">Date</th>
            <th className="px-4 py-2 text-left">Check-in</th>
            <th className="px-4 py-2 text-left">Check-out</th>
            <th className="px-4 py-2 text-right">Hours</th>
            <th className="px-4 py-2 text-left">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((a) => (
            <tr key={a.id}>
              <td className="px-4 py-2 text-gray-900">{formatDate(a.data)}</td>
              <td className="px-4 py-2 text-gray-700">{a.ora_hyrjes || '—'}</td>
              <td className="px-4 py-2 text-gray-700">{a.ora_daljes || '—'}</td>
              <td className="px-4 py-2 text-right text-gray-700">
                {a.hours_worked != null ? Number(a.hours_worked).toFixed(2) : '—'}
              </td>
              <td className="px-4 py-2 text-gray-700 capitalize">{a.statusi}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

/**
 * Performance tab — placeholder until the Performance endpoints are wired up.
 */
const PerformanceTab = ({ employeeId }) => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const { data } = await axiosInstance.get('/performance-reviews', {
          params: { employee_id: employeeId, limit: 50 },
        });
        if (cancelled) return;
        setRows(data.data || []);
      } catch (err) {
        if (cancelled) return;
        // 404 just means the endpoint isn't mounted yet — swallow gracefully
        if (err.response?.status === 404) {
          setRows([]);
        } else {
          setError(err.response?.data?.message || 'Failed to load reviews');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchData();
    return () => {
      cancelled = true;
    };
  }, [employeeId]);

  if (loading) return <TabLoading />;
  if (error) return <TabError message={error} />;
  if (!rows.length) return <EmptyState message="No performance reviews yet." />;

  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li
          key={r.id}
          className="bg-white border border-gray-200 rounded-lg p-4 flex items-start justify-between gap-4"
        >
          <div>
            <p className="text-sm font-medium text-gray-900">
              Review period: {r.periudha || '—'}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              By {r.reviewer_first_name} {r.reviewer_last_name} · {formatDate(r.data_review)}
            </p>
            {r.pikat_forta && (
              <p className="text-sm text-gray-700 mt-2 line-clamp-2">{r.pikat_forta}</p>
            )}
          </div>
          {r.vleresimi != null && (
            <span className="inline-flex items-center rounded-full bg-yellow-50 px-2.5 py-1 text-xs font-medium text-yellow-800">
              ★ {Number(r.vleresimi).toFixed(1)}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
};

/**
 * Documents tab — placeholder until the Documents endpoints are wired up.
 */
const DocumentsTab = ({ employeeId }) => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const { data } = await axiosInstance.get('/documents', {
          params: { employee_id: employeeId, limit: 100 },
        });
        if (cancelled) return;
        setRows(data.data || []);
      } catch (err) {
        if (cancelled) return;
        if (err.response?.status === 404) {
          setRows([]);
        } else {
          setError(err.response?.data?.message || 'Failed to load documents');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchData();
    return () => {
      cancelled = true;
    };
  }, [employeeId]);

  if (loading) return <TabLoading />;
  if (error) return <TabError message={error} />;
  if (!rows.length) return <EmptyState message="No documents uploaded." />;

  return (
    <ul className="divide-y divide-gray-200 bg-white border border-gray-200 rounded-lg">
      {rows.map((d) => (
        <li key={d.id} className="px-4 py-3 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">
              {d.emri || d.file_name || 'Document'}
            </p>
            <p className="text-xs text-gray-500">
              {d.lloji || 'file'} · uploaded {formatDate(d.created_at)}
            </p>
          </div>
          {d.data_skadimit && (
            <span className="text-xs text-gray-500">Expires {formatDate(d.data_skadimit)}</span>
          )}
        </li>
      ))}
    </ul>
  );
};

/* -------------------------------------------------------------------------- */
/*  Main detail component                                                     */
/* -------------------------------------------------------------------------- */

/**
 * EmployeeDetail — tabbed detail view for a single employee.
 *
 * Tabs are lazily mounted: each tab component runs its own fetch only the
 * first time it becomes active (controlled by the `visitedTabs` set so we
 * don't unmount/refetch when the user switches back and forth).
 *
 * @param {Object} props
 * @param {number} props.employeeId
 * @param {Function} [props.onEdit]
 * @param {Function} [props.onTerminate] - Soft-delete / terminate action
 * @param {Function} [props.onClose]
 * @returns {JSX.Element}
 */
const EmployeeDetail = ({ employeeId, onEdit, onTerminate, onClose }) => {
  const [employee, setEmployee] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [activeTab, setActiveTab] = useState(TABS.OVERVIEW);
  const [visitedTabs, setVisitedTabs] = useState(() => new Set([TABS.OVERVIEW]));

  useEffect(() => {
    const fetchDetail = async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await employeeApi.getById(employeeId);
        setEmployee(result);
      } catch (err) {
        setError(err.response?.data?.message || 'Failed to load employee');
      } finally {
        setLoading(false);
      }
    };
    if (employeeId) fetchDetail();
  }, [employeeId]);

  const handleTabClick = (id) => {
    setActiveTab(id);
    if (!visitedTabs.has(id)) {
      setVisitedTabs((prev) => {
        const next = new Set(prev);
        next.add(id);
        return next;
      });
    }
  };

  const tabContent = useMemo(() => {
    if (!employee) return null;
    return {
      [TABS.OVERVIEW]: <OverviewTab employee={employee} />,
      [TABS.SALARY]: <SalaryTab employeeId={employee.id} />,
      [TABS.LEAVE]: <LeaveTab employeeId={employee.id} />,
      [TABS.ATTENDANCE]: <AttendanceTab employeeId={employee.id} />,
      [TABS.PERFORMANCE]: <PerformanceTab employeeId={employee.id} />,
      [TABS.DOCUMENTS]: <DocumentsTab employeeId={employee.id} />,
    };
  }, [employee]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-sm text-red-700">{error}</p>
      </div>
    );
  }

  if (!employee) return null;

  return (
    <div className="space-y-6">
      {/* Profile card */}
      <EmployeeProfile
        employee={employee}
        onEdit={onEdit}
        onTerminate={onTerminate}
        onClose={onClose}
      />

      {/* Tab bar */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex gap-6 overflow-x-auto" aria-label="Tabs">
          {TAB_LIST.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleTabClick(tab.id)}
                className={`whitespace-nowrap py-3 px-1 border-b-2 text-sm font-medium transition-colors ${
                  isActive
                    ? 'border-indigo-600 text-indigo-700'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
                aria-current={isActive ? 'page' : undefined}
              >
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Active tab panel — only mount tabs that have been visited */}
      <div>
        {TAB_LIST.map((tab) => {
          if (!visitedTabs.has(tab.id)) return null;
          const isActive = activeTab === tab.id;
          return (
            <div key={tab.id} hidden={!isActive}>
              {tabContent?.[tab.id]}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default EmployeeDetail;
