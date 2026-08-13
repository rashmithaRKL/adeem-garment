import { formatNumber } from '@/lib/format';
import { ChartEmpty } from './chrome';
import { sequentialColor } from './palette';

export interface RankedRow {
  label: string;
  value: number;
  /** Overrides the ramp when the row's identity already owns a colour. */
  color?: string | undefined;
  /** Printed at the end of the row. Defaults to the formatted value. */
  suffix?: string | undefined;
  hint?: string | undefined;
}

interface RankedBarsProps {
  rows: RankedRow[];
  /** Defaults to the largest row, i.e. bars fill the width relative to the top one. */
  max?: number;
  format?: (n: number) => string;
  empty?: string;
}

/**
 * One measure, ranked. Horizontal because the labels are words — a line name, a
 * defect category, a school — and words read across, not rotated 45° under an
 * axis. Every bar prints its own figure, so the ramp is reinforcement rather
 * than the only thing carrying the value.
 */
export function RankedBars({ rows, max, format = formatNumber, empty }: RankedBarsProps) {
  if (rows.length === 0) return <ChartEmpty>{empty ?? 'Nothing to rank yet.'}</ChartEmpty>;

  const peak = max ?? Math.max(1, ...rows.map((r) => r.value));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
      {rows.map((row, i) => {
        // A non-zero value always shows a sliver: a bar of literally no width
        // reads as missing data rather than as a small number.
        const width = peak > 0 ? Math.max((row.value / peak) * 100, row.value > 0 ? 1.5 : 0) : 0;
        return (
          <div className="barrow" key={row.label} title={row.hint}>
            <span style={{
              fontSize: 12.5, color: 'var(--text-muted)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
            }}>{row.label}</span>
            <span style={{ display: 'block', height: 10, background: 'var(--surface-muted)', borderRadius: 5 }}>
              <span className="grow-x" style={{
                display: 'block', height: '100%', width: width + '%', borderRadius: 5,
                background: row.color ?? sequentialColor(i, rows.length),
                ['--i' as string]: i
              }} />
            </span>
            <span style={{ textAlign: 'right', font: '600 13px var(--font-body)', color: 'var(--text)' }}>
              {row.suffix ?? format(row.value)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
