/**
 * @file frontend/src/components/common/Sidebar.jsx
 * @description Responsive collapsible sidebar with dark-mode support,
 *   smooth animations, mobile overlay vs desktop push behavior, and
 *   swipe-to-close touch gestures on mobile.
 * @author Dev B (original), Dev A (responsive transforms + gestures)
 *
 * Two presentations driven by the `lg` breakpoint (≥ 1024px):
 *
 *   • **Mobile / tablet** (< lg): the sidebar is a fixed-position
 *     OVERLAY. Animates via `translateX` so it slides in from the
 *     left edge and over the page content. A swipe-left touch
 *     gesture dismisses the overlay (calls `onClose`).
 *
 *   • **Desktop** (≥ lg): the sidebar is a PUSH panel — the main
 *     content takes its left-margin from the sidebar's width, so the
 *     animation is on the `width` property collapsing to 0.
 *
 * Both presentations live on one element through breakpoint-prefixed
 * Tailwind utilities — no JS branch on viewport size for the layout
 * itself. The only JS that needs the viewport is the touch-gesture
 * handler, which is mobile-only by design.
 *
 * Touch gesture math:
 *   - Capture `touchstart` X coordinate
 *   - On `touchmove`, follow the finger with `translateX` (clamped to
 *     ≤ 0) so the slide feels responsive instead of stiff
 *   - On `touchend`, fire `onClose` when the finger travelled more
 *     than `SWIPE_CLOSE_THRESHOLD_PX` to the left OR the gesture's
 *     horizontal velocity exceeded `SWIPE_VELOCITY_THRESHOLD_PX_MS`.
 *     Otherwise snap back open.
 */

import { useEffect, useRef, useState } from 'react';
import { NavLink } from 'react-router-dom';

/** Distance in px the finger must travel left to count as a close-swipe. */
const SWIPE_CLOSE_THRESHOLD_PX = 60;

/** Velocity (px/ms) above which even a short swipe counts as a close. */
const SWIPE_VELOCITY_THRESHOLD_PX_MS = 0.4;

/** Tailwind `lg` breakpoint — kept in JS for the touch-gesture gate. */
const LG_BREAKPOINT_PX = 1024;

/**
 * Navigation items for the sidebar menu.
 * Each item has a label, path, and SVG icon path.
 */
const navItems = [
  {
    label: 'Dashboard',
    path: '/dashboard',
    icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6',
  },
  {
    label: 'Departments',
    path: '/departments',
    icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4',
  },
  {
    label: 'Positions',
    path: '/positions',
    icon: 'M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
  },
  {
    label: 'Employees',
    path: '/employees',
    icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z',
  },
  {
    label: 'Salaries',
    path: '/salaries',
    icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  },
  {
    label: 'Leave Requests',
    path: '/leave-requests',
    icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
  },
  {
    label: 'Attendance',
    path: '/attendance',
    icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4',
  },
  {
    label: 'Performance',
    path: '/performance',
    icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
  },
  {
    label: 'Trainings',
    path: '/trainings',
    icon: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253',
  },
  {
    label: 'Documents',
    path: '/documents',
    icon: 'M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z',
  },
  {
    label: 'Users',
    path: '/users',
    icon: 'M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z',
  },
];

/**
 * Sidebar — responsive collapsible navigation.
 *
 * @param {Object} props
 * @param {boolean} props.isOpen - Whether the sidebar is expanded
 * @param {Function} [props.onClose] - Called when the user dismisses the
 *   overlay via swipe-left gesture. Required for mobile UX; if omitted
 *   the gesture is detected but produces no action.
 * @returns {JSX.Element}
 */
