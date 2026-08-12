import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/Card';
import { formatNumber } from '@/lib/format';
import { EFFICIENCY_THRESHOLD } from '@/lib/env';
import { fetchQualityOverview, type DefectStat } from './queries';
import { STAGE_LABEL } from './types';

/**
 * Two colours only, and neither carries meaning on its own: blue is the measure,
 * red marks a bar under the pass threshold, and every bar prints its own number
 * beside it. Validated for colour-vision deficiency as an adjacent pair.
 */
const MARK = 'var(--blue-500)';
const MARK_LOW = 'var(--red-500)';

const pctText = (n: number | null): string => (n == null ? '—' : n.toFixed(1) + '%');

/** Horizontal bars: one measure, ranked. Labels are always present, never hover-only. */
function BarRow({ label, value, max, suffix, low, hint }: {
  label: string; value: number; max: number; suffix: string; low?: boolean; hint?: string;
}) {
  const width = max > 0 ? Math.max((value / max) * 100, value > 0 ? 1.5 : 0) : 0;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '116px minmax(0,1fr) 74px', alignItems: 'center', gap: 12 }}
      title={hint}>
      <span style={{ fontSize: 12.5, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {label}
      </span>
      <span style={{ display: 'block', height: 10, background: 'var(--surface-muted)', borderRadius: 5 }}>
        <span style={{
          display: 'block', height: '100%', width: width + '%',
          background: low ? MARK_LOW : MARK, borderRadius: 5, transition: 'width .3s'
        }} />
      </span>
      <span style={{ textAlign: 'right', font: '600 13px var(--font-body)', color: 'var(--text)' }}>
        {suffix}
      </span>
    </div>
  );
}

