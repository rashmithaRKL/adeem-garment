import { useCallback, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { QueryState } from '@/components/QueryState';
import { StatusChip } from '@/components/StatusChip';
import { ProgressBar, toneForEfficiency } from '@/components/ProgressBar';
import { Modal, Field } from '@/components/Modal';
import { SearchInput, useSearch, useSearchTerm } from '@/components/SearchInput';
import { formatNumber, formatPercent, formatDate } from '@/lib/format';
import { friendlyError } from '@/lib/errors';
import { fetchLinePerformance } from '@/features/dashboard/queries';
import { useRealtimeDashboard } from '@/features/dashboard/useRealtimeDashboard';
import {
  fetchQualityRecords, buildQualityMatrix, datasetGrain, earliestDate, latestDate, openingDate,
  FLOOR_STAGES, type QualityRecords
} from '@/features/quality/queries';
import { spanFor, spanLabel, today, type QualityRange } from '@/features/quality/period';
import { QualityPeriodPicker } from '@/features/quality/QualityPeriodPicker';
import { STAGE_LABEL } from '@/features/quality/types';
import { fetchNextStyles } from '@/features/loading/queries';
import { useIsManager } from '@/features/auth/AuthProvider';
import { EFFICIENCY_THRESHOLD } from '@/lib/env';
import { useTilt } from '@/lib/motion';
import {
  fetchAllLines, createLine, updateLine, deleteLine,
  LINE_STATUSES, type LineRow, type LineEdit
} from './mutations';

const BLANK: LineEdit = {
  line_number: 1, line_name: '', department: 'Sewing', status: 'idle', active: true
};

/** Steady identity while the records query is in flight, so the builder is stable. */
const NO_QUALITY: QualityRecords = { inspections: [], defects: [], lines: [], finals: [] };

/** Written the way the client says it: "In line + End line + Appearance". */
const floorNote = FLOOR_STAGES.map((s) => STAGE_LABEL[s]).join(' + ');

/** Pass rate over the floor gates, read off the same two figures shown beside it. */
const passOf = (q: { checked: number; defects: number }): number =>
  Math.round(((q.checked - q.defects) / q.checked) * 10_000) / 100;

export function LinesPage() {
  useRealtimeDashboard();
  const queryClient = useQueryClient();
  const canManage = useIsManager();

  const perf = useQuery({ queryKey: ['dashboard', 'lines'], queryFn: () => fetchLinePerformance() });
  const all = useQuery({ queryKey: ['lines', 'all'], queryFn: fetchAllLines });
  // The same rows, the same builder and the same cache entry the Quality
  // Management screen uses, so a line's pass rate reads the same on both screens
  // for the same day or month rather than being an all-time figure here.
  const quality = useQuery({ queryKey: ['quality', 'records'], queryFn: fetchQualityRecords });
  // What each line takes on after the style it is running now. The current order
  // comes from the order book; what follows it is a plan, and lives there.
  const nextStyles = useQuery({ queryKey: ['loadingPlan', 'next'], queryFn: fetchNextStyles });

  const [term, setTerm] = useSearchTerm();
  // null on both means "follow the reports" — see the Quality Management screen,
  // which opens the same way so the two agree on what "now" is.
  const [range, setRange] = useState<QualityRange | null>(null);
  const [anchor, setAnchor] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ row: LineRow | null } | null>(null);
  const [removing, setRemoving] = useState<LineRow | null>(null);

  const records = quality.data ?? NO_QUALITY;
  const latest = latestDate(records);
  const earliest = earliestDate(records);
  const span = spanFor(
    range ?? (datasetGrain(records) === 'daily' ? 'day' : 'month'),
    anchor ?? openingDate(records) ?? today()
  );
  const matrix = buildQualityMatrix(records, span, EFFICIENCY_THRESHOLD);
  const hasQuality = records.inspections.length > 0 || records.defects.length > 0;
  const qualityByLine = new Map(
    matrix.lines.filter((l) => l.lineNo != null).map((l) => [l.lineNo!, l])
  );

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['lines'] });
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const save = useMutation({
    mutationFn: ({ id, patch }: { id: string | null; patch: LineEdit }) =>
      (id ? updateLine(id, patch) : createLine(patch)),
    onSuccess: () => { refresh(); setEditing(null); }
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteLine(id),
    onSuccess: () => { refresh(); setRemoving(null); }
  });

  // The performance query only returns active lines, so a deactivated one would
  // disappear from the screen it is administered on. The full list drives the
  // cards; performance is looked up against it where it exists.
  const rows = all.data ?? [];
  const searchable = useCallback(
    (l: LineRow) => `${l.line_name} ${l.line_number} ${l.department ?? ''} ${l.status} ${l.active ? 'active' : 'inactive'}`,
    []
  );
  const shown = useSearch(rows, term, searchable);
  const perfById = new Map((perf.data ?? []).map((p) => [p.id, p]));
  const nextNumber = rows.reduce((max, l) => Math.max(max, l.line_number), 0) + 1;

  return (
    <>
      {canManage && (
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 4 }}>
          <div style={{ flex: '1 1 260px', minWidth: 0 }}>
            <SearchInput value={term} onChange={setTerm}
              placeholder="Search line name, number, department or status"
              count={{ shown: shown.length, total: rows.length }} />
          </div>
          <button type="button" className="btn btn--primary" style={{ flex: 'none' }}
            onClick={() => setEditing({ row: null })}>
            + Add line
          </button>
        </div>
      )}

      {/* The picker governs the Quality panel on each card and nothing else on
          this screen — output against target comes from production records, which
          have their own dates — so it is captioned rather than left to be guessed. */}
      {/* Hidden until a quality report has been imported at all: with nothing to
          look at, a date field and three range buttons are three ways of asking
          the same empty question. It stays on screen once there is data even if
          this window has none, because widening the window is exactly how the
          figures are found. */}
      {hasQuality && (
        <QualityPeriodPicker
          span={span}
          latest={latest}
          earliest={earliest}
          onRange={setRange}
          onAnchor={setAnchor}
          note={<>Quality figures on each card only. Checked and defects are {floorNote}.</>}
        />
      )}

      {remove.error && <p className="banner banner--error">{friendlyError(remove.error)}</p>}

      <QueryState isLoading={all.isLoading} error={all.error} isEmpty={rows.length === 0}
        emptyTitle="No production lines"
        emptyBody={canManage
          ? 'Use “Add line” above, or import a quality report — the lines it names are created automatically.'
          : 'Lines appear once an administrator adds them.'}>
      <div className="grid grid--cards">
        {shown.map((row, i) => {
          const line = perfById.get(row.id);
          const q = qualityByLine.get(row.line_number);
          const next = nextStyles.data?.[row.line_number];
          return (
          <LineCard key={row.id} index={i}>
            <header style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <span style={{
                width: 36, height: 36, borderRadius: 9, background: 'var(--blue-50)',
                color: 'var(--blue-500)', display: 'grid', placeItems: 'center',
                font: '700 13px var(--font-heading)'
              }}>{String(row.line_number).padStart(2, '0')}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', font: '600 17px/1.1 var(--font-heading)', letterSpacing: '.06em' }}>{row.line_name}</span>
                <span style={{ fontSize: 11.5, color: 'var(--text-faint)' }}>
                  {row.department ?? 'no department'}{row.active ? '' : ' · inactive'}
                </span>
              </span>
              <StatusChip status={row.status} />
            </header>

            {/* Output against target only exists once production records do. Until
                then the panel would be four zeroes and a red 0% efficiency, which
                reads as a failing line rather than an empty one. */}
            {line && (line.target > 0 || line.actual > 0) ? (
              <>
                <div style={{ background: 'var(--surface-muted)', borderRadius: 9, padding: 12, marginBottom: 14 }}>
                  <div style={{ fontSize: 11, color: 'var(--text-faint)', letterSpacing: '.08em', textTransform: 'uppercase' }}>Current order</div>
                  <div style={{ font: '600 14px var(--font-body)' }}>{line.currentOrder ?? '—'} {line.buyer ? '· ' + line.buyer : ''}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                    {line.styleNumber ?? 'no style'} — due {formatDate(line.deliveryDate)}
                  </div>
                </div>

                <div className="grid" style={{ gridTemplateColumns: 'repeat(3,1fr)', textAlign: 'center', marginBottom: 14, gap: 10 }}>
                  <div><div style={{ font: '600 20px/1 var(--font-heading)' }}>{formatNumber(line.target)}</div><div style={{ fontSize: 11, color: 'var(--text-faint)' }}>Target</div></div>
                  <div><div style={{ font: '600 20px/1 var(--font-heading)', color: 'var(--green-500)' }}>{formatNumber(line.actual)}</div><div style={{ fontSize: 11, color: 'var(--text-faint)' }}>Actual</div></div>
                  <div><div style={{ font: '600 20px/1 var(--font-heading)', color: 'var(--amber-500)' }}>{formatNumber(line.balance)}</div><div style={{ fontSize: 11, color: 'var(--text-faint)' }}>Balance</div></div>
                </div>

                <ProgressBar value={line.progress} tone={toneForEfficiency(line.efficiency)} />
                <p style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: 'var(--text-muted)', margin: '7px 0 0' }}>
                  <span>Efficiency <strong style={{ color: toneForEfficiency(line.efficiency) }}>{formatPercent(line.efficiency)}</strong></span>
                  <span>Progress {formatPercent(line.progress, 0)}</span>
                </p>
              </>
            ) : (
              <p style={{ margin: '0 0 4px', fontSize: 12.5, color: 'var(--text-faint)' }}>
                No production output recorded for this line.
              </p>
            )}

            {/* What comes next, which is the question asked of a line that is
                about to finish. Sourced from the loading plan rather than the
                order book: an order becomes "next" by being scheduled, and only
                the plan knows that. */}
            <div style={{ borderTop: '1px solid var(--border-soft)', marginTop: 14, paddingTop: 12 }}>
              <div style={{ fontSize: 11, color: 'var(--text-faint)', letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 8 }}>
                Next style
              </div>
              {next ? (
                <div style={{ background: 'var(--blue-50)', borderRadius: 9, padding: 11 }}>
                  <div style={{ font: '600 15px/1.2 var(--font-heading)', letterSpacing: '.05em' }}>
                    {next.style_number}
                    {next.order_number ? <span style={{ fontSize: 12, color: 'var(--text-muted)' }}> · {next.order_number}</span> : null}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>
                    {next.school_name ?? 'no school named'} — {formatNumber(next.order_qty)} pcs
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 3 }}>
                    PSD {formatDate(next.psd)} · PED {formatDate(next.ped)}
                  </div>
                </div>
              ) : (
                <p style={{ margin: 0, fontSize: 12, color: 'var(--text-faint)' }}>
                  Nothing queued for this line on the loading plan.
                </p>
              )}
            </div>

            {/* Quality stands on its own: these lines are known from inspection
                reports, which say nothing about output against target. */}
            <div style={{ borderTop: '1px solid var(--border-soft)', marginTop: 14, paddingTop: 12 }}>
              <div style={{ fontSize: 11, color: 'var(--text-faint)', letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 8 }}>
                Quality
              </div>
              {q && q.checked > 0 ? (
                <>
                  <div className="grid" style={{ gridTemplateColumns: 'repeat(3,1fr)', textAlign: 'center', gap: 10 }}>
                    <div>
                      <div style={{ font: '600 18px/1 var(--font-heading)',
                        color: passOf(q) < EFFICIENCY_THRESHOLD ? 'var(--red-500)' : 'var(--blue-500)' }}>
                        {passOf(q).toFixed(1)}%
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>Pass rate</div>
                    </div>
                    <div>
                      <div style={{ font: '600 18px/1 var(--font-heading)' }}>{formatNumber(q.checked)}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>Checked</div>
                    </div>
                    <div>
                      <div style={{ font: '600 18px/1 var(--font-heading)' }}>{formatNumber(q.defects)}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>Defects</div>
                    </div>
                  </div>
                  <p style={{ margin: '8px 0 0', fontSize: 11, color: 'var(--text-faint)' }}>
                    {floorNote} · {spanLabel(span)}
                  </p>
                </>
              ) : (
                <p style={{ margin: 0, fontSize: 12, color: 'var(--text-faint)' }}>
                  {latest == null
                    ? 'No inspection data imported for this line yet.'
                    : 'Not inspected in ' + spanLabel(span) + '.'}
                </p>
              )}
            </div>

            {canManage && (
              <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
                <button type="button" className="btn btn--secondary btn--small"
                  onClick={() => setEditing({ row })}>Edit</button>
                <button type="button" className="btn btn--ghost btn--small"
                  style={{ color: 'var(--red-500)' }}
                  onClick={() => setRemoving(row)}>Delete</button>
              </div>
            )}
          </LineCard>
          );
        })}
      </div>
      </QueryState>

      {editing && (
        <EditLine
          row={editing.row}
          nextNumber={nextNumber}
          saving={save.isPending}
          error={save.error ? friendlyError(save.error) : undefined}
          onCancel={() => { save.reset(); setEditing(null); }}
          onSave={(patch) => save.mutate({ id: editing.row?.id ?? null, patch })}
        />
      )}

      {removing && (
        <Modal
          title="Delete production line"
          onClose={() => { remove.reset(); setRemoving(null); }}
          error={remove.error ? friendlyError(remove.error) : undefined}
          actions={
            <>
              <button type="button" className="btn btn--secondary"
                onClick={() => { remove.reset(); setRemoving(null); }}>Cancel</button>
              <button type="button" className="btn btn--danger" disabled={remove.isPending}
                onClick={() => remove.mutate(removing.id)}>
                {remove.isPending ? 'Deleting…' : 'Delete line'}
              </button>
            </>
          }
        >
          <p style={{ margin: '0 0 12px', fontSize: 14 }}>
            Delete <strong>{removing.line_name}</strong>?
          </p>
          <p className="banner banner--warning" style={{ margin: 0 }}>
            If any production record or order still points at this line, the database
            will refuse rather than destroy that history — deactivate it instead and it
            leaves every dashboard while its past stays intact.
          </p>
        </Modal>
      )}
    </>
  );
}

