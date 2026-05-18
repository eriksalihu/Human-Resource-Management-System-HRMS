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

import { useEffect, useRef } from 'react';

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
    const onKeyDown = (e) => {
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

  return (
    <div
      className="fixed inset-0 z-50 flex sm:items-center sm:justify-center items-stretch justify-stretch"
      role="presentation"
    >
      {/* Backdrop overlay */}
      <div
        className="fixed inset-0 bg-black/50 transition-opacity animate-[fadeIn_0.15s_ease-in-out]"
        onClick={closeOnBackdrop ? onClose : undefined}
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
