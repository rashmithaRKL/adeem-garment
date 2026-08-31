import * as XLSX from 'xlsx';
import { isGuideSheet } from './guideSheet';

/**
 * Shared machinery for the header-driven importers (HR attendance, loading plan).
 *
 * The production and quality parsers each grew their own copies of this because
 * they read very differently shaped workbooks. These two do not: both are a flat
 * table with a header row somewhere near the top, so they share one reader and
 * one column matcher rather than a third and fourth private copy.
 */

export interface SheetTable {
  sheet: string;
  headerRow: number;
  headers: string[];
  rows: unknown[][];
}

/** Strips everything that varies between typists: case, spaces, punctuation. */
export const norm = (v: unknown): string =>
  String(v ?? '').toLowerCase().replace(/[\s_\-./\\%#()'’,:]+/g, '');

export const cellText = (v: unknown): string | null => {
  const t = String(v ?? '').trim();
  return t.length > 0 ? t : null;
};

export const cellInt = (v: unknown): number | null => {
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v) : null;
  const t = String(v ?? '').replace(/[,\s]/g, '');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? Math.round(n) : null;
};

const isoDay = (d: Date): string =>
  new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);

/**
 * Excel serials arrive as bare numbers whenever a cell was never formatted as a
 * date, so they are converted from the 1899-12-30 epoch rather than handed to
 * `new Date`, which would read 45000 as the year 45000.
 */
export const cellDate = (v: unknown): string | null => {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : isoDay(v);
  if (typeof v === 'number' && Number.isFinite(v)) {
    if (v < 1 || v > 100_000) return null;
    return new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86_400_000).toISOString().slice(0, 10);
  }
  const t = String(v ?? '').trim();
  if (!t) return null;
  // Day-first is the local convention on these sheets, and Date.parse reads
  // 03/08/2026 as 3 August in some engines and 8 March in others.
  const dmy = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/.exec(t);
  if (dmy) {
    const [, d, m, y] = dmy;
    const year = Number(y!.length === 2 ? '20' + y : y);
    const date = new Date(year, Number(m) - 1, Number(d));
    return Number.isNaN(date.getTime()) ? null : isoDay(date);
  }
  const parsed = new Date(t);
  return Number.isNaN(parsed.getTime()) ? null : isoDay(parsed);
};

/** A named column and every spelling of it seen in the wild. */
export interface ColumnSpec {
  key: string;
  synonyms: string[];
  /** Without these the sheet is not this kind of report at all. */
  required?: boolean;
}

export type ColumnIndex = Record<string, number>;

/**
 * Matches headers to columns: exact normalised hit first, then containment.
 *
 * A header is claimed once, so a sheet carrying both "Order No" and "Order Qty"
 * cannot have them both swallowed by whichever spec listed "order" first.
 */
export function matchColumns(headers: string[], specs: ColumnSpec[]): ColumnIndex {
  const index: ColumnIndex = {};
  const claimed = new Set<number>();
  const keys = headers.map(norm);

  for (const pass of ['exact', 'contains'] as const) {
    for (const spec of specs) {
      if (index[spec.key] != null) continue;
      for (let i = 0; i < keys.length; i += 1) {
        const key = keys[i]!;
        if (!key || claimed.has(i)) continue;
        // Containment runs one way only: the header may carry extra words around
        // a synonym ("Absent Qty" → absent), but a synonym may never swallow a
        // shorter header. The reverse direction matched a plain "Date" column
        // against "ppdate" and handed every production sheet to the loading-plan
        // parser, which is exactly the kind of silent mis-routing this file exists
        // to prevent.
        const hit = pass === 'exact'
          ? spec.synonyms.includes(key)
          : spec.synonyms.some((s) => s.length >= 3 && key.length >= 3 && key.includes(s));
        if (hit) {
          index[spec.key] = i;
          claimed.add(i);
          break;
        }
      }
    }
  }
  return index;
}

const densify = (row: unknown[]): unknown[] =>
  Array.from({ length: row.length }, (_, i) => row[i] ?? null);

/**
 * Finds the header row by scoring candidates against the columns being looked
 * for, rather than by taking the first row with some text in it. These sheets
 * open with a title block, a factory name and a date range, and any of those can
 * put three strings on a row long before the real headers arrive.
 */
function scoreHeaderRow(rows: unknown[][], specs: ColumnSpec[]): { index: number; score: number } {
  let best = { index: 0, score: 0 };
  for (let i = 0; i < Math.min(rows.length, 25); i += 1) {
    const headers = (rows[i] ?? []).map((h) => String(h ?? '').trim());
    if (headers.filter(Boolean).length < 2) continue;
    const matched = matchColumns(headers, specs);
    const score = Object.keys(matched).length;
    if (score > best.score) best = { index: i, score };
  }
  return best;
}

/**
 * Reads every sheet in the workbook and returns the ones that look like the
 * table described by `specs`, best match first. Multi-sheet workbooks are the
 * norm — one tab per month, or one per line — so all of them are offered rather
 * than only the first.
 */
export async function readTables(file: File, specs: ColumnSpec[]): Promise<SheetTable[]> {
  const workbook = XLSX.read(await file.arrayBuffer(), { cellDates: true });
  const required = specs.filter((s) => s.required).map((s) => s.key);

  const tables: SheetTable[] = [];
  for (const sheet of workbook.SheetNames) {
    // The guide sheet on a downloaded template lists the headers being looked
    // for here, one per row, so it reads as a table of its own if it is let in.
    if (isGuideSheet(sheet)) continue;
    const ws = workbook.Sheets[sheet];
    if (!ws || !ws['!ref']) continue;

    const rows = XLSX.utils
      .sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false })
      .map(densify);
    if (rows.length < 2) continue;

    const { index, score } = scoreHeaderRow(rows, specs);
    if (score === 0) continue;

    const headers = (rows[index] ?? []).map((h) => String(h ?? '').trim());
    const matched = matchColumns(headers, specs);
    if (!required.every((key) => matched[key] != null)) continue;

    tables.push({
      sheet,
      headerRow: index,
      headers,
      rows: rows.slice(index + 1).filter((r) => r.some((c) => c !== '' && c != null))
    });
  }
  return tables;
}

export interface ImportIssue {
  sheet: string;
  rowNumber: number;
  message: string;
}
