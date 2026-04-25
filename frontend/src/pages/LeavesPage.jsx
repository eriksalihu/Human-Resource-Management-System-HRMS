/**
 * @file frontend/src/pages/LeavesPage.jsx
 * @description Leaves page with role-based tabs — My Requests, All Requests (HR), Pending Approvals (Manager), and Calendar view
 * @author Dev B
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import * as leaveRequestApi from '../api/leaveRequestApi';
import LeaveRequestList from '../components/leaves/LeaveRequestList';
import LeaveRequestForm from '../components/leaves/LeaveRequestForm';
import LeaveApproval from '../components/leaves/LeaveApproval';
import Modal from '../components/common/Modal';
import ConfirmDialog from '../components/common/ConfirmDialog';
import LoadingSpinner from '../components/common/LoadingSpinner';
import { useToast } from '../components/common/Toast';
import useAuth from '../hooks/useAuth';

/** Role groupings used to decide which tabs are visible. */
const HR_ROLES = ['Admin', 'HR Manager'];
const MANAGER_ROLES = ['Department Manager'];

/** Top-level tab identifiers. */
const TABS = {
  MINE: 'mine',
  ALL: 'all',
  APPROVALS: 'approvals',
  CALENDAR: 'calendar',
};

/** Tailwind color classes per leave type for the calendar pills. */
const TYPE_BADGE_CLASS = {
  annual: 'bg-indigo-100 text-indigo-800',
  sick: 'bg-rose-100 text-rose-800',
  personal: 'bg-sky-100 text-sky-800',
  maternity: 'bg-pink-100 text-pink-800',
  paternity: 'bg-purple-100 text-purple-800',
  unpaid: 'bg-gray-100 text-gray-800',
};

/** Tailwind color classes per status for outline cues on calendar pills. */
const STATUS_RING_CLASS = {
  pending: 'ring-yellow-400',
  approved: 'ring-green-500',
  rejected: 'ring-red-400',
  cancelled: 'ring-gray-300',
};

/** ISO YYYY-MM-DD for a Date object. */
const isoDate = (d) => d.toISOString().slice(0, 10);

/** Same-day comparison on YYYY-MM-DD strings. */
const inRange = (day, start, end) =>
  day >= String(start).slice(0, 10) && day <= String(end).slice(0, 10);

/**
 * Build a 6-row × 7-col grid of Date objects covering the given month, with
 * leading/trailing days of adjacent months to keep cell count consistent.
 *
 * Week starts on Monday (Albania locale convention).
 */
const buildMonthGrid = (year, monthIndex) => {
  const firstOfMonth = new Date(year, monthIndex, 1);
  // 0=Sun, 1=Mon ... shift so Monday is the first column
  const offset = (firstOfMonth.getDay() + 6) % 7;
  const start = new Date(year, monthIndex, 1 - offset);

  const cells = [];
  for (let i = 0; i < 42; i += 1) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    cells.push(d);
  }
  return cells;
};

/**
 * LeavesPage — orchestrator for the leaves module.
 *
 * Tab visibility is driven by the caller's role set:
 *   - "My requests" — every authenticated employee
 *   - "All requests" — HR / Admin
 *   - "Pending approvals" — Department Managers (and HR / Admin who often
 *     also have direct reports)
 *   - "Calendar" — every authenticated user, scoped to their visible data
 *
 * @returns {JSX.Element}
 */
