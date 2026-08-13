import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/Card';
import { Kpi } from '@/components/Kpi';
import { QueryState } from '@/components/QueryState';
import { StatusChip } from '@/components/StatusChip';
import { ProgressBar, toneForEfficiency } from '@/components/ProgressBar';
import { Donut, BarChart, LineChart, RankedBars } from '@/components/charts';
import { formatNumber, formatPercent, formatDate } from '@/lib/format';
import { fetchDashboardKpis, fetchLinePerformance, fetchOutputTrend } from './queries';
import { useRealtimeDashboard, useDashboardKeys } from './useRealtimeDashboard';
import { QualitySection } from '@/features/quality/QualitySection';
import { fetchHrRows, buildHrOverview } from '@/features/hr/queries';
import { fetchLoadingPlan, overdueMilestone } from '@/features/loading/queries';

const weekday = (iso: string): string =>
  new Date(iso).toLocaleDateString('en-GB', { weekday: 'short' });

/**
 * The total summary: production, quality, manpower and what is loaded next, on
 * one screen. Each panel is a different subject, so each gets the form that suits
 * it — bars for output against target, a ring for a split, a line for a trend —
 * rather than four copies of the same chart in four colours.
 */
export function AdminDashboardPage() {
  useRealtimeDashboard();
  const keys = useDashboardKeys();

  const kpis = useQuery({ queryKey: keys.kpis, queryFn: () => fetchDashboardKpis() });
  const lines = useQuery({ queryKey: keys.lines, queryFn: () => fetchLinePerformance() });
  const trend = useQuery({ queryKey: keys.trend, queryFn: () => fetchOutputTrend(7) });
  const hr = useQuery({ queryKey: ['hr', 'rows'], queryFn: fetchHrRows });
  const plan = useQuery({ queryKey: ['loadingPlan'], queryFn: fetchLoadingPlan });

  const k = kpis.data;
  const manpower = buildHrOverview(hr.data ?? []);
  const planRows = plan.data ?? [];
  const queued = planRows.filter((r) => r.status === 'upcoming');

  const qtyByLine = [...new Set(queued.map((r) => r.line_no))]
    .sort((a, b) => a - b)
    .map((lineNo) => ({
      label: 'L' + String(lineNo).padStart(2, '0'),
      values: {
        qty: queued.filter((r) => r.line_no === lineNo).reduce((sum, r) => sum + r.order_qty, 0)
      }
    }));

  return (
    <QueryState isLoading={kpis.isLoading || lines.isLoading} error={kpis.error ?? lines.error}>
      <div className="grid grid--kpi">
        <Kpi index={0} label="Today · production" icon="📈" tone="blue"
          value={formatNumber(k?.todayActual ?? 0)}
          sub={'of ' + formatNumber(k?.todayTarget ?? 0) + ' target'}
          delta={formatPercent(k?.achievement)} />
        <Kpi index={1} label="Active orders" icon="📋" tone="purple"
          value={String(k?.activeOrders ?? 0)}
          sub={(k?.completedOrders ?? 0) + ' completed'} />
        <Kpi index={2} label="Remaining qty" icon="⏳" tone="orange"
          value={formatNumber(k?.remainingQuantity ?? 0)} sub="across open orders" />
        <Kpi index={3} label="Avg efficiency" icon="⚡" tone="green"
          value={formatPercent(k?.avgEfficiency)} sub="target 88%" />
      </div>

      <div className="grid grid--split" style={{ marginTop: 16 }}>
        <Card title="Production lines" aside={<span style={{ fontSize: 12, color: 'var(--text-faint)' }}>today · target vs actual</span>}>
          {(lines.data ?? []).length === 0 && (
            <p style={{ margin: 0, fontSize: 13.5, color: 'var(--text-muted)', lineHeight: 1.6 }}>
              No production lines are set up yet, so there is nothing to chart here.
              {' '}This panel tracks output against target — it fills once a production sheet
              {' '}with line, order, target and produced quantities is imported. The quality
              {' '}reports below come from a different set of workbooks and do not feed it.
            </p>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {(lines.data ?? []).map((line) => (
              <div key={line.id} className="linerow">
                <div>
                  <div style={{ font: '600 14px/1.15 var(--font-heading)', letterSpacing: '.06em' }}>{line.lineName}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>{line.department}</div>
                </div>
                <div>
                  <ProgressBar value={line.progress} tone={toneForEfficiency(line.efficiency)} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5, fontSize: 11, color: 'var(--text-faint)', gap: 10 }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {line.buyer ?? 'No active order'} {line.styleNumber ? '· ' + line.styleNumber : ''}
                    </span>
                    <span style={{ flex: 'none' }}>
                      <strong style={{ color: 'var(--text-muted)' }}>{formatNumber(line.actual)}</strong> / {formatNumber(line.target)}
                    </span>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ font: '600 15px/1 var(--font-heading)', color: toneForEfficiency(line.efficiency) }}>
                    {formatPercent(line.efficiency)}
                  </div>
                  <div style={{ fontSize: 10.5, color: 'var(--text-faint)' }}>efficiency</div>
                </div>
                <div style={{ textAlign: 'right' }}><StatusChip status={line.status} /></div>
              </div>
            ))}
          </div>
        </Card>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card title="Output — last 7 days">
            <BarChart
              height={190}
              data={(trend.data ?? []).map((d) => ({
                label: weekday(d.date),
                values: { target: d.target, actual: d.actual }
              }))}
              series={[
                { key: 'target', label: 'Target', color: 'var(--chart-4)' },
                { key: 'actual', label: 'Produced', color: 'var(--chart-1)' }
              ]}
              empty="No production records in the last 7 days."
            />
          </Card>

          <Card title="Delivery status">
            {/* A ring, because these four numbers are parts of one order book —
                which is exactly the question "how much of it is late?". */}
            <Donut
              size={150}
              centerLabel="orders"
              slices={[
                { label: 'On time', value: k?.onTime ?? 0, color: 'var(--green-500)' },
                { label: 'Upcoming', value: k?.upcoming ?? 0, color: 'var(--blue-500)' },
                { label: 'Delayed', value: k?.delayed ?? 0, color: 'var(--red-500)' },
                { label: 'Completed', value: k?.completed ?? 0, color: 'var(--cyan-500)' }
              ].filter((s) => s.value > 0)}
              format={(n) => String(n)}
              empty="No orders on the system yet."
            />
          </Card>
        </div>
      </div>

      <h2 className="section-heading">Manpower and loading</h2>

      <div className="grid grid--split" style={{ marginTop: 16 }}>
        <Card title="Absenteeism — last 7 recorded days"
          aside={manpower.latest
            ? <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>
                {formatNumber(manpower.latest.carder)} carder on {formatDate(manpower.latest.date)}
              </span>
            : null}>
          <LineChart
            domain="percent"
            area
            height={190}
            threshold={{ value: 5, label: '5% tolerance' }}
            format={(n) => n.toFixed(1) + '%'}
            points={manpower.week.map((d) => ({
              label: formatDate(d.date).slice(0, 6),
              values: { rate: d.absenteeism }
            }))}
            series={[{ key: 'rate', label: 'Absenteeism', color: 'var(--chart-2)' }]}
            empty="No attendance recorded yet — enter a day on the HR screen."
          />
          <div style={{ display: 'flex', gap: 18, marginTop: 14, flexWrap: 'wrap' }}>
            <Figure label="Direct carder" value={formatNumber(manpower.latest?.direct ?? 0)} color="var(--chart-1)" />
            <Figure label="Indirect carder" value={formatNumber(manpower.latest?.indirect ?? 0)} color="var(--chart-3)" />
            <Figure label="Absent today" value={formatNumber(manpower.latest?.absent ?? 0)} color="var(--chart-2)" />
          </div>
        </Card>

        <Card title="Loading plan — queued quantity by line"
          aside={<span style={{ fontSize: 12, color: 'var(--text-faint)' }}>
            {queued.length} styles waiting
          </span>}>
          <BarChart
            height={190}
            data={qtyByLine}
            series={[{ key: 'qty', label: 'Queued pieces', color: 'var(--chart-7)' }]}
            empty="No styles queued — add them on the Loading Plan screen."
          />
          {planRows.some((r) => overdueMilestone(r)) && (
            <p className="banner banner--warning" style={{ margin: '14px 0 0' }}>
              {planRows.filter((r) => overdueMilestone(r)).length} planned style
              {planRows.filter((r) => overdueMilestone(r)).length === 1 ? ' has' : 's have'} passed
              a PP, PCD, PSD or PED date while still waiting.
            </p>
          )}
        </Card>
      </div>

      {queued.length > 0 && (
        <Card title="Next up, line by line" style={{ marginTop: 16 }}>
          <RankedBars
            rows={[...new Set(queued.map((r) => r.line_no))].sort((a, b) => a - b).map((lineNo) => {
              const next = queued
                .filter((r) => r.line_no === lineNo)
                .sort((a, b) => a.sequence - b.sequence)[0]!;
              return {
                label: `L${String(lineNo).padStart(2, '0')} · ${next.style_number}`,
                value: next.order_qty,
                suffix: formatNumber(next.order_qty) + ' pcs',
                hint: `${next.school_name ?? 'no school'} · PSD ${formatDate(next.psd)} · PED ${formatDate(next.ped)}`
              };
            })}
          />
        </Card>
      )}

      <h2 className="section-heading">Quality</h2>
      <QualitySection />
    </QueryState>
  );
}

/** A small labelled number under a chart, in the colour of the mark it explains. */
function Figure({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span aria-hidden style={{ width: 9, height: 9, borderRadius: 3, background: color }} />
        <span style={{ font: '600 17px/1 var(--font-heading)' }}>{value}</span>
      </span>
      <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{label}</span>
    </span>
  );
}
