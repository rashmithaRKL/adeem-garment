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
