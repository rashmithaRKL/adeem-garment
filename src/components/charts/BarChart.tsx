import { useState } from 'react';
import { formatNumber } from '@/lib/format';
import { ChartTooltip, ChartEmpty, Legend, useMeasure, type TipState, type LegendItem } from './chrome';
import { niceMax, roundedTop, seriesColor, type ChartSeries } from './palette';

export type BarSeries = ChartSeries;

export interface BarDatum {
  label: string;
  /** Missing keys are read as zero, so a sparse day still draws its group. */
  values: Record<string, number>;
}

interface BarChartProps {
  data: BarDatum[];
  series: BarSeries[];
  height?: number;
  /** Segments of one total, rather than measures standing side by side. */
  stacked?: boolean;
  format?: (n: number) => string;
  empty?: string;
}

const PAD = { l: 46, r: 10, t: 14, b: 26 };

/** Axis ticks are read at a glance, so thousands lose their tail. */
const tickLabel = (v: number): string =>
  Math.abs(v) >= 10_000 ? Math.round(v / 1000) + 'k' : formatNumber(Math.round(v));

/**
 * Magnitude across a handful of named things — output per day, quantity per line.
 * Grouped bars compare measures of the same unit; anything on a second unit gets
 * its own chart rather than a second axis.
 */
export function BarChart({
  data, series, height = 220, stacked = false, format = formatNumber, empty
}: BarChartProps) {
  const { ref, width } = useMeasure<HTMLDivElement>();
  const [tip, setTip] = useState<TipState | null>(null);

  const colored = series.map((s, i) => ({ ...s, color: s.color ?? seriesColor(i) }));
  const totalOf = (d: BarDatum) =>
    stacked
      ? colored.reduce((sum, s) => sum + (d.values[s.key] ?? 0), 0)
      : Math.max(0, ...colored.map((s) => d.values[s.key] ?? 0));

  const hasData = data.length > 0 && data.some((d) => totalOf(d) > 0);

  const plotW = Math.max(0, width - PAD.l - PAD.r);
  const plotH = Math.max(0, height - PAD.t - PAD.b);
  const max = niceMax(Math.max(...data.map(totalOf), 0));
  const y = (v: number) => PAD.t + (1 - v / max) * plotH;

  const groupW = data.length > 0 ? plotW / data.length : 0;
  // Never narrower than a few pixels: a card squeezed onto a phone can drive the
  // group width below the gap and turn every bar into a negative-width path.
  const band = Math.max(6, Math.min(groupW - 10, stacked ? 46 : 18 * colored.length + 6));
  // Long runs of dates would otherwise overprint each other along the axis.
  const labelEvery = data.length > 10 ? Math.ceil(data.length / 7) : 1;

  const legend: LegendItem[] = colored.map((s) => ({ label: s.label, color: s.color }));

  return (
    <>
      <div className="chartbox" ref={ref} onMouseLeave={() => setTip(null)}>
        {!hasData && <ChartEmpty>{empty ?? 'No figures recorded for this period yet.'}</ChartEmpty>}

        {hasData && width > 0 && (
          <svg width={width} height={height} role="img"
            aria-label={`${colored.map((s) => s.label).join(' and ')} across ${data.length} groups`}>
            {[0, 0.25, 0.5, 0.75, 1].map((t) => (
              <g key={t}>
                <line x1={PAD.l} x2={width - PAD.r} y1={y(max * t)} y2={y(max * t)}
                  stroke="var(--border-soft)" strokeWidth={1} />
                <text x={PAD.l - 7} y={y(max * t) + 3.5} textAnchor="end"
                  fontSize={9.5} fill="var(--text-faint)">{tickLabel(max * t)}</text>
              </g>
            ))}

            {data.map((d, gi) => {
              const cx = PAD.l + groupW * gi + groupW / 2;
              const left = cx - band / 2;
              let stackTop = PAD.t + plotH;

              return (
                <g key={d.label + gi}>
                  {colored.map((s, si) => {
                    const value = d.values[s.key] ?? 0;
                    const h = max > 0 ? (value / max) * plotH : 0;
                    if (value <= 0) return null;

                    if (stacked) {
                      // A 2px bite out of each segment keeps the boundary between
                      // two similar hues visible without a border colour.
                      const segH = Math.max(h - 2, 1);
                      const top = stackTop - segH;
                      stackTop -= h;
                      const isTop = colored.slice(si + 1)
                        .every((rest) => (d.values[rest.key] ?? 0) <= 0);
                      return (
                        <path key={s.key} className="grow-y"
                          style={{ ['--i' as string]: gi }}
                          d={isTop
                            ? roundedTop(left, top, band, segH)
                            : `M${left},${top} h${band} v${segH} h${-band} Z`}
                          fill={s.color} />
                      );
                    }

                    const barW = Math.max(2, (band - 2 * (colored.length - 1)) / colored.length);
                    const x = left + si * (barW + 2);
                    return (
                      <path key={s.key} className="grow-y" style={{ ['--i' as string]: gi }}
                        d={roundedTop(x, PAD.t + plotH - h, barW, Math.max(h, 1))}
                        fill={s.color} />
                    );
                  })}

                  {(gi % labelEvery === 0) && (
                    <text x={cx} y={height - 8} textAnchor="middle" fontSize={10}
                      fill="var(--text-faint)">{d.label}</text>
                  )}

                  {/* One hit target per group, taller than the bars themselves —
                      chasing a 6px-wide bar with a mouse is not an interaction. */}
                  <rect x={PAD.l + groupW * gi} y={PAD.t} width={groupW} height={plotH}
                    fill="transparent"
                    onMouseEnter={() => setTip({
                      x: cx, y: Math.max(PAD.t, y(totalOf(d)) - 12), title: d.label,
                      rows: colored.map((s) => ({
                        label: s.label, color: s.color, value: format(d.values[s.key] ?? 0)
                      }))
                    })} />
                </g>
              );
            })}
          </svg>
        )}

        <ChartTooltip tip={tip} boxWidth={width} />
      </div>

      {hasData && colored.length > 1 && <Legend items={legend} />}
    </>
  );
}