function EditLine({ row, nextNumber, saving, error, onCancel, onSave }: {
  row: LineRow | null;
  nextNumber: number;
  saving: boolean;
  error?: string | undefined;
  onCancel: () => void;
  onSave: (patch: LineEdit) => void;
}) {
  const [form, setForm] = useState<LineEdit>(() => row
    ? {
        line_number: row.line_number, line_name: row.line_name,
        department: row.department ?? '', status: row.status, active: row.active
      }
    : { ...BLANK, line_number: nextNumber, line_name: `LINE ${String(nextNumber).padStart(2, '0')}` });

  const set = <K extends keyof LineEdit>(k: K, v: LineEdit[K]) => setForm((f) => ({ ...f, [k]: v }));
  const valid = form.line_name.trim().length > 0 && form.line_number > 0;

  return (
    <Modal
      title={row ? `Edit ${row.line_name}` : 'Add production line'}
      onClose={onCancel}
      error={error}
      actions={
        <>
          <button type="button" className="btn btn--secondary" onClick={onCancel}>Cancel</button>
          <button type="button" className="btn btn--primary" disabled={!valid || saving}
            onClick={() => onSave(form)}>
            {saving ? 'Saving…' : row ? 'Save changes' : 'Create line'}
          </button>
        </>
      }
    >
      <Field label="Line number" hint="Unique. Quality reports match their “Team No” against this.">
        <input className="input" type="number" min={1} value={form.line_number}
          onChange={(e) => set('line_number', Number(e.target.value))} />
      </Field>

      <Field label="Line name">
        <input className="input" value={form.line_name}
          onChange={(e) => set('line_name', e.target.value)} />
      </Field>

      <Field label="Department">
        <input className="input" value={form.department}
          onChange={(e) => set('department', e.target.value)} placeholder="Sewing" />
      </Field>

      <Field label="Status">
        <select className="input" value={form.status}
          onChange={(e) => set('status', e.target.value as LineEdit['status'])}>
          {LINE_STATUSES.map((s) => (
            <option key={s} value={s} style={{ textTransform: 'capitalize' }}>{s}</option>
          ))}
        </select>
      </Field>

      <Field label="Active" hint="Inactive lines are hidden from the dashboards but keep their history.">
        <select className="input" value={form.active ? 'yes' : 'no'}
          onChange={(e) => set('active', e.target.value === 'yes')}>
          <option value="yes">Active</option>
          <option value="no">Inactive</option>
        </select>
      </Field>
    </Modal>
  );
}

/**
 * A line card is read at a glance rather than worked through, so it is one of the
 * few surfaces where tilting the whole card helps rather than gets in the way.
 */
function LineCard({ index, children }: { index: number; children: React.ReactNode }) {
  const tilt = useTilt<HTMLElement>(5);
  return (
    <article
      ref={tilt.ref as React.RefObject<HTMLElement>}
      onPointerMove={tilt.onPointerMove}
      onPointerLeave={tilt.onPointerLeave}
      className="card tilt rise"
      style={{ ['--i' as string]: index }}
    >
      {children}
    </article>
  );
}
