import { Card } from '@/components/Card';
import { useAuth } from './AuthProvider';

export function ProfilePage() {
  const { profile, session } = useAuth();
  if (!profile) return null;

  const rows: [string, string][] = [
    ['Full name', profile.fullName],
    ['Employee ID', profile.employeeId],
    ['Email', profile.email],
    ['Role', profile.role],
    ['Status', profile.status],
    ['Last sign-in', session?.user.last_sign_in_at
      ? new Date(session.user.last_sign_in_at).toLocaleString('en-GB')
      : '-']
  ];

  return (
    <Card title="Account" style={{ maxWidth: 560 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        {rows.map(([k, v]) => (
          <div key={k} style={{ display: 'flex', gap: 10, fontSize: 13.5, padding: '10px 12px', background: 'var(--surface-muted)', borderRadius: 8 }}>
            <span style={{ color: 'var(--text-muted)' }}>{k}</span>
            <strong style={{ marginLeft: 'auto', textTransform: k === 'Role' || k === 'Status' ? 'capitalize' : 'none' }}>{v}</strong>
          </div>
        ))}
      </div>
      <p style={{ marginTop: 16, marginBottom: 0, fontSize: 12, color: 'var(--text-faint)', lineHeight: 1.5 }}>
        Role and status are managed by an administrator. Row level security prevents this page from
        changing either, even if the request is altered.
      </p>
    </Card>
  );
}
