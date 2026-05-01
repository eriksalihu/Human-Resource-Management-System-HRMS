/**
 * @file frontend/src/components/dashboard/StatCard.jsx
 * @description Reusable dashboard stat card with icon, title, large value, percentage-change indicator, color variants, and click-to-navigate
 * @author Dev A
 */

import { useNavigate } from 'react-router-dom';

/**
 * Color variants. Each maps to the icon-circle background and the
 * percentage-pill colors for that tone. Keeping the palette centralised
 * here makes it easy to add new tones without hunting through Tailwind
 * class concatenations in every consumer.
 */
const VARIANTS = {
  indigo: {
    iconBg: 'bg-indigo-100',
    iconText: 'text-indigo-600',
    accent: 'border-indigo-100',
  },
  emerald: {
    iconBg: 'bg-emerald-100',
    iconText: 'text-emerald-600',
    accent: 'border-emerald-100',
  },
  amber: {
    iconBg: 'bg-amber-100',
    iconText: 'text-amber-600',
    accent: 'border-amber-100',
  },
  rose: {
    iconBg: 'bg-rose-100',
    iconText: 'text-rose-600',
    accent: 'border-rose-100',
  },
  sky: {
    iconBg: 'bg-sky-100',
    iconText: 'text-sky-600',
    accent: 'border-sky-100',
  },
  purple: {
    iconBg: 'bg-purple-100',
    iconText: 'text-purple-600',
    accent: 'border-purple-100',
  },
  gray: {
    iconBg: 'bg-gray-100',
    iconText: 'text-gray-600',
    accent: 'border-gray-100',
  },
};

/**
 * Default-export icon set. We render *whatever the caller passes* via the
 * `icon` prop, but expose this string→component map so dashboards don't
 * have to import inline SVGs everywhere. Each entry is a tiny stroke-only
 * SVG sized to inherit `currentColor`.
 */
export const STAT_ICONS = {
  users: (
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-5a4 4 0 11-8 0 4 4 0 018 0zm6 0a4 4 0 11-8 0 4 4 0 018 0z"
      />
    </svg>
  ),
  briefcase: (
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M21 13.255A23.93 23.93 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
      />
    </svg>
  ),
  calendar: (
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
      />
    </svg>
  ),
  clock: (
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  ),
  cash: (
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  ),
  document: (
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
      />
    </svg>
  ),
};

/**
 * Decide the trend pill tone from a percentage-change number. Positive →
 * green (up), negative → red (down), zero → neutral gray.
 */
const trendClass = (change) => {
  const n = Number(change);
  if (!Number.isFinite(n) || n === 0) return 'bg-gray-50 text-gray-700 ring-gray-200';
  if (n > 0) return 'bg-emerald-50 text-emerald-700 ring-emerald-200';
  return 'bg-rose-50 text-rose-700 ring-rose-200';
};

/**
 * Pretty-format the change value as `+12.3%` / `-4.0%` / `0%`. We keep one
 * decimal of precision so small movements aren't rounded to zero.
 */
