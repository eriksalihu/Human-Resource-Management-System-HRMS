/**
 * @file frontend/src/pages/NotificationsPage.jsx
 * @description Notifications page — chronological list, all/unread/read filter, bulk mark-as-read, individual delete, and notification-type icons
 * @author Dev B
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import * as notificationApi from '../api/notificationApi';
import LoadingSpinner from '../components/common/LoadingSpinner';
import ConfirmDialog from '../components/common/ConfirmDialog';
import { useToast } from '../components/common/Toast';
import { SafeText, sanitizeUrl } from '../utils/security';

/** Filter tabs. */
const FILTERS = [
  { id: 'all',    label: 'All' },
  { id: 'unread', label: 'Unread' },
  { id: 'read',   label: 'Read' },
];

/**
 * Tone classes per notification type — drives the left-border accent and
 * the icon-circle background. Falls back to neutral gray for unknown types.
 */
const TYPE_META = {
  info: {
    border: 'border-l-sky-500',
    iconBg: 'bg-sky-100 text-sky-700',
    label: 'Info',
  },
  success: {
    border: 'border-l-emerald-500',
    iconBg: 'bg-emerald-100 text-emerald-700',
    label: 'Success',
  },
  warning: {
    border: 'border-l-amber-500',
    iconBg: 'bg-amber-100 text-amber-800',
    label: 'Warning',
  },
  error: {
    border: 'border-l-rose-500',
    iconBg: 'bg-rose-100 text-rose-700',
    label: 'Error',
  },
};

const DEFAULT_TYPE_META = {
  border: 'border-l-gray-300',
  iconBg: 'bg-gray-100 text-gray-700',
  label: 'Note',
};

/** Inline SVG icon per type. */
const TYPE_ICONS = {
  info: (
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
        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  ),
  success: (
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
        d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
      />
    </svg>
  ),
  warning: (
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
        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
      />
    </svg>
  ),
  error: (
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
        d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  ),
};

/** Lightweight relative-time formatter. */
const formatRelative = (timestamp) => {
  if (!timestamp) return '—';
  const t = new Date(timestamp).getTime();
  if (!Number.isFinite(t)) return '—';
  const diffSec = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (diffSec < 30) return 'just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(timestamp).toLocaleDateString('en-GB');
};

