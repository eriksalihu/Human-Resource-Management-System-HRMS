/**
 * @file frontend/src/components/common/Toast.jsx
 * @description Toast notification system with variants, auto-dismiss,
 *   queue management (max 3 visible), stacking depth animation,
 *   swipe-to-dismiss on touch, and configurable screen position.
 * @author Dev B (original), Dev A (queue + gestures + positioning)
 *
 * v2 (commit 251) additions:
 *   - **Queue management**: at most `MAX_VISIBLE` (3) toasts render at
 *     once. Extra toasts wait in the backing list and promote into view
 *     as visible ones dismiss, so a burst of notifications doesn't bury
 *     the screen. A "+N more" pill shows the queued overflow count.
 *   - **Stacking animation**: visible toasts beyond the first are
 *     slightly scaled down + offset so the stack reads as depth rather
 *     than a flat list.
 *   - **Swipe to dismiss**: on touch devices the toast follows the
 *     finger horizontally; releasing past a distance/velocity threshold
 *     dismisses it (in the direction of the swipe).
 *   - **Configurable position**: `position` prop on `ToastContainer`
 *     ('top-right' default, plus the three other corners + top/bottom
 *     center). The slide-in direction adapts to the chosen edge.
 *
 * `useToast`'s public shape is unchanged: `{ toasts, addToast,
 * dismissToast }`. Existing call sites keep working untouched.
 */

import { useState, useEffect, useCallback, useRef } from 'react';

/** Hard cap on simultaneously-rendered toasts. The rest queue. */
const MAX_VISIBLE = 3;

/** Swipe distance (px) past which release dismisses the toast. */
const SWIPE_DISMISS_PX = 80;

/** Swipe velocity (px/ms) above which even a short flick dismisses. */
const SWIPE_VELOCITY = 0.45;

/**
 * Icon and color configuration for each toast variant.
 */
const variantConfig = {
  success: {
    bgClass: 'bg-green-50 border-green-200',
    iconClass: 'text-green-500',
    icon: 'M5 13l4 4L19 7',
  },
  error: {
    bgClass: 'bg-red-50 border-red-200',
    iconClass: 'text-red-500',
    icon: 'M6 18L18 6M6 6l12 12',
  },
  warning: {
    bgClass: 'bg-yellow-50 border-yellow-200',
    iconClass: 'text-yellow-500',
    icon: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z',
  },
  info: {
    bgClass: 'bg-blue-50 border-blue-200',
    iconClass: 'text-blue-500',
    icon: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  },
};

/** Position → container anchor + default slide-in axis. */
const POSITION_CONFIG = {
  'top-right': { anchor: 'top-4 right-4', enter: 'translate-x-full' },
  'top-left': { anchor: 'top-4 left-4', enter: '-translate-x-full' },
  'bottom-right': { anchor: 'bottom-4 right-4', enter: 'translate-x-full' },
  'bottom-left': { anchor: 'bottom-4 left-4', enter: '-translate-x-full' },
  'top-center': {
    anchor: 'top-4 left-1/2 -translate-x-1/2',
    enter: '-translate-y-8',
  },
};

/**
 * Single toast notification item.
 *
 * @param {Object} props
 * @param {string} props.id - Unique identifier for the toast
 * @param {string} props.message - The notification message
 * @param {string} [props.variant='info'] - 'success'|'error'|'warning'|'info'
 * @param {Function} props.onDismiss - Callback to remove this toast
 * @param {number} [props.duration=5000] - Auto-dismiss duration in ms
 * @param {number} [props.depth=0] - Stack index (0 = front-most)
 * @param {string} [props.enterClass] - Off-screen entry transform class
 */
