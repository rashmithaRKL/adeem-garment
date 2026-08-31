import * as XLSX from 'xlsx';
import { cellText, lineFromLabel, norm, readGrid, runsOf } from '@/features/excel/layout';
import { cellDate, cellInt, type ImportIssue } from '@/features/excel/sheetKit';
import { isGuideSheet } from '@/features/excel/guideSheet';

/**
 * The rejection report: how many pieces each sewing line threw out, style by
 * style, day by day.
 *
 * The workbook is banded. One five-column block per line — DATE, STYLE NO, ORDER
 * QTY, REJECT QTY, % — sits side by side under a merged "Line 01" heading, and
 * every block runs to a different depth because a line that rejected nothing on
 * Thursday simply has no row for it. Read flat, that is twenty columns with four
 * of every header and no line anywhere; unpivoted, it is one record per line per
 * date per style, which is the only shape the figures mean anything in.
 *
 * A flat sheet with a LINE column is read too. The banded layout is what this
 * factory sends today, but the two shapes cost one branch to support and a
 * factory that changes its template should not have to wait for a release.
 */

/** The column this report exists for. Without it the sheet is not one. */
const REJECT_HEADER = /^(reject|rejection|rejected|rej)(qty|quantity|pcs|pieces|nos?)?$/;

const DATE_HEADER = /^(date|proddate|productiondate|day|rejectdate)$/;
const STYLE_HEADER = /^(style|styleno|stylenumber|stylecode|styleref|item|itemno)$/;
const ORDER_QTY_HEADER = /^(orderqty|orderquantity|qty|quantity|totalqty|checkedqty|inspectedqty|pcs)$/;
const LINE_HEADER = /^(line|lineno|linenumber|productionline|sewingline|team|teamno|module|moduleno)$/;

/** A summary row at the foot of a block, which is a restatement, not a record. */
const TOTAL_ROW = /^(total|grandtotal|subtotal|sum|ttl)$/;

/** Rows scanned looking for the header. Title blocks are rarely deeper. */
const MAX_SCAN_ROWS = 25;

export interface RejectionParseRow {
  sheet: string;
  /** 1-based Excel row, so a skipped row can be found in the workbook. */
  rowNumber: number;
  line_no: number;
  line_label: string;
  production_date: string;
  style_number: string | null;
  order_qty: number | null;
  reject_qty: number;
  reject_pct: number | null;
}

export interface RejectionParseResult {
  kind: 'rejection';
  /** Human sentence naming the layout, shown on the preview screen. */
  label: string;
  sheetsUsed: string[];
  sheetsSkipped: { sheet: string; reason: string }[];
  rows: RejectionParseRow[];
  errors: ImportIssue[];
  warnings: string[];
  periodStart: string | null;
  periodEnd: string | null;
  /** Every line the workbook names, including one whose block is still empty. */
  linesSeen: number[];
  /** The totals the preview shows, so the user can check them against the sheet. */
  totals: { orderQty: number; rejectQty: number; rejectPct: number | null };
}

interface HeaderCols {
  date: number;
  style: number;
  orderQty: number;
  reject: number;
}

/** Locates the four columns inside one block, or null when reject is missing. */
function columnsIn(headerRow: unknown[], from: number, to: number): HeaderCols | null {
  const find = (re: RegExp): number => {
    for (let c = from; c <= to && c < headerRow.length; c += 1) {
      if (re.test(norm(headerRow[c]))) return c;
    }
    return -1;
  };
  const reject = find(REJECT_HEADER);
  if (reject < 0) return null;
  return { date: find(DATE_HEADER), style: find(STYLE_HEADER), orderQty: find(ORDER_QTY_HEADER), reject };
}

/** The row that carries the reject header — the report's own signature. */
function findHeaderRow(cells: unknown[][], width: number): number {
  const limit = Math.min(cells.length, MAX_SCAN_ROWS);
  for (let r = 0; r < limit; r += 1) {
    const row = cells[r] ?? [];
    for (let c = 0; c < width && c < row.length; c += 1) {
      if (REJECT_HEADER.test(norm(row[c]))) return r;
    }
  }
  return -1;
}

