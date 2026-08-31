import * as XLSX from 'xlsx';
import { requiredHits, scoreHeaders } from './columnDetection';
import { isGuideSheet } from './guideSheet';

/**
 * Works out how a production workbook is actually laid out, because no two
 * factories type one the same way.
 *
 * Three shapes turn up in practice and all three are read here:
 *
 *   1. A flat table with a title block above it.
 *   2. A banded table - one column block per sewing line, sitting side by side
 *      under a merged "Line 01" / "Line 02" heading. Each block repeats the same
 *      sub-headers, so the sheet has to be unpivoted before it means anything.
 *   3. One tab per line or per day, every tab carrying the same columns.
 *
 * The header row is found by scoring candidates against the fields the importer
 * knows, not by taking the first row with text on it: a title block, a factory
 * name or a merged band heading all put text on a row long before the real
 * headers arrive, and taking the first of those is what fed the importer a row
 * of "Line 01" values and made every record fail as "order number is blank".
 */

/** Rows examined when hunting for the header. Title blocks are rarely deeper. */
const MAX_SCAN_ROWS = 30;
/** Guards against a workbook whose declared range is far larger than its data. */
const MAX_GRID_ROWS = 20_000;
const MAX_GRID_COLS = 256;
/** A band has to carry enough of the required columns to stand on its own. */
const MIN_BAND_REQUIRED_HITS = 2;

export const cellText = (v: unknown): string => (v == null ? '' : String(v).trim());

