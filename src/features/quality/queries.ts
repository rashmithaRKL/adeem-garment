import { supabase } from '@/lib/supabase';
import { addMonths, monthEnd, monthStart, today as todayISO, weekStart, withinSpan } from './period';
import type { QualityRange, QualitySpan } from './period';
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

const PAGE_SIZE = 1000;

/**
 * Pages through every row a query matches rather than stopping at one page. A
 * flat .limit() silently drops whatever is oldest once a factory's history grows
 * past it — the screen then reads as "this is all there is" instead of "this
 * request only asked for so much", and the earliest-date arrows lock a month or
 * a year before the reports actually run out.
 */
async function fetchAllRows<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) return rows;
  }
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

/**
 * What a final-inspection figure counts. 'styles' where the final inspection
 * report's month tabs cover the window — one PASS or FAIL per style, the way the
 * factory's own first-time pass rate counts — and 'pieces' where only the FINAL
 * columns of the KPI and daily sheets do.
 */
export type FinalBasis = 'pieces' | 'styles';

export interface StageStat {
  stage: QualityStage;
  /** Styles inspected rather than pieces, when unit is 'styles'. */
  checked: number;
  /** Styles failed rather than defective pieces, when unit is 'styles'. */
  defects: number;
  passPct: number | null;
  /** Pieces unless said otherwise; only the final gate is ever counted in styles. */
  unit?: FinalBasis;
}
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
  upload_id: string;
  created_at: string;
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

/**
 * The grain a figure was read at. Daily and monthly rows describe the same
 * inspections twice over, so a window is answered from one grain or the other and
 * never from both — summing a monthly summary with the days inside it counts every
 * piece twice and halves the pass rate on screen.
 */
export type QualityGrain = 'daily' | 'monthly';

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
  upload_id: string;
  created_at: string;
  period_month: string | null;
  checked_qty: number | null;
  defect_qty: number | null;
  pass_pct: number | null;
  defect_pct: number | null;
}

/**
 * One style at the final inspection, off a month tab of the final inspection
 * report: the sample pulled, the major defects in it, and the PASS or FAIL it was
 * given. Dated twice — the day it was inspected, and the month of the tab it was
 * filed on.
 */
export interface FinalVerdictRow {
  upload_id: string;
  created_at: string;
  line_no: number | null;
  line_label: string | null;
  /** Further lines a style inspected for several lines together is credited to. */
  shared_lines: number[] | null;
  style_number: string | null;
  inspection_date: string | null;
  period_month: string | null;
  checked_qty: number | null;
  defect_qty: number | null;
  verdict: string | null;
}

export interface QualityRecords {
  inspections: InspectionRow[];
  defects: DefectRow[];
  /** The roster, so a line with no inspections is still shown as a line. */
  lines: QualityLineRef[];
  finals: FinalInspectionRow[];
  verdicts: FinalVerdictRow[];
}

interface Filing { upload_id: string; created_at: string; period_month: string | null; }

/**
 * Which upload answers for each month of the final inspection report.
 *
 * The factory keeps that report as one workbook for the whole year and uploads it
 * again as each month is added, so every upload repeats the months before it.
 * Read as additions, a re-upload counted those months twice — September's sample
 * doubled the day October was filed. So a month is answered by the newest upload
 * that carries it, and older copies of that month stand aside: a later report is
 * the factory's correction, not a second sample.
 *
 * An upload is dated by when its own rows landed rather than by quality_uploads,
 * which RLS shows only to its owner and to admins; these rows are readable by
 * anyone signed in, so every viewer settles on the same upload.
 */
function currentFilings(...groups: Filing[][]): (r: Filing) => boolean {
  const landed = new Map<string, number>();
  for (const rows of groups) {
    for (const r of rows) {
      const at = Date.parse(r.created_at);
      const seen = landed.get(r.upload_id);
      if (seen == null || at < seen) landed.set(r.upload_id, at);
    }
  }
  const owner = new Map<string, string>();
  for (const rows of groups) {
    for (const r of rows) {
      if (r.period_month == null) continue;
      const held = owner.get(r.period_month);
      if (held == null || landed.get(r.upload_id)! > landed.get(held)!) owner.set(r.period_month, r.upload_id);
    }
  }
  return (r) => {
    if (r.period_month == null) return true;
    const held = owner.get(r.period_month);
    return held == null || held === r.upload_id;
  };
}

/**
 * The final inspection report's own rows — the factory-wide Summary months and the
 * styles off its month tabs — with every month answered by one upload only.
 */
