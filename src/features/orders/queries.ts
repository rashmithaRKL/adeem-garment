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