interface Block { lineNo: number; label: string; cols: HeaderCols; }

/**
 * The blocks to read, and which line each one belongs to.
 *
 * Banded first: the row above the headers is scanned for merged runs that name a
 * line, and each run contributes the block sitting under it. That is the only
 * place the line number appears on this workbook, so a sheet whose banner row
 * does not parse has no line at all and is reported rather than guessed at.
 *
 * The fallback is a flat table with a LINE column, where every row names its own
 * line and there is a single block spanning the sheet.
 */
function blocksOf(
  cells: unknown[][], headerRowIndex: number, width: number
): { blocks: Block[]; lineColumn: number } {
  const headerRow = cells[headerRowIndex] ?? [];

  const lineColumn = (() => {
    for (let c = 0; c < width && c < headerRow.length; c += 1) {
      if (LINE_HEADER.test(norm(headerRow[c]))) return c;
    }
    return -1;
  })();

  if (headerRowIndex > 0) {
    const banner = cells[headerRowIndex - 1] ?? [];
    // Only runs spanning more than one column: a lone "Line 01" over a single
    // column is a stray label, and a merged report title is one run that will
    // fail lineFromLabel below anyway.
    const runs = runsOf(banner, width).filter((r) => r.end > r.start);
    const blocks: Block[] = [];
    for (const run of runs) {
      const lineNo = lineFromLabel(run.label);
      if (lineNo == null) continue;
      const cols = columnsIn(headerRow, run.start, run.end);
      if (cols) blocks.push({ lineNo, label: run.label.trim(), cols });
    }
    // Two or more, so a title row that happens to read like a line cannot turn a
    // flat sheet into a one-block banded one.
    if (blocks.length >= 2) return { blocks, lineColumn: -1 };
  }

  const cols = columnsIn(headerRow, 0, width - 1);
  return cols ? { blocks: [{ lineNo: 0, label: '', cols }], lineColumn } : { blocks: [], lineColumn };
}

const pct = (part: number, whole: number | null): number | null =>
  whole != null && whole > 0 ? Math.round((part / whole) * 10_000) / 100 : null;

/**
 * Reads the workbook if it is a rejection report, and returns null if it is not.
 *
 * Returning null rather than throwing is what lets the upload flow try each
 * importer in turn: a workbook this one does not recognise falls through to the
 * next without the user seeing an error for a test that was only ever a guess.
 */
