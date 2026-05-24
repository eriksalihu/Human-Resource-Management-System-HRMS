/**
 * @file frontend/src/components/common/Toast.jsx
 * @description Toast notification system with variants, auto-dismiss,
 *   queue management (max 3 visible), stacking depth animation,
 *   swipe-to-dismiss on touch, and configurable screen position.
 * @author Dev B (original), Dev A (queue + gestures + positioning)
 *
 * v3 — Context-based global toast system. Previous versions used a
 * per-component `useState` inside `useToast`, which meant toasts were
 * added to local state but never rendered to the DOM (no ToastContainer
 * was mounted). Now a single `ToastProvider` near the app root owns the
 * toast list AND renders the `ToastContainer`, so every `addToast` call
 * from any component in the tree is immediately visible on screen.
 *
 * `useToast`'s public shape is unchanged: `{ toasts, addToast,
 * dismissToast }`. Existing call sites keep working untouched.
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from 'react';

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

/** Position -> container anchor + default slide-in axis. */
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

/* ── Context ─────────────────────────────────────────────────────────── */

/**
 * @type {React.Context<{ toasts: Array, addToast: Function, dismissToast: Function } | null>}
 */
const ToastContext = createContext(null);

/* ── Components ──────────────────────────────────────────────────────── */

/**
 * Single toast notification item.
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
      setDragX(distance > 0 ? window.innerWidth : -window.innerWidth);
      setTimeout(() => onDismiss(id), 200);
    } else {
      setDragX(0);
      timerRef.current = setTimeout(close, 2000);
    }
  };

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

      <p className="text-sm text-gray-700 flex-1">{message}</p>

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
 * ToastContainer — renders the visible toast stack + overflow pill.
 */
const ToastContainer = ({ toasts, onDismiss, position = 'top-right' }) => {
  const posConfig = POSITION_CONFIG[position] || POSITION_CONFIG['top-right'];
  const visible = toasts.slice(0, MAX_VISIBLE);
  const queuedCount = Math.max(0, toasts.length - MAX_VISIBLE);
  const bottomAnchored = position.startsWith('bottom');

  if (toasts.length === 0) return null;

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

/* ── Provider ────────────────────────────────────────────────────────── */

/**
 * ToastProvider — owns the global toast list AND renders the
 * `ToastContainer`. Mount once near the app root so every descendant
 * that calls `useToast()` feeds into the same visible queue.
 *
 * @param {{ children: React.ReactNode, position?: string }} props
 */
export const ToastProvider = ({ children, position = 'top-right' }) => {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, variant = 'info', duration = 5000) => {
    const id = Date.now().toString() + Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { id, message, variant, duration }]);
  }, []);

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const value = useMemo(
    () => ({ toasts, addToast, dismissToast }),
    [toasts, addToast, dismissToast],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastContainer
        toasts={toasts}
        onDismiss={dismissToast}
        position={position}
      />
    </ToastContext.Provider>
  );
};

/* ── Hook ────────────────────────────────────────────────────────────── */

/**
 * useToast — returns `{ toasts, addToast, dismissToast }`.
 *
 * When called inside a `<ToastProvider>` (the normal path), reads from
 * context so all components share one toast queue and the container is
 * rendered. The public API is unchanged from the original hook so every
 * existing call site works without modification.
 */
export const useToast = () => {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within a <ToastProvider>');
  }
  return ctx;
};

export default ToastContainer;
