import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/Card';
import { Donut, LineChart, RankedBars, seriesColor } from '@/components/charts';
import { formatNumber } from '@/lib/format';
import { EFFICIENCY_THRESHOLD } from '@/lib/env';
import { useTilt, useCountUp } from '@/lib/motion';
import { fetchQualityOverview } from './queries';
import { STAGE_LABEL } from './types';

const MARK = 'var(--chart-1)';
const MARK_LOW = 'var(--red-500)';

const pctText = (n: number | null): string => (n == null ? '—' : n.toFixed(1) + '%');

/** A quality headline tile: tilts toward the cursor, counts up on arrival. */
function StatTile({ value, label, color, index }: {
  value: string; label: string; color?: string; index: number;
}) {
  const tilt = useTilt<HTMLDivElement>();
  const numeric = Number(value.replace(/[,\s%]/g, ''));
  const counted = useCountUp(Number.isFinite(numeric) ? numeric : 0);
  const decimals = (value.split('.')[1] ?? '').replace(/[^0-9]/g, '').length;
  const shown = Number.isFinite(numeric)
    ? counted.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
      + (value.trim().endsWith('%') ? '%' : '')
    : value;

  return (
    <div
      ref={tilt.ref}
      onPointerMove={tilt.onPointerMove}
      onPointerLeave={tilt.onPointerLeave}
      className="card tilt rise"
      style={{ ['--i' as string]: index }}
    >
      <div className="tilt__pop" style={{ font: '600 30px/1 var(--font-heading)', color: color ?? 'var(--text)' }}>
        {shown}
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 6 }}>{label}</div>
    </div>
  );
}

/**
 * The quality summary that sits under the dashboard. Deliberately kept to four
 * panels: it answers "is quality holding" and hands off to Quality Management,
 * which is where a line, a stage and a period can actually be picked apart.
 */
export function QualitySection() {
  const q = useQuery({ queryKey: ['quality', 'overview'], queryFn: fetchQualityOverview });
  const d = q.data;

  if (q.isLoading) return null;
  if (q.error) {
    return (
      <Card title="Quality">
        <p className="banner banner--error" style={{ margin: 0 }}>
          {q.error instanceof Error ? q.error.message : 'Quality data could not be loaded.'}
        </p>
      </Card>
    );
  }
  if (!d?.hasData) {
    return (
      <Card title="Quality">
        <p style={{ margin: 0, fontSize: 13.5, color: 'var(--text-muted)' }}>
          No quality reports have been imported yet. Upload a KPI report, a daily quality
          performance report or a monthly summary from the Upload Excel screen.
        </p>
      </Card>
    );
  }

  const low = (n: number | null) => n != null && n < EFFICIENCY_THRESHOLD;

  return (
    <>
      <div className="grid grid--kpi" style={{ marginTop: 16 }}>
        <StatTile index={0} value={pctText(d.passPct)} color={low(d.passPct) ? MARK_LOW : MARK}
          label={'Overall pass rate' + (low(d.passPct) ? ' · below target' : '')} />
        <StatTile index={1} value={formatNumber(d.checked)} label="Pieces checked" />
        <StatTile index={2} value={formatNumber(d.defects)} label="Defects found" />
        <StatTile index={3} value={String(d.stages.length)}
          label={`Inspection stages · ${d.basis === 'daily' ? 'daily figures' : 'monthly figures'}`} />
      </div>

      <div className="grid grid--split" style={{ marginTop: 16 }}>
        <Card title="Pass rate by inspection stage"
          aside={<span style={{ fontSize: 12, color: 'var(--text-faint)' }}>
            {d.periodFrom} → {d.periodTo}
          </span>}>
          <RankedBars
            max={100}
            rows={d.stages.map((s) => ({
              label: STAGE_LABEL[s.stage],
              value: s.passPct ?? 0,
              suffix: pctText(s.passPct),
              color: low(s.passPct) ? MARK_LOW : MARK,
              hint: `${formatNumber(s.checked)} checked · ${formatNumber(s.defects)} defects`
            }))}
          />
          <p style={{ margin: '14px 0 0', fontSize: 11.5, color: 'var(--text-faint)' }}>
            Bars run 0–100%. Red marks a stage under the {EFFICIENCY_THRESHOLD}% threshold.
          </p>
        </Card>

        <Card title="Top defect categories">
          <Donut
            size={158}
            centerLabel="defects"
            slices={d.defectCategories.slice(0, 8).map((c, i) => ({
              label: c.category, value: c.qty, color: seriesColor(i)
            }))}
            empty="This report carried no defect breakdown."
          />
        </Card>
      </div>

      <div className="grid grid--split-rev" style={{ marginTop: 16 }}>
        <Card title="Pass rate by line">
          {/* Every line the factory runs, not only the ones with figures: a line
              that was never inspected reads "—" rather than disappearing. */}
          <RankedBars
            max={100}
            rows={d.lines.map((l) => ({
              label: l.label,
              value: l.passPct ?? 0,
              suffix: pctText(l.passPct),
              color: low(l.passPct) ? MARK_LOW : MARK,
              hint: l.passPct == null
                ? 'not inspected in the reports imported so far'
                : `${formatNumber(l.checked)} checked · ${formatNumber(l.defects)} defects`
            }))}
          />
        </Card>

        <Card title="Pass rate over time"
          aside={<span style={{ fontSize: 12, color: 'var(--text-faint)' }}>
            dashed line = {EFFICIENCY_THRESHOLD}% threshold
          </span>}>
          <LineChart
            domain="percent"
            area
            height={200}
            threshold={{ value: EFFICIENCY_THRESHOLD, label: EFFICIENCY_THRESHOLD + '%' }}
            format={(n) => n.toFixed(1) + '%'}
            points={d.trend.map((p) => ({ label: p.date.slice(5), values: { pass: p.passPct } }))}
            series={[{ key: 'pass', label: 'Pass rate', color: MARK }]}
            empty="A trend needs at least two dated reports — upload another to see it."
          />
        </Card>
      </div>
    </>
  );
}
