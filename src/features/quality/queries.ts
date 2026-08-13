import { supabase } from '@/lib/supabase';
import type { QualityReportKind, QualityStage } from './types';

export interface QualityUploadRow {
  id: string;
  original_filename: string;
  report_kind: QualityReportKind;
  sheet_names: string[];
  period_start: string | null;
  period_end: string | null;
  inspection_rows: number;
  defect_rows: number;
  created_at: string;
  profiles?: { full_name: string } | null;
}

/**
 * Quality reports live in their own tables, so the production upload screens do
 * not see them. RLS still decides the rows: an admin gets everything, an employee
 * only their own.
 */
export async function fetchQualityUploads(): Promise<QualityUploadRow[]> {
  const { data, error } = await supabase
    .from('quality_uploads')
    .select('id,original_filename,report_kind,sheet_names,period_start,period_end,' +
            'inspection_rows,defect_rows,created_at,' +
            'profiles!quality_uploads_uploaded_by_fkey ( full_name )')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as QualityUploadRow[];
}

export interface StageStat { stage: QualityStage; checked: number; defects: number; passPct: number | null; }
export interface LineStat { key: string; label: string; checked: number; defects: number; passPct: number | null; }
export interface TrendPoint { date: string; checked: number; defects: number; passPct: number; }
export interface DefectStat { category: string; qty: number; }

export interface QualityOverview {
  hasData: boolean;
  /**
   * Daily and monthly rows describe the same inspections at two grains, so the
   * totals are taken from one grain only. Mixing them would count every piece
   * twice and quietly halve the reported pass rate.
   */
  basis: 'daily' | 'monthly';
  checked: number;
  defects: number;
  passPct: number | null;
  periodFrom: string | null;
  periodTo: string | null;
  stages: StageStat[];
  lines: LineStat[];
  trend: TrendPoint[];
  defectCategories: DefectStat[];
}

/**
 * Removing the upload row cascades to its inspection and defect rows, so the
 * dashboard figures fall back to what the remaining reports say. Only an admin
 * gets past RLS here (q_uploads_admin); an employee's delete matches no rows.
 */
