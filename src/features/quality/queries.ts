import { supabase } from '@/lib/supabase';
import { STAGE_LABEL } from './types';
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
export interface LineStat {
  key: string; lineNo: number | null; label: string;
  checked: number; defects: number; passPct: number | null;
}
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

/**
 * Rows for a stage the app no longer reports on are dropped on the way in. Pre
 * final was removed at the client's request, and a database imported before that
 * still holds its rows; left alone they would keep turning up in the pieces
 * checked, the defect count and the stage chart, which is the opposite of
 * removing the stage. `0010_drop_pre_final.sql` deletes them for good — this
 * guard is what keeps the screens right until that migration is applied.
 */
const reportable = (rows: InspectionRow[]): InspectionRow[] =>
  rows.filter((r) => r.stage in STAGE_LABEL);

export type QualityBasis = 'daily' | 'monthly';

/** A line the factory has, whether or not any report has measured it yet. */
export interface QualityLineRef {
  lineNo: number;
  label: string;
}

/**
 * A line named "LINE 04" by the importer is shown the way the reports write it,
 * while a name an admin typed is kept exactly as they typed it — renaming a line
 * on the Lines screen should be visible here rather than being overwritten.
 */
const lineLabel = (lineNo: number, name: string | null): string => {
  const trimmed = name?.trim();
  if (trimmed && !/^line\s*0*\d+$/i.test(trimmed)) return trimmed;
  return `Line ${String(lineNo).padStart(2, '0')}`;
};

/**
 * The pre-shipment final inspection, which is filed per month at factory level
 * rather than per line — one audit covers the styles shipping that month, not
 * the sewing line that made them.
 */
export interface FinalInspectionRow {
  period_month: string | null;
  checked_qty: number | null;
  defect_qty: number | null;
  pass_pct: number | null;
  defect_pct: number | null;
}

export interface QualityRecords {
  inspections: InspectionRow[];
  defects: DefectRow[];
  /** The roster, so a line with no inspections is still shown as a line. */
  lines: QualityLineRef[];
  finals: FinalInspectionRow[];
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
  const [
    { data: insData, error: insError },
    { data: defData, error: defError },
    { data: lineData, error: lineError },
    { data: finalData, error: finalError }
  ] = await Promise.all([
    supabase
      .from('quality_inspections')
      .select('line_no,line_label,inspection_date,period_month,stage,checked_qty,pass_qty,defect_qty,pass_pct')
      .eq('is_factory', false)
      .order('inspection_date', { ascending: false })
      .limit(5000),
    supabase
      .from('quality_defects')
      .select('line_no,line_label,is_factory,inspection_date,period_month,category,qty')
      .limit(5000),
    // The roster the factory actually runs. A line the reports have not measured
    // yet has no inspection row to be inferred from, and inferring the line list
    // from the figures is what hid LINE 04 while the other three were charted.
    supabase
      .from('production_lines')
      .select('line_number,line_name')
      .eq('active', true)
      .order('line_number'),
    // Final inspection is the only stage filed at factory level, so it is the one
    // place the is_factory exclusion above would throw away real data rather than
    // a roll-up of rows already counted.
    supabase
      .from('quality_inspections')
      .select('period_month,checked_qty,defect_qty,pass_pct,defect_pct')
      .eq('is_factory', true)
      .eq('stage', 'final')
      .order('period_month', { ascending: true })
      .limit(500)
  ]);
  if (insError) throw new Error(insError.message);
  if (defError) throw new Error(defError.message);
  if (lineError) throw new Error(lineError.message);
  if (finalError) throw new Error(finalError.message);

