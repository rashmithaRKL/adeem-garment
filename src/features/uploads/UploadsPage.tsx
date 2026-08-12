import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Card } from '@/components/Card';
import { QueryState } from '@/components/QueryState';
import { StatusChip } from '@/components/StatusChip';
import { formatBytes, formatDateTime, compressionRatio, formatNumber } from '@/lib/format';
import { fetchAllUploads } from './queries';

export function UploadsPage() {
  const { data, isLoading, error } = useQuery({ queryKey: ['uploads', 'all'], queryFn: fetchAllUploads });

  const totalOriginal = (data ?? []).reduce((s, u) => s + u.original_file_size, 0);
  const totalStored = (data ?? []).reduce((s, u) => s + u.compressed_file_size, 0);

  return (
    <>
      <div className="grid grid--kpi" style={{ marginBottom: 16 }}>
        {[
          ['Documents', String(data?.length ?? 0), 'uploads recorded'],
          ['Original size', formatBytes(totalOriginal), 'uncompressed equivalent'],
          ['Stored size', formatBytes(totalStored), 'private bucket usage'],
          ['Space saved', compressionRatio(totalOriginal, totalStored), 'originals restorable']
        ].map(([label, value, sub]) => (
          <div className="card" key={label}>
            <div style={{ fontSize: 11.5, color: 'var(--text-muted)', letterSpacing: '.08em', textTransform: 'uppercase' }}>{label}</div>
            <div style={{ font: '600 27px/1 var(--font-heading)', marginTop: 8 }}>{value}</div>
            <div style={{ fontSize: 11.5, color: 'var(--text-faint)', marginTop: 5 }}>{sub}</div>
          </div>
        ))}
      </div>

      <Card title="All uploads" aside={<span style={{ fontSize: 12, color: 'var(--text-faint)' }}>bucket garment-excel-files · private</span>}>
        <QueryState isLoading={isLoading} error={error} isEmpty={data?.length === 0}
          emptyTitle="No uploads yet" emptyBody="Employee uploads appear here the moment they import.">
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>File</th><th>Ver</th><th>Uploaded</th><th>By</th>
                  <th className="num">Rows</th><th className="num">Original</th>
                  <th className="num">Stored</th><th className="num">Saved</th><th>Status</th><th />
                </tr>
              </thead>
              <tbody>
                {(data ?? []).map((u) => (
                  <tr key={u.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{u.original_filename}</div>
                      <div className="mono" style={{ fontSize: 11, color: 'var(--text-faint)' }}>
                        sha256 {u.file_hash.slice(0, 8)}…
                      </div>
                    </td>
                    <td>v{u.upload_version}</td>
                    <td>{formatDateTime(u.created_at)}</td>
                    <td>{u.profiles?.full_name ?? '—'}</td>
                    <td className="num">{formatNumber(u.row_count)}</td>
                    <td className="num">{formatBytes(u.original_file_size)}</td>
                    <td className="num">{formatBytes(u.compressed_file_size)}</td>
                    <td className="num" style={{ color: 'var(--green-500)', fontWeight: 600 }}>
                      {compressionRatio(u.original_file_size, u.compressed_file_size)}
                    </td>
                    <td><StatusChip status={u.processing_status} /></td>
                    <td className="num">
                      <Link className="btn btn--secondary btn--small" to={'/admin/uploads/' + u.id} style={{ textDecoration: 'none' }}>
                        Details
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </QueryState>
      </Card>
    </>
  );
}
