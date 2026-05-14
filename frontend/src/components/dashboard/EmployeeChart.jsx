/**
 * @file frontend/src/components/dashboard/EmployeeChart.jsx
 * @description Responsive bar chart showing employees per department, with hover tooltips and per-bar color coding
 * @author Dev A
 *
 * Implementation note: this is a self-contained inline-SVG bar chart so
 * the dashboard works out of the box without pulling in Recharts. The
 * component boundary (props in / chart out) is intentionally stable so a
 * future commit can swap the SVG body for `<ResponsiveContainer>` +
 * `<BarChart>` from Recharts without any caller-side changes.
 */

import { useMemo, useRef, useState, useLayoutEffect } from 'react';

/**
 * Inline bar-chart skeleton. Matches the chart's real footprint so the
 * widget reserves layout space and the page doesn't shift when data
 * arrives. Bar heights are deterministic per index so re-renders don't
 * cause the placeholder to twitch.
 *
 * @param {Object} props
 * @param {number} props.height - Match the chart's `height` prop
 * @returns {JSX.Element}
 */
const ChartSkeleton = ({ height }) => {
  const bars = [56, 78, 42, 90, 64, 32, 70, 50];
  return (
    <div
      className="relative animate-pulse"
      style={{ height: `${height}px` }}
      aria-busy="true"
      aria-label="Loading chart"
    >
      {/* X-axis */}
      <div className="absolute bottom-6 left-0 right-0 h-px bg-gray-200" />
      {/* Bars */}
      <div className="absolute inset-x-0 bottom-7 top-2 flex items-end justify-around gap-2 px-2">
        {bars.map((pct, i) => (
          <div
            key={i}
            className="flex-1 rounded-t bg-gradient-to-t from-gray-200 to-gray-100"
            style={{ height: `${pct}%` }}
          />
        ))}
      </div>
      {/* X-axis labels */}
      <div className="absolute bottom-0 left-0 right-0 flex justify-around gap-2 px-2">
        {bars.map((_, i) => (
          <div key={i} className="h-2 w-8 rounded bg-gray-100" />
        ))}
      </div>
    </div>
  );
};

/**
 * Department color palette. Cycled positionally — once you exceed
 * COLORS.length departments the palette wraps. Colors are picked to read
 * cleanly against the white card background.
 */
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

/** Pick a color for a given index (modulo the palette). */
const colorFor = (index) => COLORS[index % COLORS.length];

/**
 * Hook: observe the wrapper element's `clientWidth` so the SVG can size
 * itself responsively without a layout library. Returns the latest known
 * width (or null before the first measurement).
 *
 * @param {React.RefObject<HTMLElement>} ref
 * @returns {number|null}
 */
const useElementWidth = (ref) => {
  const [width, setWidth] = useState(null);

  useLayoutEffect(() => {
    if (!ref.current || typeof ResizeObserver === 'undefined') {
      // Fallback for environments without ResizeObserver — measure once.
      if (ref.current) setWidth(ref.current.clientWidth);
      return undefined;
    }
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const next = Math.round(entry.contentRect.width);
      setWidth((prev) => (prev === next ? prev : next));
    });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [ref]);

  return width;
};

/**
 * EmployeeChart — bar chart of employees per department.
 *
 * @param {Object} props
 * @param {Array<{ department_id: number, emertimi: string, headcount: number }>} props.data
 * @param {boolean} [props.loading=false]
 * @param {string} [props.title='Employees by department']
 * @param {string} [props.emptyMessage]
 * @param {number} [props.height=280] - Chart drawing height in px
 * @returns {JSX.Element}
 */