const Sidebar = ({ isOpen, onClose }) => {
  /**
   * Drag offset (px, negative-only) — follows the finger during a swipe
   * so the slide feels responsive. Resets to 0 after touchend.
   */
  const [dragX, setDragX] = useState(0);

  /** Whether a touch gesture is currently in progress. */
  const dragRef = useRef(null);

  /**
   * Touch handlers — only meaningful on viewports < lg. We still attach
   * them universally because touchscreen laptops exist; the size check
   * prevents desktops from acting on a stylus tap.
   */
  const onTouchStart = (e) => {
    if (!isOpen) return;
    if (typeof window !== 'undefined' && window.innerWidth >= LG_BREAKPOINT_PX) {
      return; // Desktop — push mode doesn't need swipe to dismiss.
    }
    const touch = e.touches[0];
    if (!touch) return;
    dragRef.current = {
      startX: touch.clientX,
      startedAt: Date.now(),
      currentX: touch.clientX,
    };
  };

  const onTouchMove = (e) => {
    if (!dragRef.current) return;
    const touch = e.touches[0];
    if (!touch) return;
    dragRef.current.currentX = touch.clientX;
    // Clamp to ≤ 0 so the user can't drag the sidebar past its open
    // resting position (would feel buggy).
    const delta = Math.min(0, touch.clientX - dragRef.current.startX);
    setDragX(delta);
  };

  const onTouchEnd = () => {
    if (!dragRef.current) return;
    const drag = dragRef.current;
    dragRef.current = null;

    const distance = drag.currentX - drag.startX; // negative on left swipe
    const elapsedMs = Math.max(1, Date.now() - drag.startedAt);
    const velocity = Math.abs(distance) / elapsedMs;

    const traveledFarEnough = -distance > SWIPE_CLOSE_THRESHOLD_PX;
    const fastEnough = velocity > SWIPE_VELOCITY_THRESHOLD_PX_MS;

    setDragX(0);
    if ((traveledFarEnough || fastEnough) && distance < 0) {
      onClose?.();
    }
  };

  /** If `isOpen` flips while a drag is in progress, abort the drag. */
  useEffect(() => {
    if (!isOpen) {
      dragRef.current = null;
      setDragX(0);
    }
  }, [isOpen]);

  /**
   * Keyboard navigation within the nav list:
   *   - ↓ / ↑  : move focus to the next / previous link (wrapping)
   *   - Home / End : jump to the first / last link
   *   - Escape : dismiss the sidebar (mobile overlay UX)
   *
   * Tab still works natively for sequential focus; the arrow keys add
   * the expected "menu" affordance on top without hijacking Tab.
   */
  const onNavKeyDown = (e) => {
    const links = Array.from(
      e.currentTarget.querySelectorAll('a[href]')
    );
    if (links.length === 0) return;
    const currentIndex = links.indexOf(document.activeElement);

    switch (e.key) {
      case 'ArrowDown': {
        e.preventDefault();
        const next = links[(currentIndex + 1) % links.length];
        next?.focus();
        break;
      }
      case 'ArrowUp': {
        e.preventDefault();
        const prev =
          links[(currentIndex - 1 + links.length) % links.length];
        prev?.focus();
        break;
      }
      case 'Home': {
        e.preventDefault();
        links[0]?.focus();
        break;
      }
      case 'End': {
        e.preventDefault();
        links[links.length - 1]?.focus();
        break;
      }
      case 'Escape': {
        e.preventDefault();
        onClose?.();
        break;
      }
      default:
        break;
    }
  };

  // Inline style for the live drag offset. Only applied while a touch
  // gesture is active; otherwise the CSS classes handle the transform.
  const dragStyle =
    dragX < 0 && isOpen
      ? {
          // Disable the CSS transition during a live drag so the
          // sidebar follows the finger 1:1. Re-enabled on touchend.
          transition: 'none',
          transform: `translateX(${dragX}px)`,
        }
      : undefined;

  return (
    <aside
      id="app-sidebar"
      aria-label="Main navigation"
      aria-hidden={!isOpen}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
      style={dragStyle}
      className={`
        fixed left-0 top-16 bottom-0 z-20 w-64
        overflow-hidden border-r
        bg-white border-gray-200 dark:bg-gray-900 dark:border-gray-800
        will-change-transform
        transition-[transform,width] duration-300 ease-in-out
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        lg:translate-x-0
        ${isOpen ? 'lg:w-64' : 'lg:w-0'}
        shadow-xl lg:shadow-none
      `}
    >
      {/* Visual swipe affordance — a thin handle indicator visible only
          on touch devices, hints that the sidebar can be swiped away */}
      <span
        aria-hidden="true"
        className="absolute right-1 top-1/2 -translate-y-1/2 h-12 w-1 rounded-full bg-gray-300/40 dark:bg-gray-600/40 lg:hidden"
      />

      <div
        className={`p-4 transition-opacity duration-200 ${
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <p
          id="sidebar-menu-label"
          className="text-xs uppercase tracking-wider mb-4 px-3 text-gray-400 dark:text-gray-500"
        >
          Menu
        </p>
        <nav
          aria-labelledby="sidebar-menu-label"
          onKeyDown={onNavKeyDown}
          className="space-y-1"
        >
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={() => {
                // Dismiss the overlay immediately on mobile. The
                // MainLayout pathname effect only fires when the path
                // actually changes — tapping the link for the page
                // you're already on left the overlay stuck open. This
                // closes it on EVERY nav tap below the lg breakpoint.
                if (
                  typeof window !== 'undefined' &&
                  window.innerWidth < LG_BREAKPOINT_PX
                ) {
                  onClose?.();
                }
              }}
              className={({ isActive }) =>
                `relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors duration-150
                ${
                  isActive
                    ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {/* Active route accent rail */}
                  <span
                    aria-hidden="true"
                    className={`absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r-full transition-opacity ${
                      isActive
                        ? 'bg-indigo-600 dark:bg-indigo-400 opacity-100'
                        : 'opacity-0'
                    }`}
                  />
                  <svg
                    className="w-5 h-5 flex-shrink-0"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d={item.icon}
                    />
                  </svg>
                  <span className="truncate">{item.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>
      </div>
    </aside>
  );
};

export default Sidebar;
