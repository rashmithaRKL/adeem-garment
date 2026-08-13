import { useState, type MouseEvent } from 'react';
import { formatNumber } from '@/lib/format';
import { ChartTooltip, ChartEmpty, Legend, useMeasure, type TipState, type LegendItem } from './chrome';
import { niceMax, seriesColor, type ChartSeries } from './palette';

export interface LinePoint {
  label: string;
  /** null is a genuine gap — the line breaks rather than inventing a value. */
  values: Record<string, number | null>;
}

interface LineChartProps {
  points: LinePoint[];
  series: ChartSeries[];
  height?: number;
  /** 'percent' pins the axis to a padded 0–100 band; 'auto' starts at zero. */
  domain?: 'auto' | 'percent';
  threshold?: { value: number; label: string } | undefined;
  format?: (n: number) => string;
  /** Fills under a single series. Meaningless — and unreadable — for several. */
  area?: boolean;
  empty?: string;
}

const PAD = { l: 44, r: 14, t: 14, b: 26 };

/**
 * Change over time, and only over time. A line implies the gap between two
 * points is continuous, so it is never used for unrelated categories sitting
 * side by side — those are bars.
 */
export function LineChart({
  points, series, height = 220, domain = 'auto', threshold,
  format = formatNumber, area = false, empty
}: LineChartProps) {
  const { ref, width } = useMeasure<HTMLDivElement>();
  const [tip, setTip] = useState<TipState | null>(null);

  const colored = series.map((s, i) => ({ ...s, color: s.color ?? seriesColor(i) }));
  const all = points.flatMap((p) => colored.map((s) => p.values[s.key]))
    .filter((v): v is number => v != null);
  const hasData = points.length > 0 && all.length > 0;

  const plotW = Math.max(0, width - PAD.l - PAD.r);
  const plotH = Math.max(0, height - PAD.t - PAD.b);

  const rawMin = Math.min(...all, threshold?.value ?? Infinity);
  const rawMax = Math.max(...all, threshold?.value ?? -Infinity);
  const lo = domain === 'percent' ? Math.max(0, Math.floor(rawMin - 4)) : 0;
  // A percentage axis stops at 100 — unless the data goes past it, as production
  // against target routinely does, in which case clamping would draw the good
  // days flat along the top edge.
  const hi = domain === 'percent'
    ? Math.max(Math.min(100, Math.ceil(rawMax + 3)), Math.ceil(rawMax))
    : niceMax(rawMax);
  const span = Math.max(hi - lo, 1);

  const x = (i: number) => PAD.l + (points.length === 1 ? plotW / 2 : (i / (points.length - 1)) * plotW);
  const y = (v: number) => PAD.t + (1 - (v - lo) / span) * plotH;

  const labelEvery = points.length > 8 ? Math.ceil(points.length / 6) : 1;

  const path = (key: string): string => {
    let out = '';
    let penDown = false;
    points.forEach((p, i) => {
      const v = p.values[key];
      if (v == null) { penDown = false; return; }
      out += `${penDown ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)} `;
      penDown = true;
    });
    return out.trim();
  };

  function onMove(e: MouseEvent<SVGSVGElement>) {
    if (points.length === 0 || plotW <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const local = e.clientX - rect.left;
    const step = points.length === 1 ? plotW : plotW / (points.length - 1);
    const i = Math.max(0, Math.min(points.length - 1, Math.round((local - PAD.l) / step)));
    const point = points[i]!;
    setTip({
      x: x(i), y: PAD.t,
      title: point.label,
      rows: colored.map((s) => ({
        label: s.label, color: s.color,
        value: point.values[s.key] == null ? '—' : format(point.values[s.key]!)
      }))
    });
  }

  const legend: LegendItem[] = colored.map((s) => ({ label: s.label, color: s.color }));
  const hovered = tip ? points.findIndex((p) => p.label === tip.title) : -1;

  return (
    <>
      <div className="chartbox" ref={ref} onMouseLeave={() => setTip(null)}>
        {!hasData && <ChartEmpty>{empty ?? 'A trend needs at least one dated figure.'}</ChartEmpty>}

        {hasData && width > 0 && (
          <svg width={width} height={height} role="img" onMouseMove={onMove}
            aria-label={`${colored.map((s) => s.label).join(' and ')} from ${points[0]!.label} to ${points[points.length - 1]!.label}`}>
            {[0, 0.25, 0.5, 0.75, 1].map((t) => {
              const value = lo + span * t;
              return (
                <g key={t}>
                  <line x1={PAD.l} x2={width - PAD.r} y1={y(value)} y2={y(value)}
                    stroke="var(--border-soft)" strokeWidth={1} />
                  <text x={PAD.l - 7} y={y(value) + 3.5} textAnchor="end" fontSize={9.5}
                    fill="var(--text-faint)">
                    {domain === 'percent' ? value.toFixed(0) : formatNumber(Math.round(value))}
                  </text>
                </g>
              );
            })}

            {threshold && threshold.value >= lo && threshold.value <= hi && (
              <>
                <line x1={PAD.l} x2={width - PAD.r} y1={y(threshold.value)} y2={y(threshold.value)}
                  stroke="var(--red-500)" strokeWidth={1} strokeDasharray="4 4" opacity={0.6} />
                <text x={width - PAD.r} y={y(threshold.value) - 5} textAnchor="end" fontSize={9.5}
                  fill="var(--red-500)">{threshold.label}</text>
              </>
            )}

            {area && colored.length === 1 && (
              <>
                <defs>
                  <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={colored[0]!.color} stopOpacity={0.24} />
                    <stop offset="100%" stopColor={colored[0]!.color} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <path
                  d={`${path(colored[0]!.key)} L${x(points.length - 1)},${PAD.t + plotH} L${x(0)},${PAD.t + plotH} Z`}
                  fill="url(#areaFill)" stroke="none" />
              </>
            )}

            {hovered >= 0 && (
              <line x1={x(hovered)} x2={x(hovered)} y1={PAD.t} y2={PAD.t + plotH}
                stroke="var(--border)" strokeWidth={1} />
            )}

            {colored.map((s) => (
              <path key={s.key} className="draw-line" pathLength={1} d={path(s.key)} fill="none"
                stroke={s.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            ))}

            {colored.map((s) => points.map((p, i) => {
              const v = p.values[s.key];
              if (v == null) return null;
              return (
                <circle key={s.key + i} className="pop-in" style={{ ['--i' as string]: i }}
                  cx={x(i)} cy={y(v)} r={hovered === i ? 5.5 : 4} fill={s.color}
                  /* The ring is the card, so two series crossing stay two lines. */
                  stroke="var(--surface)" strokeWidth={2}>
                  <title>{`${p.label} · ${s.label} ${format(v)}`}</title>
                </circle>
              );
            }))}

            {points.map((p, i) => (i % labelEvery === 0 || i === points.length - 1) && (
              <text key={'x' + i} x={x(i)} y={height - 8} fontSize={10} fill="var(--text-faint)"
                textAnchor={i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'}>
                {p.label}
              </text>
            ))}
          </svg>
        )}

        <ChartTooltip tip={tip} boxWidth={width} />
      </div>

      {hasData && colored.length > 1 && <Legend items={legend} />}
    </>
  );
}