async function fetchFinalReport() {
  const [finals, verdicts] = await Promise.all([
    // Final inspection is the only stage filed at factory level, so it is the one
    // place the is_factory exclusion elsewhere would throw away real data rather
    // than a roll-up of rows already counted.
    fetchAllRows<FinalInspectionRow>((from, to) => supabase
      .from('quality_inspections')
      .select('upload_id,created_at,period_month,checked_qty,defect_qty,pass_pct,defect_pct')
      .eq('is_factory', true)
      .eq('stage', 'final')
      .order('period_month', { ascending: true })
      .order('id')
      .range(from, to)),
    fetchAllRows<FinalVerdictRow>((from, to) => supabase
      .from('quality_inspections')
      .select('upload_id,created_at,line_no,line_label,shared_lines,style_number,inspection_date,period_month,checked_qty,defect_qty,verdict')
      .not('verdict', 'is', null)
      .order('inspection_date', { ascending: true })
      .order('id')
      .range(from, to))
  ]);
  // A month the sheet had not reached when it was uploaded: no sample, no defects
  // and a 0 in the pass-rate column. Earlier imports kept these rows. Read as
  // figures they put a 0% first-time pass rate on an empty month, and as "a month
  // with figures" they made Monthly open on an empty November.
  const filed = finals.filter((r) => r.checked_qty || r.defect_qty || r.pass_pct || r.defect_pct != null);
  const isCurrent = currentFilings(filed, verdicts);
  return { finals: filed.filter(isCurrent), verdicts: verdicts.filter(isCurrent), isCurrent };
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
  const [insData, defData, { data: lineData, error: lineError }, report] = await Promise.all([
    fetchAllRows<InspectionRow>((from, to) => supabase
      .from('quality_inspections')
      .select('line_no,line_label,inspection_date,period_month,stage,checked_qty,pass_qty,defect_qty,pass_pct')
      .eq('is_factory', false)
      // The styles off the final inspection report's month tabs are read on their
      // own, as verdicts: their counts are a sample, not pieces through a gate.
      .is('verdict', null)
      .order('inspection_date', { ascending: false })
      .order('id')
      .range(from, to)),
    fetchAllRows<DefectRow>((from, to) => supabase
      .from('quality_defects')
      .select('upload_id,created_at,line_no,line_label,is_factory,inspection_date,period_month,category,qty')
      .order('id')
      .range(from, to)),
    // The roster the factory actually runs. A line the reports have not measured
    // yet has no inspection row to be inferred from, and inferring the line list
    // from the figures is what hid LINE 04 while the other three were charted.
    supabase
      .from('production_lines')
      .select('line_number,line_name')
      .eq('active', true)
      .order('line_number'),
    fetchFinalReport()
  ]);
  if (lineError) throw new Error(lineError.message);

  return {
    inspections: reportable(insData),
    // The final-inspection defects come from the same re-uploaded workbook as the
    // verdicts, so they stand aside for a newer upload on the same terms.
    defects: defData.filter((d) => defectStage(d.category) !== 'final' || report.isCurrent(d)),
    lines: ((lineData ?? []) as { line_number: number; line_name: string | null }[])
      .filter((l) => l.line_number != null && l.line_number > 0)
      .map((l) => ({ lineNo: l.line_number, label: lineLabel(l.line_number, l.line_name) })),
    finals: report.finals,
    verdicts: report.verdicts
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
  /** The window these figures cover. */
  span: QualitySpan;
  /** Which grain answered it — daily rows where they exist, monthly otherwise. */
  grain: QualityGrain;
  /**
   * True when the reports hold monthly summaries the current window cannot reach,
   * so an empty day or week can say where the figures actually are instead of
   * reading as a factory that inspected nothing.
   */
  hasMonthlySummaries: boolean;
  /** True when any daily report exists at all, anywhere in the history. */
  hasDailyReports: boolean;
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
  /**
   * Every category's total, the ones outside the top five included. The chart
   * shows five slices; this is what all of them together account for.
   */
  defectsCategorised: number;
  /**
   * Defects counted at the gates this breakdown covers — what the categories are
   * a breakdown *of*, and so what the chart has to add up to. The categories are
   * typed into a block of their own on the sheet, beside the gate columns rather
   * than derived from them, so the two can disagree; the chart shows the gap
   * instead of quietly totalling to less than the "Defects found" tile.
   */
  defectsAtBreakdownGates: number;
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
  /**
   * The defective share of the sample: the report's own "Defect %" where the
   * sheet fills it in, and defects over checked where it does not.
   */
  defectPct: number | null;
}

/** One line's final-inspection result over the selected window. */
export interface FinalLineStat {
  key: string;
  lineNo: number | null;
  label: string;
  /**
   * How many final inspections the reports record for this line — one per line
   * per day the gate was run, or one per style on the final inspection report —
   * not a piece count. This is the figure the client calls "no of inspections",
   * and it is deliberately separate from the pieces those inspections covered.
   */
  inspections: number;
  /** Pieces that went through the gate, or the pieces sampled from each style. */
  checked: number;
  /** Pieces on the 'pieces' basis; styles judged PASS or FAIL on the 'styles' one. */
  pass: number;
  fail: number;
  passPct: number | null;
  /** The exact complement of passPct, so the two always read to 100%. */
  failPct: number | null;
  status: FinalStatus;
}

/** One bucket of the final-inspection run: a day, or a month. */
export interface FinalPeriodPoint {
  date: string;
  inspections: number;
  checked: number;
  pass: number;
  fail: number;
  passPct: number | null;
}

/**
 * The pre-shipment audit from the monthly inspection report. It is kept apart
 * from the line figures above rather than added to them: one audit covers the
 * styles shipping that month, and its "1st time pass rate" counts styles that
 * cleared at the first attempt while the counts beside it are pieces. Summing a
 * styles rate with a piece rate produces a number that means nothing.
 */
export interface FinalAudit {
  hasData: boolean;
  months: FinalInspectionMonth[];
  /** The newest month carrying figures — the verdict the client reads first. */
  latest: FinalInspectionMonth | null;
  checked: number;
  defects: number;
  /** Defects per hundred pieces audited, across every month shown. */
  defectPct: number | null;
}

export interface FinalInspectionSummary {
  hasData: boolean;
  /** The window these figures cover — the same day, week or month as the page. */
  span: QualitySpan;
  /** Daily where the reports date the final gate by day, monthly otherwise. */
  grain: QualityGrain;
  /**
   * What pass and fail count over this window. The final inspection report is the
   * one that records failures — the FINAL columns on the KPI sheets are left at
   * zero on the floor — so wherever it covers the window it answers on its own.
   */
  basis: FinalBasis;
  /**
   * True when the reports carry the final gate line by line, which is what lets
   * the table below be read per line. False when the only final-inspection data
   * is the factory-wide monthly audit, and there is nothing to attribute.
   */
  lineWise: boolean;

  /** Totals — the "ttl summary" row. A style shared by two lines counts once here. */
  inspections: number;
  checked: number;
  pass: number;
  fail: number;
  passPct: number | null;
  failPct: number | null;
  /** Major defects found in the samples, on the 'styles' basis; 0 otherwise. */
  defects: number;

  lines: FinalLineStat[];
  /** Day by day, or month by month, over the selected window. */
  periods: FinalPeriodPoint[];
  topDefects: DefectStat[];
  /**
   * Every category's total, the ones outside the top five included. The month
   * tabs break defects down far finer than the Summary did, so the five no longer
   * add up to the whole and the ring needs the rest as a slice of its own.
   */
  defectsCategorised: number;
  /**
   * The months the defect breakdown was read from. The final-inspection defect
   * columns are only ever filed monthly, so a day or a week is answered with the
   * month it falls in — and the caption has to say so rather than let a month of
   * findings sit under a Tuesday's heading.
   */
  defectMonths: string[];
  /** True when the defect breakdown covers more of the calendar than the window. */
  defectsWiderThanSpan: boolean;

  audit: FinalAudit;
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

interface Dated { inspection_date: string | null; period_month: string | null; }

const dailyIn = <T extends Dated>(rows: T[], span: QualitySpan): T[] =>
  rows.filter((r) => r.inspection_date != null && withinSpan(r.inspection_date, span));

/**
 * Monthly rows are only reachable from a month-wide window. A summary covering
 * August answers "August" honestly; charging its whole month against a Tuesday, or
 * against a seven-day window that happens to contain the first of the month, would
 * put a month of production behind one day's heading.
 */
const monthlyIn = <T extends Dated>(rows: T[], span: QualitySpan): T[] =>
  span.range !== 'month'
    ? []
    : rows.filter((r) => r.inspection_date == null && r.period_month != null
        && withinSpan(r.period_month, span));

/**
 * Rows off the final inspection report's month tabs, which are dated twice: the
 * day a style was inspected and the month whose tab it was filed on. A month-wide
 * window follows the tab, so September reads the same 36 styles the factory's own
 * Summary counts — including the ones inspected on 31 August and filed on the SEP
 * tab. A day or a week follows the calendar, the way every other daily row does.
 */
const filedIn = <T extends Dated>(rows: T[], span: QualitySpan): T[] =>
  rows.filter((r) => {
    const at = span.range === 'month' && r.period_month != null ? r.period_month : r.inspection_date;
    return at != null && withinSpan(at, span);
  });

/** The date a row is plotted against, or null when it was filed at the other
 *  grain and so belongs to no point on this axis. */
const pointOf = (r: Dated, grain: QualityGrain): string | null =>
  (grain === 'daily' ? r.inspection_date : r.period_month);

/**
 * Which line a row belongs to. Keyed by number where the report gives one so the
 * roster and the figures meet on the same key, and by label only for a row that
 * names no line at all.
 */
const lineKeyOf = (r: { line_no: number | null; line_label: string | null }): string =>
  (r.line_no != null ? String(r.line_no) : (r.line_label ?? '—'));

/**
 * One line's reading of one gate — the unit the daily/monthly choice is made for.
 *
 * Per line alone is not fine enough. A line keys its floor gates into the daily
 * sheet all month and has its final gate written up once in the monthly report:
 * judged per line, the daily floor rows would still delete the monthly final row,
 * which is the shape LINE 04 actually had. Per gate, each column answers from the
 * grain it was filed at, and the double-count the rule exists to stop — a month
 * summed with the days inside it — is still impossible, because that would take
 * the same line and the same gate at both grains.
 */
const gateKeyOf = (
  r: { line_no: number | null; line_label: string | null; stage: QualityStage }
): string => lineKeyOf(r) + '|' + r.stage;

/** Whether the history holds daily reports at all — not just inside some window. */
export const hasDailyReports = (data: QualityRecords): boolean =>
  data.inspections.some((r) => r.inspection_date != null);

export const hasMonthlySummaries = (data: QualityRecords): boolean =>
  data.inspections.some((r) => r.inspection_date == null && r.period_month != null);

/** Daily where the factory files daily, monthly where it only files summaries. */
export const datasetGrain = (data: QualityRecords): QualityGrain =>
  hasDailyReports(data) ? 'daily' : 'monthly';

/**
 * The newest date the screen can open on: a factory that last filed on Friday
 * wants Friday, not an empty Monday.
 *
 * It is read at the grain the screen will open at, because the two have to agree.
 * A factory that files daily reports *and* a monthly summary has rows reaching the
 * last of the month, but the screen opens Daily — anchoring it on the 31st shows
 * an empty day for a month that is full of reports. So daily data is answered with
 * the newest day that carries an inspection, and only a summary-only factory is
 * answered with the end of its newest month.
 */
export function latestDate(data: QualityRecords): string | null {
  let best: string | null = null;
  const offer = (d: string | null) => { if (d != null && (best == null || d > best)) best = d; };

  if (datasetGrain(data) === 'daily') {
    for (const r of data.inspections) offer(r.inspection_date);
    // Only if no inspection carries a day at all — a defect breakdown on its own
    // is still something to show, and nothing else can date the screen.
    if (best == null) for (const d of data.defects) offer(d.inspection_date);
    return best;
  }

  for (const r of data.inspections) offer(r.period_month);
  for (const d of data.defects) offer(d.period_month);
  for (const f of data.finals) offer(f.period_month);
  for (const v of data.verdicts) offer(v.period_month);
  return best != null ? monthEnd(best) : null;
}

/** Days that carry something worth showing — a measured inspection or a defect. */
function daysWithFigures(data: QualityRecords): Set<string> {
  const days = new Set<string>();
  for (const r of data.inspections) {
    if (r.inspection_date != null && (r.checked_qty ?? 0) > 0) days.add(r.inspection_date);
  }
  for (const d of data.defects) {
    if (d.inspection_date != null && (d.qty ?? 0) > 0) days.add(d.inspection_date);
  }
  for (const v of data.verdicts) if (v.inspection_date != null) days.add(v.inspection_date);
  return days;
}

/** Months that carry a summary, for a factory that files nothing daily. */
function monthsWithFigures(data: QualityRecords): Set<string> {
  const months = new Set<string>();
  for (const r of data.inspections) if (r.period_month != null) months.add(r.period_month);
  for (const d of data.defects) if (d.period_month != null) months.add(d.period_month);
  for (const f of data.finals) if (f.period_month != null) months.add(f.period_month);
  for (const v of data.verdicts) if (v.period_month != null) months.add(v.period_month);
  return months;
}

const daysBetween = (a: string, b: string): number =>
  Math.abs(Date.parse(a + 'T00:00:00Z') - Date.parse(b + 'T00:00:00Z')) / 86_400_000;

/**
 * The day a screen opens on: today, and if nothing was filed today the closest
 * day that was.
 *
 * Today is the answer the client asked for and the one a floor manager expects at
 * the start of a shift. Falling back to the nearest filed day rather than to an
 * empty screen is the other half of it — a Monday morning before the weekend's
 * reports are keyed in should show Friday, not a wall of dashes that reads like a
 * broken import. Ties go to the past: a day already filed beats one that is not.
 */
export function openingDate(data: QualityRecords): string | null {
  const now = todayISO();

  if (datasetGrain(data) === 'daily') {
    const days = daysWithFigures(data);
    if (days.size === 0) return latestDate(data);
    if (days.has(now)) return now;
    let best: string | null = null;
    for (const day of days) {
      if (best == null) { best = day; continue; }
      const gap = daysBetween(day, now) - daysBetween(best, now);
      if (gap < 0 || (gap === 0 && day < best)) best = day;
    }
    return best;
  }

  // Monthly: the closest month, pointed at from as near to today as it reaches, so
  // that switching to Daily afterwards lands somewhere sensible rather than on the
  // last of a month for no reason.
  const months = [...monthsWithFigures(data)];
  if (months.length === 0) return null;
  let month = months[0]!;
  for (const m of months) {
    const gap = daysBetween(m, now) - daysBetween(month, now);
    if (gap < 0 || (gap === 0 && m < month)) month = m;
  }
  const start = monthStart(month);
  const end = monthEnd(month);
  return now < start ? start : now > end ? end : now;
}

/** The key in `keys` closest to `now`, ties going to the earlier one. */
function nearest(keys: Iterable<string>, now: string): string | null {
  let best: string | null = null;
  for (const k of keys) {
    if (best == null) { best = k; continue; }
    const gap = daysBetween(k, now) - daysBetween(best, now);
    if (gap < 0 || (gap === 0 && k < best)) best = k;
  }
  return best;
}

/**
 * The anchor a range should open on, picked for that range specifically rather
 * than for whichever grain the factory files most: the latest day with figures
 * for Daily, the latest week for Weekly, the latest month for Monthly. Pressing
 * Weekly after Daily is asking "how does the most recent reporting look as a
 * week", not "what week does today fall in" — today may be empty while the
 * report a manager actually wants to see is a few days old.
 */
export function openingAnchorFor(range: QualityRange, data: QualityRecords): string | null {
  const now = todayISO();

  if (range === 'month') {
    const months = [...monthsWithFigures(data)];
    if (months.length === 0) return null;
    const month = nearest(months, now)!;
    const start = monthStart(month);
    const end = monthEnd(month);
    return now < start ? start : now > end ? end : now;
  }

  const days = daysWithFigures(data);
  if (days.size === 0) return null;

  if (range === 'day') return nearest(days, now);

  // Week: compare by the Monday each figured day's week starts on, so every day
  // in the same calendar week resolves to the same anchor.
  const weeks = new Set([...days].map(weekStart));
  return nearest(weeks, weekStart(now));
}

/** The oldest date any report reaches — the floor for the date field. */
export function earliestDate(data: QualityRecords): string | null {
  let best: string | null = null;
  const offer = (d: string | null) => { if (d != null && (best == null || d < best)) best = d; };
  for (const r of data.inspections) offer(r.inspection_date ?? r.period_month);
  for (const d of data.defects) offer(d.inspection_date ?? d.period_month);
  for (const f of data.finals) offer(f.period_month);
  for (const v of data.verdicts) offer(v.inspection_date ?? v.period_month);
  return best;
}

/**
 * The pass-rate trend, built from the whole history rather than the selected
 * window: a trend of one day is not a trend, and the point of the panel is the
 * shape either side of wherever the window happens to sit.
 */
export function buildTrend(data: QualityRecords, grain: QualityGrain): TrendPoint[] {
  const buckets = new Map<string, { checked: number; defects: number }>();
  for (const r of data.inspections) {
    if (!onFloor(r.stage)) continue;
    const at = grain === 'daily' ? r.inspection_date : (r.inspection_date ? null : r.period_month);
    if (at == null) continue;
    const c = r.checked_qty ?? 0;
    if (c <= 0) continue;
    const d = r.defect_qty ?? (r.pass_qty != null ? c - r.pass_qty : 0);
    const acc = buckets.get(at) ?? { checked: 0, defects: 0 };
    buckets.set(at, { checked: acc.checked + c, defects: acc.defects + d });
  }
  return [...buckets.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, v]) => ({
      date, checked: v.checked, defects: v.defects, passPct: rate(v.checked, v.defects) ?? 0
    }));
}

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
  span: QualitySpan,
  threshold: number
): QualityMatrix {
  const daily = dailyIn(data.inspections, span);
  const monthly = monthlyIn(data.inspections, span);
  // Daily wins wherever it exists — but line by line, not for the factory at
  // once. Two lines can be filed at two different grains in the same month: the
  // floor keys its own sheets daily while a line that ships on its own gets
  // written up in the monthly report. Judging the window as a whole meant one
  // line's daily rows deleted another line's only figures, which is how LINE 04
  // came to read "not inspected" beside three lines that were.
  //
  // The rule it replaces is still kept, because it is the one that matters: a
  // line is never counted at both grains, so a monthly summary and the days
  // inside it can never be summed over the same pieces.
  const gatesFiledDaily = new Set(daily.map(gateKeyOf));
  const rows = [...daily, ...monthly.filter((r) => !gatesFiledDaily.has(gateKeyOf(r)))];
  // The trend is one axis, so it still has a single grain: whichever the window
  // mostly speaks. Rows filed at the other one keep their line and stage figures
  // and simply sit out of the chart.
  const grain: QualityGrain = daily.length > 0 || monthly.length === 0 ? 'daily' : 'monthly';

  // Built first because it decides what the final gate reads everywhere else on
  // the page — the tile, the bar per line and the column at the end of each row
  // all have to agree with the card that explains them.
  const finalInspection = buildFinalInspection(data, span, threshold);
  const finalInStyles = finalInspection.basis === 'styles';

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
    // Where the final inspection report covers the window, the KPI sheets' FINAL
    // columns stand aside for it: the floor fills in CHECKED and never FAIL, so
    // they read 100% whatever the inspectors found.
    if (finalInStyles && r.stage === 'final') continue;
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

    const key = lineKeyOf(r);
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

    const p = counts ? pointOf(r, grain) : null;
    if (p != null) {
      const bucket = periodMap.get(p) ?? { checked: 0, defects: 0 };
      periodMap.set(p, { checked: bucket.checked + c, defects: bucket.defects + d });
    }
  }

  // The final gate counted in styles: the stage and each line's cell carry styles
  // inspected and styles failed, so the pass rate they work out to is the share
  // of styles that passed — the same figure as the final inspection card.
  if (finalInStyles && finalInspection.inspections > 0) {
    stageMap.set('final', { checked: finalInspection.inspections, defects: finalInspection.fail });
    for (const f of finalInspection.lines) {
      if (f.inspections === 0) continue;
      const line = lineMap.get(f.key) ?? {
        key: f.key, label: f.label, lineNo: f.lineNo,
        stages: {}, checked: 0, defects: 0, rejectionPct: null,
        finalPassPct: null, finalStatus: 'not_inspected' as FinalStatus
      };
      line.stages.final = { checked: f.inspections, defects: f.fail, passPct: null };
      lineMap.set(f.key, line);
    }
  }

  // Final inspection is the last gate before the goods leave, so it gets its own
  // verdict rather than being averaged into the line's overall pass rate — and it
  // is the card's verdict, so the row and the card can never disagree.
  const finalByLine = new Map(finalInspection.lines.map((f) => [f.key, f]));

  const lines = [...lineMap.values()].map((line) => {
    for (const cell of Object.values(line.stages)) {
      cell.passPct = rate(cell.checked, cell.defects);
    }
    const final = finalByLine.get(line.key);
    return {
      ...line,
      rejectionPct: line.checked > 0
        ? Math.round((line.defects / line.checked) * 10_000) / 100
        : null,
      finalPassPct: final?.passPct ?? null,
      finalStatus: final?.status ?? 'not_inspected'
    };
  }).sort(byLineOrder);

  // Defect rows follow the same window and the same grain rule, decided on their
  // own supply: a factory can file daily inspection figures and only a monthly
  // defect breakdown, and the breakdown is worth showing either way. The monthly
  // summaries record their categories at factory level, so excluding roll-ups
  // there leaves nothing — per-line rows are preferred and factory rows are the
  // fallback, never both.
  //
  // Final-inspection defects are set aside before that choice is made. They are
  // dated by day now, and a September of final findings would otherwise decide
  // "daily" for a month whose floor breakdown was only ever filed monthly — and
  // then filter itself away below, leaving the floor chart empty.
  const floorDefects = data.defects.filter((d) => defectStage(d.category) !== 'final');
  const dailyDefects = dailyIn(floorDefects, span);
  const defectRows = dailyDefects.length > 0 ? dailyDefects : monthlyIn(floorDefects, span);

  // End line and appearance, on whichever basis is showing — decided row by row
  // rather than for the whole window at once.
  //
  // Two reports can land in the same month and disagree about whether they name a
  // gate: the monthly second summary is one column per category and names none,
  // while the monthly inspection report's categories are all tagged "(Final)" by
  // the importer. Judging the window as a whole meant one of those decided for
  // the other — either the untagged summary was filtered away to nothing, or the
  // shipping-audit findings were charted here as sewing-floor defects. So a row
  // that names a floor gate is counted, a row that names no gate at all is
  // counted (there is nothing better to do with it, and the caption says so), and
  // a row that names some other gate — final, AQL, in line — is left to the panel
  // that reports on it.
  const scoped = defectRows.filter((d) => {
    const stage = defectStage(d.category);
    return stage == null || DEFECT_STAGES.includes(stage);
  });
  const namesGates = scoped.some((d) => defectStage(d.category) != null);

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

  // The breakdown is a breakdown of the gate columns beside it, so it is measured
  // against those and not against itself. Which gates depends on whether the
  // categories named one: named, the card covers end line and appearance and is
  // judged against those two; unnamed, it carries everything the report had and
  // answers to all three floor gates — the same figure the "Defects found" tile
  // shows, which is where the client reads it from.
  const breakdownStages = namesGates ? DEFECT_STAGES : FLOOR_STAGES;
  const defectsAtBreakdownGates = breakdownStages
    .reduce((sum, s) => sum + (stageMap.get(s)?.defects ?? 0), 0);
  const defectsCategorised = [...catTotals.values()].reduce((sum, q) => sum + q, 0);

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

  return {
    // A factory that files only the pre-shipment inspection report still has
    // quality data to show, so it does not get the "no reports yet" screen.
    hasData: rows.length > 0 || defectRows.length > 0 || finalInspection.hasData,
    span,
    grain,
    hasMonthlySummaries: hasMonthlySummaries(data),
    hasDailyReports: hasDailyReports(data),
    checked,
    defects,
    passPct: rate(checked, defects),
    rejectionPct: checked > 0 ? Math.round((defects / checked) * 10_000) / 100 : null,
    aqlPassPct: aql ? rate(aql.checked, aql.defects) : null,
    lines,
    stages: [...stageMap.entries()]
      .map(([stage, v]) => ({
        stage, checked: v.checked, defects: v.defects, passPct: rate(v.checked, v.defects),
        unit: stage === 'final' && finalInStyles ? 'styles' as const : 'pieces' as const
      }))
      .sort((a, b) => b.checked - a.checked),
    topDefects,
    defectsGated: namesGates,
    defectsCategorised,
    defectsAtBreakdownGates,
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

/** The first of every month the window touches, oldest first. */
function monthsSpanned(span: QualitySpan): string[] {
  const out: string[] = [];
  const last = monthStart(span.to);
  for (let m = monthStart(span.from); m <= last; m = addMonths(m, 1)) out.push(m);
  return out;
}

/**
 * Pass and fail for one final-inspection row.
 *
 * The KPI sheets fill in CHECKED / PASS / FAIL, but not always all three — a
 * typist who fills PASS leaves FAIL blank and the other way round — so whichever
 * half is present decides the other. Neither present means the gate passed
 * everything it checked, which is what the sheet says by leaving the column
 * empty. Both are clamped into the checked quantity: a keying error reporting
 * more failures than pieces must not put a negative pass count on screen.
 */
function passFail(r: { checked_qty: number | null; pass_qty: number | null; defect_qty: number | null }) {
  const checked = r.checked_qty ?? 0;
  const raw = r.defect_qty ?? (r.pass_qty != null ? checked - r.pass_qty : 0);
  const fail = Math.min(Math.max(raw, 0), checked);
  return { checked, pass: checked - fail, fail };
}

const pct = (part: number, whole: number): number | null =>
  whole > 0 ? Math.round((part / whole) * 10_000) / 100 : null;

/**
 * The final inspection, over the window the page is showing.
 *
 * The client reads this gate the way they read every other one — daily, weekly or
 * monthly, line by line, with a pass and a fail count on each row and a total
 * underneath. It is built from one of two sources, never both:
 *
 *  - The final inspection report's month tabs, wherever they reach the window.
 *    Each row there is one style, sampled and judged PASS or FAIL against AQL
 *    2.5 by the inspector, and pass and fail count those styles — the way the
 *    report's own "1st time pass rate" counts them, so a month here reads the
 *    same as the factory's Summary.
 *  - Otherwise the per-line FINAL block on the KPI and daily sheets, in pieces.
 *    The floor fills in CHECKED there and leaves FAIL blank, so this only ever
 *    reads 100% — which is exactly why it is the fallback and not the source:
 *    every line read "Passed" in a month where nine styles had failed.
 *
 * The pre-shipment audit is kept monthly in `audit`, beside these figures and
 * never added into them. The defect breakdown is read by day where the report
 * dates it, and by month where only the Summary carries it; `defectMonths` says
 * which month a day or a week had to borrow.
 *
 * Final rows are still never added into the floor totals elsewhere on the page —
 * those are In line, End line and Appearance. Final inspection judges goods
 * already counted at all three, so adding it in would count the same garments
 * twice.
 */
export function buildFinalInspection(
  data: QualityRecords,
  span: QualitySpan,
  threshold: number
): FinalInspectionSummary {
  // Decided by the month, not by the window: once the report covers September, a
  // day in September with no style inspected is a day the final gate did not run
  // — not a day to fall back on the KPI columns and read 100% again.
  const filedMonths = new Set(data.verdicts.map((v) => v.period_month));
  const basis: FinalBasis = monthsSpanned(span).some((m) => filedMonths.has(m)) ? 'styles' : 'pieces';
  const verdicts = basis === 'styles' ? filedIn(data.verdicts, span) : [];

  // data.inspections excludes the sheets' Factory roll-up rows, so what is left
  // at this stage is the per-line final gate and nothing else.
  const finalRows = basis === 'pieces' ? data.inspections.filter((r) => r.stage === 'final') : [];
  const daily = dailyIn(finalRows, span);
  const monthly = monthlyIn(finalRows, span);
  // Line by line, exactly as the matrix decides it: a line is never counted at
  // both grains, but one line filing daily no longer erases another line whose
  // final gate was only ever written up monthly.
  const gatesFiledDaily = new Set(daily.map(gateKeyOf));
  const rows = [...daily, ...monthly.filter((r) => !gatesFiledDaily.has(gateKeyOf(r)))];
  const grain: QualityGrain = basis === 'styles'
    ? (verdicts.some((v) => v.inspection_date != null) ? 'daily' : 'monthly')
    : (daily.length > 0 || monthly.length === 0 ? 'daily' : 'monthly');

  let inspections = 0;
  let checked = 0;
  let pass = 0;
  let fail = 0;
  let defects = 0;

  // The roster comes first, so a line the factory runs but did not final-inspect
  // in this window is still a row reading "not inspected" — a different fact from
  // a line that failed, and the one a planner needs to see.
  const lineMap = new Map<string, FinalLineStat>();
  for (const ref of data.lines) {
    lineMap.set(String(ref.lineNo), {
      key: String(ref.lineNo), lineNo: ref.lineNo, label: ref.label,
      inspections: 0, checked: 0, pass: 0, fail: 0,
      passPct: null, failPct: null, status: 'not_inspected'
    });
  }

  const periodMap = new Map<string, { inspections: number; checked: number; pass: number; fail: number }>();

  /** One inspection, onto a line and onto its point in the run. */
  const tally = (
    line: { key: string; lineNo: number | null; label: string } | null,
    at: string | null,
    v: { checked: number; pass: number; fail: number }
  ) => {
    if (line) {
      const stat = lineMap.get(line.key) ?? {
        ...line, inspections: 0, checked: 0, pass: 0, fail: 0,
        passPct: null, failPct: null, status: 'not_inspected' as FinalStatus
      };
      stat.inspections += 1;
      stat.checked += v.checked;
      stat.pass += v.pass;
      stat.fail += v.fail;
      lineMap.set(line.key, stat);
    }
    if (at == null) return;
    const bucket = periodMap.get(at) ?? { inspections: 0, checked: 0, pass: 0, fail: 0 };
    periodMap.set(at, {
      inspections: bucket.inspections + 1,
      checked: bucket.checked + v.checked,
      pass: bucket.pass + v.pass,
      fail: bucket.fail + v.fail
    });
  };

  if (basis === 'styles') {
    for (const s of verdicts) {
      const failed = s.verdict === 'fail' ? 1 : 0;
      const v = { checked: s.checked_qty ?? 0, pass: 1 - failed, fail: failed };
      inspections += 1;
      checked += v.checked;
      pass += v.pass;
      fail += v.fail;
      defects += s.defect_qty ?? 0;

      const at = grain === 'daily' ? s.inspection_date : s.period_month;
      // A style inspected for two lines together ("1 & 4") counts on both lines,
      // and once in the totals above — as the factory's own Summary counts it.
      const named = [...new Set([s.line_no, ...(s.shared_lines ?? [])])]
        .filter((n): n is number => n != null && n > 0);
      if (!named.length) tally(null, at, v);
      named.forEach((n, i) => tally(
        { key: String(n), lineNo: n, label: i === 0 && s.line_label ? s.line_label : lineLabel(n, null) },
        // The run counts the style once, not once per line.
        i === 0 ? at : null,
        v
      ));
    }
  } else {
    for (const r of rows) {
      const v = passFail(r);
      if (v.checked <= 0) continue;
      inspections += 1;
      checked += v.checked;
      pass += v.pass;
      fail += v.fail;
      const key = lineKeyOf(r);
      tally({ key, lineNo: r.line_no, label: r.line_label ?? `Line ${key}` }, pointOf(r, grain), v);
    }
  }

  // A style carries one verdict, so its rates are over styles inspected; a piece
  // count is over the pieces checked.
  const over = (t: { inspections: number; checked: number }): number =>
    (basis === 'styles' ? t.inspections : t.checked);

  const lines = [...lineMap.values()].map((line) => {
    const passPct = pct(line.pass, over(line));
    return {
      ...line,
      passPct,
      failPct: pct(line.fail, over(line)),
      status: (passPct == null
        ? 'not_inspected'
        : passPct >= threshold ? 'passed' : 'below') as FinalStatus
    };
  }).sort(byLineOrder);

  const periods = [...periodMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, v]) => ({
      date, inspections: v.inspections, checked: v.checked, pass: v.pass, fail: v.fail,
      passPct: pct(v.pass, over(v))
    }));

  // ---- Defects counted at this gate, and only at this gate ----------------
  // The importer writes the gate into the category ("Fabric (Final)"), which is
  // what keeps a shipping-audit finding out of the sewing-floor breakdown beside
  // it. Per-line rows are preferred; the monthly inspection report files its
  // categories at factory level, so those are a fallback rather than an addition
  // — counting both would double every category it names. Rows off the month tabs
  // follow the same window as the verdicts they came with.
  const finalDefects = data.defects.filter((d) => defectStage(d.category) === 'final');
  const dailyDefects = filedIn(finalDefects.filter((d) => d.inspection_date != null), span);
  const months = monthsSpanned(span);
  const monthlyDefects = finalDefects.filter(
    (d) => d.inspection_date == null && d.period_month != null && months.includes(d.period_month)
  );
  const defectRows = dailyDefects.length > 0 ? dailyDefects : monthlyDefects;

  const catTotals = new Map<string, number>();
  for (const d of defectRows) {
    const name = defectCategory(d.category);
    catTotals.set(name, (catTotals.get(name) ?? 0) + (d.qty ?? 0));
  }
  const topDefects = [...catTotals.entries()]
    .map(([category, qty]) => ({ category, qty }))
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 5);

  const defectMonths = dailyDefects.length > 0
    ? []
    : [...new Set(monthlyDefects.map((d) => d.period_month!))].sort();

  const audit = buildFinalAudit(data.finals, months);

  return {
    hasData: inspections > 0 || topDefects.length > 0 || audit.hasData,
    span,
    grain,
    basis,
    // The report's month tabs name a line on every style, so a day with no style
    // inspected is still read line by line: every line "not inspected".
    lineWise: basis === 'styles' || lines.some((l) => l.inspections > 0),
    inspections,
    checked,
    pass,
    fail,
    passPct: pct(pass, over({ inspections, checked })),
    failPct: pct(fail, over({ inspections, checked })),
    defects,
    lines,
    periods,
    topDefects,
    defectsCategorised: [...catTotals.values()].reduce((sum, q) => sum + q, 0),
    defectMonths,
    // A month-wide window is exactly the grain the breakdown is filed at, so this
    // is only worth flagging when a day or a week borrowed a whole month.
    defectsWiderThanSpan: span.range !== 'month' && defectMonths.length > 0,
    audit
  };
}

