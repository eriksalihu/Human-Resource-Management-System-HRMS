/**
 * @file frontend/src/components/leaves/LeaveApproval.jsx
 * @description Manager-facing pending-queue with per-row approve/reject, bulk selection, and optional comment field
 * @author Dev B
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import * as leaveRequestApi from '../../api/leaveRequestApi';
import LoadingSpinner from '../common/LoadingSpinner';
import { useToast } from '../common/Toast';

/** Tailwind classes per leave type for colored type pills. */
const TYPE_BADGE_CLASS = {
  annual: 'bg-indigo-50 text-indigo-700 ring-indigo-600/20',
  sick: 'bg-rose-50 text-rose-700 ring-rose-600/20',
  personal: 'bg-sky-50 text-sky-700 ring-sky-600/20',
  maternity: 'bg-pink-50 text-pink-700 ring-pink-600/20',
  paternity: 'bg-purple-50 text-purple-700 ring-purple-600/20',
  unpaid: 'bg-gray-50 text-gray-700 ring-gray-600/20',
};

/** Format an ISO-like date as DD/MM/YYYY. */
const formatDate = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-GB');
};

/**
 * LeaveApproval — single-screen review of all leave requests waiting for a
 * decision. Supports individual approve/reject as well as bulk approve /
 * bulk reject over selected rows, with an optional comment captured in the
 * confirm dialog. The comment is surfaced in the toast but is not persisted
 * by the current backend endpoint (no schema column yet) — kept here for UI
 * parity with the spec so wiring it up later is a one-line change.
 *
 * @param {Object} props
 * @param {number} [props.departmentId] - Optional scope filter (manager use)
 * @param {Function} [props.onChanged] - Fired after any mutation (so parents
 *                                       can refresh dashboards / badges)
 * @returns {JSX.Element}
 */
