import { useRef, type DragEvent } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '@/components/Card';
import { formatBytes, formatNumber, formatDateTime, compressionRatio } from '@/lib/format';
import { MAX_UPLOAD_BYTES } from '@/lib/env';
import type { MappableField } from '@/types/domain';
import { useUploadFlow, SCAN_STAGES } from './useUploadFlow';
import { STAGE_LABEL } from '@/features/quality/types';
import { useAuth } from '@/features/auth/AuthProvider';

const FIELD_LABELS: Record<MappableField, string> = {
  lineNumber: 'Production line', orderNumber: 'Order number', buyer: 'Buyer',
  styleNumber: 'Style number', productName: 'Product name', color: 'Colour', size: 'Size',
  orderQuantity: 'Order quantity', targetQuantity: 'Target quantity',
  actualQuantity: 'Produced quantity', efficiency: 'Efficiency',
  productionDate: 'Production date', deliveryDate: 'Delivery date', remarks: 'Remarks'
};

const STEPS: { id: string; label: string }[] = [
  { id: 'select', label: 'Select' }, { id: 'scanning', label: 'Scan' },
  { id: 'mapping', label: 'Map' }, { id: 'preview', label: 'Preview' }, { id: 'done', label: 'Import' }
];

/**
 * Steps the stepper has no dot for. Without this the index resolves to -1 and
 * every dot greys out mid-import, which reads as though the flow had reset.
 */
const STEP_ALIAS: Record<string, string> = {
  duplicate: 'preview', importing: 'preview',
  quality: 'preview', qualityDuplicate: 'preview', qualityDone: 'done',
  sheet: 'preview', sheetDone: 'done'
};