/**
 * The pre-shipment audit, month by month, over the months the window touches.
 *
 * It is never folded into the line figures above: one audit covers the styles
 * shipping that month rather than the line that sewed them, and adding a
 * factory-level audit to per-line totals would count the same garments twice.
 */
function buildFinalAudit(rows: FinalInspectionRow[], months: string[]): FinalAudit {
  const byMonth = new Map<string, {
    checked: number; defects: number; passPct: number | null; defectPct: number | null;
  }>();
  for (const r of rows) {
    if (!r.period_month || !months.includes(r.period_month)) continue;
    const acc = byMonth.get(r.period_month)
      ?? { checked: 0, defects: 0, passPct: null, defectPct: null };
    acc.checked += r.checked_qty ?? 0;
    acc.defects += r.defect_qty ?? 0;
    // Reported, not derived. A later report for the same month replaces the rate
    // rather than being averaged with it — two readings of one month are a
    // correction, not two samples. Both rates are treated the same way, so the
    // sheet's own Defect % survives the trip rather than being recomputed here.
    if (r.pass_pct != null) acc.passPct = r.pass_pct;
    if (r.defect_pct != null) acc.defectPct = r.defect_pct;
    byMonth.set(r.period_month, acc);
  }

  const list = [...byMonth.entries()]
    .map(([m, v]) => ({
      month: m,
      checked: v.checked,
      defects: v.defects,
      passPct: v.passPct,
      // The importer already prefers the typed column; this covers a month whose
      // rate was never filed at all, so the table has a figure either way.
      defectPct: v.defectPct ?? pct(v.defects, v.checked)
    }))
    .sort((a, b) => a.month.localeCompare(b.month));

  const withFigures = list.filter(
    (m) => m.checked > 0 || m.defects > 0 || m.passPct != null || m.defectPct != null
  );
  const checked = list.reduce((sum, m) => sum + m.checked, 0);
  const defects = list.reduce((sum, m) => sum + m.defects, 0);
  const latest = withFigures[withFigures.length - 1] ?? null;

  return {
    hasData: withFigures.length > 0,
    months: list,
    latest,
    checked,
    defects,
    // Across several months the pieces are what can honestly be added up; a single
    // month with no counts falls back to the rate that month reported.
    defectPct: pct(defects, checked) ?? latest?.defectPct ?? null
  };
}

