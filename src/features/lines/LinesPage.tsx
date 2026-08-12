import { useQuery } from '@tanstack/react-query';
import { QueryState } from '@/components/QueryState';
import { StatusChip } from '@/components/StatusChip';
import { ProgressBar, toneForEfficiency } from '@/components/ProgressBar';
import { formatNumber, formatPercent, formatDate } from '@/lib/format';
import { fetchLinePerformance } from '@/features/dashboard/queries';
import { useRealtimeDashboard } from '@/features/dashboard/useRealtimeDashboard';

export function LinesPage() {
  useRealtimeDashboard();
  const { data, isLoading, error } = useQuery({
    queryKey: ['dashboard', 'lines'], queryFn: () => fetchLinePerformance()
  });

  return (
    <QueryState isLoading={isLoading} error={error} isEmpty={data?.length === 0}
      emptyTitle="No active production lines"
      emptyBody="Add lines in Settings, or insert rows into production_lines.">
      <div className="grid grid--cards">
        {(data ?? []).map((line) => (
          <article key={line.id} className="card">
            <header style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <span style={{
                width: 36, height: 36, borderRadius: 9, background: 'var(--blue-50)',
                color: 'var(--blue-500)', display: 'grid', placeItems: 'center',
                font: '700 13px var(--font-heading)'
              }}>{String(line.lineNumber).padStart(2, '0')}</span>
              <span style={{ flex: 1 }}>
                <span style={{ display: 'block', font: '600 17px/1.1 var(--font-heading)', letterSpacing: '.06em' }}>{line.lineName}</span>
                <span style={{ fontSize: 11.5, color: 'var(--text-faint)' }}>{line.department}</span>
              </span>
              <StatusChip status={line.status} />
            </header>

            <div style={{ background: 'var(--surface-muted)', borderRadius: 9, padding: 12, marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: 'var(--text-faint)', letterSpacing: '.08em', textTransform: 'uppercase' }}>Current order</div>
              <div style={{ font: '600 14px var(--font-body)' }}>{line.currentOrder ?? '—'} {line.buyer ? '· ' + line.buyer : ''}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                {line.styleNumber ?? 'no style'} — due {formatDate(line.deliveryDate)}
              </div>
            </div>

            <div className="grid" style={{ gridTemplateColumns: 'repeat(3,1fr)', textAlign: 'center', marginBottom: 14, gap: 10 }}>
              <div><div style={{ font: '600 20px/1 var(--font-heading)' }}>{formatNumber(line.target)}</div><div style={{ fontSize: 11, color: 'var(--text-faint)' }}>Target</div></div>
              <div><div style={{ font: '600 20px/1 var(--font-heading)', color: 'var(--green-500)' }}>{formatNumber(line.actual)}</div><div style={{ fontSize: 11, color: 'var(--text-faint)' }}>Actual</div></div>
              <div><div style={{ font: '600 20px/1 var(--font-heading)', color: 'var(--amber-500)' }}>{formatNumber(line.balance)}</div><div style={{ fontSize: 11, color: 'var(--text-faint)' }}>Balance</div></div>
            </div>

            <ProgressBar value={line.progress} tone={toneForEfficiency(line.efficiency)} />
            <p style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: 'var(--text-muted)', margin: '7px 0 0' }}>
              <span>Efficiency <strong style={{ color: toneForEfficiency(line.efficiency) }}>{formatPercent(line.efficiency)}</strong></span>
              <span>Progress {formatPercent(line.progress, 0)}</span>
            </p>
          </article>
        ))}
      </div>
    </QueryState>
  );
}