function Trend({ points }: { points: { date: string; passPct: number; checked: number }[] }) {
  if (points.length < 2) {
    return <p style={{ margin: 0, fontSize: 13, color: 'var(--text-faint)' }}>
      A trend needs at least two dated reports — upload another to see it.
    </p>;
  }

  const w = 560;
  const h = 130;
  const pad = { l: 34, r: 14, t: 12, b: 22 };
  const lo = Math.max(0, Math.min(...points.map((p) => p.passPct)) - 4);
  const hi = Math.min(100, Math.max(...points.map((p) => p.passPct)) + 3);
  const span = Math.max(hi - lo, 1);

  const x = (i: number) => pad.l + (i / (points.length - 1)) * (w - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - (v - lo) / span) * (h - pad.t - pad.b);

  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.passPct).toFixed(1)}`).join(' ');
  const last = points[points.length - 1]!;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} role="img"
      aria-label={`Pass rate from ${points[0]!.date} to ${last.date}`}>
      {[lo, (lo + hi) / 2, hi].map((v) => (
        <g key={v}>
          <line x1={pad.l} x2={w - pad.r} y1={y(v)} y2={y(v)} stroke="var(--border-soft)" strokeWidth="1" />
          <text x={pad.l - 6} y={y(v) + 3.5} textAnchor="end" fontSize="9.5" fill="var(--text-faint)">
            {v.toFixed(0)}
          </text>
        </g>
      ))}

      {/* the threshold the floor is judged against, drawn once and labelled */}
      {EFFICIENCY_THRESHOLD >= lo && EFFICIENCY_THRESHOLD <= hi && (
        <line x1={pad.l} x2={w - pad.r} y1={y(EFFICIENCY_THRESHOLD)} y2={y(EFFICIENCY_THRESHOLD)}
          stroke={MARK_LOW} strokeWidth="1" strokeDasharray="3 3" opacity=".55" />
      )}

      <path d={path} fill="none" stroke={MARK} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

      {points.map((p, i) => (
        <circle key={p.date} cx={x(i)} cy={y(p.passPct)} r="4.5"
          fill={p.passPct < EFFICIENCY_THRESHOLD ? MARK_LOW : MARK} stroke="var(--surface)" strokeWidth="2">
          <title>{`${p.date} · ${p.passPct.toFixed(1)}% pass · ${formatNumber(p.checked)} checked`}</title>
        </circle>
      ))}

      {points.map((p, i) => (
        (i === 0 || i === points.length - 1) && (
          <text key={'l' + p.date} x={x(i)} y={h - 6} fontSize="9.5" fill="var(--text-faint)"
            textAnchor={i === 0 ? 'start' : 'end'}>{p.date.slice(5)}</text>
        )
      ))}

      <text x={x(points.length - 1)} y={y(last.passPct) - 9} fontSize="10.5" fontWeight="600"
        fill="var(--text)" textAnchor="end">{last.passPct.toFixed(1)}%</text>
    </svg>
  );
}

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

  const maxDefect = Math.max(1, ...d.defectCategories.map((c: DefectStat) => c.qty));
  const low = (n: number | null) => n != null && n < EFFICIENCY_THRESHOLD;

  return (
    <>
      <div className="grid grid--kpi" style={{ marginTop: 16 }}>
        <div className="card">
          <div style={{ font: '600 30px/1 var(--font-heading)', color: low(d.passPct) ? MARK_LOW : MARK }}>
            {pctText(d.passPct)}
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 6 }}>
            Overall pass rate {low(d.passPct) ? '· below target' : ''}
          </div>
        </div>
        <div className="card">
          <div style={{ font: '600 30px/1 var(--font-heading)', color: 'var(--text)' }}>{formatNumber(d.checked)}</div>
          <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 6 }}>Pieces checked</div>
        </div>
        <div className="card">
          <div style={{ font: '600 30px/1 var(--font-heading)', color: 'var(--text)' }}>{formatNumber(d.defects)}</div>
          <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 6 }}>Defects found</div>
        </div>
        <div className="card">
          <div style={{ font: '600 30px/1 var(--font-heading)', color: 'var(--text)' }}>{d.stages.length}</div>
          <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 6 }}>
            Inspection stages · {d.basis === 'daily' ? 'daily figures' : 'monthly figures'}
          </div>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'minmax(0,1.55fr) minmax(0,1fr)', marginTop: 16 }}>
        <Card title="Pass rate by inspection stage"
          aside={<span style={{ fontSize: 12, color: 'var(--text-faint)' }}>
            {d.periodFrom} → {d.periodTo}
          </span>}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
            {d.stages.map((s) => (
              <BarRow key={s.stage} label={STAGE_LABEL[s.stage]} value={s.passPct ?? 0} max={100}
                suffix={pctText(s.passPct)} low={low(s.passPct)}
                hint={`${formatNumber(s.checked)} checked · ${formatNumber(s.defects)} defects`} />
            ))}
          </div>
          <p style={{ margin: '14px 0 0', fontSize: 11.5, color: 'var(--text-faint)' }}>
            Bars run 0–100%. Red marks a stage under the {EFFICIENCY_THRESHOLD}% threshold.
          </p>
        </Card>

        <Card title="Top defect categories">
          {d.defectCategories.length === 0 ? (
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-faint)' }}>
              This report carried no defect breakdown.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
              {d.defectCategories.map((c) => (
                <BarRow key={c.category} label={c.category} value={c.qty} max={maxDefect}
                  suffix={formatNumber(c.qty)} />
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.55fr)', marginTop: 16 }}>
        <Card title="Pass rate by line">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
            {d.lines.map((l) => (
              <BarRow key={l.key} label={l.label} value={l.passPct ?? 0} max={100}
                suffix={pctText(l.passPct)} low={low(l.passPct)}
                hint={`${formatNumber(l.checked)} checked · ${formatNumber(l.defects)} defects`} />
            ))}
          </div>
        </Card>

        <Card title="Pass rate over time"
          aside={<span style={{ fontSize: 12, color: 'var(--text-faint)' }}>
            dashed line = {EFFICIENCY_THRESHOLD}% threshold
          </span>}>
          <Trend points={d.trend} />
        </Card>
      </div>
    </>
  );
}
