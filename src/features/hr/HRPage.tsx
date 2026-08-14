import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card } from '@/components/Card';
import { Kpi } from '@/components/Kpi';
import { QueryState } from '@/components/QueryState';
import { Modal, Field } from '@/components/Modal';
import { SearchInput, useSearch, useSearchTerm } from '@/components/SearchInput';
import { Donut, BarChart, LineChart, RankedBars } from '@/components/charts';
import { formatNumber, formatPercent, formatDate } from '@/lib/format';
import { friendlyError } from '@/lib/errors';
import { useAuth } from '@/features/auth/AuthProvider';
import { downloadHrTemplate } from '@/features/excel/templates';
import { fetchHrRows, buildHrOverview, type HrRow } from './queries';
import {
  createHrEntry, updateHrEntry, deleteHrEntry, HR_DEPARTMENTS, type HrEdit
} from './mutations';

const today = (): string => new Date().toISOString().slice(0, 10);

const BLANK: HrEdit = {
  work_date: today(), department: 'Factory',
  direct_carder: 0, indirect_carder: 0, present: 0, absent: 0, on_leave: 0, remarks: ''
};

/**
 * Manpower and attendance. Two questions, in the order HR is asked them: how many
 * people the factory carries — split direct against indirect, because the ratio
 * is the thing being managed — and how many of them turned up today, over the
 * last seven days, and month by month.
 */
