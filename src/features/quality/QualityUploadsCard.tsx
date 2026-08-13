import { useCallback, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card } from '@/components/Card';
import { QueryState } from '@/components/QueryState';
import { Modal } from '@/components/Modal';
import { SearchInput, useSearch, useSearchTerm } from '@/components/SearchInput';
import { formatDateTime, formatNumber } from '@/lib/format';
import { friendlyError } from '@/lib/errors';
import { useAuth } from '@/features/auth/AuthProvider';
import { fetchQualityUploads, deleteQualityUpload, type QualityUploadRow } from './queries';
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
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const { data, isLoading, error } = useQuery({
    queryKey: ['quality', 'uploads'],
    queryFn: fetchQualityUploads
  });

  const [term, setTerm] = useSearchTerm();
  const [removing, setRemoving] = useState<QualityUploadRow | null>(null);

  const remove = useMutation({
    mutationFn: (id: string) => deleteQualityUpload(id),
    onSuccess: () => {
      // Every quality figure on every screen is derived from these rows.
      void queryClient.invalidateQueries({ queryKey: ['quality'] });
      setRemoving(null);
    }
  });

  const rows = data ?? [];
  const searchable = useCallback(
    (u: QualityUploadRow) => `${u.original_filename} ${u.report_kind} ${u.period_start ?? ''} ${u.period_end ?? ''} ${u.profiles?.full_name ?? ''}`,
    []
  );
  const shown = useSearch(rows, term, searchable);

  return (
    <Card title="Quality reports"
      aside={<span style={{ fontSize: 12, color: 'var(--text-faint)' }}>
        imported into the quality tables
      </span>}>
      {rows.length > 0 && (
        <SearchInput value={term} onChange={setTerm}
          placeholder="Search file, layout, period or uploader"
          count={{ shown: shown.length, total: rows.length }} />
      )}

      <QueryState isLoading={isLoading} error={error} isEmpty={rows.length === 0}
        emptyTitle="No quality reports yet"
        emptyBody="KPI reports, daily quality sheets and monthly summaries appear here once imported.">
        <div className="table-scroll">
          <table className="table" style={{ minWidth: 720 }}>
            <thead>
              <tr>
                <th>File</th><th>Layout</th><th>Period</th>
                {showOwner && <th>By</th>}
                <th className="num">Inspections</th><th className="num">Defects</th><th>Imported</th>
                {isAdmin && <th />}
              </tr>
            </thead>
            <tbody>
              {shown.map((u) => (
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
                  {isAdmin && (
                    <td className="num">
                      <button type="button" className="btn btn--ghost btn--small"
                        style={{ color: 'var(--red-500)' }}
                        onClick={() => setRemoving(u)}>Delete</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </QueryState>

      {removing && (
        <Modal
          title="Delete quality report"
          onClose={() => { remove.reset(); setRemoving(null); }}
          error={remove.error ? friendlyError(remove.error) : undefined}
          actions={
            <>
              <button type="button" className="btn btn--secondary"
                onClick={() => { remove.reset(); setRemoving(null); }}>Cancel</button>
              <button type="button" className="btn btn--danger" disabled={remove.isPending}
                onClick={() => remove.mutate(removing.id)}>
                {remove.isPending ? 'Deleting…' : 'Delete report'}
              </button>
            </>
          }
        >
          <p style={{ margin: '0 0 12px', fontSize: 14 }}>
            Delete <strong>{removing.original_filename}</strong>?
          </p>
          <p className="banner banner--warning" style={{ margin: 0 }}>
            This removes {formatNumber(removing.inspection_rows)} inspection rows and{' '}
            {formatNumber(removing.defect_rows)} defect rows. Every quality figure on the
            dashboard is recalculated from what remains, so pass rates and totals will
            change. Re-uploading the same file restores it.
          </p>
        </Modal>
      )}
    </Card>
  );
}
