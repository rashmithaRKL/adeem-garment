import { useQuery } from '@tanstack/react-query';
import { QueryState } from '@/components/QueryState';
import { StatusChip } from '@/components/StatusChip';
import { ProgressBar, toneForEfficiency } from '@/components/ProgressBar';
import { formatNumber, formatPercent, formatDate } from '@/lib/format';
import { fetchLinePerformance } from '@/features/dashboard/queries';
import { useRealtimeDashboard } from '@/features/dashboard/useRealtimeDashboard';
import { fetchQualityByLine } from '@/features/quality/queries';
import { EFFICIENCY_THRESHOLD } from '@/lib/env';
import { useTilt } from '@/lib/motion';

export function LinesPage() {
  useRealtimeDashboard();
  const { data, isLoading, error } = useQuery({
    queryKey: ['dashboard', 'lines'], queryFn: () => fetchLinePerformance()
  });
  const quality = useQuery({ queryKey: ['quality', 'byLine'], queryFn: fetchQualityByLine });

  return (
    <QueryState isLoading={isLoading} error={error} isEmpty={data?.length === 0}
      emptyTitle="No active production lines"
      emptyBody="Add lines in Settings, or insert rows into production_lines.">
      <div className="grid grid--cards">
        {(data ?? []).map((line, i) => {
          const q = quality.data?.[line.lineNumber];
          return (
          <LineCard key={line.id} index={i}>
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

            {/* Quality stands on its own: these lines are known from inspection
                reports, which say nothing about output against target. */}
            <div style={{ borderTop: '1px solid var(--border-soft)', marginTop: 14, paddingTop: 12 }}>
              <div style={{ fontSize: 11, color: 'var(--text-faint)', letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 8 }}>
                Quality
              </div>
              {q ? (
                <>
                  <div className="grid" style={{ gridTemplateColumns: 'repeat(3,1fr)', textAlign: 'center', gap: 10 }}>
                    <div>
                      <div style={{ font: '600 18px/1 var(--font-heading)',
                        color: q.passPct != null && q.passPct < EFFICIENCY_THRESHOLD ? 'var(--red-500)' : 'var(--blue-500)' }}>
                        {q.passPct != null ? q.passPct.toFixed(1) + '%' : '—'}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>Pass rate</div>
                    </div>
                    <div>
                      <div style={{ font: '600 18px/1 var(--font-heading)' }}>{formatNumber(q.checked)}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>Checked</div>
                    </div>
                    <div>
                      <div style={{ font: '600 18px/1 var(--font-heading)' }}>{formatNumber(q.defects)}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>Defects</div>
                    </div>
                  </div>
                  <p style={{ margin: '8px 0 0', fontSize: 11, color: 'var(--text-faint)' }}>
                    {q.stages} inspection stage{q.stages === 1 ? '' : 's'}
                    {q.lastSeen ? ' · latest ' + q.lastSeen : ''}
                  </p>
                </>
              ) : (
                <p style={{ margin: 0, fontSize: 12, color: 'var(--text-faint)' }}>
                  No inspection data imported for this line yet.
                </p>
              )}
            </div>
          </LineCard>
          );
        })}
      </div>
    </QueryState>
  );
}

/**
 * A line card is read at a glance rather than worked through, so it is one of the
 * few surfaces where tilting the whole card helps rather than gets in the way.
 */
function LineCard({ index, children }: { index: number; children: React.ReactNode }) {
  const tilt = useTilt<HTMLElement>(5);
  return (
    <article
      ref={tilt.ref as React.RefObject<HTMLElement>}
      onPointerMove={tilt.onPointerMove}
      onPointerLeave={tilt.onPointerLeave}
      className="card tilt rise"
      style={{ ['--i' as string]: index }}
    >
      {children}
    </article>
  );
}