export function HRPage() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';

  const rows = useQuery({ queryKey: ['hr', 'rows'], queryFn: fetchHrRows });
  const [term, setTerm] = useSearchTerm();
  const [editing, setEditing] = useState<{ row: HrRow | null } | null>(null);
  const [removing, setRemoving] = useState<HrRow | null>(null);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['hr'] });
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const save = useMutation({
    mutationFn: ({ id, patch }: { id: string | null; patch: HrEdit }) =>
      (id ? updateHrEntry(id, patch, profile?.id ?? null) : createHrEntry(patch, profile?.id ?? null)),
    onSuccess: () => { refresh(); setEditing(null); }
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteHrEntry(id),
    onSuccess: () => { refresh(); setRemoving(null); }
  });

  const all = rows.data ?? [];
  const overview = buildHrOverview(all);
  const searchable = useCallback(
    (r: HrRow) => `${r.work_date} ${r.department} ${r.remarks ?? ''}`, []
  );
  const shown = useSearch(all, term, searchable);
  const latest = overview.latest;

  return (
    <>
      {isAdmin && (
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 260px', minWidth: 0 }}>
            <SearchInput value={term} onChange={setTerm}
              placeholder="Search by date, department or note"
              count={{ shown: shown.length, total: all.length }} />
          </div>
          <button type="button" className="btn btn--secondary" style={{ flex: 'none' }}
            onClick={() => void downloadHrTemplate()}
            title="A blank attendance workbook laid out the way the importer expects">
            Excel template
          </button>
          <Link to="/admin/upload" className="btn btn--secondary" style={{ flex: 'none', textDecoration: 'none' }}>
            Upload sheet
          </Link>
          <button type="button" className="btn btn--primary" style={{ flex: 'none' }}
            onClick={() => setEditing({ row: null })}>
            + Add day
          </button>
        </div>
      )}

      {remove.error && <p className="banner banner--error">{friendlyError(remove.error)}</p>}

      <QueryState
        isLoading={rows.isLoading}
        error={rows.error}
        isEmpty={all.length === 0}
        emptyTitle="No attendance recorded yet"
        emptyBody={isAdmin
          ? 'Two ways in: upload an attendance workbook on the Upload Excel screen — any sheet with date, carder, present and absent columns is recognised — or use “Add day” to type one in. Everything on this screen is derived from those entries.'
          : 'Manpower figures appear once an administrator records a day.'}
      >
        <div className="grid grid--kpi">
          <Kpi index={0} label="Direct carder" icon="🧵" tone="blue"
            value={formatNumber(latest?.direct ?? 0)}
            sub={latest ? 'on ' + formatDate(latest.date) : ''} />
          <Kpi index={1} label="Indirect carder" icon="🛠️" tone="purple"
            value={formatNumber(latest?.indirect ?? 0)}
            sub="support and staff" />
          <Kpi index={2} label="Total manpower" icon="👥" tone="cyan"
            value={formatNumber(latest?.carder ?? 0)}
            sub={formatNumber(latest?.present ?? 0) + ' present'} />
          <Kpi index={3} label="Absenteeism" icon="📉"
            tone={(latest?.absenteeism ?? 0) >= 10 ? 'red' : (latest?.absenteeism ?? 0) >= 5 ? 'amber' : 'green'}
            value={formatPercent(latest?.absenteeism ?? 0)}
            sub={formatNumber(latest?.absent ?? 0) + ' absent, ' + formatNumber(latest?.leave ?? 0) + ' on leave'} />
        </div>

        <div className="grid grid--split" style={{ marginTop: 16 }}>
          <Card title="Absenteeism — last 7 recorded days"
            aside={<span style={{ fontSize: 12, color: 'var(--text-faint)' }}>
              absent ÷ total carder
            </span>}>
            <LineChart
              domain="percent"
              area
              height={210}
              threshold={{ value: 5, label: '5% tolerance' }}
              format={(n) => n.toFixed(1) + '%'}
              points={overview.week.map((d) => ({
                label: formatDate(d.date).slice(0, 6),
                values: { rate: d.absenteeism }
              }))}
              series={[{ key: 'rate', label: 'Absenteeism', color: 'var(--chart-2)' }]}
              empty="Record two or more days to see the trend."
            />
          </Card>

          <Card title="Carder split"
            aside={latest ? <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>
              {formatDate(latest.date)}
            </span> : null}>
            <Donut
              size={162}
              centerLabel="total carder"
              slices={[
                { label: 'Direct', value: latest?.direct ?? 0, color: 'var(--chart-1)' },
                { label: 'Indirect', value: latest?.indirect ?? 0, color: 'var(--chart-3)' }
              ]}
              empty="No headcount recorded for the latest day."
            />
          </Card>
        </div>

        <div className="grid grid--split-rev" style={{ marginTop: 16 }}>
          <Card title="Present against absent — by department"
            aside={latest ? <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>
              {formatDate(latest.date)}
            </span> : null}>
            <BarChart
              height={215}
              data={overview.departments.map((d) => ({
                label: d.department,
                values: { present: d.present, absent: d.absent }
              }))}
              series={[
                { key: 'present', label: 'Present', color: 'var(--chart-1)' },
                { key: 'absent', label: 'Absent', color: 'var(--chart-2)' }
              ]}
              empty="No department entries for the latest day."
            />
            <div style={{ marginTop: 16 }}>
              <RankedBars
                rows={overview.departments.map((d) => ({
                  label: d.department,
                  value: d.absenteeism,
                  suffix: formatPercent(d.absenteeism),
                  color: d.absenteeism >= 10 ? 'var(--red-500)' : 'var(--chart-4)',
                  hint: `${formatNumber(d.absent)} absent of ${formatNumber(d.direct + d.indirect)}`
                }))}
                max={Math.max(10, ...overview.departments.map((d) => d.absenteeism))}
                empty="Absenteeism by department appears once a day is recorded."
              />
            </div>
          </Card>

          <Card title="Monthly absenteeism">
            <BarChart
              height={215}
              format={(n) => n.toFixed(1) + '%'}
              data={overview.months.map((m) => ({
                label: m.label,
                values: { rate: m.absenteeism }
              }))}
              series={[{ key: 'rate', label: 'Absenteeism %', color: 'var(--chart-5)' }]}
              empty="Month figures appear once a full month has been recorded."
            />
            <p style={{ margin: '14px 0 0', fontSize: 11.5, color: 'var(--text-faint)', lineHeight: 1.6 }}>
              Each month is its own total: every absence in the month over every man-day
              carried in it, so a short month is not flattered by having fewer days.
            </p>
          </Card>
        </div>

        <Card title="Recorded days" style={{ marginTop: 16 }}
          aside={<span style={{ fontSize: 12, color: 'var(--text-faint)' }}>
            newest first
          </span>}>
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th><th>Department</th>
                  <th className="num">Direct</th><th className="num">Indirect</th>
                  <th className="num">Present</th><th className="num">Absent</th>
                  <th className="num">Leave</th><th className="num">Absenteeism</th>
                  {isAdmin && <th />}
                </tr>
              </thead>
              <tbody>
                {shown.slice(0, 60).map((r) => {
                  const carder = r.direct_carder + r.indirect_carder;
                  const pct = carder > 0 ? (r.absent / carder) * 100 : 0;
                  return (
                    <tr key={r.id}>
                      <td style={{ whiteSpace: 'nowrap' }}>{formatDate(r.work_date)}</td>
                      <td>{r.department}</td>
                      <td className="num">{formatNumber(r.direct_carder)}</td>
                      <td className="num">{formatNumber(r.indirect_carder)}</td>
                      <td className="num">{formatNumber(r.present)}</td>
                      <td className="num">{formatNumber(r.absent)}</td>
                      <td className="num">{formatNumber(r.on_leave)}</td>
                      <td className="num" style={{
                        fontWeight: 600,
                        color: pct >= 10 ? 'var(--red-500)' : pct >= 5 ? 'var(--amber-500)' : 'var(--green-500)'
                      }}>{formatPercent(pct)}</td>
                      {isAdmin && (
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
          {shown.length === 0 && (
            <p style={{ margin: '12px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
              No recorded day matches “{term}”. The figures above still cover every entry.
            </p>
          )}
          {shown.length > 60 && (
            <p style={{ margin: '12px 0 0', fontSize: 12, color: 'var(--text-faint)' }}>
              Showing the 60 most recent of {shown.length} matching entries — narrow the search to see older days.
            </p>
          )}
        </Card>
      </QueryState>

      {editing && (
        <EditDay
          row={editing.row}
          saving={save.isPending}
          error={save.error ? friendlyError(save.error) : undefined}
          onCancel={() => { save.reset(); setEditing(null); }}
          onSave={(patch) => save.mutate({ id: editing.row?.id ?? null, patch })}
        />
      )}

      {removing && (
        <Modal
          title="Delete attendance entry"
          onClose={() => { remove.reset(); setRemoving(null); }}
          error={remove.error ? friendlyError(remove.error) : undefined}
          actions={
            <>
              <button type="button" className="btn btn--secondary"
                onClick={() => { remove.reset(); setRemoving(null); }}>Cancel</button>
              <button type="button" className="btn btn--danger" disabled={remove.isPending}
                onClick={() => remove.mutate(removing.id)}>
                {remove.isPending ? 'Deleting…' : 'Delete entry'}
              </button>
            </>
          }
        >
          <p style={{ margin: 0, fontSize: 14 }}>
            Delete the <strong>{removing.department}</strong> entry for{' '}
            <strong>{formatDate(removing.work_date)}</strong>? Every absenteeism figure that
            includes that day will change.
          </p>
        </Modal>
      )}
    </>
  );
}

function EditDay({ row, saving, error, onCancel, onSave }: {
  row: HrRow | null;
  saving: boolean;
  error?: string | undefined;
  onCancel: () => void;
  onSave: (patch: HrEdit) => void;
}) {
  const [form, setForm] = useState<HrEdit>(() => row
    ? {
        work_date: row.work_date, department: row.department,
        direct_carder: row.direct_carder, indirect_carder: row.indirect_carder,
        present: row.present, absent: row.absent, on_leave: row.on_leave,
        remarks: row.remarks ?? ''
      }
    : BLANK);

  const set = <K extends keyof HrEdit>(k: K, v: HrEdit[K]) => setForm((f) => ({ ...f, [k]: v }));
  const carder = form.direct_carder + form.indirect_carder;
  const accounted = form.present + form.absent + form.on_leave;
  const valid = form.work_date !== '' && carder > 0;

  return (
    <Modal
      title={row ? `Edit ${row.department} · ${formatDate(row.work_date)}` : 'Record a day'}
      onClose={onCancel}
      error={error}
      actions={
        <>
          <button type="button" className="btn btn--secondary" onClick={onCancel}>Cancel</button>
          <button type="button" className="btn btn--primary" disabled={!valid || saving}
            onClick={() => onSave(form)}>
            {saving ? 'Saving…' : row ? 'Save changes' : 'Add entry'}
          </button>
        </>
      }
    >
      <Field label="Date">
        <input className="input" type="date" value={form.work_date}
          onChange={(e) => set('work_date', e.target.value)} />
      </Field>

      <Field label="Department" hint="One entry per department per day.">
        <input className="input" list="hr-departments" value={form.department}
          onChange={(e) => set('department', e.target.value)} />
        <datalist id="hr-departments">
          {HR_DEPARTMENTS.map((d) => <option key={d} value={d} />)}
        </datalist>
      </Field>

      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="Direct carder" hint="On the line, producing.">
          <input className="input" type="number" min={0} value={form.direct_carder}
            onChange={(e) => set('direct_carder', Number(e.target.value))} />
        </Field>
        <Field label="Indirect carder" hint="Support, quality, stores.">
          <input className="input" type="number" min={0} value={form.indirect_carder}
            onChange={(e) => set('indirect_carder', Number(e.target.value))} />
        </Field>
        <Field label="Present">
          <input className="input" type="number" min={0} value={form.present}
            onChange={(e) => set('present', Number(e.target.value))} />
        </Field>
        <Field label="Absent">
          <input className="input" type="number" min={0} value={form.absent}
            onChange={(e) => set('absent', Number(e.target.value))} />
        </Field>
        <Field label="On leave">
          <input className="input" type="number" min={0} value={form.on_leave}
            onChange={(e) => set('on_leave', Number(e.target.value))} />
        </Field>
      </div>

      <Field label="Note">
        <input className="input" value={form.remarks} placeholder="Optional"
          onChange={(e) => set('remarks', e.target.value)} />
      </Field>

      {/* A warning rather than a block: a real day can legitimately not add up
          while the shift is still being counted, and refusing to save would send
          the figure back to a notebook. */}
      {carder > 0 && accounted > carder && (
        <p className="banner banner--warning" style={{ margin: 0 }}>
          Present, absent and on leave add up to {formatNumber(accounted)}, which is more than
          the {formatNumber(carder)} carder entered above. It will save, but the absenteeism
          percentage will read oddly until the figures agree.
        </p>
      )}
    </Modal>
  );
}