export async function deleteQualityUpload(id: string) {
  const { error } = await supabase.from('quality_uploads').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export interface LineQuality {
  checked: number;
  defects: number;
  passPct: number | null;
  lastSeen: string | null;
  stages: number;
}

/**
 * Quality figures keyed by the line number printed on the sheet, so a screen built
 * around production_lines can show what a line's inspections say even when no
 * production output has ever been recorded for it.
 */
export async function fetchQualityByLine(): Promise<Record<number, LineQuality>> {
  const { data, error } = await supabase
    .from('quality_inspections')
    .select('line_no,stage,checked_qty,pass_qty,defect_qty,inspection_date,period_month')
    .eq('is_factory', false)
    .not('line_no', 'is', null)
    .limit(5000);
  if (error) throw new Error(error.message);

  const out: Record<number, LineQuality & { _stages: Set<string> }> = {};
  for (const r of (data ?? []) as (InspectionRow & { line_no: number })[]) {
    const c = r.checked_qty ?? 0;
    if (c <= 0) continue;
    const d = r.defect_qty ?? (r.pass_qty != null ? c - r.pass_qty : 0);
    const seen = r.inspection_date ?? r.period_month;

    const acc = out[r.line_no] ?? { checked: 0, defects: 0, passPct: null, lastSeen: null, stages: 0, _stages: new Set<string>() };
    acc.checked += c;
    acc.defects += d;
    acc._stages.add(r.stage);
    if (seen && (!acc.lastSeen || seen > acc.lastSeen)) acc.lastSeen = seen;
    out[r.line_no] = acc;
  }

  const final: Record<number, LineQuality> = {};
  for (const [k, v] of Object.entries(out)) {
    final[Number(k)] = {
      checked: v.checked,
      defects: v.defects,
      passPct: rate(v.checked, v.defects),
      lastSeen: v.lastSeen,
      stages: v._stages.size
    };
  }
  return final;
}

interface InspectionRow {
  line_no: number | null;
  line_label: string | null;
  inspection_date: string | null;
  period_month: string | null;
  stage: QualityStage;
  checked_qty: number | null;
  pass_qty: number | null;
  defect_qty: number | null;
  pass_pct: number | null;
}

interface DefectRow {
  line_no: number | null;
  line_label: string | null;
  is_factory: boolean;
  inspection_date: string | null;
  period_month: string | null;
  category: string;
  qty: number | null;
}

export type QualityBasis = 'daily' | 'monthly';

export interface QualityRecords {
  inspections: InspectionRow[];
  defects: DefectRow[];
}

/**
 * Every inspection and defect row the caller may see, fetched once.
 *
 * The Quality Management screen slices the same rows four ways — by basis, by
 * period, by line and by stage — and each slice has to agree with the others.
 * One fetch and pure functions over the result is the only arrangement where
 * that is true by construction rather than by four queries happening to match.
 */
export async function fetchQualityRecords(): Promise<QualityRecords> {
  const [{ data: insData, error: insError }, { data: defData, error: defError }] = await Promise.all([
    supabase
      .from('quality_inspections')
      .select('line_no,line_label,inspection_date,period_month,stage,checked_qty,pass_qty,defect_qty,pass_pct')
      .eq('is_factory', false)
      .order('inspection_date', { ascending: false })
      .limit(5000),
    supabase
      .from('quality_defects')
      .select('line_no,line_label,is_factory,inspection_date,period_month,category,qty')
      .limit(5000)
  ]);
  if (insError) throw new Error(insError.message);
  if (defError) throw new Error(defError.message);

  return {
    inspections: (insData ?? []) as InspectionRow[],
    defects: (defData ?? []) as DefectRow[]
  };
}

export interface StageCell {
  checked: number;
  defects: number;
  passPct: number | null;
}

export type FinalStatus = 'passed' | 'below' | 'not_inspected';

export interface LineQualityRow {
  key: string;
  label: string;
  lineNo: number | null;
  stages: Partial<Record<QualityStage, StageCell>>;
  checked: number;
  defects: number;
  /** Defects found for every hundred pieces checked — the inverse of pass rate. */
  rejectionPct: number | null;
  finalPassPct: number | null;
  finalStatus: FinalStatus;
}

export interface QualityMatrix {
  hasData: boolean;
  basis: QualityBasis;
  /** Every period available on this basis, newest first. */
  periods: string[];
  /** null means every period at once. */
  period: string | null;
  checked: number;
  defects: number;
  passPct: number | null;
  rejectionPct: number | null;
  aqlPassPct: number | null;
  lines: LineQualityRow[];
  stages: StageStat[];
  topDefects: DefectStat[];
  /** Defect quantities per line for the top categories, keyed by line label. */
  defectsByLine: { label: string; byCategory: Record<string, number> }[];
  trend: TrendPoint[];
}

const periodOf = (r: { inspection_date: string | null; period_month: string | null }, basis: QualityBasis) =>
  basis === 'daily' ? r.inspection_date : r.period_month;

/**
 * The line-wise view the client asked for, on one basis and one period.
 *
 * Daily and monthly rows describe the same inspections at two grains, so they are
 * never mixed: a monthly summary and the days inside it would count every piece
 * twice and halve every pass rate on screen.
 */
export function buildQualityMatrix(
  data: QualityRecords,
  basis: QualityBasis,
  period: string | null,
  threshold: number
): QualityMatrix {
  const dated = data.inspections.filter((r) => periodOf(r, basis) != null);
  const periods = [...new Set(dated.map((r) => periodOf(r, basis)!))].sort((a, b) => b.localeCompare(a));
  const active = period && periods.includes(period) ? period : null;
  const rows = active ? dated.filter((r) => periodOf(r, basis) === active) : dated;

  let checked = 0;
  let defects = 0;
  const stageMap = new Map<QualityStage, { checked: number; defects: number }>();
  const lineMap = new Map<string, LineQualityRow>();
  const periodMap = new Map<string, { checked: number; defects: number }>();

  for (const r of rows) {
    const c = r.checked_qty ?? 0;
    if (c <= 0) continue;
    // pass_qty is filled in far more often than defect_qty on the KPI sheets.
    const d = r.defect_qty ?? (r.pass_qty != null ? c - r.pass_qty : 0);

    checked += c;
    defects += d;

    const st = stageMap.get(r.stage) ?? { checked: 0, defects: 0 };
    stageMap.set(r.stage, { checked: st.checked + c, defects: st.defects + d });

    const key = r.line_no != null ? String(r.line_no) : (r.line_label ?? '—');
    const line = lineMap.get(key) ?? {
      key, label: r.line_label ?? `Line ${key}`, lineNo: r.line_no,
      stages: {}, checked: 0, defects: 0, rejectionPct: null,
      finalPassPct: null, finalStatus: 'not_inspected' as FinalStatus
    };
    const cell = line.stages[r.stage] ?? { checked: 0, defects: 0, passPct: null };
    cell.checked += c;
    cell.defects += d;
    line.stages[r.stage] = cell;
    line.checked += c;
    line.defects += d;
    lineMap.set(key, line);

    const p = periodOf(r, basis)!;
    const bucket = periodMap.get(p) ?? { checked: 0, defects: 0 };
    periodMap.set(p, { checked: bucket.checked + c, defects: bucket.defects + d });
  }

  const lines = [...lineMap.values()].map((line) => {
    for (const cell of Object.values(line.stages)) {
      cell.passPct = rate(cell.checked, cell.defects);
    }
    // Final inspection is the last gate before the goods leave, so it gets its
    // own verdict rather than being averaged into the line's overall pass rate.
    const final = line.stages.final;
    const finalPassPct = final ? rate(final.checked, final.defects) : null;
    return {
      ...line,
      rejectionPct: line.checked > 0
        ? Math.round((line.defects / line.checked) * 10_000) / 100
        : null,
      finalPassPct,
      finalStatus: (finalPassPct == null
        ? 'not_inspected'
        : finalPassPct >= threshold ? 'passed' : 'below') as FinalStatus
    };
  }).sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));

  // Defect rows follow the same period rule. The monthly summaries record their
  // categories at factory level, so excluding roll-ups there leaves nothing —
  // per-line rows are preferred and factory rows are the fallback, never both.
  const defectRows = data.defects.filter((d) => {
    const p = periodOf(d, basis);
    if (p == null) return false;
    return active ? p === active : true;
  });
  const perLine = defectRows.filter((d) => !d.is_factory);
  const chosen = perLine.length > 0 ? perLine : defectRows;

  const catTotals = new Map<string, number>();
  for (const d of chosen) catTotals.set(d.category, (catTotals.get(d.category) ?? 0) + (d.qty ?? 0));
  const topDefects = [...catTotals.entries()]
    .map(([category, qty]) => ({ category, qty }))
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 5);

  const topNames = new Set(topDefects.map((d) => d.category));
  const byLine = new Map<string, Record<string, number>>();
  for (const d of perLine) {
    if (!topNames.has(d.category)) continue;
    const label = d.line_label ?? (d.line_no != null ? `Line ${d.line_no}` : '—');
    const bucket = byLine.get(label) ?? {};
    bucket[d.category] = (bucket[d.category] ?? 0) + (d.qty ?? 0);
    byLine.set(label, bucket);
  }

  const aql = stageMap.get('aql');

  return {
    hasData: rows.length > 0,
    basis,
    periods,
    period: active,
    checked,
    defects,
    passPct: rate(checked, defects),
    rejectionPct: checked > 0 ? Math.round((defects / checked) * 10_000) / 100 : null,
    aqlPassPct: aql ? rate(aql.checked, aql.defects) : null,
    lines,
    stages: [...stageMap.entries()]
      .map(([stage, v]) => ({ stage, checked: v.checked, defects: v.defects, passPct: rate(v.checked, v.defects) }))
      .sort((a, b) => b.checked - a.checked),
    topDefects,
    defectsByLine: [...byLine.entries()]
      .map(([label, byCategory]) => ({ label, byCategory }))
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true })),
    trend: [...periodMap.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, v]) => ({
        date, checked: v.checked, defects: v.defects, passPct: rate(v.checked, v.defects) ?? 0
      }))
  };
}

