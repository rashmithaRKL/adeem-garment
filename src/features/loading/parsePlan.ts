import {
  readTables, matchColumns, cellDate, cellInt, cellText, norm,
  type ColumnSpec, type ImportIssue
} from '@/features/excel/sheetKit';
import type { PlanStatus } from './queries';

/**
 * A loading plan workbook: which style each line takes next, and the four dates
 * it has to hit on the way there.
 *
 * PP date, PCD, PSD and PED are the industry's own abbreviations and are almost
 * always written exactly that way, which is what makes this sheet recognisable
 * without a template.
 */
const COLUMNS: ColumnSpec[] = [
  { key: 'line', synonyms: ['line', 'lineno', 'linenumber', 'sewingline', 'team', 'teamno', 'module'] },
  { key: 'style', required: true, synonyms: ['style', 'styleno', 'stylenumber', 'stylecode', 'styleref'] },
  { key: 'order', synonyms: ['order', 'orderno', 'ordernumber', 'po', 'pono', 'ponumber', 'jobno', 'workorder'] },
  { key: 'school', synonyms: ['school', 'schoolname', 'buyer', 'buyername', 'customer', 'client', 'institute', 'college'] },
  { key: 'qty', synonyms: ['orderqty', 'orderquantity', 'qty', 'quantity', 'totalqty', 'planqty', 'pcs'] },
  { key: 'pp_date', synonyms: ['ppdate', 'pp', 'ppmeeting', 'ppmeetingdate', 'preproductiondate', 'ppm'] },
  { key: 'pcd', synonyms: ['pcd', 'plancutdate', 'plannedcutdate', 'cutdate', 'cuttingdate'] },
  { key: 'psd', synonyms: ['psd', 'plansewingdate', 'plannedsewingdate', 'sewingstartdate', 'startdate', 'inputdate'] },
  { key: 'ped', synonyms: ['ped', 'planenddate', 'plannedenddate', 'enddate', 'finishdate', 'outputdate'] },
  { key: 'status', synonyms: ['status', 'state', 'stage', 'progress'] },
  { key: 'sequence', synonyms: ['sequence', 'seq', 'slno', 'sl', 'serial', 'priority', 'order of loading'] },
  { key: 'remarks', synonyms: ['remarks', 'remark', 'note', 'notes', 'comment', 'comments'] }
];

/** Words a planner writes in a status column, mapped onto the four states. */
function toStatus(value: unknown): PlanStatus {
  const key = norm(value);
  if (!key) return 'upcoming';
  if (/(complete|done|finish|shipped|closed)/.test(key)) return 'completed';
  if (/(hold|stop|pending|postpone|cancel)/.test(key)) return 'hold';
  if (/(running|progress|ongoing|started|wip|sewing|current)/.test(key)) return 'in_progress';
  return 'upcoming';
}

export interface PlanParseRow {
  sheet: string;
  rowNumber: number;
  line_no: number;
  style_number: string;
  order_number: string | null;
  school_name: string | null;
  order_qty: number;
  pp_date: string | null;
  pcd: string | null;
  psd: string | null;
  ped: string | null;
  status: PlanStatus;
  sequence: number;
  remarks: string | null;
}

export interface PlanParseResult {
  kind: 'plan';
  label: string;
  sheetsUsed: string[];
  rows: PlanParseRow[];
  errors: ImportIssue[];
  warnings: string[];
  periodStart: string | null;
  periodEnd: string | null;
}

/** Sheet names like "LINE 03" or "L3", used when the sheet has no line column. */
function lineFromSheetName(sheet: string): number | null {
  const match = /(?:line|l)\s*[-_]?\s*(\d{1,2})\b/i.exec(sheet) ?? /^(\d{1,2})$/.exec(sheet.trim());
  return match ? Number(match[1]) : null;
}

/**
 * Returns null when the workbook is not a loading plan. A style column alone is
 * not enough — production sheets carry one too — so at least one planning date
 * or a school-and-quantity pair has to be present before the file is claimed.
 */
export async function tryParsePlanFile(file: File): Promise<PlanParseResult | null> {
  const tables = await readTables(file, COLUMNS);
  if (tables.length === 0) return null;

  const rows: PlanParseRow[] = [];
  const errors: ImportIssue[] = [];
  const warnings: string[] = [];
  const sheetsUsed: string[] = [];
  // One row per style per line: a repeat in the file is a correction, and the
  // database holds the same rule, so it is applied here too.
  const seen = new Map<string, PlanParseRow>();

  for (const table of tables) {
    const col = matchColumns(table.headers, COLUMNS);
    // At least one of the four planning milestones has to be named. A style
    // column with a buyer and a quantity beside it describes almost every sheet
    // in a garment factory, including the production sheets — PP, PCD, PSD and
    // PED are what make this one a plan.
    const dateColumns = ['pp_date', 'pcd', 'psd', 'ped'].filter((key) => col[key] != null);
    if (dateColumns.length === 0) continue;

    const sheetLine = lineFromSheetName(table.sheet);
    sheetsUsed.push(table.sheet);

    const at = (raw: unknown[], key: string): unknown =>
      (col[key] != null ? raw[col[key]!] : undefined);

    table.rows.forEach((raw, i) => {
      const rowNumber = table.headerRow + 2 + i;
      const style = cellText(at(raw, 'style'));
      if (!style) return;
      // "Total", "Sub total" and the like sit in the style column at the foot.
      if (/^(total|sub\s?total|grand\s?total)$/i.test(style)) return;

      const lineNo = cellInt(at(raw, 'line')) ?? sheetLine;
      if (lineNo == null || lineNo <= 0) {
        errors.push({
          sheet: table.sheet, rowNumber,
          message: `“${style}” has no line number, and the sheet name does not name one either.`
        });
        return;
      }

      const row: PlanParseRow = {
        sheet: table.sheet,
        rowNumber,
        line_no: lineNo,
        style_number: style,
        order_number: cellText(at(raw, 'order')),
        school_name: cellText(at(raw, 'school')),
        order_qty: Math.max(0, cellInt(at(raw, 'qty')) ?? 0),
        pp_date: cellDate(at(raw, 'pp_date')),
        pcd: cellDate(at(raw, 'pcd')),
        psd: cellDate(at(raw, 'psd')),
        ped: cellDate(at(raw, 'ped')),
        status: toStatus(at(raw, 'status')),
        // Falls back to the order the planner wrote the rows in, which is the
        // order they mean them to run.
        sequence: cellInt(at(raw, 'sequence')) ?? i + 1,
        remarks: cellText(at(raw, 'remarks'))
      };

      const key = `${row.line_no}|${style.toLowerCase()}`;
      if (seen.has(key)) {
        warnings.push(`Style ${style} is listed twice for line ${row.line_no}; the last row was kept.`);
      }
      seen.set(key, row);
    });
  }

  if (sheetsUsed.length === 0) return null;
  rows.push(...seen.values());
  rows.sort((a, b) => a.line_no - b.line_no || a.sequence - b.sequence);
  if (rows.length === 0) return null;

  const dates = rows
    .flatMap((r) => [r.pp_date, r.pcd, r.psd, r.ped])
    .filter((d): d is string => d != null)
    .sort();

  return {
    kind: 'plan',
    label: 'Loading plan — line-wise upcoming styles',
    sheetsUsed,
    rows,
    errors,
    warnings: [...new Set(warnings)],
    periodStart: dates[0] ?? null,
    periodEnd: dates[dates.length - 1] ?? null
  };
}