  return {
    inspections: reportable((insData ?? []) as InspectionRow[]),
    defects: (defData ?? []) as DefectRow[],
    lines: ((lineData ?? []) as { line_number: number; line_name: string | null }[])
      .filter((l) => l.line_number != null && l.line_number > 0)
      .map((l) => ({ lineNo: l.line_number, label: lineLabel(l.line_number, l.line_name) })),
    finals: (finalData ?? []) as FinalInspectionRow[]
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
  /**
   * True when the defect rows named their gate and the breakdown above was
   * narrowed to end line and appearance; false when the report named none and
   * every category it carried is shown instead.
   */
  defectsGated: boolean;
  /** Defect quantities per line for the top categories, in the same line order. */
  defectsByLine: { lineNo: number | null; label: string; byCategory: Record<string, number> }[];
  trend: TrendPoint[];
  /** The pre-shipment final inspection, which is filed per month, not per line. */
  finalInspection: FinalInspectionSummary;
}

export interface FinalInspectionMonth {
  month: string;
  /** Pieces pulled for the audit. */
  checked: number;
  defects: number;
  /**
   * The first-time pass rate as the report states it. It counts styles that
   * cleared the audit at the first attempt, not pieces, so it is never derived
   * from the two counts beside it and never averaged across months.
   */
  passPct: number | null;
}

export interface FinalInspectionSummary {
  hasData: boolean;
  months: FinalInspectionMonth[];
  /** The newest month carrying figures — the verdict the client reads first. */
  latest: FinalInspectionMonth | null;
  checked: number;
  defects: number;
  /** Defects per hundred pieces audited, across every month shown. */
  defectPct: number | null;
}

/**
 * The gates every piece passes on the sewing floor, and the only ones counted
 * into "pieces checked" and "defects".
 *
 * Final inspection and the AQL audit sample goods that were already counted at
 * these three gates, so adding them in counts the same garments twice and drags
 * the pass rate towards whatever the sample happened to say. Both still get their
 * own figures on screen — the stage breakdown, the AQL tile and the pre-shipment
 * card — they are simply not part of the floor totals.
 */
export const FLOOR_STAGES: QualityStage[] = ['in_line', 'end_line', 'appearance'];

/**
 * The gates whose defect categories are counted into the top-5 breakdown.
 *
 * In line is a running check on work still being sewn — the same piece is
 * corrected and passes again — so its category counts describe rework rather
 * than defects leaving the line. End line and appearance are the two gates that
 * judge finished work, which is what the client reads the chart for.
 */
export const DEFECT_STAGES: QualityStage[] = ['end_line', 'appearance'];

const onFloor = (stage: QualityStage): boolean => FLOOR_STAGES.includes(stage);

/**
 * The stage a defect category was counted at.
 *
 * The defect blocks on these sheets are two-tier: a banner naming one thing over
 * sub-columns naming the other, which the parser flattens to "Uncut Threads (End
 * Line)". The gate is therefore already written into the category, and reading it
 * back here means the breakdown can be filtered by gate without re-importing a
 * single workbook. A summary sheet that names no gate returns null.
 */
const STAGE_IN_CATEGORY: { stage: QualityStage; pattern: RegExp }[] = [
  { stage: 'end_line', pattern: /\bend[\s-]*line\b/i },
  { stage: 'appearance', pattern: /\bappearance\b/i },
  { stage: 'in_line', pattern: /\bin[\s-]*line\b/i },
  { stage: 'aql', pattern: /\baql\b/i },
  { stage: 'final', pattern: /\bfinal\b/i }
];

export function defectStage(category: string): QualityStage | null {
  return STAGE_IN_CATEGORY.find((s) => s.pattern.test(category))?.stage ?? null;
}

/**
 * The category without the gate that qualifies it, so "Uncut Threads (End Line)"
 * and "Uncut Threads (Appearance)" are one bar rather than two halves of one.
 *
 * Which half of the pair carries the gate depends on the typist: the daily block
 * banners the defect over "End Line"/"Appearance" sub-columns, while the appearance
 * summary banners the gate over the defect names. Removing the gate can therefore
 * leave the remainder wrapped in, or holding one half of, the brackets that used to
 * separate the two — so those are unwrapped here. Only unmatched brackets are
 * dropped: a category that genuinely reads "Fabric (Knit)" keeps its own.
 */
export function defectCategory(category: string): string {
  const stripped = STAGE_IN_CATEGORY
    .reduce((text, s) => text.replace(s.pattern, ''), category)
    .replace(/\(\s*\)/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  const tidy = trimDelimiters(unwrapParens(stripped));
  return tidy.length > 0 ? tidy : category.trim();
}

const trimDelimiters = (text: string): string =>
  text.replace(/^[\s\-–—/|]+/, '').replace(/[\s\-–—/|]+$/, '').trim();

const unwrapParens = (text: string): string => {
  const inner = /^\(([^()]+)\)$/.exec(text.trim());
  if (inner) return inner[1]!.trim();
  const opens = (text.match(/\(/g) ?? []).length;
  const closes = (text.match(/\)/g) ?? []).length;
  if (opens > closes && text.startsWith('(')) return text.slice(1).trim();
  if (closes > opens && text.endsWith(')')) return text.slice(0, -1).trim();
  return text;
};

const periodOf = (r: { inspection_date: string | null; period_month: string | null }, basis: QualityBasis) =>
  basis === 'daily' ? r.inspection_date : r.period_month;

/** Numbered lines in floor order; anything unnumbered (a stray label) sorts last. */
const byLineOrder = (a: { lineNo: number | null; label: string }, b: { lineNo: number | null; label: string }) => {
  if (a.lineNo != null && b.lineNo != null) return a.lineNo - b.lineNo;
  if (a.lineNo != null) return -1;
  if (b.lineNo != null) return 1;
  return a.label.localeCompare(b.label, undefined, { numeric: true });
};

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

  // The roster comes first so that a line the factory runs but did not inspect in
  // this period is still a row, reading "—" at every stage. Building the list from
  // the figures instead made an uninspected line indistinguishable from one that
  // does not exist, which is the opposite of what a quality screen is for.
  for (const ref of data.lines) {
    lineMap.set(String(ref.lineNo), {
      key: String(ref.lineNo), label: ref.label, lineNo: ref.lineNo,
      stages: {}, checked: 0, defects: 0, rejectionPct: null,
      finalPassPct: null, finalStatus: 'not_inspected'
    });
  }

  for (const r of rows) {
    const c = r.checked_qty ?? 0;
    if (c <= 0) continue;
    // pass_qty is filled in far more often than defect_qty on the KPI sheets.
    const d = r.defect_qty ?? (r.pass_qty != null ? c - r.pass_qty : 0);

    // Every stage keeps its own cell and its own tile; only the three floor gates
    // are added into the totals, the line totals and the trend.
    const counts = onFloor(r.stage);
    if (counts) {
      checked += c;
      defects += d;
    }

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
    if (counts) {
      line.checked += c;
      line.defects += d;
    }
    lineMap.set(key, line);

    if (counts) {
      const p = periodOf(r, basis)!;
      const bucket = periodMap.get(p) ?? { checked: 0, defects: 0 };
      periodMap.set(p, { checked: bucket.checked + c, defects: bucket.defects + d });
    }
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
  }).sort(byLineOrder);

