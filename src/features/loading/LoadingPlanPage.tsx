import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card } from '@/components/Card';
import { Kpi } from '@/components/Kpi';
import { QueryState } from '@/components/QueryState';
import { Modal, Field } from '@/components/Modal';
import { SearchInput, useSearch, useSearchTerm } from '@/components/SearchInput';
import { Donut, BarChart, RankedBars, toSlices } from '@/components/charts';
import { formatNumber, formatDate } from '@/lib/format';
import { friendlyError } from '@/lib/errors';
import { useAuth, useIsManager } from '@/features/auth/AuthProvider';
import { downloadPlanTemplate } from '@/features/excel/templates';
import {
  fetchLoadingPlan, overdueMilestone, PLAN_STATUSES, PLAN_STATUS_LABEL,
  type PlanRow, type PlanStatus
} from './queries';
import { createPlanRow, updatePlanRow, deletePlanRow, type PlanEdit } from './mutations';

const BLANK: PlanEdit = {
  line_no: 1, style_number: '', order_number: '', school_name: '', order_qty: 0,
  pp_date: '', pcd: '', psd: '', ped: '', status: 'upcoming', sequence: 1, remarks: ''
};

/** Status is a state, not a series, so it keeps the semantic palette. */
const STATUS_COLOR: Record<PlanStatus, string> = {
  upcoming: 'var(--blue-500)',
  in_progress: 'var(--green-500)',
  completed: 'var(--cyan-500)',
  hold: 'var(--amber-500)'
};

const DATE_COLUMNS: { key: 'pp_date' | 'pcd' | 'psd' | 'ped'; label: string; title: string }[] = [
  { key: 'pp_date', label: 'PP date', title: 'Pre-production meeting' },
  { key: 'pcd', label: 'PCD', title: 'Planned cut date' },
  { key: 'psd', label: 'PSD', title: 'Planned sewing start date' },
  { key: 'ped', label: 'PED', title: 'Planned end date' }
];

/**
 * What each line runs next, and the four dates it has to hit on the way there.
 * The screen is organised line by line rather than as one flat list because that
 * is the unit of the decision: a planner is asking "what does line 3 do after
 * this style", not "what is due on Thursday".
 */
