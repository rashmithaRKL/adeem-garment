import * as XLSX from 'xlsx';
import type { ColumnMapping, ImportRow, MappableField, RowIssue } from '@/types/domain';
import { detectColumns } from './columnDetection';
import { EFFICIENCY_THRESHOLD } from '@/lib/env';

export interface ParsedWorkbook {
  sheetCount: number;
  rowCount: number;
  columnCount: number;
  headerRowIndex: number;
  headers: string[];
  mappings: ColumnMapping[];
  dataRows: unknown[][];
}

/**
 * sheet_to_json leaves a hole - not a value - wherever a cell is empty or has been
 * swallowed by a merge, and real production sheets are full of both. JavaScript's
 * array methods then disagree about those holes: map, forEach, some and filter skip
 * them, but findIndex visits every index and hands the callback `undefined`. That
 * mismatch crashed the scan, because a sparse header row produced a sparse mapping
 * array and validateRows' findIndex then read `.field` off a hole.
 *
 * Densifying once, here, is what keeps every downstream call site honest.
 */
const densify = (row: unknown[]): unknown[] =>
  Array.from({ length: row.length }, (_, i) => row[i] ?? null);

/**
 * Production sheets rarely start on row 1 - there is usually a title block.
 * The header row is the first row where at least three cells are non-empty text.
 */
function findHeaderRow(rows: unknown[][]): number {
  for (let i = 0; i < Math.min(rows.length, 20); i += 1) {
    const cells = (rows[i] ?? []).filter((c) => typeof c === 'string' && c.trim().length > 0);
    if (cells.length >= 3) return i;
  }
  return 0;
}

export async function parseWorkbook(file: File): Promise<ParsedWorkbook> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error('The workbook contains no sheets.');

  const sheet = workbook.Sheets[sheetName]!;
  const rows = XLSX.utils
    .sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false })
    .map(densify);

  const headerRowIndex = findHeaderRow(rows);
  const headers = (rows[headerRowIndex] ?? []).map((h) => String(h ?? '').trim());
  const dataRows = rows.slice(headerRowIndex + 1).filter((r) => r.some((c) => c !== '' && c != null));

  return {
    sheetCount: workbook.SheetNames.length,
    rowCount: dataRows.length,
    columnCount: headers.length,
    headerRowIndex,
    headers,
    mappings: detectColumns(headers),
    dataRows
  };
}

const toInt = (v: unknown): number | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.round(v);
  const text = String(v ?? '').replace(/[,\s%]/g, '');
  if (!text) return null;
  const n = Number(text);
  return Number.isFinite(n) ? Math.round(n) : null;
};

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
  if (v instanceof Date) return localDay(v);
  if (typeof v === 'number' && Number.isFinite(v)) {
    // Excel serial: days since 1899-12-30, already calendar-absolute.
    if (v < 1 || v > 100_000) return null;
    return new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86_400_000).toISOString().slice(0, 10);
  }
  const text = String(v ?? '').trim();
  if (!text) return null;
  const d = new Date(text);
  return Number.isNaN(d.getTime()) ? null : localDay(d);
};

/** Reads the calendar day the user sees, not the UTC one. */
function localDay(d: Date): string {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

const today = (): string => localDay(new Date());

export interface ValidationResult {
  rows: ImportRow[];
  warnings: RowIssue[];
  errors: (RowIssue & { type: string })[];
}

/** Rows with errors are reported and skipped - never silently dropped. */
export function validateRows(parsed: ParsedWorkbook, mappings: ColumnMapping[]): ValidationResult {
  const indexOf = (field: MappableField): number =>
    mappings.findIndex((m) => m.field === field);

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

  // A sheet without a date column is the day's sheet: file it under today, once,
  // rather than under whatever partial date each row happens to contain.
  const fallbackDate = today();

  const rows: ImportRow[] = [];
  const warnings: RowIssue[] = [];
  const errors: (RowIssue & { type: string })[] = [];

  parsed.dataRows.forEach((raw, i) => {
    const rowNumber = parsed.headerRowIndex + 2 + i;
    const cell = (idx: number): unknown => (idx >= 0 ? raw[idx] : undefined);

    const lineNumber = toInt(cell(cols.line));
    const orderNumber = String(cell(cols.order) ?? '').trim();
    const target = toInt(cell(cols.target)) ?? 0;
    const actual = toInt(cell(cols.actual));

    if (!orderNumber) {
      errors.push({ rowNumber, column: 'Order No', type: 'missing_required',
        message: 'Order number is blank - the row cannot be linked to an order.' });
      return;
    }
    if (lineNumber == null) {
      errors.push({ rowNumber, column: 'Line No', type: 'invalid_line',
        message: 'Line number is missing or not a number.' });
      return;
    }
    if (actual == null) {
      errors.push({ rowNumber, column: 'Prod Qty', type: 'invalid_number',
        message: 'Produced quantity "' + String(cell(cols.actual) ?? '') + '" is not a number.' });
      return;
    }

    const efficiency = cols.efficiency >= 0
      ? toPercent(cell(cols.efficiency))
      : target > 0 ? round2((actual / target) * 100) : null;

    if (efficiency != null && efficiency < EFFICIENCY_THRESHOLD) {
      warnings.push({ rowNumber, column: 'Eff %',
        message: 'Efficiency ' + efficiency + '% is below the ' + EFFICIENCY_THRESHOLD + '% threshold.' });
    }
    if (target > 0 && actual > target * 1.02) {
      warnings.push({ rowNumber, column: 'Prod Qty',
        message: 'Produced quantity exceeds target - verify the count.' });
    }

    const productionDate = toIsoDateOrNull(cell(cols.date));
    if (cols.date >= 0 && productionDate == null && cell(cols.date) != null) {
      warnings.push({ rowNumber, column: 'Date',
        message: 'Production date could not be read; the row was filed under today.' });
    }

    const record: Record<string, unknown> = {};
    parsed.headers.forEach((h, idx) => { record[h] = raw[idx] ?? null; });

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
  });

  return { rows, warnings, errors };
}