const LeaveApproval = ({ departmentId, onChanged }) => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [actingId, setActingId] = useState(null); // per-row pending state
  const [bulkAction, setBulkAction] = useState(null); // 'approve' | 'reject'
  const [bulkComment, setBulkComment] = useState('');
  const [bulkRunning, setBulkRunning] = useState(false);

  const { addToast } = useToast();

  /**
   * Load the pending queue. Pinned by departmentId when supplied so
   * department managers only see their own team's requests.
   */
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const pending = await leaveRequestApi.getPendingApprovals(
        departmentId ? { department_id: departmentId } : {}
      );
      setRows(Array.isArray(pending) ? pending : []);
      setSelectedIds(new Set()); // reset selection on reload
    } catch (err) {
      addToast(
        err.response?.data?.message || 'Failed to load pending approvals',
        'error'
      );
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [departmentId, addToast]);

  useEffect(() => {
    load();
  }, [load]);

  /** Toggle a single-row checkbox. */
  const toggleOne = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  /** Select / deselect every visible row. */
  const toggleAll = () => {
    if (selectedIds.size === rows.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(rows.map((r) => r.id)));
    }
  };

  /**
   * Apply a decision to a single row. Returns the row's id on success so
   * the caller can update its local set.
   */
  const applyOne = async (row, decision) => {
    setActingId(row.id);
    try {
      if (decision === 'approve') {
        await leaveRequestApi.approve(row.id);
        addToast(
          `Approved leave for ${row.first_name} ${row.last_name}`,
          'success'
        );
      } else {
        await leaveRequestApi.reject(row.id);
        addToast(
          `Rejected leave for ${row.first_name} ${row.last_name}`,
          'info'
        );
      }
      onChanged?.();
      await load();
    } catch (err) {
      const msg =
        err.response?.data?.message ||
        `Failed to ${decision} leave request`;
      addToast(msg, 'error');
    } finally {
      setActingId(null);
    }
  };

  /**
   * Kick off bulk mode — opens the confirm dialog with a comment field.
   */
  const startBulk = (action) => {
    if (selectedIds.size === 0) {
      addToast('Select at least one request first', 'info');
      return;
    }
    setBulkComment('');
    setBulkAction(action);
  };

  /**
   * Execute the staged bulk action. Falls back gracefully when one row
   * fails — successes still land, and the toast tallies both.
   */
  const runBulk = async () => {
    if (!bulkAction) return;
    const ids = [...selectedIds];
    setBulkRunning(true);

    const fn =
      bulkAction === 'approve'
        ? leaveRequestApi.approve
        : leaveRequestApi.reject;

    const results = await Promise.allSettled(ids.map((id) => fn(id)));
    const ok = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.length - ok;

    if (ok > 0) {
      addToast(
        `${bulkAction === 'approve' ? 'Approved' : 'Rejected'} ${ok} request${
          ok === 1 ? '' : 's'
        }${bulkComment ? ` — comment noted` : ''}`,
        failed ? 'info' : 'success'
      );
    }
    if (failed > 0) {
      addToast(
        `${failed} request${failed === 1 ? '' : 's'} failed`,
        'error'
      );
    }

    setBulkAction(null);
    setBulkComment('');
    setBulkRunning(false);
    onChanged?.();
    await load();
  };

  /** Whether the "select all" master checkbox is currently checked. */
  const allSelected = useMemo(
    () => rows.length > 0 && selectedIds.size === rows.length,
    [rows.length, selectedIds.size]
  );

  return (
    <div className="space-y-4">
      {/* Header + bulk actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900">
            Pending Approvals
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            {rows.length} request{rows.length === 1 ? '' : 's'} awaiting a
            decision
            {departmentId ? ' in your department' : ''}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => startBulk('approve')}
            disabled={selectedIds.size === 0 || bulkRunning}
            className="px-3 py-2 text-sm font-medium rounded-md bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
          >
            Approve ({selectedIds.size})
          </button>
          <button
            type="button"
            onClick={() => startBulk('reject')}
            disabled={selectedIds.size === 0 || bulkRunning}
            className="px-3 py-2 text-sm font-medium rounded-md bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
          >
            Reject ({selectedIds.size})
          </button>
          <button
            type="button"
            onClick={load}
            disabled={loading || bulkRunning}
            className="px-3 py-2 text-sm font-medium rounded-md bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Body */}
      {loading ? (
        <div className="flex justify-center py-10">
          <LoadingSpinner />
        </div>
      ) : rows.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-10 text-center text-gray-500">
          <svg
            className="mx-auto h-10 w-10 text-gray-400"
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
          <p className="mt-2 text-sm">No pending leave requests — all caught up.</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="w-12 px-3 py-2 text-left">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      aria-label="Select all"
                    />
                  </th>
                  <th className="px-3 py-2 text-left">Employee</th>
                  <th className="px-3 py-2 text-left">Type</th>
                  <th className="px-3 py-2 text-left">Dates</th>
                  <th className="px-3 py-2 text-right">Days</th>
                  <th className="px-3 py-2 text-left">Reason</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((row) => {
                  const checked = selectedIds.has(row.id);
                  const typeClass =
                    TYPE_BADGE_CLASS[row.lloji] || TYPE_BADGE_CLASS.unpaid;
                  const isActing = actingId === row.id;
                  return (
                    <tr
                      key={row.id}
                      className={`${checked ? 'bg-indigo-50/40' : ''} hover:bg-gray-50`}
                    >
                      <td className="px-3 py-3">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleOne(row.id)}
                          className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                          aria-label={`Select request #${row.id}`}
                        />
                      </td>
                      <td className="px-3 py-3">
                        <div className="font-medium text-gray-900">
                          {row.first_name} {row.last_name}
                        </div>
                        {row.numri_punonjesit && (
                          <div className="text-xs text-gray-500 font-mono">
                            {row.numri_punonjesit}
                          </div>
                        )}
                        {row.department_emertimi && (
                          <div className="text-xs text-gray-500">
                            {row.department_emertimi}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ring-1 ring-inset ${typeClass}`}
                        >
                          {row.lloji}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-gray-700">
                        {formatDate(row.data_fillimit)} –{' '}
                        {formatDate(row.data_perfundimit)}
                      </td>
                      <td className="px-3 py-3 text-right font-medium text-gray-900">
                        {row.total_days ?? '—'}
                      </td>
                      <td className="px-3 py-3 text-gray-600 max-w-xs">
                        {row.arsyeja ? (
                          <span className="line-clamp-2" title={row.arsyeja}>
                            {row.arsyeja}
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => applyOne(row, 'approve')}
                            disabled={isActing || bulkRunning}
                            className="px-2.5 py-1 text-xs font-medium rounded-md bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
                          >
                            {isActing ? '…' : 'Approve'}
                          </button>
                          <button
                            type="button"
                            onClick={() => applyOne(row, 'reject')}
                            disabled={isActing || bulkRunning}
                            className="px-2.5 py-1 text-xs font-medium rounded-md bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                          >
                            Reject
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Bulk confirm banner with optional comment (rendered as a sheet
          above the table rather than a nested dialog so the comment
          textarea isn't trapped inside a <p> tag). */}
      {bulkAction && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${bulkAction === 'approve' ? 'Approve' : 'Reject'} selected requests`}
          className={`rounded-lg border p-4 space-y-3 ${
            bulkAction === 'approve'
              ? 'bg-green-50 border-green-200'
              : 'bg-red-50 border-red-200'
          }`}
        >
          <div>
            <h3 className="text-sm font-semibold text-gray-900">
              {bulkAction === 'approve'
                ? 'Approve selected requests?'
                : 'Reject selected requests?'}
            </h3>
            <p className="text-sm text-gray-700 mt-1">
              This will {bulkAction} {selectedIds.size} leave request
              {selectedIds.size === 1 ? '' : 's'}. Add an optional comment
              below — it will accompany the action in your toast confirmation.
            </p>
          </div>
          <textarea
            rows={3}
            value={bulkComment}
            onChange={(e) => setBulkComment(e.target.value)}
            placeholder="Optional comment (e.g. 'Coverage confirmed with team lead')"
            className="block w-full rounded-md border-gray-300 shadow-sm focus:ring-indigo-500 focus:border-indigo-500 text-sm"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                if (bulkRunning) return;
                setBulkAction(null);
                setBulkComment('');
              }}
              disabled={bulkRunning}
              className="px-3 py-2 text-sm font-medium rounded-md bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={runBulk}
              disabled={bulkRunning}
              className={`px-3 py-2 text-sm font-medium rounded-md text-white disabled:opacity-50 ${
                bulkAction === 'approve'
                  ? 'bg-green-600 hover:bg-green-700'
                  : 'bg-red-600 hover:bg-red-700'
              }`}
            >
              {bulkRunning
                ? 'Working…'
                : bulkAction === 'approve'
                  ? 'Approve all'
                  : 'Reject all'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default LeaveApproval;
