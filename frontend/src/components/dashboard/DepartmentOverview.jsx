/**
 * @file frontend/src/components/dashboard/DepartmentOverview.jsx
 * @description Department overview widget — donut chart of employee distribution + top-departments cards with budget utilization indicators
 * @author Dev A
 *
 * Implementation note: same dependency-free philosophy as `EmployeeChart`.
 * The donut is hand-rolled inline-SVG using cumulative-arc math; the
 * component shape is stable so a future commit can swap to Recharts'
 * `<PieChart>` without changing callers.
 */

import { useMemo, useState } from 'react';

/**
 * Donut + side-list skeleton. Mirrors the widget's two-column layout so
 * the page reserves space for it during the initial fetch and doesn't
 * shift when data lands.
 *
 * @param {Object} props
 * @param {number} props.size - Donut diameter in px (match the widget's SIZE)
 * @returns {JSX.Element}
 */
const DepartmentOverviewSkeleton = ({ size = 180 }) => (
  <div
    className="grid grid-cols-1 lg:grid-cols-2 gap-5 animate-pulse"
    aria-busy="true"
    aria-label="Loading department overview"
  >
    {/* Donut placeholder */}
    <div className="flex flex-col items-center">
      <div
        className="rounded-full bg-gradient-to-br from-gray-200 via-gray-100 to-gray-200"
        style={{
          width: size,
          height: size,
          maskImage:
            'radial-gradient(circle, transparent 40%, black 41%)',
          WebkitMaskImage:
            'radial-gradient(circle, transparent 40%, black 41%)',
        }}
      />
      <div className="h-3 w-20 bg-gray-200 rounded mt-3" />
    </div>
    {/* Legend / top departments list placeholder */}
    <div className="space-y-3">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-md bg-gray-200" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 w-2/3 bg-gray-200 rounded" />
            <div className="h-2 w-1/2 bg-gray-100 rounded" />
          </div>
          <div className="h-3 w-10 bg-gray-200 rounded" />
        </div>
      ))}
    </div>
  </div>
);

/** Reuses the same palette as EmployeeChart so colors stay consistent. */
const COLORS = [
  '#4f46e5', // indigo
  '#10b981', // emerald
  '#f59e0b', // amber
  '#ef4444', // rose
  '#0ea5e9', // sky
  '#a855f7', // purple
  '#14b8a6', // teal
  '#f97316', // orange
];

const colorFor = (i) => COLORS[i % COLORS.length];

/**
 * Convert an angle in degrees to (x, y) on a circle of `radius` centered
 * at `(cx, cy)`. Angle 0° points up (12 o'clock); positive sweeps clockwise.
 */
const polar = (cx, cy, radius, deg) => {
  const rad = ((deg - 90) * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(rad),
    y: cy + radius * Math.sin(rad),
  };
};

/**
 * Build an SVG path string for a donut wedge from `startDeg` to `endDeg`.
 * Inner radius `ri` carves out the donut hole; outer radius `ro` is the
 * pie's edge.
 */