export async function tryParseRejectionFile(file: File): Promise<RejectionParseResult | null> {
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(await file.arrayBuffer(), { cellDates: true });
  } catch {
    return null;
  }

  const rows: RejectionParseRow[] = [];
  const errors: ImportIssue[] = [];
  const warnings: string[] = [];
  const sheetsUsed: string[] = [];
  const sheetsSkipped: { sheet: string; reason: string }[] = [];
  const linesSeen = new Set<number>();
  let banded = false;

  for (const sheetName of workbook.SheetNames) {
    // The guide sheet on the downloaded template spells out REJECT QTY in its
    // column list, which is exactly the signature this parser looks for: read as
    // data it produced a block with no line and a page of errors under it.
    if (isGuideSheet(sheetName)) continue;
    const ws = workbook.Sheets[sheetName];
    if (!ws || !ws['!ref']) { sheetsSkipped.push({ sheet: sheetName, reason: 'empty' }); continue; }

    const { cells, firstRow, width } = readGrid(ws);
    if (cells.length < 2 || width === 0) {
      sheetsSkipped.push({ sheet: sheetName, reason: 'empty' });
      continue;
    }

    const headerRowIndex = findHeaderRow(cells, width);
    if (headerRowIndex < 0) {
      sheetsSkipped.push({ sheet: sheetName, reason: 'no reject column' });
      continue;
    }

    const { blocks, lineColumn } = blocksOf(cells, headerRowIndex, width);
    if (blocks.length === 0) {
      sheetsSkipped.push({ sheet: sheetName, reason: 'no reject column' });
      continue;
    }
    if (blocks.length > 1) banded = true;

    // A block's heading proves its line exists even when every row under it is
    // still blank — a line that rejected nothing all week is a fact worth having,
    // and inferring the line list from the figures would hide exactly that line.
    for (const b of blocks) if (b.lineNo > 0) linesSeen.add(b.lineNo);

    // A sheet named for a line dates a flat table that names none.
    const sheetLine = lineFromLabel(sheetName);
    let wrote = 0;

    for (let r = headerRowIndex + 1; r < cells.length; r += 1) {
      const row = cells[r] ?? [];
      const rowNumber = firstRow + r + 1;

      for (const block of blocks) {
        const { cols } = block;
        const dateCell = cols.date >= 0 ? row[cols.date] : null;
        const rejectCell = row[cols.reject];

        // The block ran out of rows, or this is the TOTAL line at its foot. Both
        // are silent: a restatement of figures already counted is not an error,
        // and reporting one per block would bury the real errors under four.
        if (TOTAL_ROW.test(norm(dateCell)) || TOTAL_ROW.test(norm(row[0]))) continue;
        const blank = [dateCell, rejectCell, cols.style >= 0 ? row[cols.style] : null]
          .every((c) => cellText(c) === '');
        if (blank) continue;

        const lineNo = block.lineNo > 0
          ? block.lineNo
          : (lineColumn >= 0 ? lineFromLabel(cellText(row[lineColumn])) : null) ?? sheetLine ?? 0;
        if (lineNo <= 0) {
          errors.push({ sheet: sheetName, rowNumber, message: 'no line number for this row' });
          continue;
        }
        linesSeen.add(lineNo);

        const date = cellDate(dateCell);
        if (!date) {
          errors.push({ sheet: sheetName, rowNumber, message: 'the date could not be read' });
          continue;
        }

        const rejectQty = cellInt(rejectCell);
        if (rejectQty == null) {
          errors.push({ sheet: sheetName, rowNumber, message: 'the reject quantity is not a number' });
          continue;
        }

        const orderQty = cols.orderQty >= 0 ? cellInt(row[cols.orderQty]) : null;
        if (orderQty != null && rejectQty > orderQty) {
          warnings.push(
            `${sheetName} row ${rowNumber}: ${rejectQty} rejected out of an order of ${orderQty}.`
          );
        }

        rows.push({
          sheet: sheetName,
          rowNumber,
          line_no: lineNo,
          line_label: block.label || `Line ${String(lineNo).padStart(2, '0')}`,
          production_date: date,
          style_number: cols.style >= 0 ? (cellText(row[cols.style]) || null) : null,
          order_qty: orderQty,
          reject_qty: Math.max(rejectQty, 0),
          // Derived, never read from the sheet's "%" column: that column holds a
          // percentage typed as a plain number, which is indistinguishable from a
          // fraction once Excel has stored it. See 0013_rejection.sql.
          reject_pct: pct(rejectQty, orderQty)
        });
        wrote += 1;
      }
    }

    if (wrote > 0) sheetsUsed.push(sheetName);
    else sheetsSkipped.push({ sheet: sheetName, reason: 'no rejection rows recorded yet' });
  }

  // Nothing recognised the report at all — hand the file back to the next parser.
  if (sheetsUsed.length === 0 && rows.length === 0 && errors.length === 0) return null;

  const dates = rows.map((r) => r.production_date).sort();
  const orderQty = rows.reduce((sum, r) => sum + (r.order_qty ?? 0), 0);
  const rejectQty = rows.reduce((sum, r) => sum + r.reject_qty, 0);

  if (rows.length === 0) warnings.push('No rejection rows could be read from this workbook.');

  return {
    kind: 'rejection',
    label: banded
      ? 'Rejection report — one block per line, side by side'
      : 'Rejection report — one row per line and date',
    sheetsUsed,
    sheetsSkipped,
    rows,
    errors,
    warnings,
    periodStart: dates[0] ?? null,
    periodEnd: dates[dates.length - 1] ?? null,
    linesSeen: [...linesSeen].sort((a, b) => a - b),
    totals: { orderQty, rejectQty, rejectPct: pct(rejectQty, orderQty) }
  };
}
