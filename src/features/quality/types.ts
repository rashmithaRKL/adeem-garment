export type QualityStage =
  | 'in_line' | 'end_line' | 'appearance' | 'pre_final' | 'final' | 'aql';

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
  periodStart: string | null;
  periodEnd: string | null;
  warnings: string[];
}

export const STAGE_LABEL: Record<QualityStage, string> = {
  in_line: 'In line',
  end_line: 'End line',
  appearance: 'Appearance',
  pre_final: 'Pre final',
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
