/**
 * @file frontend/src/components/common/HelpTooltip.jsx
 * @description Inline help tooltip (commit 297) — a small question-mark
 *   trigger that reveals guidance text on hover OR click/focus, with a
 *   popover that auto-flips to whichever side has room.
 * @author Dev B
 *
 * Why both hover AND click: hover alone is inaccessible to keyboard and
 * touch users. The trigger is a real `<button>` — focus/Enter/Space
 * opens it, Escape closes it, and it carries `aria-describedby` linking
 * to the popover so screen readers announce the guidance.
 *
 * Usage:
 *   <label>
 *     Net salary
 *     <HelpTooltip text="Gross pay minus statutory deductions." />
 *   </label>
 */

import { useEffect, useId, useRef, useState } from 'react';

/**
 * @param {Object} props
 * @param {string} props.text - Guidance text shown in the popover
 * @param {'top'|'bottom'|'left'|'right'} [props.placement='top'] -
 *   Preferred side; auto-flips if it would overflow the viewport
 * @param {string} [props.label='Help'] - Accessible label for the trigger
 * @param {string} [props.className] - Extra classes on the wrapper
 * @returns {JSX.Element}
 */
const HelpTooltip = ({
  text,
  placement = 'top',
  label = 'Help',
  className = '',
}) => {
  const [open, setOpen] = useState(false);
  const [side, setSide] = useState(placement);
  const wrapperRef = useRef(null);
  const triggerRef = useRef(null);
  const popoverId = useId();

  /** Close on outside-click + Escape while open. */
  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  /**
   * When opening, flip the popover to the opposite side if the preferred
   * side would overflow the viewport. A cheap one-shot check against the
   * trigger's bounding rect — good enough for short guidance strings.
   */
  useEffect(() => {
    if (!open || !triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    const margin = 160; // rough popover footprint
    let next = placement;
    if (placement === 'top' && r.top < margin) next = 'bottom';
    else if (placement === 'bottom' && window.innerHeight - r.bottom < margin)
      next = 'top';
    else if (placement === 'left' && r.left < margin) next = 'right';
    else if (placement === 'right' && window.innerWidth - r.right < margin)
      next = 'left';
    setSide(next);
  }, [open, placement]);

  /** Position classes for the popover per resolved side. */
  const sideClasses = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  };

  return (
    <span
      ref={wrapperRef}
      className={`relative inline-flex items-center ${className}`}
      // Hover open/close for pointer users; click/focus handled on the
      // button for keyboard + touch.
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-describedby={open ? popoverId : undefined}
        onClick={() => setOpen((v) => !v)}
        onFocus={() => setOpen(true)}
        className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-gray-200 text-gray-600 text-[10px] font-bold leading-none hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
      >
        ?
      </button>

      {open && (
        <span
          id={popoverId}
          role="tooltip"
          className={`absolute z-50 w-52 max-w-[60vw] rounded-md bg-gray-900 px-3 py-2 text-xs font-normal leading-snug text-white shadow-lg ${sideClasses[side]}`}
        >
          {text}
        </span>
      )}
    </span>
  );
};

export default HelpTooltip;
