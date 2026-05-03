/**
 * @file frontend/src/context/NotificationContext.jsx
 * @description Notification context — auto-polled list, unread count, mark-as-read actions, and subscriber-driven new-notification events for toast popups
 * @author Dev A
 *
 * Polling cadence:
 *   - Every 30 seconds while the tab is visible
 *   - Immediately on the `visibilitychange` event when the tab is brought
 *     back to the foreground (so users don't see a stale badge after
 *     returning to a backgrounded tab)
 *   - The polling loop is gated by `isAuthenticated` so we don't hammer
 *     the API for users who aren't signed in
 *
 * Why direct axios calls (vs. an api/notificationApi.js layer)?
 *   The dedicated `notificationApi.js` is a later commit; this context is
 *   intentionally self-contained so it can be wired into the app today
 *   without depending on a file that doesn't yet exist. A future cleanup
 *   commit can swap these calls for the api wrapper when both ship.
 */

import {
  createContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from 'react';
import axiosInstance from '../api/axiosInstance';
import useAuth from '../hooks/useAuth';

/** Polling cadence in milliseconds. */
const POLL_INTERVAL_MS = 30 * 1000;

/** Maximum notifications kept in client state at any time. */
const MAX_LIST_SIZE = 50;

/** @type {React.Context} */
export const NotificationContext = createContext(null);

/**
 * NotificationProvider — wraps the app and keeps notification state in
 * sync via 30-second polling.
 *
 * Exposes:
 *   - notifications: Array of recent notifications (newest first, capped)
 *   - unreadCount: number of unread notifications
 *   - loading: boolean
 *   - error: last error string (if any)
 *   - lastUpdatedAt: Date of last successful fetch
 *   - refresh(): manual refetch
 *   - markAsRead(id): marks one notification as read
 *   - markAllAsRead(): marks every notification as read
 *   - deleteNotification(id): removes one notification
 *   - subscribe(handler): registers a callback fired ONCE per genuinely
 *     new notification (used by consumers to show a toast popup); returns
 *     an unsubscribe function
 *
 * @param {{ children: React.ReactNode }} props
 * @returns {JSX.Element}
 */
export const NotificationProvider = ({ children }) => {
  const { isAuthenticated, user } = useAuth() || {};

  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);

  /** Track which notification IDs we've already announced to subscribers. */
  const seenIdsRef = useRef(new Set());

  /** Active subscriber callbacks (consumers register via `subscribe`). */
  const subscribersRef = useRef(new Set());

  /** Polling timer handle so we can clear it on unmount or sign-out. */
  const timerRef = useRef(null);

  /**
   * Subscribe to "new notification" events. Each registered callback is
   * invoked once per genuinely new notification we see during a poll
   * (i.e. one whose id wasn't in `seenIdsRef`).
   *
   * Returns an unsubscribe function.
   */
  const subscribe = useCallback((handler) => {
    if (typeof handler !== 'function') return () => {};
    subscribersRef.current.add(handler);
    return () => {
      subscribersRef.current.delete(handler);
    };
  }, []);

  /**
   * Fetch the newest notifications + unread count. Called on a 30s interval
   * AND on visibility-change. Quietly swallows errors after the first one
   * so we don't flood `error` state — the user only sees one toast / banner.
   *
   * @param {Object} [opts]
   * @param {boolean} [opts.silent=false] - When true, skips the loading flag
   *   (used for background polling so the badge doesn't flicker)
   */
  const refresh = useCallback(
    async ({ silent = false } = {}) => {
      if (!isAuthenticated) return;

      if (!silent) setLoading(true);
      try {
        const [listResp, countResp] = await Promise.all([
          axiosInstance.get('/notifications/me', {
            params: { limit: MAX_LIST_SIZE },
          }),
          axiosInstance.get('/notifications/unread-count'),
        ]);

        const fetched = listResp.data?.data?.notifications || [];
        const count = Number(countResp.data?.data?.count) || 0;

        // Detect genuinely-new rows so we can fire `onNewNotification` for
        // each (subscribers typically render a toast). On the first fetch
        // we seed `seenIdsRef` without firing — otherwise every notification
        // would toast on initial load.
        const isFirstFetch = seenIdsRef.current.size === 0;
        const newRows = isFirstFetch
          ? []
          : fetched.filter((n) => n.id != null && !seenIdsRef.current.has(n.id));

        // Update the seen-set with everything we just fetched.
        for (const n of fetched) {
          if (n.id != null) seenIdsRef.current.add(n.id);
        }

        setNotifications(fetched);
        setUnreadCount(count);
        setLastUpdatedAt(new Date());
        setError(null);

        // Fire subscribers for each truly-new notification (newest first).
        if (newRows.length > 0 && subscribersRef.current.size > 0) {
          for (const row of newRows) {
            for (const handler of subscribersRef.current) {
              try {
                handler(row);
              } catch (subscriberErr) {
                // A misbehaving subscriber shouldn't break polling.
                console.error(
                  '[NotificationContext] subscriber threw:',
                  subscriberErr
                );
              }
            }
          }
        }
      } catch (err) {
        // Don't toast or log spam — just record the error for debugging.
        const msg =
          err.response?.data?.message ||
          err.message ||
          'Failed to load notifications';
        setError(msg);
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [isAuthenticated]
  );

  /** Optimistically mark one notification as read (rolls back on error). */
  const markAsRead = useCallback(async (id) => {
    if (!id) return;

    // Optimistic local update — feels instant, then we reconcile.
    let prevSnapshot = null;
    setNotifications((prev) => {
      prevSnapshot = prev;
      return prev.map((n) =>
        n.id === id ? { ...n, is_read: 1, read_at: new Date().toISOString() } : n
      );
    });
    setUnreadCount((c) => Math.max(0, c - 1));

    try {
      await axiosInstance.put(`/notifications/${id}/read`);
    } catch (err) {
      // Roll back on failure.
      if (prevSnapshot) setNotifications(prevSnapshot);
      // Reconcile counter rather than guessing.
      try {
        const countResp = await axiosInstance.get('/notifications/unread-count');
        setUnreadCount(Number(countResp.data?.data?.count) || 0);
      } catch {
        /* swallow */
      }
      throw err;
    }
  }, []);

  /** Mark every unread notification as read. */
  const markAllAsRead = useCallback(async () => {
    let prevSnapshot = null;
    setNotifications((prev) => {
      prevSnapshot = prev;
      return prev.map((n) =>
        n.is_read ? n : { ...n, is_read: 1, read_at: new Date().toISOString() }
      );
    });
    setUnreadCount(0);

    try {
      await axiosInstance.put('/notifications/read-all');
    } catch (err) {
      if (prevSnapshot) setNotifications(prevSnapshot);
      try {
        const countResp = await axiosInstance.get('/notifications/unread-count');
        setUnreadCount(Number(countResp.data?.data?.count) || 0);
      } catch {
        /* swallow */
      }
      throw err;
    }
  }, []);

  /** Delete one notification. */
  const deleteNotification = useCallback(async (id) => {
    if (!id) return;
    let prevSnapshot = null;
    let prevCount = 0;
    setNotifications((prev) => {
      prevSnapshot = prev;
      const target = prev.find((n) => n.id === id);
      // If we're removing an unread row, decrement the badge.
      if (target && !target.is_read) {
        setUnreadCount((c) => {
          prevCount = c;
          return Math.max(0, c - 1);
        });
      }
      return prev.filter((n) => n.id !== id);
    });

    try {
      await axiosInstance.delete(`/notifications/${id}`);
      // Don't keep the deleted id in the seen-set forever — re-allow it
      // to fire as "new" if the server ever recreates a row with the same id.
      seenIdsRef.current.delete(id);
    } catch (err) {
      if (prevSnapshot) setNotifications(prevSnapshot);
      if (prevCount) setUnreadCount(prevCount);
      throw err;
    }
  }, []);

  /**
   * Polling lifecycle. Starts when the user authenticates, pauses on
   * sign-out, and reacts to tab-visibility changes so we hit the API once
   * a backgrounded tab returns to the foreground.
   */
  useEffect(() => {
    if (!isAuthenticated) {
      // Stop polling and clear local state on logout.
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setNotifications([]);
      setUnreadCount(0);
      setError(null);
      setLastUpdatedAt(null);
      seenIdsRef.current.clear();
      return undefined;
    }

    // Initial fetch on mount / re-auth.
    refresh({ silent: false });

    // 30-second polling.
    timerRef.current = setInterval(() => {
      refresh({ silent: true });
    }, POLL_INTERVAL_MS);

    // Re-fetch when the tab returns to the foreground.
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        refresh({ silent: true });
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      document.removeEventListener('visibilitychange', handleVisibility);
    };
    // We deliberately depend on `isAuthenticated` and `user?.id` (so a
    // user-swap re-seeds the seen-set) but NOT on `refresh` — `refresh`
    // is stable via useCallback against `isAuthenticated`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, user?.id]);

  const value = useMemo(
    () => ({
      notifications,
      unreadCount,
      loading,
      error,
      lastUpdatedAt,
      refresh,
      markAsRead,
      markAllAsRead,
      deleteNotification,
      subscribe,
    }),
    [
      notifications,
      unreadCount,
      loading,
      error,
      lastUpdatedAt,
      refresh,
      markAsRead,
      markAllAsRead,
      deleteNotification,
      subscribe,
    ]
  );

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
};

export default NotificationContext;
