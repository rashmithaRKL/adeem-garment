import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/Card';
import { QueryState } from '@/components/QueryState';
import { supabase } from '@/lib/supabase';
import { formatDateTime } from '@/lib/format';

const TONE: Record<string, [string, string]> = {
  EXCEL_IMPORT:   ['var(--green-50)', 'var(--green-500)'],
  EXCEL_UPLOAD:   ['var(--blue-50)', 'var(--blue-500)'],
  EXCEL_DOWNLOAD: ['var(--cyan-50)', 'var(--cyan-500)'],
  ACCESS_DENIED:  ['var(--red-50)', 'var(--red-500)'],
  IMPORT_FAILED:  ['var(--amber-50)', 'var(--amber-500)'],
  ROLE_CHANGE:    ['var(--purple-50)', 'var(--purple-500)'],
  LOGIN:          ['var(--surface-muted)', 'var(--text-muted)']
};

async function fetchAuditLogs() {
  const { data, error } = await supabase
    .from('audit_logs')
    .select('*, profiles ( full_name )')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []) as unknown as (
    { id: string; action: string; description: string | null; created_at: string;
      profiles: { full_name: string } | null }
  )[];
}

export function AuditLogPage() {
  const { data, isLoading, error } = useQuery({ queryKey: ['audit'], queryFn: fetchAuditLogs });

  return (
    <Card title="Audit log" aside={<span style={{ fontSize: 12, color: 'var(--text-faint)' }}>
      admin only · newest first, last 200 events
    </span>}>
      <QueryState isLoading={isLoading} error={error} isEmpty={data?.length === 0}
        emptyTitle="No events recorded yet"
        emptyBody="Sign-ins, imports, downloads and role changes will be listed here.">
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {(data ?? []).map((log) => {
            const [bg, fg] = TONE[log.action] ?? ['var(--surface-muted)', 'var(--text-muted)'];
            return (
              <div key={log.id} className="auditrow">
                <span className="chip" style={{ background: bg, color: fg, justifySelf: 'start' }}>{log.action}</span>
                {/* break-word, not anywhere: "anywhere" lets the column's min-content
                    width fall to a single character, which is how a grid track this
                    narrow ends up rendering the sentence vertically. */}
                <span style={{ fontSize: 13.5, overflowWrap: 'break-word' }}>
                  {log.description}
                  <span style={{ color: 'var(--text-faint)' }}> · {log.profiles?.full_name ?? 'system'}</span>
                </span>
                <span className="auditrow__time mono">
                  {formatDateTime(log.created_at)}
                </span>
              </div>
            );
          })}
        </div>
      </QueryState>
    </Card>
  );
}
