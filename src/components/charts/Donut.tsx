import { useState } from 'react';
import { formatNumber } from '@/lib/format';
import { Legend, ChartEmpty, type LegendItem } from './chrome';
import type { Slice } from './palette';

interface DonutProps {
  slices: Slice[];
  /** Diameter in pixels. The ring is drawn at a fixed size and the legend flows. */
  size?: number;
  /** Big figure in the middle. Defaults to the total of the slices. */
  centerValue?: string;
  centerLabel?: string;
  format?: (n: number) => string;
  empty?: string;
}

const polar = (cx: number, cy: number, r: number, angle: number): [number, number] =>
  [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];

/** An annulus sector: outer arc, straight in, inner arc back, close. */
function segment(cx: number, cy: number, r: number, ir: number, from: number, to: number): string {
  const [x1, y1] = polar(cx, cy, r, from);
  const [x2, y2] = polar(cx, cy, r, to);
  const [x3, y3] = polar(cx, cy, ir, to);
  const [x4, y4] = polar(cx, cy, ir, from);
  const large = to - from > Math.PI ? 1 : 0;
  return `M${x1},${y1} A${r},${r} 0 ${large} 1 ${x2},${y2} L${x3},${y3} A${ir},${ir} 0 ${large} 0 ${x4},${y4} Z`;
}

/**
 * Parts of one whole — a delivery mix, a manpower split, where the defects are.
 * Deliberately not used for change over time or for comparing two totals: a ring
 * answers "how is this one number divided", and nothing else.
 */
export function Donut({
  slices, size = 172, centerValue, centerLabel, format = formatNumber, empty
}: DonutProps) {
  const [active, setActive] = useState<number | null>(null);

  const total = slices.reduce((sum, s) => sum + s.value, 0);
  if (total <= 0) {
    return <ChartEmpty>{empty ?? 'Nothing to chart yet.'}</ChartEmpty>;
  }

  const r = size / 2 - 3;
  const ir = r * 0.6;
  const cx = size / 2;
  const cy = size / 2;

  let cursor = -Math.PI / 2;
  const arcs = slices.map((slice) => {
    const sweep = (slice.value / total) * Math.PI * 2;
    const arc = { slice, from: cursor, to: cursor + sweep };
    cursor += sweep;
    return arc;
  });

  const items: LegendItem[] = slices.map((s) => ({
    label: s.label,
    color: s.color,
    value: `${format(s.value)} · ${((s.value / total) * 100).toFixed(1)}%`
  }));

  return (
    <div className="donut">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={`${centerLabel ?? 'Total'} ${format(total)}, split into ${slices.length} parts`}
        style={{ flex: 'none' }}
      >
        {/* One slice at 100% has no arc to draw — start and end land on the same
            point and the path collapses to nothing. */}
        {arcs.length === 1 ? (
          <circle cx={cx} cy={cy} r={(r + ir) / 2} fill="none"
            stroke={arcs[0]!.slice.color} strokeWidth={r - ir} />
        ) : arcs.map((arc, i) => (
          <path
            key={arc.slice.label}
            className="donut__seg"
            d={segment(cx, cy, r, ir, arc.from, arc.to)}
            fill={arc.slice.color}
            /* The 2px gap between neighbours is the card showing through, which
               keeps two similar hues from bleeding into one shape. */
            stroke="var(--surface)"
            strokeWidth={2}
            opacity={active == null || active === i ? 1 : 0.32}
            onMouseEnter={() => setActive(i)}
            onMouseLeave={() => setActive(null)}
          >
            <title>{`${arc.slice.label}: ${format(arc.slice.value)} (${((arc.slice.value / total) * 100).toFixed(1)}%)`}</title>
          </path>
        ))}

        <text x={cx} y={cy - 1} textAnchor="middle"
          style={{ font: '600 21px var(--font-heading)', fill: 'var(--text)' }}>
          {active != null ? format(slices[active]!.value) : centerValue ?? format(total)}
        </text>
        <text x={cx} y={cy + 15} textAnchor="middle"
          style={{ fontSize: 10.5, fill: 'var(--text-faint)' }}>
          {active != null ? slices[active]!.label.slice(0, 18) : centerLabel ?? 'total'}
        </text>
      </svg>

      <Legend items={items} columns />
    </div>
  );
}
