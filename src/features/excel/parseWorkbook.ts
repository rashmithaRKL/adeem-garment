import * as XLSX from 'xlsx';
import type { ColumnMapping, ImportRow, MappableField, RowIssue } from '@/types/domain';
import { detectColumns, mappedFields, namesForeignFigure } from './columnDetection';
import {
  analyseWorkbook, cellText, columnLetter, lineFromHeading, lineFromLabel, norm, type SheetLayout
} from './layout';
import { EFFICIENCY_THRESHOLD } from '@/lib/env';

export interface ParsedWorkbook {
  sheetCount: number;
  /** Data rows across every sheet read. A banded sheet yields more records. */
  rowCount: number;
  columnCount: number;
  headerRowIndex: number;
  /** One entry per logical column, blanks named "Column D". */
  headers: string[];
  /** First value under each column, shown beside the header while mapping. */
  samples: string[];
  mappings: ColumnMapping[];
  layouts: SheetLayout[];
  sheetsUsed: string[];
  sheetsSkipped: string[];
  /** Plain-language summary of the layout the scan settled on. */
  layoutNote: string;
}

export async function parseWorkbook(file: File): Promise<ParsedWorkbook> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { cellDates: true });
  if (workbook.SheetNames.length === 0) throw new Error('The workbook contains no sheets.');

  const { sheetCount, layouts, skipped } = analyseWorkbook(workbook);
  const best = layouts[0];
  if (!best) throw new Error('None of the sheets in this workbook contain any data.');

  const rowCount = layouts.reduce((total, l) => total + l.rows.length, 0);
  const detected = detectColumns(best.headers);
  const mappings: ColumnMapping[] = detected.map((m, i) => ({
    ...m,
    excelHeader: best.displayHeaders[i] ?? 'Column ' + columnLetter(i)
  }));

  return {
    sheetCount,
    rowCount,
    columnCount: best.width,
    headerRowIndex: best.headerRowIndex,
    headers: best.displayHeaders,
    samples: best.samples,
    mappings,
    layouts,
    sheetsUsed: layouts.map((l) => l.sheet),
    sheetsSkipped: skipped,
    layoutNote: describeLayout(layouts, skipped)
  };
}

function describeLayout(layouts: SheetLayout[], skipped: string[]): string {
  const best = layouts[0];
  if (!best) return '';

  const parts: string[] = [];
  parts.push(layouts.length > 1
    ? layouts.length + ' sheets read (' + layouts.map((l) => l.sheet).join(', ') + ')'
    : 'Sheet "' + best.sheet + '"');
  parts.push('headers on row ' + (best.headerRowIndex + 1));

  const labelled = best.bands.filter((b) => b.label);
  if (labelled.length > 1) {
    parts.push(labelled.length + ' side-by-side blocks (' +
      labelled.map((b) => b.label).join(', ') + ') read as separate records');
  }

  const dataRows = layouts.reduce((n, l) => n + l.rows.length, 0);
  parts.push(dataRows + ' data row' + (dataRows === 1 ? '' : 's'));
  if (skipped.length > 0) parts.push('skipped: ' + skipped.join(', '));

  return parts.join(' · ');
}

const toInt = (v: unknown): number | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.round(v);
  const text = String(v ?? '').replace(/[,\s%]/g, '');
  if (!text) return null;
  const n = Number(text);
  return Number.isFinite(n) ? Math.round(n) : null;
};

/** A line cell may hold a number, "L3" or "Line 03" depending on who typed it. */
const toLine = (v: unknown): number | null => toInt(v) ?? lineFromLabel(cellText(v));

const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Excel stores a percent-formatted cell as a fraction, so "85%" arrives as 0.85.
 * Anything at or below 1.5 is read as a fraction; above that it is already a
 * percentage. numeric(5,2) caps the column at 999.99.
 */
const toPercent = (v: unknown): number | null => {
  const isFraction = typeof v === 'number' && v > 0 && v <= 1.5;
  const text = String(v ?? '').replace(/[,\s%]/g, '');
  if (!text) return null;
  const n = Number(text);
  if (!Number.isFinite(n)) return null;
  return Math.min(round2(isFraction ? n * 100 : n), 999.99);
};

const toText = (v: unknown): string | null => {
  const text = String(v ?? '').trim();
  return text.length > 0 ? text : null;
};

