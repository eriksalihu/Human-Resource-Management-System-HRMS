/**
 * @file frontend/src/components/common/SessionTimeoutModal.jsx
 * @description Session-timeout warning modal — countdown timer, "Stay Logged In" extends the session, "Logout" ends it manually
 * @author Dev B
 *
 * Reads its visibility, expiry, and actions directly from `useAuth()`:
 *   - showSessionWarning   → boolean, true within the warning window
 *   - sessionExpiresAt     → Date, drives the live countdown
 *   - extendSession()      → calls /auth/refresh-token; clears warning on success
 *   - dismissSessionWarning() → hides the modal without refreshing
 *   - logout()             → ends the session and redirects via the router guard
 *
 * Mount once near the top of the authenticated tree (e.g. inside
 * `MainLayout`) and it'll surface itself whenever the AuthContext flips
 * `showSessionWarning` to true. Single-instance design — multiple mounts
 * would race each other on the countdown.
 */

import { useEffect, useState, useRef } from 'react';
import useAuth from '../../hooks/useAuth';

/**
 * If the session expires while the modal is still visible (e.g. the user
 * walked away mid-countdown), we auto-fire `logout()` so the redirect
 * happens cleanly. This grace period gives the silent-refresh path one
 * last chance before we force a sign-out.
 */
const AUTO_LOGOUT_GRACE_MS = 1500;

/** Format a count of seconds as `M:SS`. */
const formatCountdown = (totalSeconds) => {
  const safe = Math.max(0, Math.round(totalSeconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
};

/**
 * SessionTimeoutModal — overlay shown during the warning window.
 *
 * @returns {JSX.Element|null}
 */
const SessionTimeoutModal = () => {
  const auth = useAuth();
  const {
    showSessionWarning,
    sessionExpiresAt,
    extendSession,
    dismissSessionWarning,
    logout,
  } = auth || {};

  const [secondsLeft, setSecondsLeft] = useState(0);
  const [extending, setExtending] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState(null);

  /** Track whether we've already auto-logged-out to avoid double-fires. */
  const autoLogoutFiredRef = useRef(false);

  /**
   * Tick the countdown every 250 ms while the warning is visible. We use
   * a quarter-second tick instead of a full second so the display stays
   * smooth and the auto-logout grace window is honored precisely.
   */
  useEffect(() => {
    if (!showSessionWarning || !sessionExpiresAt) {
      setSecondsLeft(0);
      autoLogoutFiredRef.current = false;
      return undefined;
    }

    const update = () => {
      const remaining = Math.max(
        0,
        (new Date(sessionExpiresAt).getTime() - Date.now()) / 1000
      );
      setSecondsLeft(remaining);

      // Auto-fire logout once the grace window has been blown through.
      if (
        remaining <= -(AUTO_LOGOUT_GRACE_MS / 1000) &&
        !autoLogoutFiredRef.current
      ) {
        autoLogoutFiredRef.current = true;
        if (typeof logout === 'function') {
          logout();
        }
      }
    };

    update();
    const interval = setInterval(update, 250);
    return () => clearInterval(interval);
  }, [showSessionWarning, sessionExpiresAt, logout]);

  /**
   * Reset transient state when the modal is dismissed/re-opened so a
   * stale "Refresh failed" message doesn't carry over to the next time
   * the warning fires.
   */
  useEffect(() => {
    if (!showSessionWarning) {
      setError(null);
      setExtending(false);
      setSigningOut(false);
    }
  }, [showSessionWarning]);

  /** Don't render anything if we're not in a warning window. */
  if (!showSessionWarning || !auth) return null;

  /** Trigger a silent refresh; on success, the AuthContext clears the warning. */
  const handleStay = async () => {
    if (extending || signingOut) return;
    setExtending(true);
    setError(null);
    try {
      const ok = await extendSession?.();
      if (!ok) {
        // The interceptor's forced-logout path will handle the actual
        // redirect — show a brief banner before it fires.
        setError('Session could not be extended. Signing you out…');
      }
    } catch (err) {
      setError(
        err?.response?.data?.message ||
          'Could not refresh your session. Try again or sign out.'
      );
    } finally {
      setExtending(false);
    }
  };

  /** Manual logout. */
  const handleLogout = async () => {
    if (extending || signingOut) return;
    setSigningOut(true);
    try {
      await logout?.();
    } finally {
      setSigningOut(false);
    }
  };

  /**
   * Dismiss without refreshing. The countdown keeps running underneath —
   * if the silent refresh succeeds the warning stays gone; if not, the
   * auto-logout grace fires.
   */
  const handleClose = () => {
    if (extending || signingOut) return;
    dismissSessionWarning?.();
  };

  const totalCountdown = Math.max(0, secondsLeft);
  const expired = secondsLeft <= 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="session-timeout-title"
      aria-describedby="session-timeout-desc"
      className="fixed inset-0 z-50 flex items-center justify-center"
    >
      {/* Backdrop — clicking does nothing; the user must pick an action. */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
        aria-hidden="true"
      />

      <div
        className="relative w-full max-w-md mx-4 rounded-xl shadow-2xl overflow-hidden animate-slide-in-down
          bg-white text-gray-900
"
      >
        {/* Header strip */}
        <div className="flex items-center gap-3 px-5 py-4 border-b bg-amber-50 border-amber-100 text-amber-900">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-200/70">
            <svg
              className="h-5 w-5"
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
          </div>
          <div>
            <h2
              id="session-timeout-title"
              className="text-base font-semibold"
            >
              Your session is about to expire
            </h2>
            <p className="text-xs opacity-80">
              We'll sign you out automatically when the timer runs out.
            </p>
          </div>
        </div>

        {/* Body — countdown + description */}
        <div className="px-5 py-5 space-y-4">
          <p
            id="session-timeout-desc"
            className="text-sm text-gray-700"
          >
            For your security, HRMS ends inactive sessions automatically.
            Click <span className="font-semibold">Stay logged in</span> to
            extend your session, or sign out now if you're done.
          </p>

          <div
            className={`flex items-baseline justify-center gap-2 rounded-lg p-4 font-mono tabular-nums ${
              expired
                ? 'bg-rose-50 text-rose-800'
                : 'bg-gray-50 text-gray-900'
            }`}
            aria-live="polite"
            aria-atomic="true"
          >
            <span className="text-3xl font-bold">
              {formatCountdown(totalCountdown)}
            </span>
            <span className="text-xs uppercase tracking-wider opacity-70">
              {expired ? 'expired' : 'remaining'}
            </span>
          </div>

          {error && (
            <p
              role="alert"
              className="text-xs rounded-md p-2 bg-rose-50 text-rose-700 ring-1 ring-rose-200"
            >
              {error}
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="px-5 py-3 border-t bg-gray-50 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2">
          <button
            type="button"
            onClick={handleClose}
            disabled={extending || signingOut}
            className="px-3 py-2 text-sm font-medium rounded-md bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Dismiss
          </button>
          <button
            type="button"
            onClick={handleLogout}
            disabled={extending || signingOut}
            className="px-3 py-2 text-sm font-medium rounded-md bg-white border border-rose-300 text-rose-700 hover:bg-rose-50 disabled:opacity-50"
          >
            {signingOut ? 'Signing out…' : 'Sign out'}
          </button>
          <button
            type="button"
            onClick={handleStay}
            disabled={extending || signingOut}
            autoFocus
            className="px-3 py-2 text-sm font-medium rounded-md bg-indigo-600 text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
          >
            {extending ? 'Extending…' : 'Stay logged in'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SessionTimeoutModal;
