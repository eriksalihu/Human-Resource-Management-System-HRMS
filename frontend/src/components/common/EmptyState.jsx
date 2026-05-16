/**
 * @file frontend/src/components/common/EmptyState.jsx
 * @description Reusable empty-state placeholder — icon, title,
 *   description, and an optional call-to-action button. Used by list
 *   views when there's no data (no records yet, filters matched
 *   nothing, search returned empty, etc.).
 * @author Dev A
 *
 * Design notes:
 *   - One component, two common shapes: "nothing here yet" (offer a
 *     create action) and "your filter/search found nothing" (offer a
 *     clear-filters action). The caller decides which by what it passes
 *     for `action`.
 *   - A small set of built-in icons (`box`, `search`, `inbox`, `error`)
 *     is provided so callers don't have to inline SVGs; any custom node
 *     can still be passed via `icon`.
 *   - Pure presentational + accessible: the wrapper is `role="status"`
 *     so assistive tech announces the empty condition rather than the
 *     user wondering whether the list is still loading.
 */

/**
 * Built-in icon set. Stroke-only, inherit `currentColor`, sized by the
 * wrapper. Keyed by short names the call sites can reference as strings.
 */
const ICONS = {
  box: 'M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4',
  search:
    'M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z',
  inbox:
    'M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4',
  error:
    'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z',
  users:
    'M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-5a4 4 0 11-8 0 4 4 0 018 0zm6 0a4 4 0 11-8 0 4 4 0 018 0z',
};

/**
 * EmptyState — placeholder for "no data" surfaces.
 *
 * @param {Object} props
 * @param {React.ReactNode|string} [props.icon='box'] - A custom node, or
 *   the key of a built-in icon (`box` | `search` | `inbox` | `error` |
 *   `users`).
 * @param {string} props.title - Short headline (e.g. "No employees yet")
 * @param {string} [props.description] - Supporting sentence under the title
 * @param {Object} [props.action] - Optional CTA:
 *   `{ label: string, onClick: () => void, variant?: 'primary'|'secondary' }`
 * @param {React.ReactNode} [props.children] - Extra content rendered
 *   below the action (e.g. a secondary link)
 * @param {string} [props.className] - Extra wrapper classes
 * @returns {JSX.Element}
 */
const EmptyState = ({
  icon = 'box',
  title,
  description,
  action,
  children,
  className = '',
}) => {
  const renderIcon = () => {
    if (typeof icon === 'string') {
      const d = ICONS[icon] || ICONS.box;
      return (
        <svg
          className="h-12 w-12 text-gray-300"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d={d}
          />
        </svg>
      );
    }
    return <div className="text-gray-300">{icon}</div>;
  };

  const actionClasses =
    action?.variant === 'secondary'
      ? 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 focus:ring-indigo-500'
      : 'bg-indigo-600 text-white hover:bg-indigo-700 focus:ring-indigo-500';

  return (
    <div
      role="status"
      className={`flex flex-col items-center justify-center text-center px-6 py-12 ${className}`}
    >
      {renderIcon()}

      <h3 className="mt-4 text-sm font-semibold text-gray-900">{title}</h3>

      {description && (
        <p className="mt-1 text-sm text-gray-500 max-w-sm">{description}</p>
      )}

      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className={`mt-5 inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 transition-colors ${actionClasses}`}
        >
          {action.icon && (
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
                d={action.icon}
              />
            </svg>
          )}
          {action.label}
        </button>
      )}

      {children && <div className="mt-3">{children}</div>}
    </div>
  );
};

export default EmptyState;