/**
 * Excel serial dates arrive as numbers when a cell is not formatted as a date,
 * so they are converted from the 1899-12-30 epoch rather than fed to `new Date`,
 * which would read 45000 as the year 45000.
 */
const toIsoDateOrNull = (v: unknown): string | null => {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : localDay(v);
  if (typeof v === 'number' && Number.isFinite(v)) {
    // Excel serial: days since 1899-12-30, already calendar-absolute.
    if (v < 1 || v > 100_000) return null;
    return new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86_400_000).toISOString().slice(0, 10);
  }
  const text = String(v ?? '').trim();
  if (!text) return null;
  // Day-first is the local convention: Date.parse reads 03/08/2026 as 3 August
  // in some engines and 8 March in others.
  const dmy = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/.exec(text);
  if (dmy) {
    const year = Number(dmy[3]!.length === 2 ? '20' + dmy[3] : dmy[3]);
    const date = new Date(year, Number(dmy[2]) - 1, Number(dmy[1]));
    return Number.isNaN(date.getTime()) ? null : localDay(date);
  }
  const d = new Date(text);
  return Number.isNaN(d.getTime()) ? null : localDay(d);
};

/** Reads the calendar day the user sees, not the UTC one. */
function localDay(d: Date): string {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

const today = (): string => localDay(new Date());

/**
 * A daily sheet usually has no date column - the date is written once in the
 * title block. Reading it there files the sheet under the day it covers instead
 * of under whatever day it happened to be uploaded.
 */
function dateFromTitle(cells: unknown[]): string | null {
  for (const cell of cells) {
    if (cell instanceof Date) return toIsoDateOrNull(cell);
    const text = cellText(cell);
    if (!text) continue;
    const match = /\d{1,4}[/\-.]\d{1,2}[/\-.]\d{2,4}/.exec(text);
    const iso = match ? toIsoDateOrNull(match[0]) : null;
    if (iso) return iso;
  }
  return null;
}

const TOTAL_ROW = /^(?:grand)?(?:total|totals|subtotal|sum|average|avg)\b/;

export interface ValidationResult {
  rows: ImportRow[];
  warnings: RowIssue[];
  errors: (RowIssue & { type: string })[];
}

/**
 * Fields the import genuinely cannot run without. Target is not among them - a
 * sheet that records output but not a plan still imports, with a target of 0 -
 * and the line may come from a band heading or a tab name instead of a column.
 */
/**
 * Reports the factory produces that this importer has nowhere to put.
 *
 * Recognising one by name is the difference between "no column is mapped to
 * Order number" — which reads as a mapping the user forgot — and "this is a
 * rejection report, and there is no rejection table". The second is the truth,
 * and it tells them what to ask the developer for.
 *
 * Matched against the normalised header text, so "REJECT QTY", "Reject Qty" and
 * "REJECTQTY" all answer to the same entry.
 */
const UNSUPPORTED_SHAPES: { name: string; figure: string; pattern: RegExp }[] = [
  { name: 'rejection report', figure: 'rejected pieces',
    pattern: /^(reject|rejection|rejected)(qty|pcs|quantity|nos?)?$/ },
  { name: 'wastage report', figure: 'wasted or scrapped pieces',
    pattern: /^(waste|wastage|scrap)(qty|pcs|quantity)?$/ },
  { name: 'cutting report', figure: 'pieces cut',
    pattern: /^(cut|cutting)(qty|pcs|quantity|output)?$/ },
  { name: 'shipment report', figure: 'pieces shipped',
    pattern: /^(shipped|shipment|dispatch|dispatched|delivered)(qty|pcs|quantity)?$/ },
  { name: 'alteration report', figure: 'pieces sent back for alteration',
    pattern: /^(alter|alteration|rework|repair)(qty|pcs|quantity)?$/ }
];

export interface WorkbookDiagnosis {
  /** Required fields no column in this workbook holds. Empty means importable. */
  missing: MappableField[];
  /** Plain names for those fields, ready to print. */
  missingNames: string[];
  /** The distinct headers the workbook does carry, in sheet order. */
  headers: string[];
  /** Headers naming a figure the production table has no column for. */
  foreignHeaders: string[];
  /** A recognised-but-unsupported report shape, when the headers name one. */
  shape: { name: string; figure: string } | null;
}

/**
 * Why a workbook cannot be imported, in terms the person holding it can act on.
 *
 * The Map step can always be opened by hand, so this is not a lock — it is the
 * answer to "why is every dropdown saying Not imported". Before it existed, a
 * workbook with no importable column parked the user on the mapping screen with
 * a disabled button and a one-line complaint about a single field, which is a
 * dead end: no amount of choosing from those dropdowns could produce a record,
 * because the columns the production table needs are not in the file.
 */
export function diagnose(parsed: ParsedWorkbook, mappings: ColumnMapping[]): WorkbookDiagnosis {
  const missing = blockingFields(parsed, mappings);
  const headers = [...new Set(parsed.headers.filter((h) => h.trim().length > 0))];
  const foreignHeaders = headers.filter(namesForeignFigure);

  const shape = UNSUPPORTED_SHAPES.find((candidate) =>
    parsed.headers.some((h) => candidate.pattern.test(normaliseHeader(h)))) ?? null;

  return {
    missing,
    missingNames: missing.map((f) => FIELD_NAME[f]),
    headers,
    foreignHeaders,
    shape: shape ? { name: shape.name, figure: shape.figure } : null
  };
}

const normaliseHeader = (header: string): string =>
  header.toLowerCase().replace(/[\s_\-./\\%#()'’,:]+/g, '').trim();

export function blockingFields(parsed: ParsedWorkbook, mappings: ColumnMapping[]): MappableField[] {
  const mapped = mappedFields(mappings);
  const missing: MappableField[] = [];
  if (!mapped.has('orderNumber')) missing.push('orderNumber');
  if (!mapped.has('actualQuantity')) missing.push('actualQuantity');

  // The line can come from the tab name, a band heading over each block, or a
  // "Line 03" heading row between the records, so a sheet without a line column
  // is only blocked when none of those is present.
  const lineComesFromLayout = parsed.layouts.every((l) =>
    l.sheetLineNumber != null || l.hasSectionLines || l.bands.every((b) => b.lineNumber != null));
  if (!mapped.has('lineNumber') && !lineComesFromLayout) missing.push('lineNumber');

  return missing;
}

/** Rows with errors are reported and skipped - never silently dropped. */
export function validateRows(parsed: ParsedWorkbook, mappings: ColumnMapping[]): ValidationResult {
  const indexOf = (field: MappableField): number => mappings.findIndex((m) => m.field === field);

  const cols = {
    line: indexOf('lineNumber'),
    order: indexOf('orderNumber'),
    target: indexOf('targetQuantity'),
    actual: indexOf('actualQuantity'),
    efficiency: indexOf('efficiency'),
    date: indexOf('productionDate'),
    buyer: indexOf('buyer'),
    style: indexOf('styleNumber'),
    product: indexOf('productName'),
    color: indexOf('color'),
    size: indexOf('size'),
    orderQuantity: indexOf('orderQuantity'),
    deliveryDate: indexOf('deliveryDate')
  };

  const rows: ImportRow[] = [];
  const warnings: RowIssue[] = [];
  const errors: (RowIssue & { type: string })[] = [];

  const blocking = blockingFields(parsed, mappings);
  if (blocking.length > 0) {
    for (const field of blocking) {
      errors.push({
        rowNumber: 0, column: FIELD_NAME[field], type: 'unmapped_column',
        message: 'No column is mapped to ' + FIELD_NAME[field] +
          ' - open the Map step and choose which column holds it.'
      });
    }
    return { rows, warnings, errors };
  }

  if (cols.target < 0) {
    warnings.push({ rowNumber: 0, column: 'Target',
      message: 'No target column was found, so every record is imported with a target of 0.' });
  }

  const multiSheet = parsed.layouts.length > 1;

  for (const layout of parsed.layouts) {
    // A sheet without a date column is one day's sheet: file it under the date
    // written in its title block, and only under today when there is none.
    const fallbackDate = dateFromTitle(layout.titleCells) ?? today();
    let sectionLine: number | null = null;

    layout.rows.forEach((raw, i) => {
      const rowNumber = layout.rowNumbers[i] ?? i + 1;
      const filled = raw.map(cellText).filter(Boolean);
      const distinct = new Set(filled);

      // "Line 03" alone on a row is a section heading, and the rows beneath it
      // belong to that line. A merged heading fills its whole row, so one
      // repeated value counts as alone.
      if (distinct.size === 1) {
        const heading = lineFromHeading(filled[0] ?? '');
        if (heading != null) {
          sectionLine = heading;
          return;
        }
      }
      if (TOTAL_ROW.test(norm(filled[0] ?? ''))) return;

      for (const band of layout.bands) {
        const cell = (logical: number): unknown => {
          if (logical < 0) return undefined;
          const column = band.columns[logical];
          return column == null || column < 0 ? undefined : raw[column];
        };
        const where = (multiSheet ? layout.sheet + ' ' : '') + (band.label ? band.label + ' ' : '');

        // A block with nothing in it is a line that did not run, not an error.
        const anyValue = [cols.line, cols.order, cols.target, cols.actual, cols.efficiency]
          .some((c) => cellText(cell(c)).length > 0);
        if (!anyValue) continue;

        // Stacked sheets repeat their header row between blocks; that row is not
        // a record, and reporting it as a broken one only confuses the operator.
        const orderCell = norm(cell(cols.order));
        if (orderCell.length > 0 && orderCell === norm(mappings[cols.order]?.excelHeader)) continue;

        const lineNumber = toLine(cell(cols.line)) ?? band.lineNumber ?? sectionLine ?? layout.sheetLineNumber;
        const orderNumber = String(cell(cols.order) ?? '').trim();
        const target = toInt(cell(cols.target)) ?? 0;
        const actual = toInt(cell(cols.actual));

        if (!orderNumber) {
          errors.push({ rowNumber, column: 'Order No', type: 'missing_required',
            message: where + 'order number is blank - the row cannot be linked to an order.' });
          continue;
        }
        if (lineNumber == null) {
          errors.push({ rowNumber, column: 'Line No', type: 'invalid_line',
            message: where + 'line number is missing or not a number.' });
          continue;
        }
        if (actual == null) {
          errors.push({ rowNumber, column: 'Prod Qty', type: 'invalid_number',
            message: where + 'produced quantity "' + cellText(cell(cols.actual)) + '" is not a number.' });
          continue;
        }

        const efficiency = cols.efficiency >= 0
          ? toPercent(cell(cols.efficiency))
          : target > 0 ? round2((actual / target) * 100) : null;

        if (efficiency != null && efficiency < EFFICIENCY_THRESHOLD) {
          warnings.push({ rowNumber, column: 'Eff %',
            message: where + 'efficiency ' + efficiency + '% is below the ' + EFFICIENCY_THRESHOLD + '% threshold.' });
        }
        if (target > 0 && actual > target * 1.02) {
          warnings.push({ rowNumber, column: 'Prod Qty',
            message: where + 'produced quantity exceeds target - verify the count.' });
        }

        const productionDate = toIsoDateOrNull(cell(cols.date));
        if (cols.date >= 0 && productionDate == null && cellText(cell(cols.date)).length > 0) {
          warnings.push({ rowNumber, column: 'Date',
            message: where + 'production date could not be read; the row was filed under ' + fallbackDate + '.' });
        }

        const record: Record<string, unknown> = {};
        parsed.headers.forEach((header, j) => { record[header] = cell(j) ?? null; });
        if (band.label) record['Block'] = band.label;
        if (multiSheet) record['Sheet'] = layout.sheet;

        rows.push({
          rowNumber,
          lineNumber,
          orderNumber,
          productionDate: productionDate ?? fallbackDate,
          targetQuantity: target,
          actualQuantity: actual,
          efficiency,
          order: {
            buyer: toText(cell(cols.buyer)),
            styleNumber: toText(cell(cols.style)),
            productName: toText(cell(cols.product)),
            color: toText(cell(cols.color)),
            size: toText(cell(cols.size)),
            orderQuantity: toInt(cell(cols.orderQuantity)),
            deliveryDate: toIsoDateOrNull(cell(cols.deliveryDate))
          },
          raw: record
        });
      }
    });
  }

  return { rows, warnings, errors };
}

const FIELD_NAME: Record<MappableField, string> = {
  lineNumber: 'Production line', orderNumber: 'Order number', buyer: 'Buyer',
  styleNumber: 'Style number', productName: 'Product name', color: 'Colour', size: 'Size',
  orderQuantity: 'Order quantity', targetQuantity: 'Target quantity',
  actualQuantity: 'Produced quantity', efficiency: 'Efficiency',
  productionDate: 'Production date', deliveryDate: 'Delivery date', remarks: 'Remarks'
};