export function LoadingPlanPage() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const canManage = useIsManager();

  const plan = useQuery({ queryKey: ['loadingPlan'], queryFn: fetchLoadingPlan });
  const [term, setTerm] = useSearchTerm();
  const [editing, setEditing] = useState<{ row: PlanRow | null } | null>(null);
  const [removing, setRemoving] = useState<PlanRow | null>(null);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['loadingPlan'] });
    void queryClient.invalidateQueries({ queryKey: ['lines'] });
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const save = useMutation({
    mutationFn: ({ id, patch }: { id: string | null; patch: PlanEdit }) =>
      (id ? updatePlanRow(id, patch, profile?.id ?? null) : createPlanRow(patch, profile?.id ?? null)),
    onSuccess: () => { refresh(); setEditing(null); }
  });
  const remove = useMutation({
    mutationFn: (id: string) => deletePlanRow(id),
    onSuccess: () => { refresh(); setRemoving(null); }
  });

  const rows = plan.data ?? [];
  const searchable = useCallback(
    (r: PlanRow) => `line ${r.line_no} ${r.style_number} ${r.order_number ?? ''} ${r.school_name ?? ''} ${r.status}`,
    []
  );
  const shown = useSearch(rows, term, searchable);

  const open = rows.filter((r) => r.status === 'upcoming' || r.status === 'in_progress');
  const overdue = rows.filter((r) => overdueMilestone(r) != null);
  const lines = [...new Set(shown.map((r) => r.line_no))].sort((a, b) => a - b);

  // Quantity per line, split by state: one bar per line, four segments, so a
  // line's total load and how much of it is still to come read in one shape.
  const qtyByLine = [...new Set(rows.map((r) => r.line_no))].sort((a, b) => a - b).map((lineNo) => ({
    label: 'L' + String(lineNo).padStart(2, '0'),
    values: PLAN_STATUSES.reduce<Record<string, number>>((acc, status) => {
      acc[status] = rows
        .filter((r) => r.line_no === lineNo && r.status === status)
        .reduce((sum, r) => sum + r.order_qty, 0);
      return acc;
    }, {})
  }));

  const schools = toSlices(
    [...rows.reduce((acc, r) => {
      const key = r.school_name?.trim() || 'Unnamed';
      acc.set(key, (acc.get(key) ?? 0) + r.order_qty);
      return acc;
    }, new Map<string, number>())].map(([school, qty]) => ({ school, qty })),
    (r) => r.school,
    (r) => r.qty
  );

  return (
    <>
      {canManage && (
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 260px', minWidth: 0 }}>
            <SearchInput value={term} onChange={setTerm}
              placeholder="Search line, style, order, school or status"
              count={{ shown: shown.length, total: rows.length }} />
          </div>
          <button type="button" className="btn btn--secondary" style={{ flex: 'none' }}
            onClick={() => void downloadPlanTemplate()}
            title="A blank loading plan laid out the way the importer expects">
            Excel template
          </button>
          <Link to="/admin/upload" className="btn btn--secondary" style={{ flex: 'none', textDecoration: 'none' }}>
            Upload sheet
          </Link>
          <button type="button" className="btn btn--primary" style={{ flex: 'none' }}
            onClick={() => setEditing({ row: null })}>
            + Add style
          </button>
        </div>
      )}

      {remove.error && <p className="banner banner--error">{friendlyError(remove.error)}</p>}

      <QueryState
        isLoading={plan.isLoading}
        error={plan.error}
        isEmpty={rows.length === 0}
        emptyTitle="No loading plan entered yet"
        emptyBody={canManage
          ? 'Two ways in: upload a loading plan on the Upload Excel screen — any sheet with style, line and PP/PCD/PSD/PED columns is recognised — or use “Add style” to queue one by hand. The Production Line screen reads the next style from here.'
          : 'Upcoming styles appear once a planner enters them.'}
      >
        <div className="grid grid--kpi">
          <Kpi index={0} label="Styles queued" icon="🧷" tone="blue"
            value={String(rows.filter((r) => r.status === 'upcoming').length)}
            sub={rows.filter((r) => r.status === 'in_progress').length + ' running now'} />
          <Kpi index={1} label="Planned quantity" icon="📦" tone="purple"
            value={formatNumber(open.reduce((sum, r) => sum + r.order_qty, 0))}
            sub="queued and running" />
          <Kpi index={2} label="Lines loaded" icon="🏭" tone="cyan"
            value={String(new Set(open.map((r) => r.line_no)).size)}
            sub={'across ' + new Set(open.map((r) => r.school_name ?? '—')).size + ' schools'} />
          <Kpi index={3} label="Milestones passed" icon="⚠️" tone={overdue.length > 0 ? 'red' : 'green'}
            value={String(overdue.length)}
            sub={overdue.length > 0 ? 'styles waiting past a date' : 'nothing overdue'} />
        </div>

        <div className="grid grid--split" style={{ marginTop: 16 }}>
          <Card title="Planned quantity by line"
            aside={<span style={{ fontSize: 12, color: 'var(--text-faint)' }}>stacked by state</span>}>
            <BarChart
              stacked
              height={230}
              data={qtyByLine}
              series={PLAN_STATUSES.map((s) => ({
                key: s, label: PLAN_STATUS_LABEL[s], color: STATUS_COLOR[s]
              }))}
              empty="No quantities planned yet."
            />
          </Card>

          <Card title="Styles by state">
            <Donut
              size={162}
              centerLabel="styles"
              slices={PLAN_STATUSES
                .map((s) => ({
                  label: PLAN_STATUS_LABEL[s],
                  value: rows.filter((r) => r.status === s).length,
                  color: STATUS_COLOR[s]
                }))
                .filter((s) => s.value > 0)}
              empty="No styles planned yet."
            />
          </Card>
        </div>

        <Card title="Quantity by school" style={{ marginTop: 16 }}
          aside={<span style={{ fontSize: 12, color: 'var(--text-faint)' }}>
            every style on the plan
          </span>}>
          <RankedBars
            rows={schools.map((s) => ({ label: s.label, value: s.value, color: s.color }))}
            empty="No school named on any planned style yet."
          />
        </Card>

        {shown.length === 0 && (
          <p className="banner banner--info" style={{ marginTop: 16, marginBottom: 0 }}>
            No planned style matches “{term}”. The charts above still cover the whole plan.
          </p>
        )}

        {lines.map((lineNo, i) => {
          const lineRows = shown.filter((r) => r.line_no === lineNo);
          const next = lineRows.find((r) => r.status === 'upcoming');
          return (
            <Card
              key={lineNo}
              index={i}
              style={{ marginTop: 16 }}
              title={'Line ' + String(lineNo).padStart(2, '0')}
              aside={
                <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>
                  {next ? <>next up <strong style={{ color: 'var(--text)' }}>{next.style_number}</strong></> : 'nothing queued'}
                  {' · '}{formatNumber(lineRows.reduce((sum, r) => sum + r.order_qty, 0))} pcs
                </span>
              }
            >
              <div className="table-scroll">
                <table className="table" style={{ minWidth: 880 }}>
                  <thead>
                    <tr>
                      <th>#</th><th>Style</th><th>Order</th><th>School</th>
                      <th className="num">Order qty</th>
                      {DATE_COLUMNS.map((c) => <th key={c.key} title={c.title}>{c.label}</th>)}
                      <th>Status</th>
                      {canManage && <th />}
                    </tr>
                  </thead>
                  <tbody>
                    {lineRows.map((r) => {
                      const late = overdueMilestone(r);
                      return (
                        <tr key={r.id}>
                          <td style={{ color: 'var(--text-faint)' }}>{r.sequence}</td>
                          <td style={{ fontWeight: 600 }}>{r.style_number}</td>
                          <td className="mono">{r.order_number ?? '—'}</td>
                          <td>{r.school_name ?? '—'}</td>
                          <td className="num">{formatNumber(r.order_qty)}</td>
                          {DATE_COLUMNS.map((c) => (
                            <td key={c.key} style={{
                              whiteSpace: 'nowrap',
                              color: late?.field === c.label ? 'var(--red-500)' : undefined,
                              fontWeight: late?.field === c.label ? 600 : undefined
                            }}>
                              {r[c.key] ? formatDate(r[c.key]) : '—'}
                            </td>
                          ))}
                          <td>
                            <span className="chip" style={{
                              background: 'var(--surface-muted)', color: STATUS_COLOR[r.status]
                            }}>{PLAN_STATUS_LABEL[r.status]}</span>
                          </td>
                          {canManage && (
                            <td className="num" style={{ whiteSpace: 'nowrap' }}>
                              <button type="button" className="btn btn--secondary btn--small"
                                onClick={() => setEditing({ row: r })}>Edit</button>
                              {' '}
                              <button type="button" className="btn btn--ghost btn--small"
                                style={{ color: 'var(--red-500)' }}
                                onClick={() => setRemoving(r)}>Delete</button>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {lineRows.some((r) => overdueMilestone(r)) && (
                <p style={{ margin: '12px 0 0', fontSize: 12, color: 'var(--red-500)' }}>
                  A date in red has already passed while the style is still waiting.
                </p>
              )}
            </Card>
          );
        })}
      </QueryState>

      {editing && (
        <EditStyle
          row={editing.row}
          nextSequence={(lineNo: number) =>
            rows.filter((r) => r.line_no === lineNo).reduce((max, r) => Math.max(max, r.sequence), 0) + 1}
          saving={save.isPending}
          error={save.error ? friendlyError(save.error) : undefined}
          onCancel={() => { save.reset(); setEditing(null); }}
          onSave={(patch) => save.mutate({ id: editing.row?.id ?? null, patch })}
        />
      )}

      {removing && (
        <Modal
          title="Remove planned style"
          onClose={() => { remove.reset(); setRemoving(null); }}
          error={remove.error ? friendlyError(remove.error) : undefined}
          actions={
            <>
              <button type="button" className="btn btn--secondary"
                onClick={() => { remove.reset(); setRemoving(null); }}>Cancel</button>
              <button type="button" className="btn btn--danger" disabled={remove.isPending}
                onClick={() => remove.mutate(removing.id)}>
                {remove.isPending ? 'Removing…' : 'Remove style'}
              </button>
            </>
          }
        >
          <p style={{ margin: 0, fontSize: 14 }}>
            Remove <strong>{removing.style_number}</strong> from line{' '}
            {String(removing.line_no).padStart(2, '0')}? The styles behind it keep their
            own sequence numbers, so the queue does not renumber itself.
          </p>
        </Modal>
      )}
    </>
  );
}

function EditStyle({ row, nextSequence, saving, error, onCancel, onSave }: {
  row: PlanRow | null;
  nextSequence: (lineNo: number) => number;
  saving: boolean;
  error?: string | undefined;
  onCancel: () => void;
  onSave: (patch: PlanEdit) => void;
}) {
  const [form, setForm] = useState<PlanEdit>(() => row
    ? {
        line_no: row.line_no, style_number: row.style_number,
        order_number: row.order_number ?? '', school_name: row.school_name ?? '',
        order_qty: row.order_qty, pp_date: row.pp_date ?? '', pcd: row.pcd ?? '',
        psd: row.psd ?? '', ped: row.ped ?? '', status: row.status,
        sequence: row.sequence, remarks: row.remarks ?? ''
      }
    : { ...BLANK, sequence: nextSequence(BLANK.line_no) });

  const set = <K extends keyof PlanEdit>(k: K, v: PlanEdit[K]) => setForm((f) => ({ ...f, [k]: v }));
  const valid = form.style_number.trim().length > 0 && form.line_no > 0;

  // Dates that run backwards are a typo often enough to be worth saying, but not
  // often enough to block: a plan can legitimately be re-cut out of order.
  const sequenceWarning = [form.pp_date, form.pcd, form.psd, form.ped]
    .filter((d) => d !== '')
    .some((d, i, list) => i > 0 && d < list[i - 1]!);

  return (
    <Modal
      title={row ? `Edit ${row.style_number}` : 'Add a style to the plan'}
      onClose={onCancel}
      error={error}
      actions={
        <>
          <button type="button" className="btn btn--secondary" onClick={onCancel}>Cancel</button>
          <button type="button" className="btn btn--primary" disabled={!valid || saving}
            onClick={() => onSave(form)}>
            {saving ? 'Saving…' : row ? 'Save changes' : 'Add to plan'}
          </button>
        </>
      }
    >
      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="Line number" hint="The line this style is loaded on.">
          <input className="input" type="number" min={1} value={form.line_no}
            onChange={(e) => {
              const lineNo = Number(e.target.value);
              setForm((f) => ({ ...f, line_no: lineNo, sequence: row ? f.sequence : nextSequence(lineNo) }));
            }} />
        </Field>
        <Field label="Sequence" hint="Position in that line's queue. Lowest runs next.">
          <input className="input" type="number" min={1} value={form.sequence}
            onChange={(e) => set('sequence', Number(e.target.value))} />
        </Field>
      </div>

      <Field label="Style number">
        <input className="input" value={form.style_number} placeholder="e.g. AU-4471"
          onChange={(e) => set('style_number', e.target.value)} />
      </Field>

      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="Order number">
          <input className="input" value={form.order_number}
            onChange={(e) => set('order_number', e.target.value)} />
        </Field>
        <Field label="School name">
          <input className="input" value={form.school_name}
            onChange={(e) => set('school_name', e.target.value)} />
        </Field>
        <Field label="Order quantity">
          <input className="input" type="number" min={0} value={form.order_qty}
            onChange={(e) => set('order_qty', Number(e.target.value))} />
        </Field>
        <Field label="Status">
          <select className="input" value={form.status}
            onChange={(e) => set('status', e.target.value as PlanStatus)}>
            {PLAN_STATUSES.map((s) => (
              <option key={s} value={s}>{PLAN_STATUS_LABEL[s]}</option>
            ))}
          </select>
        </Field>
      </div>

      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="PP date" hint="Pre-production meeting.">
          <input className="input" type="date" value={form.pp_date}
            onChange={(e) => set('pp_date', e.target.value)} />
        </Field>
        <Field label="PCD" hint="Planned cut date.">
          <input className="input" type="date" value={form.pcd}
            onChange={(e) => set('pcd', e.target.value)} />
        </Field>
        <Field label="PSD" hint="Planned sewing start date.">
          <input className="input" type="date" value={form.psd}
            onChange={(e) => set('psd', e.target.value)} />
        </Field>
        <Field label="PED" hint="Planned end date.">
          <input className="input" type="date" value={form.ped}
            onChange={(e) => set('ped', e.target.value)} />
        </Field>
      </div>

      <Field label="Note">
        <input className="input" value={form.remarks} placeholder="Optional"
          onChange={(e) => set('remarks', e.target.value)} />
      </Field>

      {sequenceWarning && (
        <p className="banner banner--warning" style={{ margin: 0 }}>
          These dates do not run PP → PCD → PSD → PED in order. It will save as entered —
          check the dates if that was not deliberate.
        </p>
      )}
    </Modal>
  );
}