const ToastItem = ({
  id,
  message,
  variant = 'info',
  onDismiss,
  duration = 5000,
  depth = 0,
  enterClass = 'translate-x-full',
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [dragX, setDragX] = useState(0);
  const [dismissing, setDismissing] = useState(false);
  const dragRef = useRef(null);
  const timerRef = useRef(null);
  const config = variantConfig[variant] || variantConfig.info;

  const close = useCallback(() => {
    setIsVisible(false);
    setDismissing(true);
    setTimeout(() => onDismiss(id), 250);
  }, [id, onDismiss]);

  useEffect(() => {
    // Trigger slide-in animation on mount.
    const raf = requestAnimationFrame(() => setIsVisible(true));
    timerRef.current = setTimeout(close, duration);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timerRef.current);
    };
  }, [duration, close]);

  /* ── Swipe-to-dismiss ──────────────────────────────────────────── */

  const onTouchStart = (e) => {
    const t = e.touches[0];
    if (!t) return;
    // Pause auto-dismiss while the user is interacting.
    clearTimeout(timerRef.current);
    dragRef.current = { startX: t.clientX, startedAt: Date.now(), x: t.clientX };
  };

  const onTouchMove = (e) => {
    if (!dragRef.current) return;
    const t = e.touches[0];
    if (!t) return;
    dragRef.current.x = t.clientX;
    setDragX(t.clientX - dragRef.current.startX);
  };

  const onTouchEnd = () => {
    if (!dragRef.current) return;
    const { startX, startedAt, x } = dragRef.current;
    dragRef.current = null;
    const distance = x - startX;
    const velocity = Math.abs(distance) / Math.max(1, Date.now() - startedAt);

    if (Math.abs(distance) > SWIPE_DISMISS_PX || velocity > SWIPE_VELOCITY) {
      // Fling it the rest of the way out, then remove.
      setDragX(distance > 0 ? window.innerWidth : -window.innerWidth);
      setTimeout(() => onDismiss(id), 200);
    } else {
      // Snap back + restart the (shortened) auto-dismiss timer.
      setDragX(0);
      timerRef.current = setTimeout(close, 2000);
    }
  };

  // Deeper toasts in the stack render slightly smaller + pushed back
  // so the stack reads as physical depth.
  const stackStyle = {
    transform: `translateX(${dragX}px) scale(${1 - Math.min(depth, 2) * 0.04})`,
    opacity: dragX !== 0 ? Math.max(0, 1 - Math.abs(dragX) / 250) : undefined,
    transition: dragRef.current ? 'none' : 'transform 250ms, opacity 250ms',
    zIndex: 50 - depth,
  };

  return (
    <div
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
      style={stackStyle}
      className={`flex items-center gap-3 px-4 py-3 border rounded-lg shadow-lg ${config.bgClass} ${
        isVisible && !dismissing
          ? 'translate-x-0 opacity-100'
          : `${enterClass} opacity-0`
      }`}
      role="alert"
      aria-live={variant === 'error' ? 'assertive' : 'polite'}
    >
      {/* Icon */}
      <svg
        className={`w-5 h-5 flex-shrink-0 ${config.iconClass}`}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d={config.icon}
        />
      </svg>

      {/* Message */}
      <p className="text-sm text-gray-700 flex-1">{message}</p>

      {/* Close button */}
      <button
        onClick={close}
        className="p-1 rounded text-gray-400 hover:text-gray-600 transition-colors"
        aria-label="Dismiss notification"
      >
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </button>
    </div>
  );
};

/**
 * ToastContainer - Stacking container for toast notifications.
 * Renders at most MAX_VISIBLE toasts; the rest wait in the queue and a
 * "+N more" pill communicates the backlog.
 *
 * @param {Object} props
 * @param {Array} props.toasts - Toast objects `{ id, message, variant, duration }`
 * @param {Function} props.onDismiss - Remove a toast by id
 * @param {string} [props.position='top-right'] - Screen anchor
 * @returns {JSX.Element}
 */
const ToastContainer = ({ toasts, onDismiss, position = 'top-right' }) => {
  const posConfig = POSITION_CONFIG[position] || POSITION_CONFIG['top-right'];
  const visible = toasts.slice(0, MAX_VISIBLE);
  const queuedCount = Math.max(0, toasts.length - MAX_VISIBLE);
  const bottomAnchored = position.startsWith('bottom');

  return (
    <div
      className={`fixed z-[100] flex flex-col gap-2 w-80 max-w-[calc(100vw-2rem)] ${posConfig.anchor} ${
        bottomAnchored ? 'flex-col-reverse' : 'flex-col'
      }`}
      aria-label="Notifications"
      role="region"
    >
      {visible.map((toast, index) => (
        <ToastItem
          key={toast.id}
          id={toast.id}
          message={toast.message}
          variant={toast.variant}
          duration={toast.duration}
          depth={index}
          enterClass={posConfig.enter}
          onDismiss={onDismiss}
        />
      ))}

      {queuedCount > 0 && (
        <div
          className="self-center px-2.5 py-0.5 rounded-full bg-gray-800/80 text-white text-[11px] font-medium"
          aria-live="polite"
        >
          +{queuedCount} more
        </div>
      )}
    </div>
  );
};

/**
 * useToast - Custom hook for managing toast notifications.
 * Returns a toast list, an addToast function, and a dismissToast function.
 *
 * @returns {{ toasts: Array, addToast: Function, dismissToast: Function }}
 */
export const useToast = () => {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, variant = 'info', duration = 5000) => {
    const id = Date.now().toString() + Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { id, message, variant, duration }]);
  }, []);

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return { toasts, addToast, dismissToast };
};

export default ToastContainer;
