/**
 * Pre final is deliberately absent. The KPI sheets carry a PRE FINAL block, but
 * the client does not want that gate reported, so it is dropped at the parser
 * rather than hidden at the screen — a stage nobody reports on should not be
 * sitting in the totals either.
 */
export type QualityStage =
  | 'in_line' | 'end_line' | 'appearance' | 'final' | 'aql';

export type QualityReportKind =
  | 'line_kpi' | 'daily_quality' | 'monthly_quality' | 'monthly_inspection' | 'defect_summary';

export interface InspectionRow {
  lineNo: number | null;
  lineLabel: string | null;
  isFactory: boolean;
  styleNumber: string | null;
  /** Daily reports date a row; monthly reports set periodMonth instead. */
  inspectionDate: string | null;
  periodMonth: string | null;
  stage: QualityStage;
  checkedQty: number | null;
  passQty: number | null;
  defectQty: number | null;
  passPct: number | null;
  defectPct: number | null;
}

export interface DefectRow {
  lineNo: number | null;
  lineLabel: string | null;
  isFactory: boolean;
  inspectionDate: string | null;
  periodMonth: string | null;
  category: string;
  qty: number;
}

export interface QualityParseResult {
  kind: QualityReportKind;
  /** Human sentence naming the layout, shown on the preview screen. */
  label: string;
  sheetsUsed: string[];
  sheetsSkipped: { sheet: string; reason: string }[];
  inspections: InspectionRow[];
  defects: DefectRow[];
  /**
   * Every line the workbook names, including the ones whose row or sheet is still
   * blank. A line the factory has opened but not yet inspected has no inspection
   * row to be inferred from, and leaving it unregistered is what kept LINE 04 off
   * the Quality screens entirely.
   */
  linesSeen: number[];
  periodStart: string | null;
  periodEnd: string | null;
  warnings: string[];
}

export const STAGE_LABEL: Record<QualityStage, string> = {
  in_line: 'In line',
  end_line: 'End line',
  appearance: 'Appearance',
  final: 'Final',
  aql: 'AQL audit'
};

export const REPORT_LABEL: Record<QualityReportKind, string> = {
  line_kpi: 'KPI report — one sheet per line, one row per date',
  daily_quality: 'Daily quality performance report',
  monthly_quality: 'Monthly quality performance report',
  monthly_inspection: 'Monthly inspection report',
  defect_summary: 'Monthly second/defect summary'
};
