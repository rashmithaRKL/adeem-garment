import { Card } from '@/components/Card';
import { QueryState } from '@/components/QueryState';
import { formatDateTime } from '@/lib/format';
import { TONE } from '@/components/Kpi';
import { useNotifications } from './queries';

export function NotificationsPage() {
  const { data, isLoading, error } = useNotifications();

  return (
    <Card title="Inbox" style={{ maxWidth: 820 }}
      aside={<span style={{ fontSize: 12, color: 'var(--text-faint)' }}>
        import results for your own uploads
      </span>}>
      <QueryState isLoading={isLoading} error={error} isEmpty={data?.length === 0}
        emptyTitle="Nothing to report"
        emptyBody="Import results and issues with your sheets will appear here.">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          {(data ?? []).map((n) => {
            const { fg, bg } = TONE[n.tone];
            return (
              <article key={n.id} style={{ display: 'flex', gap: 12, padding: 14, border: '1px solid var(--border-soft)', borderRadius: 10 }}>
                <span style={{ width: 30, height: 30, flex: 'none', borderRadius: 8, background: bg, color: fg, display: 'grid', placeItems: 'center' }} aria-hidden>●</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'baseline' }}>
                    <strong style={{ fontSize: 14 }}>{n.title}</strong>
                    <span style={{ marginLeft: 'auto', fontSize: 11.5, color: 'var(--text-faint)' }}>
                      {formatDateTime(n.createdAt)}
                    </span>
                  </span>
                  <span style={{ display: 'block', fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.5, marginTop: 5 }}>
                    {n.body}
                  </span>
                </span>
              </article>
            );
          })}
        </div>
      </QueryState>
    </Card>
  );
}