  // Defect rows follow the same period rule. The monthly summaries record their
  // categories at factory level, so excluding roll-ups there leaves nothing —
  // per-line rows are preferred and factory rows are the fallback, never both.
  const defectRows = data.defects.filter((d) => {
    const p = periodOf(d, basis);
    if (p == null) return false;
    return active ? p === active : true;
  });

  // End line and appearance, on whichever basis is showing. A monthly second
  // summary is one column per category and names no gate at all; filtering that
  // to two gates would empty the panel, so a report that never names a gate is
  // charted whole and the caption says so.
  const namesGates = defectRows.some((d) => defectStage(d.category) != null);
  const scoped = namesGates
    ? defectRows.filter((d) => {
        const stage = defectStage(d.category);
        return stage != null && DEFECT_STAGES.includes(stage);
      })
    : defectRows;

  const perLine = scoped.filter((d) => !d.is_factory);
  const chosen = perLine.length > 0 ? perLine : scoped;

  const catTotals = new Map<string, number>();
  for (const d of chosen) {
    const name = defectCategory(d.category);
    catTotals.set(name, (catTotals.get(name) ?? 0) + (d.qty ?? 0));
  }
  const topDefects = [...catTotals.entries()]
    .map(([category, qty]) => ({ category, qty }))
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 5);

  // Keyed by line number, not by the label printed on the sheet, so this chart
  // carries the same lines in the same order as the pass-rate chart above it —
  // including the ones with nothing to stack.
  const topNames = new Set(topDefects.map((d) => d.category));
  const byLine = new Map<string, { lineNo: number | null; label: string; byCategory: Record<string, number> }>();
  for (const ref of data.lines) {
    byLine.set(String(ref.lineNo), { lineNo: ref.lineNo, label: ref.label, byCategory: {} });
  }
  for (const d of perLine) {
    const name = defectCategory(d.category);
    if (!topNames.has(name)) continue;
    const key = d.line_no != null ? String(d.line_no) : (d.line_label ?? '—');
    const entry = byLine.get(key) ?? {
      lineNo: d.line_no,
      label: d.line_label ?? (d.line_no != null ? `Line ${d.line_no}` : '—'),
      byCategory: {} as Record<string, number>
    };
    entry.byCategory[name] = (entry.byCategory[name] ?? 0) + (d.qty ?? 0);
    byLine.set(key, entry);
  }

  const aql = stageMap.get('aql');
  const finalInspection = buildFinalInspection(data.finals, basis === 'monthly' ? active : null);

  return {
    // A factory that files only the pre-shipment inspection report still has
    // quality data to show, so it does not get the "no reports yet" screen.
    hasData: rows.length > 0 || finalInspection.hasData,
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
    defectsGated: namesGates,
    finalInspection,
    defectsByLine: [...byLine.values()].sort(byLineOrder),
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
 * The pre-shipment final inspection, month by month.
 *
 * It is never folded into the line figures: one audit covers the styles shipping
 * that month rather than the line that sewed them, and adding a factory-level
 * audit to per-line stage totals would double-count the same garments. The daily
 * basis leaves the month filter off entirely — the report has no daily grain, and
 * hiding it on weekdays would make the screen look as if it did not exist.
 */
export function buildFinalInspection(
  rows: FinalInspectionRow[],
  month: string | null
): FinalInspectionSummary {
  const byMonth = new Map<string, { checked: number; defects: number; passPct: number | null }>();
  for (const r of rows) {
    if (!r.period_month) continue;
    if (month && r.period_month !== month) continue;
    const acc = byMonth.get(r.period_month) ?? { checked: 0, defects: 0, passPct: null };
    acc.checked += r.checked_qty ?? 0;
    acc.defects += r.defect_qty ?? 0;
    // Reported, not derived. A later report for the same month replaces the rate
    // rather than being averaged with it — two readings of one month are a
    // correction, not two samples.
    if (r.pass_pct != null) acc.passPct = r.pass_pct;
    byMonth.set(r.period_month, acc);
  }

  const months = [...byMonth.entries()]
    .map(([m, v]) => ({ month: m, checked: v.checked, defects: v.defects, passPct: v.passPct }))
    .sort((a, b) => a.month.localeCompare(b.month));

  const withFigures = months.filter((m) => m.checked > 0 || m.defects > 0 || m.passPct != null);
  const checked = months.reduce((sum, m) => sum + m.checked, 0);
  const defects = months.reduce((sum, m) => sum + m.defects, 0);

  return {
    hasData: withFigures.length > 0,
    months,
    latest: withFigures[withFigures.length - 1] ?? null,
    checked,
    defects,
    defectPct: checked > 0 ? Math.round((defects / checked) * 10_000) / 100 : null
  };
}

/**
 * The Factory rows on every sheet are roll-ups of the line rows beside them, so
 * they are excluded here rather than summed alongside their own components.
 */
export async function fetchQualityOverview(): Promise<QualityOverview> {
  const [
    { data: insData, error: insError },
    { data: defData, error: defError },
    { data: lineData, error: lineError }
  ] = await Promise.all([
    supabase
      .from('quality_inspections')
      .select('line_no,line_label,inspection_date,period_month,stage,checked_qty,pass_qty,defect_qty,pass_pct')
      .eq('is_factory', false)
      .order('inspection_date', { ascending: false })
      .limit(5000),
    supabase
      .from('quality_defects')
      .select('category,qty,is_factory')
      .limit(5000),
    supabase
      .from('production_lines')
      .select('line_number,line_name')
      .eq('active', true)
      .order('line_number')
  ]);

  if (insError) throw new Error(insError.message);
  if (defError) throw new Error(defError.message);
  if (lineError) throw new Error(lineError.message);

  const all = reportable((insData ?? []) as InspectionRow[]);
  const daily = all.filter((r) => r.inspection_date);
  const monthly = all.filter((r) => !r.inspection_date && r.period_month);

  const basis: 'daily' | 'monthly' = daily.length > 0 ? 'daily' : 'monthly';
  const rows = basis === 'daily' ? daily : monthly;
  const dateOf = (r: InspectionRow) => (basis === 'daily' ? r.inspection_date! : r.period_month!);

  let checked = 0;
  let defects = 0;
  const stageMap = new Map<QualityStage, { checked: number; defects: number }>();
  const lineMap = new Map<string, { lineNo: number | null; label: string; checked: number; defects: number }>();
  const dayMap = new Map<string, { checked: number; defects: number }>();

  // Same rule as the Quality Management screen: the roster decides which lines
  // exist, the reports decide what each one measured.
  for (const l of (lineData ?? []) as { line_number: number; line_name: string | null }[]) {
    if (l.line_number == null || l.line_number <= 0) continue;
    lineMap.set(String(l.line_number), {
      lineNo: l.line_number, label: lineLabel(l.line_number, l.line_name), checked: 0, defects: 0
    });
  }

  for (const r of rows) {
    const c = r.checked_qty ?? 0;
    // pass_qty is present more often than defect_qty on the KPI sheets.
    const d = r.defect_qty ?? (r.pass_qty != null ? c - r.pass_qty : 0);
    if (c <= 0) continue;

    // Same rule as the Quality Management screen: the three floor gates make up
    // the totals, and the sampled gates keep their own stage figures. Two screens
    // reporting different "pieces checked" for the same reports is a bug.
    const st = stageMap.get(r.stage) ?? { checked: 0, defects: 0 };
    stageMap.set(r.stage, { checked: st.checked + c, defects: st.defects + d });
    if (!onFloor(r.stage)) continue;

    checked += c;
    defects += d;

    const key = r.line_no != null ? String(r.line_no) : (r.line_label ?? '—');
    const ln = lineMap.get(key)
      ?? { lineNo: r.line_no, label: r.line_label ?? `Line ${key}`, checked: 0, defects: 0 };
    lineMap.set(key, { ...ln, checked: ln.checked + c, defects: ln.defects + d });

    const day = dateOf(r);
    const dy = dayMap.get(day) ?? { checked: 0, defects: 0 };
    dayMap.set(day, { checked: dy.checked + c, defects: dy.defects + d });
  }

  // Defect rows follow the same roll-up rule, but the monthly summaries record
  // everything at factory level -- excluding those would leave nothing at all.
  const defRows = (defData ?? []) as { category: string; qty: number; is_factory: boolean }[];
  const gatedRows = defRows.some((d) => defectStage(d.category) != null)
    ? defRows.filter((d) => {
        const stage = defectStage(d.category);
        return stage != null && DEFECT_STAGES.includes(stage);
      })
    : defRows;
  const perLine = gatedRows.filter((d) => !d.is_factory);
  const chosen = perLine.length > 0 ? perLine : gatedRows;
  const catMap = new Map<string, number>();
  for (const d of chosen) {
    const name = defectCategory(d.category);
    catMap.set(name, (catMap.get(name) ?? 0) + (d.qty ?? 0));
  }

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
      .map(([key, v]) => ({
        key, lineNo: v.lineNo, label: v.label,
        checked: v.checked, defects: v.defects, passPct: rate(v.checked, v.defects)
      }))
      .sort(byLineOrder),
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
