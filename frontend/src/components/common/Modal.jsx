/**
 * @file frontend/src/components/common/Modal.jsx
 * @description Responsive accessible modal dialog with backdrop, size
 *   variants, focus management (initial focus + tab trapping + restore),
 *   and mobile full-screen / desktop centered presentation.
 * @author Dev B (original), Dev A (responsive + accessibility)
 *
 * Behavior:
 *
 *   • **Mobile** (< sm, 640px): the modal goes FULL-SCREEN and slides up
 *     from the bottom. Form modals on phones are easier to fill out when
 *     the dialog owns the whole viewport rather than fighting with the
 *     soft keyboard for centered space.
 *
 *   • **Desktop** (≥ sm): centered dialog with size variants
 *     (`sm`/`md`/`lg`/`xl`) — preserves the original behavior so existing
 *     callers keep their layout.
 *
 *   • **Escape key** closes; **backdrop click** closes; both work on all
 *     viewports.
 *
 *   • **Focus trap**: Tab and Shift+Tab cycle through focusable
 *     descendants of the dialog. Focus is moved to the first focusable
 *     element on open (or the dialog itself when nothing is focusable),
 *     and restored to the element that opened the modal on close.
 *
 *   • **Body scroll lock** while open — prevents the page beneath from
 *     scrolling on iOS / Android (touch).
 */

import { useEffect, useRef, useState } from 'react';

/**
 * Tailwind size classes for the desktop dialog footprint. Phone view
 * ignores these — the modal goes full-screen regardless.
 */
const sizeClasses = {
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-md',
  lg: 'sm:max-w-lg',
  xl: 'sm:max-w-xl',
};

/* ──────────────────────────────────────────────────────────────────── */
/* Modal stack (commit 279 — fix nested-modal stacking)                  */
/* ──────────────────────────────────────────────────────────────────── */

/**
 * Module-level stack of currently-open modal ids, in open order. Lets
 * each modal know whether it's the TOP-MOST one.
 *
 * The bugs this fixes:
 *   - Every Modal added its own `document` keydown listener, so Escape
 *     fired ALL of them at once — opening a ConfirmDialog from inside
 *     an edit Modal and pressing Escape closed both. `stopPropagation`
 *     doesn't help: the listeners are siblings on the same node, not a
 *     bubbling chain.
 *   - All modals shared `z-50`, so a child's backdrop sat at the same
 *     layer as the parent's and the stacking was ambiguous.
 * Only the top-most modal now reacts to Escape / backdrop, and each
 * modal's z-index steps up with its depth (kept well below the toast
 * layer at z-100 so toasts/rate-limit banners still sit above modals).
 */
const modalStack = [];
let modalSeq = 0;

/** Base z for the first modal; each nested level adds 1. */
const MODAL_Z_BASE = 50;
/** Hard ceiling so modals never reach the toast layer (z-[100]). */
const MODAL_Z_MAX = 90;

/**
 * Find all focusable descendants of a container, in tab order. The
 * selector covers buttons / links / form inputs / anything with an
 * explicit `tabindex >= 0`. Disabled inputs and `tabindex="-1"` are
 * excluded so the focus trap behaves like the browser's native one.
 *
 * @param {HTMLElement} container
 * @returns {HTMLElement[]}
 */
const getFocusable = (container) => {
  if (!container) return [];
  const selector = [
    'a[href]',
    'area[href]',
    'button:not([disabled])',
    'input:not([disabled]):not([type="hidden"])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
    'iframe',
    'object',
    'embed',
    'audio[controls]',
    'video[controls]',
    '[contenteditable]:not([contenteditable="false"])',
  ].join(',');
  return Array.from(container.querySelectorAll(selector)).filter(
    (el) =>
      // Filter out elements that are part of an `inert` subtree or
      // hidden via aria-hidden / display:none / visibility:hidden.
      !el.hasAttribute('inert') &&
      el.getAttribute('aria-hidden') !== 'true' &&
      el.offsetParent !== null
  );
};

/**
 * Modal — accessible, responsive dialog.
 *
 * @param {Object} props
 * @param {boolean} props.isOpen - Whether the modal is visible
 * @param {Function} props.onClose - Callback to close the modal
 * @param {string} props.title - Modal header title (also the aria-label)
 * @param {string} [props.size='md'] - Desktop size: 'sm' | 'md' | 'lg' | 'xl'
 * @param {React.ReactNode} props.children - Modal body content
 * @param {boolean} [props.closeOnBackdrop=true] - Backdrop click closes?
 * @returns {JSX.Element|null}
 */