/** Strips everything that varies between typists: case, spaces, punctuation. */
export const norm = (v: unknown): string =>
  cellText(v).toLowerCase().replace(/[\s_\-./\\%#()'’,:]+/g, '');

/** A1-style column name, so a blank header can still be named in the UI. */
export function columnLetter(index: number): string {
  let n = index;
  let name = '';
  do {
    name = String.fromCharCode(65 + (n % 26)) + name;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return name;
}

/**
 * Reads a line number out of a band heading, a sheet name or a cell:
 * "Line 01", "LINE-3", "L2", "Module 4", "Team 07" or a bare "3".
 */
export function lineFromLabel(label: string): number | null {
  const text = label.trim();
  if (!text) return null;
  const named = /(?:^|\b)(?:line|l|module|team|sewing\s*line)\s*[-_#]?\s*0*(\d{1,3})(?:\b|$)/i.exec(text);
  if (named) return Number(named[1]);
  const bare = /^0*(\d{1,3})$/.exec(text);
  return bare ? Number(bare[1]) : null;
}

/**
 * The same, but anchored: a cell is only a section heading when that is all it
 * says. A bare number is a line number in a band heading or a tab name, and is
 * deliberately not one here - plenty of rows carry a lone figure.
 */
export function lineFromHeading(label: string): number | null {
  const match = /^(?:line|l|module|team|sewing\s*line)\s*[-_#]?\s*0*(\d{1,3})$/i.exec(label.trim());
  return match ? Number(match[1]) : null;
}

/** One column block of a banded sheet - or the whole sheet when it is flat. */
export interface SheetBand {
  /** The merged heading above the block, e.g. "Line 01". Null when flat. */
  label: string | null;
  /** Line number read from that heading, when it carries one. */
  lineNumber: number | null;
  /** Sheet column index for each logical column; -1 where the block has none. */
  columns: number[];
}

export interface SheetLayout {
  sheet: string;
  /** 0-based index into the sheet's own rows. */
  headerRowIndex: number;
  /** The merged band heading row, when the sheet is banded. */
  bandRowIndex: number | null;
  /** Header text per logical column, as written in the sheet. */
  headers: string[];
  /** The same, with blanks named "Column D" so every column can be mapped. */
  displayHeaders: string[];
  /** First value seen under each logical column, to show while mapping. */
  samples: string[];
  bands: SheetBand[];
  /** Data rows, merged cells filled in, every row the same width. */
  rows: unknown[][];
  /** 1-based Excel row number for each data row, for error messages. */
  rowNumbers: number[];
  /** Everything above the header row - where a sheet-wide date usually hides. */
  titleCells: unknown[];
  /** Line number read from the sheet's own name, for one-tab-per-line books. */
  sheetLineNumber: number | null;
  /** True when the data carries "Line 03" heading rows between its records. */
  hasSectionLines: boolean;
  width: number;
  score: number;
  /** Normalised header list, used to decide which tabs belong together. */
  signature: string;
}

export interface Grid {
  cells: unknown[][];
  /** Sheet row index the grid starts at, so Excel row numbers stay truthful. */
  firstRow: number;
  width: number;
}

/**
 * Reads the sheet as a dense grid with merged ranges filled in.
 *
 * sheet_to_json leaves a hole wherever a merge swallowed a cell, which is what
 * turns a merged "Line 01" heading into one label followed by four blanks. The
 * value is copied across the range instead, so a band heading covers its block
 * and an order number merged down three rows belongs to all three.
 */
export function readGrid(ws: XLSX.WorkSheet): Grid {
  const ref = ws['!ref'];
  if (!ref) return { cells: [], firstRow: 0, width: 0 };

  const range = XLSX.utils.decode_range(ref);
  const firstRow = range.s.r;
  const firstCol = range.s.c;
  const height = Math.min(range.e.r - firstRow + 1, MAX_GRID_ROWS);
  const width = Math.min(range.e.c - firstCol + 1, MAX_GRID_COLS);
  if (height <= 0 || width <= 0) return { cells: [], firstRow, width: 0 };

  const cells: unknown[][] = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => null as unknown));

  for (let r = 0; r < height; r += 1) {
    const row = cells[r]!;
    for (let c = 0; c < width; c += 1) {
      const cell = ws[XLSX.utils.encode_cell({ r: firstRow + r, c: firstCol + c })] as
        { v?: unknown } | undefined;
      row[c] = cell?.v ?? null;
    }
  }

  for (const merge of ws['!merges'] ?? []) {
    const top = merge.s.r - firstRow;
    const left = merge.s.c - firstCol;
    const value = cells[top]?.[left];
    if (value == null) continue;
    for (let r = top; r <= merge.e.r - firstRow; r += 1) {
      const row = cells[r];
      if (!row) continue;
      for (let c = left; c <= merge.e.c - firstCol && c < width; c += 1) {
        if (r === top && c === left) continue;
        row[c] = value;
      }
    }
  }

  return { cells, firstRow, width };
}

/** Contiguous runs of the same label, which is what a filled merge looks like. */
export function runsOf(row: unknown[], width: number): { label: string; start: number; end: number }[] {
  const runs: { label: string; start: number; end: number }[] = [];
  for (let c = 0; c < width; c += 1) {
    const label = cellText(row[c]);
    if (!label) continue;
    const last = runs[runs.length - 1];
    if (last && last.label === label && last.end === c - 1) last.end = c;
    else runs.push({ label, start: c, end: c });
  }
  return runs;
}

const spanOf = (run: { start: number; end: number }): number[] =>
  Array.from({ length: run.end - run.start + 1 }, (_, i) => run.start + i);

/** Do two blocks carry the same sub-headers? Half of them matching is enough. */
function repeatsHeaders(first: string[], other: string[]): boolean {
  const wanted = first.map(norm).filter(Boolean);
  if (wanted.length === 0) return false;
  const have = new Set(other.map(norm).filter(Boolean));
  return wanted.filter((h) => have.has(h)).length * 2 >= wanted.length;
}

/**
 * Decides whether the row above the headers is a set of per-line band headings
 * rather than a report title.
 *
 * The test is deliberately strict, because reading a title row as bands would
 * quietly triple every figure. Two or more runs are needed, each spanning more
 * than one column, each carrying a required column of its own, the sheet as a
 * whole carrying two, and every block repeating the first block's sub-headers.
 * A merged report title is a single run and fails at the first condition.
 *
 * Columns outside every band are shared: a sheet whose order number sits on the
 * left with one Target/Produced block per line is read as one record per line,
 * all of them carrying that order.
 */
function detectBands(
  cells: unknown[][], headerRowIndex: number, width: number
): { bandRowIndex: number | null; bands: SheetBand[]; logicalColumns: number[] } {
  const flat = {
    bandRowIndex: null,
    bands: [{ label: null, lineNumber: null, columns: Array.from({ length: width }, (_, i) => i) }],
    logicalColumns: Array.from({ length: width }, (_, i) => i)
  };

  if (headerRowIndex === 0) return flat;
  const bandRow = cells[headerRowIndex - 1];
  const headerRow = cells[headerRowIndex];
  if (!bandRow || !headerRow) return flat;

  const runs = runsOf(bandRow, width).filter((r) => r.end > r.start);
  if (runs.length < 2) return flat;

  const banded = new Set<number>();
  for (const run of runs) for (const c of spanOf(run)) banded.add(c);

  const headersOf = (columns: number[]): string[] => columns.map((c) => cellText(headerRow[c]));
  const sharedColumns: number[] = [];
  for (let c = 0; c < width; c += 1) {
    if (!banded.has(c) && cellText(headerRow[c])) sharedColumns.push(c);
  }

  const firstColumns = spanOf(runs[0]!);
  const firstHeaders = headersOf(firstColumns);
  if (runs.some((run) => requiredHits(headersOf(spanOf(run))) < 1)) return flat;

  // A band heading that reads "Line 01" supplies the line number itself, and that
  // is a required field arriving from the layout rather than from a column. Not
  // counting it meant a sheet whose blocks carry one required column each -- a
  // produced quantity per line and nothing else -- fell short of the two-hit bar
  // and was read as one flat table of repeated headers instead.
  //
  // The credit is only given when every run names a distinct line, which a merged
  // report title cannot do: it is a single run and has already failed above.
  const bandLines = runs.map((run) => lineFromLabel(run.label));
  const suppliesLine = bandLines.every((n) => n != null)
    && new Set(bandLines).size === bandLines.length;
  const fromLayout = suppliesLine ? 1 : 0;
  if (requiredHits([...headersOf(sharedColumns), ...firstHeaders]) + fromLayout < MIN_BAND_REQUIRED_HITS) {
    return flat;
  }
  if (runs.slice(1).some((run) => !repeatsHeaders(firstHeaders, headersOf(spanOf(run))))) return flat;

  // Logical columns in sheet order: the shared ones plus the first block's.
  const shared = new Set(sharedColumns);
  const inFirst = new Set(firstColumns);
  const logicalColumns: number[] = [];
  const isShared: boolean[] = [];
  for (let c = 0; c < width; c += 1) {
    if (shared.has(c)) { logicalColumns.push(c); isShared.push(true); }
    else if (inFirst.has(c)) { logicalColumns.push(c); isShared.push(false); }
  }
  const headers = headersOf(logicalColumns);

  const bands: SheetBand[] = runs.map((run) => {
    const own = spanOf(run);
    const used = new Set<number>();
    // Positional first, by header text second: blocks are usually identical, but
    // a typist who reordered two columns in one block should still be read right.
    const columns = logicalColumns.map((column, j) => {
      if (isShared[j]) return column;
      const wanted = norm(headers[j]);
      const positional = own[firstColumns.indexOf(column)];
      if (positional != null && norm(headerRow[positional]) === wanted) {
        used.add(positional);
        return positional;
      }
      const found = own.find((c) => !used.has(c) && norm(headerRow[c]) === wanted);
      if (found != null) {
        used.add(found);
        return found;
      }
      return -1;
    });
    return { label: run.label, lineNumber: lineFromLabel(run.label), columns };
  });

  return { bandRowIndex: headerRowIndex - 1, bands, logicalColumns };
}

/**
 * Scores every candidate row and takes the best. Falling back to the old
 * "first row with three strings" rule keeps a sheet the scorer cannot read at
 * all on screen, so the user can map it by hand rather than be told it is empty.
 */
function chooseHeaderRow(cells: unknown[][], width: number): { index: number; score: number } {
  let best = { index: -1, score: 0 };
  const limit = Math.min(cells.length, MAX_SCAN_ROWS);

  for (let i = 0; i < limit; i += 1) {
    const headers = (cells[i] ?? []).slice(0, width).map(cellText);
    if (headers.filter(Boolean).length < 2) continue;
    const score = scoreHeaders(headers);
    if (score > best.score) best = { index: i, score };
  }
  if (best.index >= 0) return best;

  for (let i = 0; i < limit; i += 1) {
    const filled = (cells[i] ?? []).filter((c) => cellText(c).length > 0);
    if (filled.length >= 3) return { index: i, score: 0 };
  }
  return { index: 0, score: 0 };
}

function analyseSheet(sheet: string, ws: XLSX.WorkSheet): SheetLayout | null {
  const { cells, firstRow, width } = readGrid(ws);
  if (cells.length < 2 || width === 0) return null;

  const { index: headerRowIndex, score } = chooseHeaderRow(cells, width);
  const { bandRowIndex, bands, logicalColumns } = detectBands(cells, headerRowIndex, width);

  const headerRow = cells[headerRowIndex] ?? [];
  const headers = logicalColumns.map((c) => cellText(headerRow[c]));
  const displayHeaders = headers.map((h, j) =>
    h || 'Column ' + columnLetter(logicalColumns[j] ?? j));

  const rows: unknown[][] = [];
  const rowNumbers: number[] = [];
  for (let i = headerRowIndex + 1; i < cells.length; i += 1) {
    const row = cells[i];
    if (!row || !row.some((c) => cellText(c).length > 0)) continue;
    rows.push(row);
    rowNumbers.push(firstRow + i + 1);
  }

  const samples = headers.map((_, j) => {
    for (const row of rows) {
      for (const band of bands) {
        const c = band.columns[j];
        if (c == null || c < 0) continue;
        const value = cellText(row[c]);
        if (value) return value;
      }
    }
    return '';
  });

  const hasSectionLines = rows.some((row) => {
    const filled = row.map(cellText).filter(Boolean);
    return new Set(filled).size === 1 && lineFromHeading(filled[0] ?? '') != null;
  });

  return {
    sheet,
    headerRowIndex,
    bandRowIndex,
    headers,
    displayHeaders,
    samples,
    bands,
    rows,
    rowNumbers,
    titleCells: cells.slice(0, headerRowIndex).flat(),
    sheetLineNumber: lineFromLabel(sheet),
    hasSectionLines,
    width,
    score,
    signature: headers.map(norm).join('|')
  };
}

export interface WorkbookLayout {
  sheetCount: number;
  /** The sheets that will be imported, best match first. */
  layouts: SheetLayout[];
  /** Sheets left out because they carry different columns. */
  skipped: string[];
}

/**
 * Reads every tab, keeps the one that matches best, and adds any other tab
 * carrying exactly the same columns - the "one tab per line" workbook is the
 * norm here, and importing only the first tab quietly loses most of the day.
 */
export function analyseWorkbook(workbook: XLSX.WorkBook): WorkbookLayout {
  // The guide sheet on a downloaded template documents the very headers this
  // scan looks for. It is not data and is not counted as a tab that was skipped.
  const names = workbook.SheetNames.filter((n) => !isGuideSheet(n));

  const all: SheetLayout[] = [];
  for (const name of names) {
    const ws = workbook.Sheets[name];
    if (!ws) continue;
    const layout = analyseSheet(name, ws);
    if (layout) all.push(layout);
  }
  if (all.length === 0) return { sheetCount: names.length, layouts: [], skipped: [] };

  const ranked = [...all].sort((a, b) => b.score - a.score);
  const best = ranked[0]!;
  const layouts = best.score > 0
    ? all.filter((l) => l.signature === best.signature && l.rows.length > 0)
    : [best];
  const kept = new Set(layouts.map((l) => l.sheet));

  return {
    sheetCount: names.length,
    layouts: layouts.length > 0 ? layouts : [best],
    skipped: names.filter((n) => !kept.has(n))
  };
}