/** Absolute timestamp for hover tooltips. */
const formatAbsolute = (timestamp) => {
  if (!timestamp) return '';
  const d = new Date(timestamp);
  if (!Number.isFinite(d.getTime())) return '';
  return d
    .toLocaleString('en-GB', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
    .replace(',', '');
};

/**
 * NotificationsPage — full list of the caller's notifications.
 *
 * @returns {JSX.Element}
 */
const NotificationsPage = () => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [busyId, setBusyId] = useState(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const { addToast } = useToast();

  /** Fetch the caller's notifications. */
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await notificationApi.getMyNotifications({ limit: 200 });
      setRows(result?.notifications || []);
    } catch (err) {
      addToast(
        err.response?.data?.message || 'Failed to load notifications',
        'error'
      );
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    load();
  }, [load]);

  /** Apply the read/unread filter client-side so toggles feel instant. */
  const filtered = useMemo(() => {
    if (filter === 'unread') return rows.filter((r) => !r.is_read);
    if (filter === 'read') return rows.filter((r) => r.is_read);
    return rows;
  }, [rows, filter]);

  /** Counts for the tab labels. */
  const counts = useMemo(
    () => ({
      all: rows.length,
      unread: rows.filter((r) => !r.is_read).length,
      read: rows.filter((r) => r.is_read).length,
    }),
    [rows]
  );

  /** Optimistic mark-as-read for a single row. */
  const handleMarkRead = async (row) => {
    if (row.is_read) return;
    setBusyId(row.id);

    // Optimistic local update.
    const snapshot = rows;
    setRows((prev) =>
      prev.map((n) =>
        n.id === row.id
          ? { ...n, is_read: 1, read_at: new Date().toISOString() }
          : n
      )
    );

    try {
      await notificationApi.markAsRead(row.id);
    } catch (err) {
      setRows(snapshot);
      addToast(
        err.response?.data?.message || 'Failed to mark as read',
        'error'
      );
    } finally {
      setBusyId(null);
    }
  };

  /** Optimistic mark-all-as-read with rollback on failure. */
  const handleMarkAllRead = async () => {
    if (counts.unread === 0) {
      addToast('You have no unread notifications', 'info');
      return;
    }
    setBulkBusy(true);

    const snapshot = rows;
    setRows((prev) =>
      prev.map((n) =>
        n.is_read ? n : { ...n, is_read: 1, read_at: new Date().toISOString() }
      )
    );

    try {
      const updated = await notificationApi.markAllAsRead();
      addToast(
        `Marked ${updated} notification${updated === 1 ? '' : 's'} as read`,
        'success'
      );
    } catch (err) {
      setRows(snapshot);
      addToast(
        err.response?.data?.message || 'Failed to mark all as read',
        'error'
      );
    } finally {
      setBulkBusy(false);
    }
  };

  /** Confirm + delete one notification. */
  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const snapshot = rows;
    setRows((prev) => prev.filter((n) => n.id !== deleteTarget.id));
    try {
      await notificationApi.remove(deleteTarget.id);
      addToast('Notification deleted', 'success');
      setDeleteTarget(null);
    } catch (err) {
      setRows(snapshot);
      addToast(
        err.response?.data?.message || 'Failed to delete notification',
        'error'
      );
    } finally {
      setDeleting(false);
    }
  };

  /**
   * Click handler on a row body — marks the notification as read AND
   * navigates to its `link` if one is present. Plain anchors handle
   * the navigation so right-click "open in new tab" works.
   */
  const handleRowClick = (row) => {
    if (!row.is_read) {
      // Fire-and-forget mark-read; we don't block navigation on it.
      handleMarkRead(row);
    }
  };

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
          <p className="text-sm text-gray-500">
            Heads-up activity across HRMS — leave decisions, training updates,
            document expirations, and more.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="px-3 py-1.5 text-sm font-medium rounded-md bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Refresh
          </button>
          <button
            type="button"
            onClick={handleMarkAllRead}
            disabled={bulkBusy || counts.unread === 0}
            className="px-3 py-1.5 text-sm font-medium rounded-md bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {bulkBusy
              ? 'Marking…'
              : counts.unread === 0
                ? 'All caught up'
                : `Mark ${counts.unread} as read`}
          </button>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex gap-4 overflow-x-auto" aria-label="Filter">
          {FILTERS.map((tab) => {
            const isActive = filter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilter(tab.id)}
                className={`whitespace-nowrap border-b-2 py-2 px-1 text-sm font-medium transition-colors ${
                  isActive
                    ? 'border-indigo-600 text-indigo-700'
                    : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                }`}
                aria-current={isActive ? 'page' : undefined}
              >
                {tab.label}
                <span
                  className={`ml-1.5 inline-flex items-center justify-center px-1.5 py-0.5 text-[10px] font-semibold rounded-full ${
                    isActive
                      ? 'bg-indigo-100 text-indigo-700'
                      : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {counts[tab.id]}
                </span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* List body */}
      {loading ? (
        <div className="flex justify-center py-10">
          <LoadingSpinner />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-10 text-center text-gray-500">
          <svg
            className="mx-auto h-10 w-10 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
            />
          </svg>
          <p className="mt-2 text-sm">
            {filter === 'unread'
              ? "No unread notifications — you're all caught up."
              : filter === 'read'
                ? "You haven't read any notifications yet."
                : 'No notifications yet — activity in HRMS will appear here.'}
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {filtered.map((row) => {
            const meta = TYPE_META[row.type] || DEFAULT_TYPE_META;
            const icon = TYPE_ICONS[row.type] || TYPE_ICONS.info;
            const isUnread = !row.is_read;
            const isBusy = busyId === row.id;

            const body = (
              <div
                className={`relative rounded-lg border bg-white p-3.5 border-l-4 ${meta.border} transition-colors hover:shadow-sm ${
                  isUnread ? 'border-gray-200' : 'border-gray-100'
                }`}
              >
                <div className="flex items-start gap-3">
                  {/* Type icon */}
                  <div
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${meta.iconBg}`}
                  >
                    {icon}
                  </div>

                  {/* Body */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3
                        className={`text-sm font-semibold ${
                          isUnread ? 'text-gray-900' : 'text-gray-700'
                        } truncate`}
                      >
                        {row.title}
                      </h3>
                      {isUnread && (
                        <span
                          className="inline-block h-2 w-2 rounded-full bg-indigo-500"
                          aria-label="Unread"
                        />
                      )}
                    </div>
                    {row.message && (
                      <div
                        className={`mt-0.5 text-sm ${
                          isUnread ? 'text-gray-700' : 'text-gray-500'
                        }`}
                      >
                        <SafeText text={row.message} mode="preserve" />
                      </div>
                    )}
                    <p
                      className="mt-1 text-xs text-gray-400"
                      title={formatAbsolute(row.created_at)}
                    >
                      {formatRelative(row.created_at)}
                      {row.is_read && row.read_at && (
                        <span> · read {formatRelative(row.read_at)}</span>
                      )}
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex items-start gap-2 shrink-0">
                    {isUnread && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleMarkRead(row);
                        }}
                        disabled={isBusy}
                        className="text-xs font-medium text-indigo-600 hover:text-indigo-800 disabled:opacity-50"
                      >
                        {isBusy ? '…' : 'Mark read'}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setDeleteTarget(row);
                      }}
                      className="text-xs font-medium text-red-600 hover:text-red-800"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            );

            // If the row has a deep-link, wrap it in an anchor so the
            // browser can navigate. Otherwise it's a button-styled div
            // that just marks read.
            return (
              <li key={row.id}>
                {row.link ? (
                  <a
                    href={sanitizeUrl(row.link)}
                    onClick={() => handleRowClick(row)}
                    className="block focus:outline-none focus:ring-2 focus:ring-indigo-500 rounded-lg"
                  >
                    {body}
                  </a>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleRowClick(row)}
                    className="block w-full text-left focus:outline-none focus:ring-2 focus:ring-indigo-500 rounded-lg"
                  >
                    {body}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* Delete confirmation */}
      <ConfirmDialog
        isOpen={!!deleteTarget}
        title="Delete notification"
        message={`Delete "${
          deleteTarget?.title || 'this notification'
        }"? This cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        loading={deleting}
        onConfirm={handleDeleteConfirm}
        onCancel={() => !deleting && setDeleteTarget(null)}
      />
    </div>
  );
};

export default NotificationsPage;
