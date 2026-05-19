/**
 * @file frontend/src/components/common/RateLimitNotice.jsx
 * @description Global "Too many requests" banner with a live
 *   retry-after countdown. Driven by the axios interceptor's 429
 *   handler via the `setOnRateLimited` bridge.
 * @author Dev A
 *
 * Why a self-contained banner rather than the Toast system: the toast
 * `useToast` hook is per-component local state with no app-wide
 * provider, so there's nothing always-mounted to push a toast into
 * from a module-level interceptor. This component IS always mounted
 * (App.jsx, outside the routes) and owns its own minimal fixed-banner
 * UI + countdown timer, so it works on any page regardless of which
 * toast instances exist.
 *
 * Behavior:
 *   - On a 429 the interceptor calls `onRateLimited({ retryAfterSec,
 *     message })`; we show the banner and tick a 1s countdown.
 *   - The interceptor also arms a local cooldown gate, so additional
 *     requests are held back until the timer elapses — the banner just
 *     makes that visible.
 *   - At 0 the banner auto-dismisses. A later 429 re-arms it (and
 *     extends the countdown if the new window is longer).
 */

import { useEffect, useRef, useState } from 'react';
import { setOnRateLimited } from '../../api/axiosInstance';

const RateLimitNotice = () => {
  const [state, setState] = useState(null); // { message } | null
  const [secondsLeft, setSecondsLeft] = useState(0);
  const intervalRef = useRef(null);

  const clearTimer = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  useEffect(() => {
    setOnRateLimited(({ retryAfterSec, message }) => {
      setState({ message });
      // Extend, never shorten, if a second 429 lands mid-countdown.
      setSecondsLeft((prev) => Math.max(prev, Math.ceil(retryAfterSec)));
    });
    return () => {
      setOnRateLimited(null);
      clearTimer();
    };
  }, []);

  // Drive the 1-second countdown whenever the banner is showing.
  useEffect(() => {
    if (secondsLeft <= 0) {
      clearTimer();
      // Hide once the cooldown fully elapses.
      if (state) setState(null);
      return undefined;
    }
    if (!intervalRef.current) {
      intervalRef.current = setInterval(() => {
        setSecondsLeft((s) => (s > 0 ? s - 1 : 0));
      }, 1000);
    }
    return undefined;
    // `state` intentionally excluded — we only (re)start the ticker on
    // a seconds change, and clear it when it hits 0.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secondsLeft]);

  if (!state || secondsLeft <= 0) return null;

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="fixed top-4 left-1/2 -translate-x-1/2 z-[120] w-[min(92vw,28rem)]
        flex items-start gap-3 px-4 py-3 rounded-lg shadow-lg
        bg-amber-50 border border-amber-200 text-amber-900"
    >
      <svg
        className="h-5 w-5 flex-shrink-0 text-amber-500 mt-0.5"
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
      <div className="text-sm">
        <p className="font-semibold">Too many requests</p>
        <p className="mt-0.5">
          {state.message} You can try again in{' '}
          <span className="font-mono font-semibold tabular-nums">
            {secondsLeft}s
          </span>
          .
        </p>
      </div>
    </div>
  );
};

export default RateLimitNotice;
