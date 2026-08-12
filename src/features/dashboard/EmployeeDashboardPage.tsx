import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/Card';
import { Kpi } from '@/components/Kpi';
import { QueryState } from '@/components/QueryState';
import { ProgressBar, toneForEfficiency } from '@/components/ProgressBar';
import { formatNumber, formatPercent } from '@/lib/format';
import { useAuth } from '@/features/auth/AuthProvider';
import { fetchLinePerformance } from './queries';
import { useRealtimeDashboard } from './useRealtimeDashboard';
import { fetchMyUploads } from '@/features/uploads/queries';

export function EmployeeDashboardPage() {
  useRealtimeDashboard();
  const { profile } = useAuth();

  const lines = useQuery({ queryKey: ['dashboard', 'lines'], queryFn: () => fetchLinePerformance() });
  const uploads = useQuery({
    queryKey: ['uploads', 'mine', profile?.id],
    queryFn: () => fetchMyUploads(profile!.id),
    enabled: Boolean(profile?.id)
  });

  // The line the supervisor is reporting on: the one with today's lowest achievement.
  const focus = (lines.data ?? []).slice().sort((a, b) => a.progress - b.progress)[0];
  const lastUpload = uploads.data?.[0];

  return (
    <QueryState isLoading={lines.isLoading} error={lines.error}>
      <div style={{
        background: 'linear-gradient(120deg,#2563eb,#0891b2)', borderRadius: 14,
        padding: '24px 26px', color: '#fff', marginBottom: 16,
        display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 20
      }}>
        <div style={{ flex: '1 1 320px' }}>
          <h2 style={{ fontSize: 26, margin: 0 }}>
            Hello, {profile?.fullName.split(' ')[0]}
          </h2>
          <p style={{ opacity: .85, fontSize: 14, margin: '5px 0 0' }}>
            {lastUpload
              ? 'Your last import was ' + lastUpload.original_filename + ' v' + lastUpload.upload_version + '.'
              : 'You have not uploaded a production sheet yet.'}
          </p>
        </div>
        <Link to="/employee/upload" className="btn" style={{ background: '#fff', color: 'var(--blue-600)', textDecoration: 'none' }}>
          Upload today's Excel
        </Link>
      </div>

      <div className="grid grid--kpi" style={{ gridTemplateColumns: 'repeat(3, minmax(0,1fr))' }}>
        <Kpi label="Focus line" icon="⛭" tone="blue"
          value={focus ? formatNumber(focus.actual) : '-'}
          sub={focus ? 'of ' + formatNumber(focus.target) + ' · ' + focus.lineName : 'no records today'} />
        <Kpi label="My uploads" icon="⬆" tone="purple"
          value={String(uploads.data?.length ?? 0)} sub="documents you created" />
        <Kpi label="Last import" icon="✓" tone="green"
          value={formatNumber(lastUpload?.valid_record_count ?? 0)}
          sub={(lastUpload?.error_count ?? 0) + ' errors'} />
      </div>

      <Card title="Shift progress" style={{ marginTop: 16 }}
        aside={focus ? <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>
          {formatNumber(focus.actual)} of {formatNumber(focus.target)} · {formatPercent(focus.progress, 0)}
        </span> : null}>
        {focus
          ? <ProgressBar value={focus.progress} tone={toneForEfficiency(focus.efficiency)} />
          : <p style={{ margin: 0, fontSize: 13, color: 'var(--text-faint)' }}>
              No production records for today yet — they appear as soon as your sheet is imported.
            </p>}
      </Card>
    </QueryState>
  );
}
