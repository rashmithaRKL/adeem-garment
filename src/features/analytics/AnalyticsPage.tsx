import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/Card';
import { QueryState } from '@/components/QueryState';
import { formatNumber, formatPercent } from '@/lib/format';
import { toneForEfficiency } from '@/components/ProgressBar';
import { fetchLinePerformance, fetchOutputTrend } from '@/features/dashboard/queries';
import { fetchOrders } from '@/features/orders/queries';

export function AnalyticsPage() {
  const lines = useQuery({ queryKey: ['dashboard', 'lines'], queryFn: () => fetchLinePerformance() });
  const trend = useQuery({ queryKey: ['dashboard', 'trend'], queryFn: () => fetchOutputTrend(7) });
  const orders = useQuery({ queryKey: ['orders'], queryFn: fetchOrders });

  const buyerMix = Object.entries(
    (orders.data ?? []).reduce<Record<string, number>>((acc, o) => {
      acc[o.buyer] = (acc[o.buyer] ?? 0) + o.order_quantity;
      return acc;
    }, {})
  ).sort((a, b) => b[1] - a[1]);
  const buyerPeak = Math.max(1, ...buyerMix.map(([, q]) => q));
  const trendPeak = Math.max(1, ...(trend.data ?? []).map((d) => Math.max(d.target, d.actual)));

  return (
    <QueryState isLoading={lines.isLoading || orders.isLoading} error={lines.error ?? orders.error}>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))' }}>
        <Card title="Efficiency by line">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
            {(lines.data ?? []).map((l) => (
              <div key={l.id} style={{ display: 'grid', gridTemplateColumns: '78px minmax(0,1fr) 60px', alignItems: 'center', gap: 12 }}>
                <span style={{ font: '600 13px var(--font-heading)', letterSpacing: '.06em' }}>{l.lineName}</span>
                <div style={{ height: 22, borderRadius: 6, background: 'var(--surface-muted)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: Math.min(100, l.efficiency) + '%', background: toneForEfficiency(l.efficiency), borderRadius: 6 }} />
                </div>
                <span style={{ textAlign: 'right', font: '600 13px var(--font-body)', color: toneForEfficiency(l.efficiency) }}>
                  {formatPercent(l.efficiency)}
                </span>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Order volume by buyer">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
            {buyerMix.map(([buyer, qty]) => (
              <div key={buyer} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,130px) minmax(0,1fr) 72px', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{buyer}</span>
                <div style={{ height: 22, borderRadius: 6, background: 'var(--surface-muted)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: (qty / buyerPeak) * 100 + '%', background: 'var(--purple-500)', borderRadius: 6 }} />
                </div>
                <span style={{ textAlign: 'right', font: '600 13px var(--font-body)', color: 'var(--text-muted)' }}>{formatNumber(qty)}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Target vs actual — last 7 days" style={{ gridColumn: '1 / -1' }}>
          <p style={{ fontSize: 12, color: 'var(--text-faint)', margin: '0 0 18px' }}>Grey bar = target, blue bar = achieved</p>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 20, height: 200 }}>
            {(trend.data ?? []).map((d) => (
              <div key={d.date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, height: '100%', justifyContent: 'flex-end' }}>
                <span style={{ font: '600 12px var(--font-body)', color: 'var(--text-muted)' }}>{formatNumber(d.actual)}</span>
                <div style={{ width: '100%', display: 'flex', alignItems: 'flex-end', gap: 5, height: 140 }}>
                  <div style={{ flex: 1, height: (d.target / trendPeak) * 100 + '%', background: 'var(--border)', borderRadius: '5px 5px 2px 2px' }} />
                  <div style={{ flex: 1, height: (d.actual / trendPeak) * 100 + '%', background: 'var(--blue-500)', borderRadius: '5px 5px 2px 2px' }} />
                </div>
                <span style={{ fontSize: 11.5, color: 'var(--text-faint)' }}>
                  {new Date(d.date).toLocaleDateString('en-GB', { weekday: 'short' })}
                </span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </QueryState>
  );
}
