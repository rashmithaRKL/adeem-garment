import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/Card';
import { QueryState } from '@/components/QueryState';
import { StatusChip } from '@/components/StatusChip';
import { formatNumber, formatDate } from '@/lib/format';
import { fetchOrders } from './queries';

export function OrdersPage() {
  const { data, isLoading, error } = useQuery({ queryKey: ['orders'], queryFn: fetchOrders });

  return (
    <Card>
      <QueryState isLoading={isLoading} error={error} isEmpty={data?.length === 0}
        emptyTitle="No orders yet" emptyBody="Orders arrive with your first Excel import.">
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th>Order</th><th>Buyer</th><th>Style</th><th>Line</th>
                <th className="num">Ordered</th><th className="num">Produced</th><th className="num">Remaining</th>
                <th>Delivery</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((o) => (
                <tr key={o.id}>
                  <td style={{ fontWeight: 600 }}>{o.order_number}</td>
                  <td style={{ color: 'var(--text-muted)' }}>{o.buyer}</td>
                  <td style={{ color: 'var(--text-muted)' }}>{o.style_number ?? '—'}</td>
                  <td style={{ color: 'var(--text-muted)' }}>{o.production_lines?.line_name ?? '—'}</td>
                  <td className="num">{formatNumber(o.order_quantity)}</td>
                  <td className="num" style={{ color: 'var(--green-500)', fontWeight: 600 }}>{formatNumber(o.produced_quantity)}</td>
                  <td className="num" style={{ color: 'var(--amber-500)' }}>{formatNumber(o.remaining_quantity)}</td>
                  <td>{formatDate(o.delivery_date)}</td>
                  <td><StatusChip status={o.production_status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </QueryState>
    </Card>
  );
}