/**
 * The Factory rows on every sheet are roll-ups of the line rows beside them, so
 * they are excluded here rather than summed alongside their own components.
 */
export async function fetchQualityOverview(): Promise<QualityOverview> {
  const [insData, defData, { data: lineData, error: lineError }, report] = await Promise.all([
    fetchAllRows<InspectionRow>((from, to) => supabase
      .from('quality_inspections')
      .select('line_no,line_label,inspection_date,period_month,stage,checked_qty,pass_qty,defect_qty,pass_pct')
      .eq('is_factory', false)
      .is('verdict', null)
      .order('inspection_date', { ascending: false })
      .order('id')
      .range(from, to)),
    fetchAllRows<{ category: string; qty: number; is_factory: boolean }>((from, to) => supabase
      .from('quality_defects')
      .select('category,qty,is_factory')
      .order('id')
      .range(from, to)),
    supabase
      .from('production_lines')
      .select('line_number,line_name')
      .eq('active', true)
      .order('line_number'),
    fetchFinalReport()
  ]);

  if (lineError) throw new Error(lineError.message);

  // The final gate is read from the final inspection report wherever one has been
  // imported, as the Quality Management screen reads it: the KPI sheets' FINAL
  // columns record no failures, so beside the report they only ever say 100%.
  const finalInStyles = report.verdicts.length > 0;
  const all = reportable(insData).filter((r) => !(finalInStyles && r.stage === 'final'));
  const daily = all.filter((r) => r.inspection_date);
  const monthly = all.filter((r) => !r.inspection_date && r.period_month);

  // Per line, as the Quality Management screen decides it: a line filed monthly
  // still counts when the line beside it is filed daily, and no line is ever
  // counted at both grains.
  const gatesFiledDaily = new Set(daily.map(gateKeyOf));
  const rows = [...daily, ...monthly.filter((r) => !gatesFiledDaily.has(gateKeyOf(r)))];
  const basis: 'daily' | 'monthly' = daily.length > 0 ? 'daily' : 'monthly';
  const dateOf = (r: InspectionRow) =>
    (basis === 'daily' ? r.inspection_date : r.period_month);

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

    const key = lineKeyOf(r);
    const ln = lineMap.get(key)
      ?? { lineNo: r.line_no, label: r.line_label ?? `Line ${key}`, checked: 0, defects: 0 };
    lineMap.set(key, { ...ln, checked: ln.checked + c, defects: ln.defects + d });

    // The trend keeps one grain, so a row filed at the other one counts towards
    // the totals and its line, and sits out of the day-by-day series.
    const day = dateOf(r);
    if (day == null) continue;
    const dy = dayMap.get(day) ?? { checked: 0, defects: 0 };
    dayMap.set(day, { checked: dy.checked + c, defects: dy.defects + d });
  }

  if (finalInStyles) {
    stageMap.set('final', {
      checked: report.verdicts.length,
      defects: report.verdicts.filter((v) => v.verdict === 'fail').length
    });
  }

  // Defect rows follow the same roll-up rule, but the monthly summaries record
  // everything at factory level -- excluding those would leave nothing at all.
  const defRows = defData;
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
      .map(([stage, v]) => ({
        stage, checked: v.checked, defects: v.defects, passPct: rate(v.checked, v.defects),
        unit: stage === 'final' && finalInStyles ? 'styles' as const : 'pieces' as const
      }))
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
