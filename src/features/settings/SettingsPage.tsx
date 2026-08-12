import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/Card';
import { supabase } from '@/lib/supabase';
import { formatBytes } from '@/lib/format';
import { MAX_UPLOAD_BYTES, STORAGE_BUCKET, EFFICIENCY_THRESHOLD } from '@/lib/env';

async function fetchLines() {
  const { data, error } = await supabase
    .from('production_lines')
    .select('line_number, line_name, active')
    .order('line_number');
  if (error) throw error;
  return data ?? [];
}

export function SettingsPage() {
  const { data: lines } = useQuery({ queryKey: ['lines', 'config'], queryFn: fetchLines });
  const activeLines = (lines ?? []).filter((l) => l.active);

  const groups: { title: string; sub: string; rows: [string, string][] }[] = [
    {
      title: 'Storage', sub: 'Supabase Storage bucket policy',
      rows: [
        ['Bucket', STORAGE_BUCKET],
        ['Visibility', 'Private'],
        ['Compression', 'deflate (zip)'],
        ['Signed URL TTL', '60 seconds']
      ]
    },
    {
      title: 'Uploads', sub: 'Validation limits enforced server-side',
      rows: [
        ['Max file size', formatBytes(MAX_UPLOAD_BYTES)],
        ['Allowed types', '.xlsx, .xls'],
        ['Duplicate check', 'SHA-256 hash'],
        ['Versions kept', 'All — never purged']
      ]
    },
    {
      title: 'Production', sub: 'Line configuration',
      rows: [
        ['Active lines', activeLines.length
          ? activeLines[0]!.line_name + ' – ' + activeLines[activeLines.length - 1]!.line_name
          : 'none configured'],
        ['Line count', String(activeLines.length)],
        ['Efficiency threshold', EFFICIENCY_THRESHOLD + '%'],
        ['Adding lines', 'Insert into production_lines — no code change']
      ]
    },
    {
      title: 'Security', sub: 'Access control',
      rows: [
        ['Authentication', 'Supabase Auth'],
        ['Role source', 'profiles.role (database)'],
        ['Row level security', 'Enabled on all tables'],
        ['Audit logging', 'On — written by Edge Functions']
      ]
    }
  ];

  return (
    <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', maxWidth: 980 }}>
      {groups.map((group) => (
        <Card key={group.title} title={group.title}>
          <p style={{ margin: '-8px 0 14px', fontSize: 12.5, color: 'var(--text-faint)' }}>{group.sub}</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {group.rows.map(([k, v]) => (
              <div key={k} style={{ display: 'flex', gap: 10, fontSize: 13.5, padding: '9px 11px', background: 'var(--surface-muted)', borderRadius: 8 }}>
                <span style={{ color: 'var(--text-muted)' }}>{k}</span>
                <strong style={{ marginLeft: 'auto', textAlign: 'right', overflowWrap: 'anywhere' }}>{v}</strong>
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}