const Modal = ({
  isOpen,
  onClose,
  title,
  size = 'md',
  children,
  closeOnBackdrop = true,
}) => {
  const dialogRef = useRef(null);
  /**
   * The element that had focus when the modal opened — we restore focus
   * to it on close so keyboard users don't lose their place.
   */
  const previousActiveRef = useRef(null);
  /** This modal's stable id within the open-modal stack. */
  const idRef = useRef(null);
  if (idRef.current === null) {
    modalSeq += 1;
    idRef.current = modalSeq;
  }
  /** Depth in the stack (0 = base). Drives the stepped z-index. */
  const [depth, setDepth] = useState(0);

  /** True only when this modal is the front-most one. */
  const isTopmost = () =>
    modalStack[modalStack.length - 1] === idRef.current;

  // ─── Stack registration ────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return undefined;
    const myId = idRef.current;
    modalStack.push(myId);
    setDepth(modalStack.indexOf(myId));
    return () => {
      const i = modalStack.indexOf(myId);
      if (i !== -1) modalStack.splice(i, 1);
    };
  }, [isOpen]);

  // ─── Body scroll lock + Escape key + focus management ───────────────
  useEffect(() => {
    if (!isOpen) return undefined;

    // Remember focused element BEFORE we move focus into the dialog.
    previousActiveRef.current =
      typeof document !== 'undefined' ? document.activeElement : null;

    // Lock body scroll for the duration of the modal.
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Move focus into the dialog after the next paint so the element is
    // mounted. Prefers the first focusable child; falls back to the
    // dialog container (which has tabIndex={-1}).
    const focusInside = () => {
      const node = dialogRef.current;
      if (!node) return;
      const focusables = getFocusable(node);
      if (focusables.length > 0) {
        focusables[0].focus();
      } else {
        node.focus();
      }
    };
    const id = window.requestAnimationFrame(focusInside);

    // Keyboard handler — Escape closes; Tab/Shift+Tab cycle inside.
    // Only the TOP-MOST modal reacts: every open Modal attaches its own
    // document listener, so without this gate Escape (and focus
    // trapping) would fire for the parent too when a child is open.
    const onKeyDown = (e) => {
      if (!isTopmost()) return;
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const node = dialogRef.current;
      if (!node) return;
      const focusables = getFocusable(node);
      if (focusables.length === 0) {
        // Trap focus on the dialog itself.
        e.preventDefault();
        node.focus();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);

    return () => {
      window.cancelAnimationFrame(id);
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = originalOverflow;
      // Restore focus to the opener. Use a microtask delay so the
      // dialog has had time to unmount before focusing.
      const prev = previousActiveRef.current;
      if (prev && typeof prev.focus === 'function') {
         
        queueMicrotask(() => prev.focus());
      }
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const desktopSizeClass = sizeClasses[size] || sizeClasses.md;

  // Stepped z-index: deeper modals sit above shallower ones, capped so
  // they never reach the toast/rate-limit layer (z-100 / z-120).
  const zIndex = Math.min(MODAL_Z_BASE + depth, MODAL_Z_MAX);

  /**
   * Backdrop click closes — but only when this is the front-most modal.
   * A child modal's backdrop visually covers the parent's, but guarding
   * on `isTopmost()` makes the intent explicit and prevents an
   * edge-case parent close if events ever reach it.
   */
  const handleBackdropClick = () => {
    if (closeOnBackdrop && isTopmost()) onClose();
  };

  return (
    <div
      className="fixed inset-0 flex sm:items-center sm:justify-center items-stretch justify-stretch"
      style={{ zIndex }}
      role="presentation"
    >
      {/* Backdrop overlay */}
      <div
        className="fixed inset-0 bg-black/50 transition-opacity animate-[fadeIn_0.15s_ease-in-out]"
        onClick={handleBackdropClick}
        aria-hidden="true"
      />

      {/*
        Modal container.
        Mobile (< sm): occupies the entire viewport with slide-up
        animation. Desktop (≥ sm): centered dialog with size variant,
        rounded corners, and fade-in animation.
        `tabIndex={-1}` lets us programmatically focus it when nothing
        inside is focusable.
      */}
      <div
        ref={dialogRef}
        tabIndex={-1}
        className={`
          relative z-10 flex flex-col bg-white shadow-xl
          w-full h-full
          sm:h-auto sm:max-h-[90vh] sm:w-full sm:mx-4 sm:rounded-xl
          ${desktopSizeClass}
          animate-[slideUp_0.2s_ease-out] sm:animate-[fadeIn_0.2s_ease-in-out]
          focus:outline-none
        `}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0">
          <h3
            id="modal-title"
            className="text-lg font-semibold text-gray-900 truncate"
          >
            {title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1"
            aria-label="Close modal"
          >
            <svg
              className="w-5 h-5"
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

        {/* Body — scrollable when content overflows */}
        <div className="px-6 py-4 overflow-y-auto flex-1">{children}</div>
      </div>
    </div>
  );
};

export default Modal;