const wedgePath = (cx, cy, ri, ro, startDeg, endDeg) => {
  // Floating point round-trip would close the loop perfectly — nudge
  // by epsilon so a single 100% wedge still renders as a closed annulus.
  const safeEnd = endDeg - startDeg >= 360 ? startDeg + 359.999 : endDeg;
  const largeArc = safeEnd - startDeg <= 180 ? 0 : 1;

  const outerStart = polar(cx, cy, ro, startDeg);
  const outerEnd = polar(cx, cy, ro, safeEnd);
  const innerStart = polar(cx, cy, ri, safeEnd);
  const innerEnd = polar(cx, cy, ri, startDeg);

  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${ro} ${ro} 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerStart.x} ${innerStart.y}`,
    `A ${ri} ${ri} 0 ${largeArc} 0 ${innerEnd.x} ${innerEnd.y}`,
    'Z',
  ].join(' ');
};

/** Format a EUR currency value for budget display. */
const formatCurrency = (value) => {
  if (value == null || Number.isNaN(Number(value))) return '€0';
  const num = Number(value);
  if (Math.abs(num) >= 1_000_000) {
    return `€${(num / 1_000_000).toFixed(2)}M`;
  }
  if (Math.abs(num) >= 1_000) {
    return `€${(num / 1_000).toFixed(1)}k`;
  }
  return `€${num.toFixed(0)}`;
};

/**
 * DepartmentOverview — donut chart + top-departments cards with optional
 * budget utilization indicators when budget data is supplied.
 *
 * @param {Object} props
 * @param {Array<{
 *   department_id: number,
 *   emertimi: string,
 *   headcount: number,
 *   buxheti?: number,             // total budget (optional)
 *   spent?: number,               // amount spent (optional, drives utilization)
 *   total_net?: number            // alternative source for "spent" (payroll)
 * }>} props.data
 * @param {boolean} [props.loading=false]
 * @param {string} [props.title='Department overview']
 * @param {number} [props.maxCards=5] - Cap the cards-list to top N
 * @returns {JSX.Element}
 */
const DepartmentOverview = ({
  data = [],
  loading = false,
  title = 'Department overview',
  maxCards = 5,
}) => {
  const [hoveredIndex, setHoveredIndex] = useState(null);

  /**
   * Pre-compute donut wedges, total headcount, sorted top-N for the cards
   * panel, and per-row budget utilization. Memoized so hovering doesn't
   * recompute the math.
   */
  const view = useMemo(() => {
    const total = data.reduce(
      (acc, d) => acc + (Number(d.headcount) || 0),
      0
    );

    if (total === 0) {
      return { total: 0, wedges: [], top: [] };
    }

    let cursor = 0;
    const wedges = data.map((d, i) => {
      const value = Number(d.headcount) || 0;
      const fraction = value / total;
      const start = cursor;
      const end = cursor + fraction * 360;
      cursor = end;
      return {
        ...d,
        index: i,
        value,
        fraction,
        start,
        end,
        color: colorFor(i),
      };
    });

    // Sort departments by headcount desc for the cards panel.
    const top = [...wedges]
      .sort((a, b) => b.value - a.value)
      .slice(0, maxCards);

    return { total, wedges, top };
  }, [data, maxCards]);

  /** Donut geometry — fixed pixel sizes, scaled via SVG viewBox. */
  const SIZE = 220;
  const CX = SIZE / 2;
  const CY = SIZE / 2;
  const OUTER = SIZE / 2 - 4;
  const INNER = OUTER * 0.6;

  /** Hovered wedge highlight. */
  const hovered = hoveredIndex != null ? view.wedges[hoveredIndex] : null;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        <span className="text-xs text-gray-500">
          {data.length} department{data.length === 1 ? '' : 's'}
        </span>
      </div>

      {loading ? (
        <DepartmentOverviewSkeleton size={SIZE} />
      ) : view.total === 0 ? (
        <div className="text-center py-10 text-sm text-gray-500">
          No active employees yet — once seeded, this widget will show
          headcount distribution.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Donut chart */}
          <div className="flex flex-col items-center">
            <div className="relative" style={{ width: SIZE, height: SIZE }}>
              <svg
                viewBox={`0 0 ${SIZE} ${SIZE}`}
                width={SIZE}
                height={SIZE}
                role="img"
                aria-label={title}
              >
                {view.wedges.map((w, i) => {
                  const isHovered = hoveredIndex === i;
                  return (
                    <path
                      key={w.department_id || `wedge-${i}`}
                      d={wedgePath(CX, CY, INNER, OUTER, w.start, w.end)}
                      fill={w.color}
                      opacity={
                        hoveredIndex == null || isHovered ? 1 : 0.5
                      }
                      style={{ transition: 'opacity 120ms ease', cursor: 'pointer' }}
                      onMouseEnter={() => setHoveredIndex(i)}
                      onMouseLeave={() =>
                        setHoveredIndex((prev) => (prev === i ? null : prev))
                      }
                    >
                      <title>
                        {w.emertimi}: {w.value} (
                        {(w.fraction * 100).toFixed(1)}%)
                      </title>
                    </path>
                  );
                })}
              </svg>

              {/* Center label — total or hovered wedge */}
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                {hovered ? (
                  <>
                    <span className="text-2xl font-bold text-gray-900">
                      {hovered.value}
                    </span>
                    <span className="text-xs text-gray-600 px-3 text-center max-w-[140px] truncate">
                      {hovered.emertimi}
                    </span>
                    <span className="text-[10px] text-gray-400 mt-0.5">
                      {(hovered.fraction * 100).toFixed(1)}%
                    </span>
                  </>
                ) : (
                  <>
                    <span className="text-2xl font-bold text-gray-900">
                      {view.total}
                    </span>
                    <span className="text-xs text-gray-500 mt-0.5">
                      total active
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Legend below the donut */}
            <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1 text-xs w-full">
              {view.wedges.map((w, i) => (
                <li
                  key={w.department_id || `legend-${i}`}
                  className="flex items-center gap-2 truncate"
                  onMouseEnter={() => setHoveredIndex(i)}
                  onMouseLeave={() =>
                    setHoveredIndex((prev) => (prev === i ? null : prev))
                  }
                >
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
                    style={{ background: w.color }}
                  />
                  <span className="truncate text-gray-700">
                    {w.emertimi}
                  </span>
                  <span className="ml-auto text-gray-500 shrink-0">
                    {w.value}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* Top departments cards */}
          <div>
            <h4 className="text-xs uppercase tracking-wide font-medium text-gray-500 mb-2">
              Top departments
            </h4>
            <ul className="space-y-2">
              {view.top.map((d) => {
                const budget = Number(d.buxheti);
                const spent = Number(d.spent ?? d.total_net ?? 0);
                const hasBudget = Number.isFinite(budget) && budget > 0;
                const utilization = hasBudget
                  ? Math.min(spent / budget, 1.5) // allow >100% to show overspend
                  : null;
                const utilTone =
                  utilization == null
                    ? 'bg-gray-200'
                    : utilization >= 1
                      ? 'bg-red-500'
                      : utilization >= 0.85
                        ? 'bg-amber-500'
                        : 'bg-emerald-500';

                return (
                  <li
                    key={d.department_id}
                    className="rounded-md border border-gray-100 bg-gray-50/40 p-3"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
                          style={{ background: d.color }}
                        />
                        <span className="text-sm font-medium text-gray-900 truncate">
                          {d.emertimi}
                        </span>
                      </div>
                      <span className="text-xs text-gray-500">
                        {d.value} ({(d.fraction * 100).toFixed(0)}%)
                      </span>
                    </div>

                    {hasBudget && (
                      <div className="mt-2">
                        <div className="flex items-center justify-between text-[11px] text-gray-600 mb-0.5">
                          <span>Budget utilization</span>
                          <span className="font-mono">
                            {formatCurrency(spent)} /{' '}
                            {formatCurrency(budget)}
                          </span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
                          <div
                            className={`${utilTone} h-1.5 rounded-full transition-all`}
                            style={{
                              width: `${Math.min(utilization * 100, 100)}%`,
                            }}
                          />
                        </div>
                        <div className="mt-0.5 text-[10px] text-gray-500">
                          {(utilization * 100).toFixed(0)}% used
                          {utilization > 1 && (
                            <span className="text-red-600 ml-1">
                              · over budget
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
};

export default DepartmentOverview;