const rate = (checked: number, defects: number): number | null =>
  checked > 0 ? Math.round(((checked - defects) / checked) * 10_000) / 100 : null;

/**
 * The Factory rows on every sheet are roll-ups of the line rows beside them, so
 * they are excluded here rather than summed alongside their own components.
 */
export async function fetchQualityOverview(): Promise<QualityOverview> {
  const [{ data: insData, error: insError }, { data: defData, error: defError }] = await Promise.all([
    supabase
      .from('quality_inspections')
      .select('line_no,line_label,inspection_date,period_month,stage,checked_qty,pass_qty,defect_qty,pass_pct')
      .eq('is_factory', false)
      .order('inspection_date', { ascending: false })
      .limit(5000),
    supabase
      .from('quality_defects')
      .select('category,qty,is_factory')
      .limit(5000)
  ]);

  if (insError) throw new Error(insError.message);
  if (defError) throw new Error(defError.message);

  const all = (insData ?? []) as InspectionRow[];
  const daily = all.filter((r) => r.inspection_date);
  const monthly = all.filter((r) => !r.inspection_date && r.period_month);

  const basis: 'daily' | 'monthly' = daily.length > 0 ? 'daily' : 'monthly';
  const rows = basis === 'daily' ? daily : monthly;
  const dateOf = (r: InspectionRow) => (basis === 'daily' ? r.inspection_date! : r.period_month!);

  let checked = 0;
  let defects = 0;
  const stageMap = new Map<QualityStage, { checked: number; defects: number }>();
  const lineMap = new Map<string, { label: string; checked: number; defects: number }>();
  const dayMap = new Map<string, { checked: number; defects: number }>();

  for (const r of rows) {
    const c = r.checked_qty ?? 0;
    // pass_qty is present more often than defect_qty on the KPI sheets.
    const d = r.defect_qty ?? (r.pass_qty != null ? c - r.pass_qty : 0);
    if (c <= 0) continue;

    checked += c;
    defects += d;

    const st = stageMap.get(r.stage) ?? { checked: 0, defects: 0 };
    stageMap.set(r.stage, { checked: st.checked + c, defects: st.defects + d });

    const key = r.line_no != null ? String(r.line_no) : (r.line_label ?? '—');
    const ln = lineMap.get(key) ?? { label: r.line_label ?? `Line ${key}`, checked: 0, defects: 0 };
    lineMap.set(key, { label: ln.label, checked: ln.checked + c, defects: ln.defects + d });

    const day = dateOf(r);
    const dy = dayMap.get(day) ?? { checked: 0, defects: 0 };
    dayMap.set(day, { checked: dy.checked + c, defects: dy.defects + d });
  }

  // Defect rows follow the same roll-up rule, but the monthly summaries record
  // everything at factory level -- excluding those would leave nothing at all.
  const defRows = (defData ?? []) as { category: string; qty: number; is_factory: boolean }[];
  const perLine = defRows.filter((d) => !d.is_factory);
  const chosen = perLine.length > 0 ? perLine : defRows;
  const catMap = new Map<string, number>();
  for (const d of chosen) catMap.set(d.category, (catMap.get(d.category) ?? 0) + (d.qty ?? 0));

  const days = [...dayMap.keys()].sort();

  return {
    hasData: rows.length > 0,
    basis,
    checked,
    defects,
    passPct: rate(checked, defects),
    periodFrom: days[0] ?? null,
    periodTo: days[days.length - 1] ?? null,
    stages: [...stageMap.entries()]
      .map(([stage, v]) => ({ stage, checked: v.checked, defects: v.defects, passPct: rate(v.checked, v.defects) }))
      .sort((a, b) => b.checked - a.checked),
    lines: [...lineMap.entries()]
      .map(([key, v]) => ({ key, label: v.label, checked: v.checked, defects: v.defects, passPct: rate(v.checked, v.defects) }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    trend: days.map((date) => {
      const v = dayMap.get(date)!;
      return { date, checked: v.checked, defects: v.defects, passPct: rate(v.checked, v.defects) ?? 0 };
    }),
    defectCategories: [...catMap.entries()]
      .map(([category, qty]) => ({ category, qty }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 8)
  };
}