const EmployeeChart = ({
  data = [],
  loading = false,
  title = 'Employees by department',
  emptyMessage = 'No department data yet — once employees are seeded this chart will populate.',
  height = 280,
}) => {
  const wrapperRef = useRef(null);
  const measuredWidth = useElementWidth(wrapperRef);
  const [hoveredIndex, setHoveredIndex] = useState(null);

  /**
   * Derive bar geometry from props. Calculated lazily so the SVG re-renders
   * cleanly when the wrapper resizes (e.g. mobile rotation, sidebar toggle).
   */
  const geometry = useMemo(() => {
    const safeWidth = measuredWidth || 600; // sensible default before first measure
    const padding = { top: 16, right: 16, bottom: 56, left: 40 };

    const innerWidth = Math.max(0, safeWidth - padding.left - padding.right);
    const innerHeight = Math.max(0, height - padding.top - padding.bottom);

    if (data.length === 0) {
      return { width: safeWidth, height, padding, innerWidth, innerHeight, bars: [], yTicks: [] };
    }

    const headcounts = data.map((d) => Number(d.headcount) || 0);
    const max = Math.max(...headcounts, 1);
    // Round max up to nicest multiple — gives breathing room above the tallest bar.
    const niceMax = max <= 5 ? 5 : Math.ceil(max / 5) * 5;

    const gap = 0.2;
    const slot = innerWidth / data.length;
    const barWidth = Math.max(8, slot * (1 - gap));

    const bars = data.map((d, i) => {
      const value = Number(d.headcount) || 0;
      const h = niceMax > 0 ? (value / niceMax) * innerHeight : 0;
      const x = padding.left + i * slot + (slot - barWidth) / 2;
      const y = padding.top + (innerHeight - h);
      return {
        ...d,
        value,
        x,
        y,
        width: barWidth,
        height: h,
        color: colorFor(i),
      };
    });

    // Y-axis ticks at 0, 25%, 50%, 75%, 100% of niceMax (rounded ints).
    const yTicks = [0, 0.25, 0.5, 0.75, 1].map((frac) => ({
      value: Math.round(niceMax * frac),
      y: padding.top + (1 - frac) * innerHeight,
    }));

    return { width: safeWidth, height, padding, innerWidth, innerHeight, bars, yTicks, niceMax };
  }, [data, measuredWidth, height]);

  /** Format big numbers as compact strings (1234 → 1.2k). */
  const formatCompact = (n) => {
    if (n == null) return '0';
    const num = Number(n);
    if (!Number.isFinite(num)) return String(n);
    if (Math.abs(num) >= 1000) return `${(num / 1000).toFixed(1)}k`;
    return String(num);
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        <span className="text-xs text-gray-500">
          {data.length} department{data.length === 1 ? '' : 's'}
        </span>
      </div>

      <div ref={wrapperRef} className="relative">
        {loading ? (
          <ChartSkeleton height={height} />
        ) : data.length === 0 ? (
          <div
            className="flex flex-col justify-center items-center text-center text-sm text-gray-500"
            style={{ height: `${height}px` }}
          >
            <p>{emptyMessage}</p>
          </div>
        ) : (
          <>
            <svg
              width={geometry.width}
              height={geometry.height}
              role="img"
              aria-label={title}
              className="overflow-visible"
            >
              {/* Y-axis grid lines + labels */}
              {geometry.yTicks.map((tick, idx) => (
                <g key={`tick-${idx}`}>
                  <line
                    x1={geometry.padding.left}
                    x2={geometry.width - geometry.padding.right}
                    y1={tick.y}
                    y2={tick.y}
                    stroke="#e5e7eb"
                    strokeDasharray={idx === 0 ? '0' : '4 4'}
                  />
                  <text
                    x={geometry.padding.left - 6}
                    y={tick.y}
                    textAnchor="end"
                    dominantBaseline="middle"
                    className="fill-gray-500 text-[10px]"
                  >
                    {formatCompact(tick.value)}
                  </text>
                </g>
              ))}

              {/* Bars + labels */}
              {geometry.bars.map((bar, i) => {
                const isHovered = hoveredIndex === i;
                return (
                  <g
                    key={bar.department_id || `bar-${i}`}
                    onMouseEnter={() => setHoveredIndex(i)}
                    onMouseLeave={() =>
                      setHoveredIndex((prev) => (prev === i ? null : prev))
                    }
                    className="cursor-pointer"
                  >
                    <rect
                      x={bar.x}
                      y={bar.y}
                      width={bar.width}
                      height={bar.height}
                      rx={4}
                      ry={4}
                      fill={bar.color}
                      opacity={
                        hoveredIndex == null || isHovered ? 1 : 0.55
                      }
                      style={{ transition: 'opacity 120ms ease' }}
                    />
                    {/* Value label above the bar */}
                    {bar.value > 0 && (
                      <text
                        x={bar.x + bar.width / 2}
                        y={bar.y - 6}
                        textAnchor="middle"
                        className="fill-gray-700 text-[10px] font-semibold"
                      >
                        {bar.value}
                      </text>
                    )}
                    {/* X-axis label (department name) */}
                    <text
                      x={bar.x + bar.width / 2}
                      y={geometry.padding.top + geometry.innerHeight + 16}
                      textAnchor="middle"
                      className="fill-gray-600 text-[10px]"
                    >
                      {bar.emertimi.length > 12
                        ? `${bar.emertimi.slice(0, 11)}…`
                        : bar.emertimi}
                    </text>
                  </g>
                );
              })}
            </svg>

            {/* Hover tooltip — positioned absolutely above the hovered bar. */}
            {hoveredIndex != null && geometry.bars[hoveredIndex] && (
              <div
                className="pointer-events-none absolute -translate-x-1/2 -translate-y-full px-2 py-1 rounded-md bg-gray-900 text-white text-xs shadow-md"
                style={{
                  left: `${
                    geometry.bars[hoveredIndex].x +
                    geometry.bars[hoveredIndex].width / 2
                  }px`,
                  top: `${geometry.bars[hoveredIndex].y - 8}px`,
                  whiteSpace: 'nowrap',
                }}
              >
                <div className="font-semibold">
                  {geometry.bars[hoveredIndex].emertimi}
                </div>
                <div className="text-gray-200">
                  {geometry.bars[hoveredIndex].value} employee
                  {geometry.bars[hoveredIndex].value === 1 ? '' : 's'}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default EmployeeChart;