const formatChange = (change) => {
  const n = Number(change);
  if (!Number.isFinite(n)) return '0%';
  if (n === 0) return '0%';
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(1)}%`;
};

/**
 * StatCard — reusable dashboard tile.
 *
 * @param {Object} props
 * @param {string} props.title - Label above the value (e.g. "Total employees")
 * @param {string|number} props.value - Big metric value
 * @param {string|number} [props.subtitle] - Optional sub-line under the value
 * @param {React.ReactNode|string} [props.icon] - Inline SVG node, or the key
 *   of `STAT_ICONS` (e.g. "users") for a built-in
 * @param {keyof typeof VARIANTS} [props.variant='indigo'] - Color tone
 * @param {number} [props.change] - Percentage change vs. prior period
 * @param {string} [props.changeLabel='vs last period'] - Caption for the trend
 * @param {string} [props.to] - Path to navigate to on click (uses react-router)
 * @param {Function} [props.onClick] - Custom click handler (overrides `to`)
 * @param {boolean} [props.loading=false] - Render skeleton state
 * @param {string} [props.className] - Extra wrapper classes
 * @returns {JSX.Element}
 */
const StatCard = ({
  title,
  value,
  subtitle,
  icon,
  variant = 'indigo',
  change,
  changeLabel = 'vs last period',
  to,
  onClick,
  loading = false,
  className = '',
}) => {
  const navigate = useNavigate();
  const tone = VARIANTS[variant] || VARIANTS.indigo;

  const isInteractive = Boolean(onClick || to);

  /** Resolve `icon` — accepts a JSX node or a string key into STAT_ICONS. */
  const renderIcon = () => {
    if (!icon) return null;
    if (typeof icon === 'string') {
      const node = STAT_ICONS[icon];
      return node ? (
        <span className={`block w-6 h-6 ${tone.iconText}`}>{node}</span>
      ) : null;
    }
    return <span className={`block w-6 h-6 ${tone.iconText}`}>{icon}</span>;
  };

  /** Click router — explicit handler wins; otherwise use `to`. */
  const handleClick = () => {
    if (onClick) {
      onClick();
      return;
    }
    if (to) navigate(to);
  };

  const handleKeyDown = (e) => {
    if (!isInteractive) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    }
  };

  if (loading) {
    return (
      <div
        className={`rounded-lg border ${tone.accent} bg-white p-4 ${className}`}
        aria-busy="true"
      >
        <div className="flex items-start justify-between">
          <div className="flex-1 space-y-2">
            <div className="h-3 w-24 rounded bg-gray-100 animate-pulse" />
            <div className="h-7 w-32 rounded bg-gray-200 animate-pulse" />
            <div className="h-3 w-20 rounded bg-gray-100 animate-pulse" />
          </div>
          <div
            className={`h-10 w-10 rounded-lg ${tone.iconBg} animate-pulse`}
          />
        </div>
      </div>
    );
  }

  return (
    <div
      role={isInteractive ? 'button' : undefined}
      tabIndex={isInteractive ? 0 : undefined}
      onClick={isInteractive ? handleClick : undefined}
      onKeyDown={isInteractive ? handleKeyDown : undefined}
      aria-label={
        isInteractive
          ? `${title}: ${value}${
              change != null ? ` (${formatChange(change)} ${changeLabel})` : ''
            }`
          : undefined
      }
      className={`rounded-lg border ${tone.accent} bg-white p-4 transition-shadow ${
        isInteractive
          ? 'cursor-pointer hover:shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500'
          : ''
      } ${className}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-xs uppercase tracking-wide font-medium text-gray-500 truncate">
            {title}
          </p>
          <p className="mt-1 text-2xl font-bold text-gray-900 truncate">
            {value ?? '—'}
          </p>
          {subtitle && (
            <p className="mt-0.5 text-xs text-gray-500 truncate">{subtitle}</p>
          )}
        </div>
        {icon && (
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${tone.iconBg}`}
          >
            {renderIcon()}
          </div>
        )}
      </div>

      {/* Trend pill — only renders when a change value was supplied. */}
      {change != null && Number.isFinite(Number(change)) && (
        <div className="mt-3 flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${trendClass(
              change
            )}`}
          >
            {/* up / down / flat arrow */}
            {Number(change) > 0 ? (
              <svg
                className="h-3 w-3"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 15l7-7 7 7"
                />
              </svg>
            ) : Number(change) < 0 ? (
              <svg
                className="h-3 w-3"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            ) : (
              <svg
                className="h-3 w-3"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 12h14"
                />
              </svg>
            )}
            {formatChange(change)}
          </span>
          <span className="text-xs text-gray-500 truncate">{changeLabel}</span>
        </div>
      )}
    </div>
  );
};

export default StatCard;
