import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/Card';
import { QueryState } from '@/components/QueryState';
import { Donut, BarChart, LineChart, RankedBars, toSlices } from '@/components/charts';
import { formatNumber, formatPercent } from '@/lib/format';
import { toneForEfficiency } from '@/components/ProgressBar';
import { fetchLinePerformance, fetchOutputTrend } from '@/features/dashboard/queries';
import { fetchOrders } from '@/features/orders/queries';

const weekday = (iso: string): string =>
  new Date(iso).toLocaleDateString('en-GB', { weekday: 'short' });

export function AnalyticsPage() {
  const lines = useQuery({ queryKey: ['dashboard', 'lines'], queryFn: () => fetchLinePerformance() });
  const trend = useQuery({ queryKey: ['dashboard', 'trend'], queryFn: () => fetchOutputTrend(7) });
  const orders = useQuery({ queryKey: ['orders'], queryFn: fetchOrders });

  const orderRows = orders.data ?? [];
  const buyerMix = toSlices(
    [...orderRows.reduce((acc, o) => {
      acc.set(o.buyer, (acc.get(o.buyer) ?? 0) + o.order_quantity);
      return acc;
    }, new Map<string, number>())].map(([buyer, qty]) => ({ buyer, qty })),
    (r) => r.buyer,
    (r) => r.qty
  );

  // Every panel on this page is derived from production output. Saying so once,
  // at the top, beats three cards that each render as an unexplained empty box.
  const noProduction = (lines.data ?? []).length === 0 && orderRows.length === 0;

  return (
    <QueryState isLoading={lines.isLoading || orders.isLoading} error={lines.error ?? orders.error}>
      {noProduction && (
        <p className="banner banner--info" style={{ marginBottom: 16 }}>
          These panels chart production output — efficiency against target, order volume by buyer,
          and daily target versus actual. There are no production lines, orders or production records
          yet, so they are empty. Quality reports do not feed this page; their figures are on the
          Dashboard under Quality and on Quality Management.
        </p>
      )}

      <div className="grid grid--split">
        <Card title="Efficiency by line"
          aside={<span style={{ fontSize: 12, color: 'var(--text-faint)' }}>today</span>}>
          <RankedBars
            max={100}
            rows={(lines.data ?? []).map((l) => ({
              label: l.lineName,
              value: Math.min(100, l.efficiency),
              suffix: formatPercent(l.efficiency),
              // Efficiency is judged, not just ranked, so the colour is the
              // verdict — the same one the Production Line screen gives.
              color: toneForEfficiency(l.efficiency),
              hint: `${formatNumber(l.actual)} of ${formatNumber(l.target)}`
            }))}
            empty="No lines with output recorded today."
          />
        </Card>

        <Card title="Order volume by buyer">
          <Donut
            size={162}
            centerLabel="pieces ordered"
            slices={buyerMix}
            empty="No orders on the system yet."
          />
        </Card>
      </div>

      <Card title="Target versus achieved — last 7 days" style={{ marginTop: 16 }}>
        <BarChart
          height={250}
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

      <Card title="Achievement against target" style={{ marginTop: 16 }}
        aside={<span style={{ fontSize: 12, color: 'var(--text-faint)' }}>
          produced ÷ target, day by day
        </span>}>
        <LineChart
          domain="percent"
          area
          height={220}
          threshold={{ value: 100, label: '100% of target' }}
          format={(n) => n.toFixed(1) + '%'}
          points={(trend.data ?? []).map((d) => ({
            label: weekday(d.date),
            values: { achievement: d.target > 0 ? Math.round((d.actual / d.target) * 1000) / 10 : 0 }
          }))}
          series={[{ key: 'achievement', label: 'Achievement', color: 'var(--chart-3)' }]}
          empty="Two or more days of production are needed before a trend means anything."
        />
      </Card>
    </QueryState>
  );
}
