import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/Card';
import { QueryState } from '@/components/QueryState';
import { formatDateTime, formatNumber } from '@/lib/format';
import { fetchQualityUploads } from './queries';
import { REPORT_LABEL } from './types';

const period = (from: string | null, to: string | null): string => {
  if (!from) return '—';
  return from === to ? from : `${from} → ${to ?? '—'}`;
};

/**
 * Quality reports are not production sheets: there is no compressed original in
 * Storage, no version chain and no row-level import log, so they are listed on
 * their own rather than forced into the production uploads table.
 */
export function QualityUploadsCard({ showOwner = false }: { showOwner?: boolean }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['quality', 'uploads'],
    queryFn: fetchQualityUploads
  });

  return (
    <Card title="Quality reports"
      aside={<span style={{ fontSize: 12, color: 'var(--text-faint)' }}>
        imported into the quality tables
      </span>}>
      <QueryState isLoading={isLoading} error={error} isEmpty={data?.length === 0}
        emptyTitle="No quality reports yet"
        emptyBody="KPI reports, daily quality sheets and monthly summaries appear here once imported.">
        <div className="table-scroll">
          <table className="table" style={{ minWidth: 720 }}>
            <thead>
              <tr>
                <th>File</th><th>Layout</th><th>Period</th>
                {showOwner && <th>By</th>}
                <th className="num">Inspections</th><th className="num">Defects</th><th>Imported</th>
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((u) => (
                <tr key={u.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{u.original_filename}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>
                      {u.sheet_names.length > 0 ? u.sheet_names.join(', ') : 'no sheets recorded'}
                    </div>
                  </td>
                  <td style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>{REPORT_LABEL[u.report_kind]}</td>
                  <td className="mono" style={{ fontSize: 12 }}>{period(u.period_start, u.period_end)}</td>
                  {showOwner && <td>{u.profiles?.full_name ?? '—'}</td>}
                  <td className="num">{formatNumber(u.inspection_rows)}</td>
                  <td className="num">{formatNumber(u.defect_rows)}</td>
                  <td style={{ fontSize: 12.5 }}>{formatDateTime(u.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </QueryState>
    </Card>
  );
}
