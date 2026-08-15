import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/Card';
import { QueryState } from '@/components/QueryState';
import { StatusChip } from '@/components/StatusChip';
import { formatBytes, formatDateTime, compressionRatio, formatNumber } from '@/lib/format';
import { friendlyError } from '@/lib/errors';
import { useIsManager } from '@/features/auth/AuthProvider';
import { downloadOriginal } from '@/features/excel/importService';
import { fetchUpload } from './queries';

export function UploadDetailPage() {
  const { uploadId } = useParams<{ uploadId: string }>();
  const canManage = useIsManager();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ['upload', uploadId],
    queryFn: () => fetchUpload(uploadId!),
    enabled: Boolean(uploadId)
  });

  const backTo = canManage ? '/admin/uploads' : '/employee/history';

  async function download() {
    if (!uploadId) return;
    setBusy(true);
    setMessage('');
    try {
      await downloadOriginal(uploadId);
      setMessage('The original Excel file has been restored and downloaded.');
    } catch (err) {
      setMessage(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <QueryState isLoading={isLoading} error={error}>
      {data && (
        <div style={{ maxWidth: 1080 }}>
          <Link to={backTo} style={{ display: 'inline-block', marginBottom: 12, fontSize: 12.5 }}>
            Back to upload history
          </Link>

          <div className="card" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px 14px', marginBottom: 16 }}>
            <span style={{ flex: '1 1 300px', minWidth: 0 }}>
              <span style={{ display: 'block', font: '600 18px var(--font-heading)' }}>{data.upload.original_filename}</span>
              <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>
                Stored compressed in the private bucket · original restorable byte for byte
              </span>
            </span>
            <span style={{ flex: 'none' }}>v{data.upload.upload_version}</span>
            <span style={{ flex: 'none', marginRight: 'auto' }}><StatusChip status={data.upload.processing_status} /></span>
            <button type="button" className="btn btn--primary" disabled={busy} onClick={() => void download()}>
              {busy ? 'Preparing…' : 'Download original Excel'}
            </button>
          </div>

          {message && <p className="banner banner--info">{message}</p>}

          <Card title="Document & storage" style={{ marginBottom: 16 }}>
            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
              {([
                ['Original filename', data.upload.original_filename],
                ['Stored object', data.upload.compressed_filename],
                ['Storage path', data.upload.storage_path],
                ['SHA-256', data.upload.file_hash],
                ['Original size', formatBytes(data.upload.original_file_size)],
                ['Compressed size', formatBytes(data.upload.compressed_file_size)],
                ['Compression saved', compressionRatio(data.upload.original_file_size, data.upload.compressed_file_size)],
                ['Compression type', data.upload.compression_type],
                ['Uploaded', formatDateTime(data.upload.created_at)],
                ['Sheets / rows / columns', data.upload.sheet_count + ' / ' + data.upload.row_count + ' / ' + data.upload.column_count],
                ['Valid records', formatNumber(data.upload.valid_record_count)],
                ['Warnings', String(data.upload.warning_count)],
                ['Errors', String(data.upload.error_count)],
                ['Duplicates', String(data.upload.duplicate_count)],
                ['Processing time', data.upload.processing_ms ? (data.upload.processing_ms / 1000).toFixed(1) + ' s' : '—'],
                ['Processing status', data.upload.processing_status]
              ] as [string, string][]).map(([k, v]) => (
                <div key={k} style={{ background: 'var(--surface-muted)', borderRadius: 9, padding: '11px 13px', minWidth: 0 }}>
                  <div style={{ fontSize: 10.5, color: 'var(--text-faint)', letterSpacing: '.08em', textTransform: 'uppercase' }}>{k}</div>
                  <div style={{ font: '600 13.5px/1.4 var(--font-body)', marginTop: 4, overflowWrap: 'anywhere' }}>{v}</div>
                </div>
              ))}
            </div>
          </Card>

          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))' }}>
            <Card title="Errors — rows skipped">
              <p style={{ fontSize: 12, color: 'var(--text-faint)', margin: '0 0 12px' }}>
                Fix these in Excel and re-upload as a new version.
              </p>
              {data.errors.length === 0
                ? <p style={{ fontSize: 13, color: 'var(--green-600)', margin: 0 }}>No errors — every row imported.</p>
                : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {data.errors.map((e) => (
                      <div key={e.id} style={{ padding: '11px 12px', background: 'var(--red-50)', borderRadius: 9 }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 5 }}>
                          <strong style={{ fontSize: 12, color: 'var(--red-500)' }}>Row {e.row_number}</strong>
                          <span className="mono" style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{e.column_name}</span>
                        </div>
                        <div style={{ fontSize: 12.5, lineHeight: 1.45, overflowWrap: 'anywhere' }}>{e.error_message}</div>
                      </div>
                    ))}
                  </div>
                )}
            </Card>

            <Card title="Warnings — imported anyway">
              <p style={{ fontSize: 12, color: 'var(--text-faint)', margin: '0 0 12px' }}>
                These rows were saved, but the values are worth a second look.
              </p>
              {data.warnings.length === 0
                ? <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>No warnings.</p>
                : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {data.warnings.map((w) => (
                      <div key={w.id} style={{ padding: '11px 12px', background: 'var(--amber-50)', borderRadius: 9 }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 5 }}>
                          <strong style={{ fontSize: 12, color: 'var(--amber-500)' }}>Row {w.row_number}</strong>
                          <span className="mono" style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{w.column_name}</span>
                        </div>
                        <div style={{ fontSize: 12.5, lineHeight: 1.45, overflowWrap: 'anywhere' }}>{w.warning_message}</div>
                      </div>
                    ))}
                  </div>
                )}
            </Card>
          </div>
        </div>
      )}
    </QueryState>
  );
}
