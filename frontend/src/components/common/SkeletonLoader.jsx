/**
 * @file frontend/src/components/common/SkeletonLoader.jsx
 * @description Skeleton-loading component kit — content-shaped
 *   placeholders that hold the page's layout while data is fetching.
 *   Variants: SkeletonText, SkeletonCard, SkeletonTable, SkeletonChart.
 * @author Dev B
 *
 * Why skeletons over a centered spinner:
 *   - A spinner says "something is happening"; a skeleton says "THIS is
 *     what's coming, and roughly where". Perceived performance is
 *     better and there's no layout shift when the real content lands.
 *   - Each variant mirrors the shape of the surface it stands in for
 *     (a list of rows, a stat card, a chart) so the swap is seamless.
 *
 * All variants share one base block (`SkeletonBlock`) that carries the
 * Tailwind `animate-pulse` and a neutral fill that reads on white and
 * tinted card backgrounds alike. Every exported variant is wrapped in
 * a `role="status"` region with an `sr-only` "Loading…" so assistive
 * tech announces the pending state instead of reading a pile of empty
 * boxes.
 */

/**
 * Primitive shimmer block. Compose these to build any skeleton shape.
 *
 * @param {Object} props
 * @param {string} [props.className] - Tailwind sizing/shape utilities
 * @returns {JSX.Element}
 */
export const SkeletonBlock = ({ className = '' }) => (
  <div
    className={`bg-gray-200/80 rounded ${className}`}
    aria-hidden="true"
  />
);

/**
 * Accessibility wrapper — `role="status"` + visually-hidden label so
 * screen readers announce the load without describing every box.
 */
const SkeletonRegion = ({ label = 'Loading', children, className = '' }) => (
  <div
    role="status"
    aria-busy="true"
    aria-label={label}
    className={`animate-pulse ${className}`}
  >
    {children}
    <span className="sr-only">{label}…</span>
  </div>
);

/**
 * SkeletonText — N stacked lines of "text". The last line is shorter to
 * mimic a real paragraph's ragged edge.
 *
 * @param {Object} props
 * @param {number} [props.lines=3]
 * @param {string} [props.className]
 * @returns {JSX.Element}
 */
export const SkeletonText = ({ lines = 3, className = '' }) => (
  <SkeletonRegion label="Loading content" className={`space-y-2 ${className}`}>
    {Array.from({ length: lines }).map((_, i) => (
      <SkeletonBlock
        key={i}
        className={`h-3 ${i === lines - 1 ? 'w-2/3' : 'w-full'}`}
      />
    ))}
  </SkeletonRegion>
);

/**
 * SkeletonCard — avatar/title/lines block sized like a profile or
 * summary card. Reserves the card footprint to prevent layout shift.
 *
 * @param {Object} props
 * @param {boolean} [props.avatar=true] - Render the leading circle
 * @param {number} [props.lines=3]
 * @param {string} [props.className]
 * @returns {JSX.Element}
 */
export const SkeletonCard = ({ avatar = true, lines = 3, className = '' }) => (
  <SkeletonRegion
    label="Loading card"
    className={`rounded-xl border border-gray-200 bg-white p-5 ${className}`}
  >
    <div className="flex items-start gap-4">
      {avatar && (
        <SkeletonBlock className="h-12 w-12 rounded-full flex-shrink-0" />
      )}
      <div className="flex-1 space-y-2">
        <SkeletonBlock className="h-4 w-1/3" />
        <SkeletonBlock className="h-3 w-1/2" />
      </div>
    </div>
    <div className="mt-4 space-y-2">
      {Array.from({ length: lines }).map((_, i) => (
        <SkeletonBlock
          key={i}
          className={`h-3 ${i === lines - 1 ? 'w-1/2' : 'w-full'}`}
        />
      ))}
    </div>
  </SkeletonRegion>
);

/**
 * SkeletonTable — header row + N body rows × M columns, wrapped in the
 * same card chrome the real DataTable uses so the swap is invisible.
 *
 * @param {Object} props
 * @param {number} [props.rows=5]
 * @param {number} [props.columns=4]
 * @param {string} [props.className]
 * @returns {JSX.Element}
 */
export const SkeletonTable = ({ rows = 5, columns = 4, className = '' }) => (
  <SkeletonRegion
    label="Loading table"
    className={`rounded-lg border border-gray-200 bg-white overflow-hidden ${className}`}
  >
    {/* Header */}
    <div className="flex gap-4 px-6 py-3 bg-gray-50 border-b border-gray-200">
      {Array.from({ length: columns }).map((_, c) => (
        <SkeletonBlock key={c} className="h-3 flex-1" />
      ))}
    </div>
    {/* Body */}
    <div className="divide-y divide-gray-100">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-4 px-6 py-4 items-center">
          {Array.from({ length: columns }).map((_, c) => (
            <SkeletonBlock
              key={c}
              className={`h-3 flex-1 ${c === 0 ? 'max-w-[40%]' : ''}`}
            />
          ))}
        </div>
      ))}
    </div>
  </SkeletonRegion>
);

/**
 * SkeletonChart — axis line + a row of varied-height bars, sized to a
 * chart card so dashboard widgets don't jump when data arrives.
 *
 * @param {Object} props
 * @param {number} [props.height=240] - Plot height in px
 * @param {number} [props.bars=8]
 * @param {string} [props.className]
 * @returns {JSX.Element}
 */
export const SkeletonChart = ({ height = 240, bars = 8, className = '' }) => {
  // Deterministic bar heights so re-renders don't make it twitch.
  const heights = [60, 82, 45, 90, 68, 38, 74, 52, 64, 48];
  return (
    <SkeletonRegion
      label="Loading chart"
      className={`rounded-lg border border-gray-200 bg-white p-4 ${className}`}
    >
      <SkeletonBlock className="h-3 w-1/4 mb-4" />
      <div className="relative" style={{ height: `${height}px` }}>
        <div className="absolute bottom-6 left-0 right-0 h-px bg-gray-200" />
        <div className="absolute inset-x-0 bottom-7 top-2 flex items-end justify-around gap-2 px-2">
          {Array.from({ length: bars }).map((_, i) => (
            <div
              key={i}
              className="flex-1 rounded-t bg-gray-200/80"
              style={{ height: `${heights[i % heights.length]}%` }}
            />
          ))}
        </div>
        <div className="absolute bottom-0 left-0 right-0 flex justify-around gap-2 px-2">
          {Array.from({ length: bars }).map((_, i) => (
            <SkeletonBlock key={i} className="h-2 w-8" />
          ))}
        </div>
      </div>
    </SkeletonRegion>
  );
};

/**
 * Default export — a small namespace object so consumers can do either:
 *   import { SkeletonTable } from '.../SkeletonLoader'
 *   import Skeleton from '.../SkeletonLoader'; <Skeleton.Table />
 */
const SkeletonLoader = {
  Block: SkeletonBlock,
  Text: SkeletonText,
  Card: SkeletonCard,
  Table: SkeletonTable,
  Chart: SkeletonChart,
};

export default SkeletonLoader;