const LeavesPage = () => {
  const { user } = useAuth() || {};
  const roles = user?.roles || [];

  const isHR = roles.some((r) => HR_ROLES.includes(r));
  const isManager = roles.some((r) => MANAGER_ROLES.includes(r));

  /** Tabs available to the current user. */
  const availableTabs = useMemo(() => {
    const tabs = [{ id: TABS.MINE, label: 'My Requests' }];
    if (isHR) tabs.push({ id: TABS.ALL, label: 'All Requests' });
    if (isHR || isManager)
      tabs.push({ id: TABS.APPROVALS, label: 'Pending Approvals' });
    tabs.push({ id: TABS.CALENDAR, label: 'Calendar' });
    return tabs;
  }, [isHR, isManager]);

  const [activeTab, setActiveTab] = useState(TABS.MINE);
  const [visitedTabs, setVisitedTabs] = useState(() => new Set([TABS.MINE]));

  /** Force-refresh key so child lists reload after mutations. */
  const [refreshKey, setRefreshKey] = useState(0);
  const refreshAll = useCallback(() => setRefreshKey((k) => k + 1), []);

  /** Modal form state. */
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState('create'); // 'create' | 'edit'
  const [formInitialData, setFormInitialData] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  /** Pending action confirmations (cancel / approve / reject). */
  const [pendingAction, setPendingAction] = useState(null);
  const [actionRunning, setActionRunning] = useState(false);

  const { addToast } = useToast();

  /**
   * Switch to a new tab, marking it as visited so its child mounts (and
   * stays mounted across switches via `hidden`).
   */
  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    setVisitedTabs((prev) => {
      if (prev.has(tabId)) return prev;
      const next = new Set(prev);
      next.add(tabId);
      return next;
    });
  };

  /** Open the create form. */
  const handleAdd = () => {
    setFormMode('create');
    setFormInitialData(null);
    setFormOpen(true);
  };

  /** Open the edit form for an existing request. */
  const handleEdit = (request) => {
    setFormMode('edit');
    setFormInitialData(request);
    setFormOpen(true);
  };

  const handleFormCancel = () => {
    setFormOpen(false);
    setFormInitialData(null);
  };

  /** Submit handler — POST for create, PUT for edit. */
  const handleFormSubmit = async (payload) => {
    setSubmitting(true);
    try {
      if (formMode === 'edit' && formInitialData?.id) {
        await leaveRequestApi.update(formInitialData.id, payload);
        addToast('Leave request updated', 'success');
      } else {
        await leaveRequestApi.create(payload);
        addToast('Leave request submitted', 'success');
      }
      setFormOpen(false);
      setFormInitialData(null);
      refreshAll();
    } catch (err) {
      const msg =
        err.response?.data?.message ||
        `Failed to ${formMode === 'edit' ? 'update' : 'submit'} leave request`;
      addToast(msg, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  /**
   * Stage a destructive / approval action behind a confirm dialog.
   *
   * @param {'cancel'|'approve'|'reject'} kind
   * @param {Object} row
   */
  const stageAction = (kind, row) => setPendingAction({ kind, row });

  /** Run the staged action against the API. */
  const runAction = async () => {
    if (!pendingAction) return;
    const { kind, row } = pendingAction;
    setActionRunning(true);
    try {
      if (kind === 'cancel') await leaveRequestApi.cancel(row.id);
      else if (kind === 'approve') await leaveRequestApi.approve(row.id);
      else if (kind === 'reject') await leaveRequestApi.reject(row.id);
      addToast(`Request ${kind}ed`, kind === 'reject' ? 'info' : 'success');
      setPendingAction(null);
      refreshAll();
    } catch (err) {
      const msg =
        err.response?.data?.message || `Failed to ${kind} request`;
      addToast(msg, 'error');
    } finally {
      setActionRunning(false);
    }
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Leave Requests</h1>
          <p className="text-sm text-gray-500">
            Submit time-off, track approvals, and view team coverage
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex space-x-6 overflow-x-auto" aria-label="Tabs">
          {availableTabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleTabChange(tab.id)}
                className={`whitespace-nowrap border-b-2 py-2 px-1 text-sm font-medium transition-colors ${
                  isActive
                    ? 'border-indigo-600 text-indigo-700'
                    : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                }`}
                aria-current={isActive ? 'page' : undefined}
              >
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab panels — lazy mounted via visitedTabs, kept alive via `hidden` */}
      {visitedTabs.has(TABS.MINE) && (
        <div hidden={activeTab !== TABS.MINE}>
          <MyRequestsPanel
            key={`mine-${refreshKey}`}
            onAdd={handleAdd}
            onEdit={handleEdit}
            onCancel={(row) => stageAction('cancel', row)}
          />
        </div>
      )}

      {visitedTabs.has(TABS.ALL) && isHR && (
        <div hidden={activeTab !== TABS.ALL}>
          <LeaveRequestList
            key={`all-${refreshKey}`}
            onAdd={handleAdd}
            onEdit={handleEdit}
            onApprove={(row) => stageAction('approve', row)}
            onReject={(row) => stageAction('reject', row)}
            onCancel={(row) => stageAction('cancel', row)}
            onDelete={async (row) => {
              await leaveRequestApi.remove(row.id);
            }}
          />
        </div>
      )}

      {visitedTabs.has(TABS.APPROVALS) && (isHR || isManager) && (
        <div hidden={activeTab !== TABS.APPROVALS}>
          <LeaveApproval
            key={`approvals-${refreshKey}`}
            departmentId={
              !isHR && isManager ? user?.employee?.department_id : undefined
            }
            onChanged={refreshAll}
          />
        </div>
      )}

      {visitedTabs.has(TABS.CALENDAR) && (
        <div hidden={activeTab !== TABS.CALENDAR}>
          <LeaveCalendar
            key={`calendar-${refreshKey}`}
            scope={isHR ? 'all' : 'mine'}
          />
        </div>
      )}

      {/* Create / Edit modal */}
      <Modal
        isOpen={formOpen}
        onClose={handleFormCancel}
        title={formMode === 'edit' ? 'Edit Leave Request' : 'New Leave Request'}
        size="lg"
      >
        <LeaveRequestForm
          initialData={formInitialData}
          onSubmit={handleFormSubmit}
          onCancel={handleFormCancel}
          submitting={submitting}
        />
      </Modal>

      {/* Action confirmation */}
      <ConfirmDialog
        isOpen={!!pendingAction}
        title={
          pendingAction?.kind === 'approve'
            ? 'Approve leave request'
            : pendingAction?.kind === 'reject'
              ? 'Reject leave request'
              : 'Cancel leave request'
        }
        message={
          pendingAction
            ? `${
                pendingAction.kind === 'cancel'
                  ? 'Cancel'
                  : pendingAction.kind === 'approve'
                    ? 'Approve'
                    : 'Reject'
              } the leave request for ${pendingAction.row.first_name} ${
                pendingAction.row.last_name
              } (${String(pendingAction.row.data_fillimit).slice(0, 10)} – ${String(
                pendingAction.row.data_perfundimit
              ).slice(0, 10)})?`
            : ''
        }
        confirmLabel={
          pendingAction?.kind === 'approve'
            ? 'Approve'
            : pendingAction?.kind === 'reject'
              ? 'Reject'
              : 'Cancel request'
        }
        variant={pendingAction?.kind === 'approve' ? 'primary' : 'danger'}
        loading={actionRunning}
        onConfirm={runAction}
        onCancel={() => !actionRunning && setPendingAction(null)}
      />
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* My Requests panel — uses /leave-requests/me which returns {requests, balance}. */
/* ------------------------------------------------------------------ */

/**
 * MyRequestsPanel — self-service view of the caller's own requests with a
 * compact balance summary at the top.
 */
const MyRequestsPanel = ({ onAdd, onEdit, onCancel }) => {
  const [data, setData] = useState({ requests: [], balance: [] });
  const [loading, setLoading] = useState(true);
  const { addToast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await leaveRequestApi.getMyRequests();
      setData({
        requests: result?.requests || [],
        balance: result?.balance || [],
      });
    } catch (err) {
      const msg =
        err.response?.data?.message || 'Failed to load your leave requests';
      addToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-5">
      {/* Header with action button */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">My requests</h2>
          <p className="text-sm text-gray-500">
            Track your time-off submissions and remaining balance
          </p>
        </div>
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-md hover:bg-indigo-700"
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
          New request
        </button>
      </div>

      {/* Balance cards */}
      {data.balance && data.balance.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {data.balance.map((b) => (
            <div
              key={b.lloji}
              className="rounded-lg ring-1 ring-gray-200 bg-white p-3"
            >
              <div className="text-xs uppercase tracking-wide text-gray-500 capitalize">
                {b.lloji}
              </div>
              <div className="mt-1 text-lg font-semibold text-gray-900">
                {b.days_used ?? 0}
                <span className="text-xs text-gray-500 font-normal ml-1">
                  days used
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Requests list */}
      {loading ? (
        <div className="flex justify-center py-10">
          <LoadingSpinner />
        </div>
      ) : data.requests.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-10 text-center text-gray-500">
          <p className="text-sm">
            You have no leave requests yet. Click "New request" to submit one.
          </p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <ul className="divide-y divide-gray-100">
            {data.requests.map((r) => {
              const isPending = r.statusi === 'pending';
              return (
                <li
                  key={r.id}
                  className="px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
                >
                  <div className="flex flex-wrap items-center gap-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                        TYPE_BADGE_CLASS[r.lloji] || TYPE_BADGE_CLASS.unpaid
                      }`}
                    >
                      {r.lloji}
                    </span>
                    <span className="text-sm text-gray-700">
                      {String(r.data_fillimit).slice(0, 10)} –{' '}
                      {String(r.data_perfundimit).slice(0, 10)}
                    </span>
                    <span className="text-xs text-gray-500">
                      {r.total_days ?? '—'} day
                      {r.total_days === 1 ? '' : 's'}
                    </span>
                    <span
                      className={`text-xs font-medium capitalize ring-1 ring-inset rounded-full px-2 py-0.5 ${
                        r.statusi === 'approved'
                          ? 'bg-green-50 text-green-700 ring-green-200'
                          : r.statusi === 'rejected'
                            ? 'bg-red-50 text-red-700 ring-red-200'
                            : r.statusi === 'cancelled'
                              ? 'bg-gray-50 text-gray-700 ring-gray-200'
                              : 'bg-yellow-50 text-yellow-800 ring-yellow-200'
                      }`}
                    >
                      {r.statusi}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    {isPending && (
                      <>
                        <button
                          type="button"
                          onClick={() => onEdit(r)}
                          className="text-sm font-medium text-indigo-600 hover:text-indigo-800"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => onCancel(r)}
                          className="text-sm font-medium text-amber-600 hover:text-amber-800"
                        >
                          Cancel
                        </button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Calendar tab — month grid with leave bars                          */
/* ------------------------------------------------------------------ */

/**
 * LeaveCalendar — monthly grid showing approved + pending leaves overlapping
 * each day. `scope='mine'` pulls `/me`; `scope='all'` pulls the org-wide
 * `/leave-requests` paginated endpoint with a generous limit.
 */
const LeaveCalendar = ({ scope = 'mine' }) => {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [monthIndex, setMonthIndex] = useState(today.getMonth());
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const { addToast } = useToast();

  const cells = useMemo(() => buildMonthGrid(year, monthIndex), [year, monthIndex]);

  /** Range bounds for the current view (first/last visible cell). */
  const rangeStart = isoDate(cells[0]);
  const rangeEnd = isoDate(cells[cells.length - 1]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (scope === 'all') {
        const result = await leaveRequestApi.getAll({
          page: 1,
          limit: 200,
          from_date: rangeStart,
          to_date: rangeEnd,
        });
        setRows(result.data || []);
      } else {
        const result = await leaveRequestApi.getMyRequests();
        setRows(result?.requests || []);
      }
    } catch (err) {
      addToast(
        err.response?.data?.message || 'Failed to load calendar data',
        'error'
      );
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [scope, rangeStart, rangeEnd, addToast]);

  useEffect(() => {
    load();
  }, [load]);

  /** Map of YYYY-MM-DD → leaves overlapping that day. */
  const leavesByDay = useMemo(() => {
    const map = new Map();
    for (const cell of cells) {
      map.set(isoDate(cell), []);
    }
    for (const lr of rows) {
      if (lr.statusi === 'cancelled') continue;
      const start = String(lr.data_fillimit).slice(0, 10);
      const end = String(lr.data_perfundimit).slice(0, 10);
      for (const cell of cells) {
        const day = isoDate(cell);
        if (inRange(day, start, end)) {
          map.get(day).push(lr);
        }
      }
    }
    return map;
  }, [rows, cells]);

  const monthLabel = new Date(year, monthIndex, 1).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
  });

  /** Step the month forward (+1) or back (-1). */
  const stepMonth = (delta) => {
    const next = new Date(year, monthIndex + delta, 1);
    setYear(next.getFullYear());
    setMonthIndex(next.getMonth());
  };

  const weekdayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  return (
    <div className="space-y-4">
      {/* Header with month navigation */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">{monthLabel}</h2>
          <p className="text-sm text-gray-500">
            {scope === 'all'
              ? 'Approved and pending leaves across the organization'
              : 'Your approved and pending leaves'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => stepMonth(-1)}
            className="px-3 py-1.5 text-sm font-medium rounded-md bg-white border border-gray-300 text-gray-700 hover:bg-gray-50"
          >
            ← Prev
          </button>
          <button
            type="button"
            onClick={() => {
              const now = new Date();
              setYear(now.getFullYear());
              setMonthIndex(now.getMonth());
            }}
            className="px-3 py-1.5 text-sm font-medium rounded-md bg-white border border-gray-300 text-gray-700 hover:bg-gray-50"
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => stepMonth(1)}
            className="px-3 py-1.5 text-sm font-medium rounded-md bg-white border border-gray-300 text-gray-700 hover:bg-gray-50"
          >
            Next →
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-2 text-xs text-gray-600">
        {Object.entries(TYPE_BADGE_CLASS).map(([type, cls]) => (
          <span
            key={type}
            className={`inline-flex items-center px-2 py-0.5 rounded-full capitalize ${cls}`}
          >
            {type}
          </span>
        ))}
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
              const dayLeaves = leavesByDay.get(day) || [];
              return (
                <div
                  key={day}
                  className={`min-h-[88px] border-t border-l border-gray-100 p-1.5 ${
                    inMonth ? 'bg-white' : 'bg-gray-50/60'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs">
                    <span
                      className={`${
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
                  <div className="mt-1 space-y-0.5">
                    {dayLeaves.slice(0, 3).map((lr) => (
                      <div
                        key={`${lr.id}-${day}`}
                        className={`truncate rounded px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset ${
                          TYPE_BADGE_CLASS[lr.lloji] ||
                          TYPE_BADGE_CLASS.unpaid
                        } ${STATUS_RING_CLASS[lr.statusi] || 'ring-transparent'}`}
                        title={`${lr.first_name || ''} ${lr.last_name || ''} — ${lr.lloji} (${lr.statusi})`.trim()}
                      >
                        {scope === 'all' && lr.last_name
                          ? `${lr.last_name}: ${lr.lloji}`
                          : lr.lloji}
                      </div>
                    ))}
                    {dayLeaves.length > 3 && (
                      <div className="text-[10px] text-gray-500">
                        +{dayLeaves.length - 3} more
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default LeavesPage;
