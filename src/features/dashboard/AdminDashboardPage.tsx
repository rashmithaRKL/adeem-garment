import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/Card';
import { Kpi } from '@/components/Kpi';
import { QueryState } from '@/components/QueryState';
import { StatusChip } from '@/components/StatusChip';
import { ProgressBar, toneForEfficiency } from '@/components/ProgressBar';
import { formatNumber, formatPercent } from '@/lib/format';
import { fetchDashboardKpis, fetchLinePerformance, fetchOutputTrend } from './queries';
import { useRealtimeDashboard, useDashboardKeys } from './useRealtimeDashboard';

export function AdminDashboardPage() {
  useRealtimeDashboard();
  const keys = useDashboardKeys();

  const kpis = useQuery({ queryKey: keys.kpis, queryFn: () => fetchDashboardKpis() });
  const lines = useQuery({ queryKey: keys.lines, queryFn: () => fetchLinePerformance() });
  const trend = useQuery({ queryKey: keys.trend, queryFn: () => fetchOutputTrend(7) });

  const k = kpis.data;
  const peak = Math.max(1, ...(trend.data ?? []).map((d) => Math.max(d.target, d.actual)));

  return (
    <QueryState isLoading={kpis.isLoading || lines.isLoading} error={kpis.error ?? lines.error}>
      <div className="grid grid--kpi">
        <Kpi label="Today · production" icon="▲" tone="blue"
          value={formatNumber(k?.todayActual ?? 0)}
          sub={'of ' + formatNumber(k?.todayTarget ?? 0) + ' target'}
          delta={formatPercent(k?.achievement)} />
        <Kpi label="Active orders" icon="▤" tone="purple"
          value={String(k?.activeOrders ?? 0)}
          sub={(k?.completedOrders ?? 0) + ' completed'} />
        <Kpi label="Remaining qty" icon="⧗" tone="orange"
          value={formatNumber(k?.remainingQuantity ?? 0)} sub="across open orders" />
        <Kpi label="Avg efficiency" icon="⚡" tone="green"
          value={formatPercent(k?.avgEfficiency)} sub="target 88%" />
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'minmax(0,1.55fr) minmax(0,1fr)', marginTop: 16 }}>
        <Card title="Production lines" aside={<span style={{ fontSize: 12, color: 'var(--text-faint)' }}>today · target vs actual</span>}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {(lines.data ?? []).map((line) => (
              <div key={line.id} style={{ display: 'grid', gridTemplateColumns: '120px minmax(0,1fr) 92px 100px', alignItems: 'center', gap: 14, padding: '11px 8px' }}>
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
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 9, height: 140 }}>
              {(trend.data ?? []).map((d) => (
                <div key={d.date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, height: '100%', justifyContent: 'flex-end' }}>
                  <span style={{ font: '600 10.5px var(--font-body)', color: 'var(--text-faint)' }}>{formatNumber(d.actual)}</span>
                  <div style={{ width: '100%', display: 'flex', alignItems: 'flex-end', gap: 3, height: '100%' }}>
                    <div style={{ flex: 1, height: (d.target / peak) * 100 + '%', background: 'var(--border)', borderRadius: '4px 4px 2px 2px' }} />
                    <div style={{ flex: 1, height: (d.actual / peak) * 100 + '%', background: 'var(--blue-500)', borderRadius: '4px 4px 2px 2px' }} />
                  </div>
                  <span style={{ fontSize: 10.5, color: 'var(--text-faint)' }}>
                    {new Date(d.date).toLocaleDateString('en-GB', { weekday: 'short' })}
                  </span>
                </div>
              ))}
            </div>
          </Card>

          <Card title="Delivery status">
            <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {([['On time', k?.onTime, 'green'], ['Upcoming', k?.upcoming, 'blue'],
                 ['Delayed', k?.delayed, 'red'], ['Completed', k?.completed, 'cyan']] as const).map(([label, n, tone]) => (
                <div key={label} style={{ background: 'var(--' + tone + '-50)', borderRadius: 10, padding: 12 }}>
                  <div style={{ font: '600 24px/1 var(--font-heading)', color: 'var(--' + tone + '-500)' }}>{n ?? 0}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{label}</div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </QueryState>
  );
}
