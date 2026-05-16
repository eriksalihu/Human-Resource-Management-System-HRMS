/**
 * @file frontend/src/components/common/Breadcrumb.jsx
 * @description Breadcrumb navigation derived from the current React
 *   Router location. Clickable ancestor segments, non-clickable current
 *   page, accessible markup.
 * @author Dev A
 *
 * The app's routes are mostly flat (`/employees`, `/salaries`, …) with
 * detail views handled as in-page panels rather than nested routes, so
 * a typical trail is just `Dashboard › Employees`. The component still
 * handles multi-segment paths (e.g. `/trainings/42/participants`)
 * gracefully — each segment becomes a crumb, numeric IDs are shown as
 * `#42`, and unknown segments are title-cased as a fallback.
 *
 * Accessibility:
 *   - Wrapped in `<nav aria-label="Breadcrumb">`
 *   - Ordered list (`<ol>`) so screen readers announce position/size
 *   - Current page marked with `aria-current="page"` and rendered as
 *     plain text (not a link) per the WAI-ARIA breadcrumb pattern
 *   - Separators are `aria-hidden` so they aren't announced
 */

import { Link, useLocation } from 'react-router-dom';

/**
 * Friendly labels for known top-level route segments. Anything not in
 * this map falls back to a title-cased version of the raw segment, so
 * adding a new page doesn't require touching this file (it just gets a
 * sensible auto-label until someone overrides it here).
 */
const SEGMENT_LABELS = {
  dashboard: 'Dashboard',
  departments: 'Departments',
  employees: 'Employees',
  positions: 'Positions',
  attendance: 'Attendance',
  leaves: 'Leave Requests',
  'leave-requests': 'Leave Requests',
  salaries: 'Salaries',
  trainings: 'Trainings',
  performance: 'Performance',
  documents: 'Documents',
  notifications: 'Notifications',
  profile: 'My Profile',
  users: 'Users',
};

/**
 * Title-case a raw URL segment for the fallback label:
 *   "performance-reviews" → "Performance Reviews"
 *
 * @param {string} segment
 * @returns {string}
 */
const titleCase = (segment) =>
  segment
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

/**
 * Resolve a single path segment to a display label. Pure numeric
 * segments (detail-view IDs) render as `#<id>`.
 *
 * @param {string} segment
 * @returns {string}
 */
const labelForSegment = (segment) => {
  if (/^\d+$/.test(segment)) return `#${segment}`;
  return SEGMENT_LABELS[segment] || titleCase(segment);
};

/**
 * Breadcrumb — route-derived navigation trail.
 *
 * @param {Object} props
 * @param {string} [props.rootLabel='Dashboard'] - Label for the implicit
 *   root crumb that always links to `/dashboard`.
 * @param {string} [props.className] - Extra wrapper classes
 * @returns {JSX.Element|null} `null` on the dashboard itself (no trail
 *   to show when you're already at the root).
 */
const Breadcrumb = ({ rootLabel = 'Dashboard', className = '' }) => {
  const location = useLocation();

  // Split + drop empty strings ("/employees/" → ["employees"]).
  const segments = location.pathname.split('/').filter(Boolean);

  // On the dashboard / root there's nothing meaningful to show.
  const isRoot =
    segments.length === 0 ||
    (segments.length === 1 && segments[0] === 'dashboard');
  if (isRoot) return null;

  /**
   * Build cumulative crumbs. Each crumb's `to` is the path up to and
   * including that segment so ancestor links navigate correctly.
   */
  const crumbs = segments.map((segment, index) => {
    const to = `/${segments.slice(0, index + 1).join('/')}`;
    return {
      key: to,
      to,
      label: labelForSegment(segment),
      isLast: index === segments.length - 1,
    };
  });

  return (
    <nav
      aria-label="Breadcrumb"
      className={`text-sm ${className}`}
    >
      <ol className="flex items-center flex-wrap gap-1.5 text-gray-500">
        {/* Implicit root crumb */}
        <li className="flex items-center gap-1.5">
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-1 hover:text-gray-700 transition-colors"
          >
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
                d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
              />
            </svg>
            <span className="sr-only sm:not-sr-only">{rootLabel}</span>
          </Link>
        </li>

        {crumbs.map((crumb) => (
          <li key={crumb.key} className="flex items-center gap-1.5">
            {/* Separator */}
            <svg
              className="h-4 w-4 text-gray-300 flex-shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5l7 7-7 7"
              />
            </svg>

            {crumb.isLast ? (
              <span
                aria-current="page"
                className="font-medium text-gray-800 truncate max-w-[12rem]"
              >
                {crumb.label}
              </span>
            ) : (
              <Link
                to={crumb.to}
                className="hover:text-gray-700 transition-colors truncate max-w-[12rem]"
              >
                {crumb.label}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
};

export default Breadcrumb;
