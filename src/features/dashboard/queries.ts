import { supabase } from '@/lib/supabase';
import type { DashboardKpis, LinePerformance } from '@/types/domain';

const today = (): string => new Date().toISOString().slice(0, 10);

/**
 * Every figure below is an aggregate over real rows. Nothing is hardcoded, so the
 * dashboard changes the moment an import lands - and supports any number of lines.
 */
export async function fetchLinePerformance(date = today()): Promise<LinePerformance[]> {
  const { data: lines, error: linesError } = await supabase
    .from('production_lines')
    .select('id, line_number, line_name, department, status, active')
    .eq('active', true)
    .order('line_number');
  if (linesError) throw linesError;

  const { data: records, error: recordsError } = await supabase
    .from('production_records')
    .select('production_line_id, target_quantity, actual_quantity, efficiency')
    .eq('production_date', date);
  if (recordsError) throw recordsError;

  const { data: orders, error: ordersError } = await supabase
    .from('orders')
    .select('id, order_number, buyer, style_number, delivery_date, production_line_id, production_status')
    .in('production_status', ['in_production', 'at_risk', 'pending']);
  if (ordersError) throw ordersError;

  return (lines ?? []).map((line) => {
    const own = (records ?? []).filter((r) => r.production_line_id === line.id);
    const target = own.reduce((sum, r) => sum + r.target_quantity, 0);
    const actual = own.reduce((sum, r) => sum + r.actual_quantity, 0);
    const order = (orders ?? []).find((o) => o.production_line_id === line.id);

    return {
      id: line.id,
      lineNumber: line.line_number,
      lineName: line.line_name,
      department: line.department,
      status: line.status,
      target,
      actual,
      balance: Math.max(target - actual, 0),
      efficiency: target > 0 ? (actual / target) * 100 : 0,
      progress: target > 0 ? Math.min((actual / target) * 100, 100) : 0,
      currentOrder: order?.order_number ?? null,
      buyer: order?.buyer ?? null,
      styleNumber: order?.style_number ?? null,
      deliveryDate: order?.delivery_date ?? null
    };
  });
}

export async function fetchDashboardKpis(date = today()): Promise<DashboardKpis> {
  const [{ data: records, error: rErr }, { data: orders, error: oErr }] = await Promise.all([
    supabase.from('production_records')
      .select('target_quantity, actual_quantity')
      .eq('production_date', date),
    supabase.from('orders')
      .select('order_quantity, produced_quantity, remaining_quantity, production_status, delivery_status')
  ]);
  if (rErr) throw rErr;
  if (oErr) throw oErr;

  const todayTarget = (records ?? []).reduce((s, r) => s + r.target_quantity, 0);
  const todayActual = (records ?? []).reduce((s, r) => s + r.actual_quantity, 0);
  const countStatus = (key: 'production_status' | 'delivery_status', value: string): number =>
    (orders ?? []).filter((o) => o[key] === value).length;

  return {
    todayTarget,
    todayActual,
    achievement: todayTarget > 0 ? (todayActual / todayTarget) * 100 : 0,
    avgEfficiency: todayTarget > 0 ? (todayActual / todayTarget) * 100 : 0,
    activeOrders: countStatus('production_status', 'in_production') + countStatus('production_status', 'at_risk'),
    completedOrders: countStatus('production_status', 'completed'),
    pendingOrders: countStatus('production_status', 'pending'),
    orderedQuantity: (orders ?? []).reduce((s, o) => s + o.order_quantity, 0),
    producedQuantity: (orders ?? []).reduce((s, o) => s + o.produced_quantity, 0),
    remainingQuantity: (orders ?? []).reduce((s, o) => s + o.remaining_quantity, 0),
    onTime: countStatus('delivery_status', 'on_time'),
    upcoming: countStatus('delivery_status', 'upcoming'),
    delayed: countStatus('delivery_status', 'delayed'),
    completed: countStatus('delivery_status', 'completed')
  };
}

export async function fetchOutputTrend(days = 7): Promise<{ date: string; target: number; actual: number }[]> {
  const from = new Date();
  from.setDate(from.getDate() - (days - 1));

  const { data, error } = await supabase
    .from('production_records')
    .select('production_date, target_quantity, actual_quantity')
    .gte('production_date', from.toISOString().slice(0, 10))
    .order('production_date');
  if (error) throw error;

  const byDate = new Map<string, { target: number; actual: number }>();
  for (const row of data ?? []) {
    const bucket = byDate.get(row.production_date) ?? { target: 0, actual: 0 };
    bucket.target += row.target_quantity;
    bucket.actual += row.actual_quantity;
    byDate.set(row.production_date, bucket);
  }
  return [...byDate.entries()].map(([date, v]) => ({ date, ...v }));
}
