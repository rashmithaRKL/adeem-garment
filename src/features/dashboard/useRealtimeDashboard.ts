import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

/**
 * No manual refresh. When an import writes production records, Postgres pushes a
 * change over the realtime channel and every open dashboard refetches itself.
 *
 * Enable replication once per table in Supabase:
 *   alter publication supabase_realtime add table production_records, orders;
 */
export function useRealtimeDashboard(): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    const channel = supabase
      .channel('dashboard-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'production_records' },
        () => { void queryClient.invalidateQueries({ queryKey: ['dashboard'] }); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' },
        () => { void queryClient.invalidateQueries({ queryKey: ['dashboard'] }); })
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [queryClient]);
}

export function useDashboardKeys() {
  return {
    kpis: ['dashboard', 'kpis'] as const,
    lines: ['dashboard', 'lines'] as const,
    trend: ['dashboard', 'trend'] as const
  };
}