export function UploadExcelPage() {
  const {
    state, selectFile, setMapping, confirmMapping,
    runImport, runQualityImport, runSheetImport, reset
  } = useUploadFlow();
  const inputRef = useRef<HTMLInputElement>(null);
  // The same flow is mounted under /admin and /employee, so every link back into
  // the app has to follow the caller rather than assume the employee portal.
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const base = isAdmin ? '/admin' : '/employee';
  const currentIndex = STEPS.findIndex((s) => s.id === (STEP_ALIAS[state.step] ?? state.step));

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) void selectFile(file);
  }

  return (
    <div style={{ maxWidth: 1000 }}>
      <ol style={{ display: 'flex', gap: 12, listStyle: 'none', padding: 0, margin: '0 0 20px', flexWrap: 'wrap' }}>
        {STEPS.map((s, i) => {
          const done = currentIndex > i;
          const active = currentIndex === i;
          return (
            <li key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 600,
              color: done || active ? 'var(--text)' : 'var(--text-faint)' }}>
              <span style={{
                width: 26, height: 26, borderRadius: '50%', display: 'grid', placeItems: 'center',
                background: done ? 'var(--green-500)' : active ? 'var(--blue-500)' : 'var(--surface)',
                color: done || active ? '#fff' : 'var(--text-faint)',
                border: '1.5px solid ' + (done ? 'var(--green-500)' : active ? 'var(--blue-500)' : 'var(--border)')
              }}>{done ? '✓' : i + 1}</span>
              {s.label}
            </li>
          );
        })}
      </ol>

      {state.error && <p className="banner banner--error">{state.error}</p>}

      {state.step === 'select' && (
        <Card>
          <div
            onDrop={onDrop}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => inputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter') inputRef.current?.click(); }}
            style={{
              border: '2px dashed var(--info-border)', borderRadius: 12, padding: '52px 26px',
              textAlign: 'center', cursor: 'pointer', background: 'var(--blue-50)'
            }}
          >
            <p style={{ font: '600 20px var(--font-heading)', letterSpacing: '.04em', margin: '0 0 6px' }}>
              Drop your Excel here
            </p>
            <p style={{ color: 'var(--text-muted)', fontSize: 13.5, margin: 0 }}>
              Production, quality, HR attendance or loading plan — the kind is recognised from the
              headers. .xlsx or .xls · max {formatBytes(MAX_UPLOAD_BYTES)} · scanned and validated
              before anything is imported
            </p>
            <span className="btn btn--primary" style={{ display: 'inline-block', marginTop: 18 }}>Select file</span>
            <input ref={inputRef} type="file" accept=".xlsx,.xls" hidden
              onChange={(e) => { const file = e.target.files?.[0]; if (file) void selectFile(file); }} />
          </div>
        </Card>
      )}

      {state.step === 'scanning' && (
        <Card>
          <p style={{ margin: '0 0 16px', fontSize: 13.5, color: 'var(--text-muted)' }}>
            {state.file?.name} · {formatBytes(state.file?.size ?? 0)}
          </p>
          <div className="bar" style={{ marginBottom: 22 }}>
            <div className="bar__fill" style={{
              width: (state.stageIndex / SCAN_STAGES.length) * 100 + '%', background: 'var(--blue-500)'
            }} />
          </div>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 11 }}>
            {SCAN_STAGES.map((stage, i) => {
              const done = i < state.stageIndex;
              return (
                <li key={stage.label} style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 13.5,
                  color: done ? 'var(--text)' : 'var(--text-faint)' }}>
                  <span style={{
                    width: 20, height: 20, borderRadius: '50%', display: 'grid', placeItems: 'center', fontSize: 11,
                    background: done ? 'var(--green-50)' : 'var(--surface-muted)',
                    color: done ? 'var(--green-500)' : 'var(--text-faint)'
                  }}>{done ? '✓' : '·'}</span>
                  {stage.label}
                  <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-faint)' }}>{stage.detail}</span>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {state.step === 'duplicate' && state.duplicate && (
        <Card>
          <h3 style={{ fontSize: 21, margin: '0 0 5px' }}>This Excel file has been uploaded before</h3>
          <p style={{ margin: '0 0 16px', color: 'var(--text-muted)', fontSize: 13.5 }}>
            The hash matches an existing document. Importing again would duplicate production data.
          </p>
          <div style={{ background: 'var(--amber-50)', border: '1px solid var(--amber-200)', borderRadius: 10, padding: 14, display: 'flex', flexWrap: 'wrap', gap: 20 }}>
            <span><strong>File</strong><br />{state.duplicate.original_filename}</span>
            <span><strong>Uploaded</strong><br />{formatDateTime(state.duplicate.created_at)}</span>
            <span><strong>Version</strong><br />v{state.duplicate.upload_version}</span>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 18, flexWrap: 'wrap' }}>
            <button type="button" className="btn btn--primary" onClick={() => void runImport(state.duplicate!.id)}>
              Create version {state.duplicate.upload_version + 1}
            </button>
            <Link className="btn btn--secondary" to={base + '/history'} style={{ textDecoration: 'none' }}>
              View previous upload
            </Link>
            <button type="button" className="btn btn--ghost" onClick={reset}>Cancel</button>
          </div>
        </Card>
      )}

      {state.step === 'mapping' && (
        <Card title="Column mapping">
          <p style={{ margin: '0 0 18px', color: 'var(--text-muted)', fontSize: 13 }}>
            Confirm the columns flagged below. Recognised headers are mapped automatically.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {state.mappings.map((m) => (
              <div key={m.excelHeader} style={{
                display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 30px minmax(0,1fr)',
                alignItems: 'center', gap: 12, padding: '11px 13px', borderRadius: 9,
                background: m.confidence === 'high' ? 'var(--surface)' : 'var(--amber-50)',
                border: '1px solid ' + (m.confidence === 'high' ? 'var(--border-soft)' : 'var(--amber-200)')
              }}>
                <span className="mono">{m.excelHeader}</span>
                <span style={{ textAlign: 'center', color: 'var(--text-faint)' }}>→</span>
                <select className="input" style={{ padding: '8px 10px', fontSize: 13 }}
                  value={m.field ?? ''}
                  onChange={(e) => setMapping(m.excelHeader, (e.target.value || null) as MappableField | null)}>
                  <option value="">Not imported</option>
                  {(Object.keys(FIELD_LABELS) as MappableField[]).map((field) => (
                    <option key={field} value={field}>{FIELD_LABELS[field]}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
            <button type="button" className="btn btn--primary" onClick={confirmMapping}>Confirm mapping</button>
            <button type="button" className="btn btn--secondary" onClick={reset}>Cancel</button>
          </div>
        </Card>
      )}

      {state.step === 'preview' && state.scan && (
        <>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', marginBottom: 16 }}>
            {([
              ['Sheets', state.scan.sheetCount, 'var(--text-muted)'],
              ['Rows', state.scan.rowCount, 'var(--text-muted)'],
              ['Columns', state.scan.columnCount, 'var(--text-muted)'],
              ['Valid records', state.scan.rows.length, 'var(--green-500)'],
              ['Warnings', state.scan.warnings.length, 'var(--amber-500)'],
              ['Errors', state.scan.errors.length, 'var(--red-500)']
            ] as [string, number, string][]).map(([label, n, color]) => (
              <div className="card" key={label}>
                <div style={{ font: '600 24px/1 var(--font-heading)', color }}>{formatNumber(n)}</div>
                <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 5 }}>{label}</div>
              </div>
            ))}
          </div>

          <Card title="Preview" aside={<span style={{ fontSize: 12, color: 'var(--text-faint)' }}>
            nothing is written until you confirm
          </span>}>
            <div className="table-scroll">
              <table className="table" style={{ minWidth: 700 }}>
                <thead>
                  <tr><th>Row</th><th>Line</th><th>Order</th><th className="num">Target</th><th className="num">Produced</th><th className="num">Eff.</th></tr>
                </thead>
                <tbody>
                  {state.scan.rows.slice(0, 8).map((r) => (
                    <tr key={r.rowNumber}>
                      <td style={{ color: 'var(--text-faint)' }}>{r.rowNumber}</td>
                      <td style={{ fontWeight: 600 }}>{r.lineNumber}</td>
                      <td>{r.orderNumber}</td>
                      <td className="num">{formatNumber(r.targetQuantity)}</td>
                      <td className="num">{formatNumber(r.actualQuantity)}</td>
                      <td className="num">{r.efficiency != null ? r.efficiency + '%' : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {state.scan.errors.length > 0 && (
              <p className="banner banner--error" style={{ marginTop: 16, marginBottom: 0 }}>
                {state.scan.errors.length} row{state.scan.errors.length > 1 ? 's' : ''} will be skipped and
                recorded in the import log — the first is row {state.scan.errors[0]!.rowNumber}: {state.scan.errors[0]!.message}
              </p>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
              <button type="button" className="btn btn--success" onClick={() => void runImport()}
                disabled={state.scan.rows.length === 0}>
                Import &amp; update dashboard
              </button>
              <button type="button" className="btn btn--secondary" onClick={reset}>Cancel</button>
            </div>
          </Card>
        </>
      )}

      {state.step === 'quality' && state.quality && (
        <>
          <div className="banner" style={{
            background: 'var(--blue-50)', border: '1px solid var(--info-border)', color: 'var(--text)',
            marginBottom: 16, fontSize: 13.5
          }}>
            Recognised as a <strong>{state.quality.label}</strong>. This workbook records inspections
            and defects rather than production output, so it is imported into the quality tables — no
            column mapping is needed.
          </div>

          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', marginBottom: 16 }}>
            {([
              ['Sheets read', state.quality.sheetsUsed.length, 'var(--text-muted)'],
              ['Inspection rows', state.quality.inspections.length, 'var(--green-500)'],
              ['Defect rows', state.quality.defects.length, 'var(--blue-500)'],
              ['Sheets skipped', state.quality.sheetsSkipped.length, 'var(--text-faint)'],
              ['Warnings', state.quality.warnings.length, 'var(--amber-500)']
            ] as [string, number, string][]).map(([label, n, color]) => (
              <div className="card" key={label}>
                <div style={{ font: '600 24px/1 var(--font-heading)', color }}>{formatNumber(n)}</div>
                <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 5 }}>{label}</div>
              </div>
            ))}
          </div>

          <Card title="Preview" aside={<span style={{ fontSize: 12, color: 'var(--text-faint)' }}>
            nothing is written until you confirm
          </span>}>
            <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--text-muted)' }}>
              Covering {state.quality.periodStart ?? '—'} to {state.quality.periodEnd ?? '—'} ·
              {' '}sheets used: {state.quality.sheetsUsed.join(', ') || 'none'}
            </p>

            <div className="table-scroll">
              <table className="table" style={{ minWidth: 720 }}>
                <thead>
                  <tr>
                    <th>Line</th><th>Date</th><th>Stage</th>
                    <th className="num">Checked</th><th className="num">Pass</th>
                    <th className="num">Defects</th><th className="num">Pass %</th>
                  </tr>
                </thead>
                <tbody>
                  {state.quality.inspections.slice(0, 10).map((r, i) => (
                    <tr key={i}>
                      <td style={{ fontWeight: 600 }}>{r.lineLabel ?? '—'}</td>
                      <td>{r.inspectionDate ?? r.periodMonth?.slice(0, 7) ?? '—'}</td>
                      <td>{STAGE_LABEL[r.stage]}</td>
                      <td className="num">{r.checkedQty != null ? formatNumber(r.checkedQty) : '—'}</td>
                      <td className="num">{r.passQty != null ? formatNumber(r.passQty) : '—'}</td>
                      <td className="num">{r.defectQty != null ? formatNumber(r.defectQty) : '—'}</td>
                      <td className="num">{r.passPct != null ? r.passPct + '%' : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {state.quality.sheetsSkipped.length > 0 && (
              <p style={{ marginTop: 14, marginBottom: 0, fontSize: 12.5, color: 'var(--text-muted)' }}>
                Skipped: {state.quality.sheetsSkipped.map((s) => `${s.sheet} (${s.reason})`).join(' · ')}
              </p>
            )}

            {state.quality.warnings.map((w) => (
              <p key={w} className="banner banner--warning" style={{ marginTop: 12, marginBottom: 0 }}>{w}</p>
            ))}

            <div style={{ display: 'flex', gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
              <button type="button" className="btn btn--success" onClick={() => void runQualityImport()}
                disabled={state.quality.inspections.length === 0 && state.quality.defects.length === 0}>
                Import &amp; update dashboard
              </button>
              <button type="button" className="btn btn--secondary" onClick={reset}>Cancel</button>
            </div>
          </Card>
        </>
      )}

      {state.step === 'sheet' && state.sheet && (
        <>
          <div className="banner" style={{
            background: 'var(--blue-50)', border: '1px solid var(--info-border)', color: 'var(--text)',
            marginBottom: 16, fontSize: 13.5
          }}>
            Recognised as a <strong>{state.sheet.label}</strong>. No column mapping is needed —
            the headers were matched automatically. Rows are written on their own key
            ({state.sheet.kind === 'hr' ? 'date and department' : 'line and style'}), so uploading a
            corrected sheet updates those rows instead of adding a second copy.
          </div>

          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', marginBottom: 16 }}>
            {([
              ['Sheets read', state.sheet.sheetsUsed.length, 'var(--text-muted)'],
              ['Rows ready', state.sheet.rows.length, 'var(--green-500)'],
              ['Rows skipped', state.sheet.errors.length, 'var(--red-500)'],
              ['Warnings', state.sheet.warnings.length, 'var(--amber-500)']
            ] as [string, number, string][]).map(([label, n, color]) => (
              <div className="card" key={label}>
                <div style={{ font: '600 24px/1 var(--font-heading)', color }}>{formatNumber(n)}</div>
                <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 5 }}>{label}</div>
              </div>
            ))}
          </div>

          <Card title="Preview" aside={<span style={{ fontSize: 12, color: 'var(--text-faint)' }}>
            nothing is written until you confirm
          </span>}>
            <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--text-muted)' }}>
              Covering {state.sheet.periodStart ?? '—'} to {state.sheet.periodEnd ?? '—'} ·
              {' '}sheets used: {state.sheet.sheetsUsed.join(', ')}
            </p>

            <div className="table-scroll">
              {state.sheet.kind === 'hr' ? (
                <table className="table" style={{ minWidth: 720 }}>
                  <thead>
                    <tr>
                      <th>Date</th><th>Department</th>
                      <th className="num">Direct</th><th className="num">Indirect</th>
                      <th className="num">Present</th><th className="num">Absent</th><th className="num">Leave</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.sheet.rows.slice(0, 10).map((r) => (
                      <tr key={r.sheet + r.rowNumber}>
                        <td>{r.work_date}</td>
                        <td>{r.department}</td>
                        <td className="num">{formatNumber(r.direct_carder)}</td>
                        <td className="num">{formatNumber(r.indirect_carder)}</td>
                        <td className="num">{formatNumber(r.present)}</td>
                        <td className="num">{formatNumber(r.absent)}</td>
                        <td className="num">{formatNumber(r.on_leave)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <table className="table" style={{ minWidth: 860 }}>
                  <thead>
                    <tr>
                      <th>Line</th><th>Style</th><th>Order</th><th>School</th>
                      <th className="num">Qty</th><th>PP date</th><th>PCD</th><th>PSD</th><th>PED</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.sheet.rows.slice(0, 10).map((r) => (
                      <tr key={r.sheet + r.rowNumber}>
                        <td style={{ fontWeight: 600 }}>{String(r.line_no).padStart(2, '0')}</td>
                        <td>{r.style_number}</td>
                        <td className="mono">{r.order_number ?? '—'}</td>
                        <td>{r.school_name ?? '—'}</td>
                        <td className="num">{formatNumber(r.order_qty)}</td>
                        <td>{r.pp_date ?? '—'}</td>
                        <td>{r.pcd ?? '—'}</td>
                        <td>{r.psd ?? '—'}</td>
                        <td>{r.ped ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {state.sheet.rows.length > 10 && (
              <p style={{ margin: '12px 0 0', fontSize: 12, color: 'var(--text-faint)' }}>
                Showing the first 10 of {formatNumber(state.sheet.rows.length)} rows.
              </p>
            )}

            {state.sheet.warnings.map((w) => (
              <p key={w} className="banner banner--warning" style={{ marginTop: 12, marginBottom: 0 }}>{w}</p>
            ))}

            {state.sheet.errors.length > 0 && (
              <p className="banner banner--error" style={{ marginTop: 12, marginBottom: 0 }}>
                {state.sheet.errors.length} row{state.sheet.errors.length > 1 ? 's' : ''} will be
                skipped — the first is {state.sheet.errors[0]!.sheet} row {state.sheet.errors[0]!.rowNumber}:
                {' '}{state.sheet.errors[0]!.message}
              </p>
            )}

            {/* Both tables are admin-write under RLS, so the database would refuse
                this import rather than the browser. Saying so before the attempt
                beats a permission error after it. */}
            {!isAdmin && (
              <p className="banner banner--warning" style={{ marginTop: 12, marginBottom: 0 }}>
                Only an administrator can import HR and loading-plan sheets. Send this file to
                an administrator, or ask them to run the upload.
              </p>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
              <button type="button" className="btn btn--success" onClick={() => void runSheetImport()}
                disabled={state.sheet.rows.length === 0 || !isAdmin}>
                Import &amp; update dashboard
              </button>
              <button type="button" className="btn btn--secondary" onClick={reset}>Cancel</button>
            </div>
          </Card>
        </>
      )}

      {state.step === 'sheetDone' && state.sheetResult && state.sheet && (
        <Card>
          <h3 style={{ fontSize: 23, margin: '0 0 4px' }}>
            {state.sheet.kind === 'hr' ? 'Attendance imported' : 'Loading plan imported'}
          </h3>
          <p style={{ color: 'var(--text-muted)', fontSize: 13.5, margin: '0 0 20px' }}>
            {formatNumber(state.sheetResult.written)} rows written in{' '}
            {(state.sheetResult.processingMs / 1000).toFixed(1)} s.
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Link className="btn btn--primary" style={{ textDecoration: 'none' }}
              to={base + (state.sheet.kind === 'hr' ? '/hr' : '/loading-plan')}>
              {state.sheet.kind === 'hr' ? 'View HR' : 'View loading plan'}
            </Link>
            <button type="button" className="btn btn--secondary" onClick={reset}>Upload another</button>
          </div>
        </Card>
      )}

      {state.step === 'qualityDuplicate' && state.qualityDuplicate && (
        <Card>
          <h3 style={{ fontSize: 21, margin: '0 0 5px' }}>This report has been uploaded before</h3>
          <p style={{ margin: '0 0 16px', color: 'var(--text-muted)', fontSize: 13.5 }}>
            The file hash matches an earlier upload. Importing it again would count every
            inspection twice.
          </p>
          <div style={{ background: 'var(--amber-50)', border: '1px solid var(--amber-200)', borderRadius: 10, padding: 14, display: 'flex', flexWrap: 'wrap', gap: 20 }}>
            <span><strong>File</strong><br />{state.qualityDuplicate.original_filename}</span>
            <span><strong>Uploaded</strong><br />{formatDateTime(state.qualityDuplicate.created_at)}</span>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 18, flexWrap: 'wrap' }}>
            <button type="button" className="btn btn--primary" onClick={() => void runQualityImport(true)}>
              Import anyway
            </button>
            <button type="button" className="btn btn--ghost" onClick={reset}>Cancel</button>
          </div>
        </Card>
      )}

      {state.step === 'qualityDone' && state.qualityResult && (
        <Card>
          <h3 style={{ fontSize: 23, margin: '0 0 4px' }}>Quality data imported</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: 13.5, margin: '0 0 20px' }}>
            {formatNumber(state.qualityResult.inspections)} inspection rows and{' '}
            {formatNumber(state.qualityResult.defects)} defect rows written in{' '}
            {(state.qualityResult.processingMs / 1000).toFixed(1)} s.
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Link className="btn btn--primary" to={base + '/dashboard'} style={{ textDecoration: 'none' }}>View dashboard</Link>
            <button type="button" className="btn btn--secondary" onClick={reset}>Upload another</button>
          </div>
        </Card>
      )}

      {state.step === 'importing' && (
        <Card>
          <div className="state">
            <div className="spinner" />
            <p style={{ margin: 0, font: '600 20px var(--font-heading)' }}>Importing</p>
            <p style={{ margin: 0, fontSize: 13.5 }}>
              Compressing the original, storing it privately and writing production records.
            </p>
          </div>
          <div className="bar">
            <div className="bar__fill" style={{ width: state.importPercent + '%', background: 'var(--green-500)' }} />
          </div>
        </Card>
      )}

      {state.step === 'done' && state.result && (
        <Card>
          <h3 style={{ fontSize: 23, margin: '0 0 4px' }}>Dashboard updated successfully</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: 13.5, margin: '0 0 20px' }}>
            {formatNumber(state.result.importedRecords)} production records imported in {(state.result.processingMs / 1000).toFixed(1)} s.
          </p>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
            {([
              ['Records imported', formatNumber(state.result.importedRecords)],
              ['Stored as', state.result.compressedFilename],
              ['Compression', formatBytes(state.result.originalSize) + ' → ' + formatBytes(state.result.compressedSize) +
                ' (' + compressionRatio(state.result.originalSize, state.result.compressedSize) + ')'],
              ['Rows skipped', String(state.result.skippedRows)],
              ['New orders created', String(state.result.ordersCreated)]
            ] as [string, string][]).map(([k, v]) => (
              <div key={k} style={{ background: 'var(--surface-muted)', borderRadius: 10, padding: 14 }}>
                <div style={{ fontSize: 11, color: 'var(--text-faint)', letterSpacing: '.07em', textTransform: 'uppercase' }}>{k}</div>
                <div style={{ font: '600 15px/1.4 var(--font-body)', marginTop: 5, overflowWrap: 'anywhere' }}>{v}</div>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
            <Link className="btn btn--primary" to={base + '/dashboard'} style={{ textDecoration: 'none' }}>View dashboard</Link>
            <Link className="btn btn--secondary" to={base + '/history'} style={{ textDecoration: 'none' }}>Upload history</Link>
            <button type="button" className="btn btn--secondary" onClick={reset}>Upload another</button>
          </div>
        </Card>
      )}
    </div>
  );
}
