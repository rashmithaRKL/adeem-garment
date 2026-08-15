import { useCallback, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card } from '@/components/Card';
import { QueryState } from '@/components/QueryState';
import { StatusChip } from '@/components/StatusChip';
import { Modal } from '@/components/Modal';
import { SearchInput, useSearch, useSearchTerm } from '@/components/SearchInput';
import { formatNumber, formatDate } from '@/lib/format';
import { friendlyError } from '@/lib/errors';
import { useIsManager } from '@/features/auth/AuthProvider';
import { fetchOrders, deleteOrder, type OrderRow } from './queries';

export function OrdersPage() {
  const queryClient = useQueryClient();
  const canManage = useIsManager();
  const { data, isLoading, error } = useQuery({ queryKey: ['orders'], queryFn: fetchOrders });

  const [term, setTerm] = useSearchTerm();
  const [removing, setRemoving] = useState<OrderRow | null>(null);

  const remove = useMutation({
    mutationFn: (id: string) => deleteOrder(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      setRemoving(null);
    }
  });

  const rows = data ?? [];
  const searchable = useCallback(
    (o: OrderRow) =>
      `${o.order_number} ${o.buyer} ${o.style_number ?? ''} ${o.production_lines?.line_name ?? ''} `
      + `${o.production_status} ${o.delivery_status}`,
    []
  );
  const shown = useSearch(rows, term, searchable);

  return (
    <Card>
      {rows.length > 0 && (
        <SearchInput value={term} onChange={setTerm}
          placeholder="Search order, buyer, style, line or status"
          count={{ shown: shown.length, total: rows.length }} />
      )}

      <QueryState isLoading={isLoading} error={error} isEmpty={rows.length === 0}
        emptyTitle="No orders yet" emptyBody="Orders arrive with your first Excel import.">
        {shown.length === 0 ? (
          <p style={{ margin: 0, fontSize: 13.5, color: 'var(--text-muted)' }}>
            Nothing matches “{term}”.
          </p>
        ) : (
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>Order</th><th>Buyer</th><th>Style</th><th>Line</th>
                  <th className="num">Ordered</th><th className="num">Produced</th><th className="num">Remaining</th>
                  <th>Delivery</th><th>Status</th>
                  {canManage && <th />}
                </tr>
              </thead>
              <tbody>
                {shown.map((o) => (
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
                    {canManage && (
                      <td className="num">
                        <button type="button" className="btn btn--ghost btn--small"
                          style={{ color: 'var(--red-500)' }}
                          onClick={() => setRemoving(o)}>Delete</button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </QueryState>

      {removing && (
        <Modal
          title="Delete order"
          onClose={() => { remove.reset(); setRemoving(null); }}
          error={remove.error ? friendlyError(remove.error) : undefined}
          actions={
            <>
              <button type="button" className="btn btn--secondary"
                onClick={() => { remove.reset(); setRemoving(null); }}>Cancel</button>
              <button type="button" className="btn btn--danger" disabled={remove.isPending}
                onClick={() => remove.mutate(removing.id)}>
                {remove.isPending ? 'Deleting…' : 'Delete order'}
              </button>
            </>
          }
        >
          <p style={{ margin: '0 0 12px', fontSize: 14 }}>
            Delete order <strong>{removing.order_number}</strong> for {removing.buyer}?
          </p>
          <p className="banner banner--warning" style={{ margin: 0 }}>
            Orders are recreated automatically by the next import that names them, so
            deleting one only clears it until then. If the order already has production
            output recorded, the database will refuse the delete rather than destroy it.
          </p>
        </Modal>
      )}
    </Card>
  );
}
