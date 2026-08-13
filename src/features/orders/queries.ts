import { supabase } from '@/lib/supabase';

export interface OrderRow {
  id: string;
  order_number: string;
  buyer: string;
  style_number: string | null;
  order_quantity: number;
  produced_quantity: number;
  remaining_quantity: number;
  delivery_date: string | null;
  production_status: string;
  delivery_status: string;
  production_lines: { line_name: string } | null;
}

export async function fetchOrders(): Promise<OrderRow[]> {
  const { data, error } = await supabase
    .from('orders')
    .select(
      'id, order_number, buyer, style_number, order_quantity, produced_quantity, ' +
      'remaining_quantity, delivery_date, production_status, delivery_status, ' +
      'production_lines ( line_name )'
    )
    .order('delivery_date', { ascending: true });

  if (error) throw error;
  return (data ?? []) as unknown as OrderRow[];
}

/**
 * Production records reference the order they belong to, so Postgres blocks the
 * delete rather than orphaning them. That is the right default here: an order
 * with output recorded against it is history, not clutter.
 */
export async function deleteOrder(id: string) {
  const { error } = await supabase.from('orders').delete().eq('id', id);
  if (error) {
    if (error.code === '23503') {
      throw new Error(
        'This order has production records attached, so deleting it would destroy '
        + 'that output history. Remove the import that created them first, or leave '
        + 'the order in place.'
      );
    }
    throw new Error(error.message);
  }
}
