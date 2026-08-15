import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/Card';
import { QueryState } from '@/components/QueryState';
import { StatusChip } from '@/components/StatusChip';
import { formatBytes, formatDateTime, formatNumber } from '@/lib/format';
import { friendlyError } from '@/lib/errors';
import { useAuth, useIsManager } from '@/features/auth/AuthProvider';
import { downloadOriginal } from '@/features/excel/importService';
import { fetchAllUploads, fetchMyUploads, groupByDocument } from './queries';
import { QualityUploadsCard } from '@/features/quality/QualityUploadsCard';

export function UploadHistoryPage() {
  const { profile } = useAuth();
  const canManage = useIsManager();
  const [message, setMessage] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['uploads', canManage ? 'all' : 'mine', profile?.id],
    queryFn: () => (canManage ? fetchAllUploads() : fetchMyUploads(profile!.id)),
    enabled: Boolean(profile)
  });

  async function download(uploadId: string) {
    setBusyId(uploadId);
    setMessage('');
    try {
      await downloadOriginal(uploadId);
      setMessage('The original Excel file has been restored and downloaded.');
    } catch (err) {
      setMessage(friendlyError(err));
    } finally {
      setBusyId(null);
    }
  }

  const groups = groupByDocument(data ?? []);
  const base = canManage ? '/admin/uploads/' : '/employee/history/';

  return (
    <>
    <Card
      title={canManage ? 'All documents' : 'My documents'}
      aside={<span style={{ fontSize: 12, color: 'var(--text-faint)' }}>
        {canManage ? 'every upload across the factory' : "other employees' files are filtered by RLS"}
      </span>}
    >
      {message && <p className="banner banner--info">{message}</p>}

      <QueryState isLoading={isLoading} error={error} isEmpty={groups.length === 0}
        emptyTitle="No uploads yet"
        emptyBody="Upload a production sheet and each version will be listed here.">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {groups.map((group) => {
            const latest = group.versions[0]!;
            return (
              <article key={group.filename} style={{ border: '1px solid var(--border)', borderRadius: 11, overflow: 'hidden' }}>
                <header style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, padding: '13px 15px', background: 'var(--surface-muted)' }}>
                  <span style={{ flex: '1 1 240px', minWidth: 0 }}>
                    <span style={{ display: 'block', font: '600 14px var(--font-body)' }}>{group.filename}</span>
                    <span style={{ fontSize: 11.5, color: 'var(--text-faint)' }}>
                      {group.versions.length} version{group.versions.length > 1 ? 's' : ''} · latest {formatDateTime(latest.created_at)}
                    </span>
                  </span>
                  <Link className="btn btn--secondary btn--small" to={base + latest.id} style={{ textDecoration: 'none' }}>
                    View details
                  </Link>
                  <button type="button" className="btn btn--secondary btn--small"
                    disabled={busyId === latest.id} onClick={() => void download(latest.id)}>
                    {busyId === latest.id ? 'Preparing…' : 'Download original'}
                  </button>
                  {!canManage && (
                    <Link className="btn btn--secondary btn--small" to="/employee/upload" style={{ textDecoration: 'none' }}>
                      Re-upload
                    </Link>
                  )}
                </header>

                <div className="table-scroll">
                  <table className="table" style={{ minWidth: 680 }}>
                    <tbody>
                      {group.versions.map((v) => (
                        <tr key={v.id}>
                          <td style={{ width: 70 }}>v{v.upload_version}</td>
                          <td style={{ width: 150 }}>{formatDateTime(v.created_at)}</td>
                          <td className="mono" style={{ color: 'var(--text-faint)', overflowWrap: 'anywhere' }}>{v.storage_path}</td>
                          <td style={{ width: 120 }}>{formatNumber(v.valid_record_count)} records</td>
                          <td style={{ width: 130 }}>
                            {formatBytes(v.original_file_size)} → {formatBytes(v.compressed_file_size)}
                          </td>
                          <td style={{ width: 100 }}><StatusChip status={v.processing_status} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>
            );
          })}
        </div>
      </QueryState>
    </Card>

    <div style={{ marginTop: 16 }}>
      <QualityUploadsCard showOwner={canManage} />
    </div>
    </>
  );
}
