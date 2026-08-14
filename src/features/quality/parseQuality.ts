import * as XLSX from 'xlsx';
import type {
  DefectRow, InspectionRow, QualityParseResult, QualityReportKind, QualityStage
} from './types';
import { REPORT_LABEL } from './types';

// ---------------------------------------------------------------------------
// Cell and grid helpers
// ---------------------------------------------------------------------------

export type Grid = unknown[][];

/**
 * sheet_to_json leaves holes where cells are empty or swallowed by a merge, and
 * these workbooks carry 55-298 merged ranges each. Densify once so that findIndex
 * and friends cannot trip over a hole later.
 */
export function readGrid(sheet: XLSX.WorkSheet): Grid {
  if (!sheet || !sheet['!ref']) return [];
  return XLSX.utils
    .sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false })
    .map((row) => Array.from({ length: row.length }, (_, i) => row[i] ?? null));
}

/** Strips everything that varies between typists: case, spaces, %, #, punctuation. */
const norm = (v: unknown): string =>
  String(v ?? '').toLowerCase().replace(/[\s_\-./\\%#()'’,:]+/g, '');

const text = (v: unknown): string | null => {
  const t = String(v ?? '').trim();
  return t.length > 0 ? t : null;
};

const int = (v: unknown): number | null => {
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v) : null;
  const t = String(v ?? '').replace(/[,\s]/g, '');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? Math.round(n) : null;
};

/**
 * Excel stores a percent-formatted cell as a fraction, so these sheets mix 0.875
 * and 87.5 for the same measure, sometimes in adjacent columns. Anything in (0,1]
 * is read as a fraction. A genuine 1% would be misread as 100%, which is the same
 * trade the production parser already makes.
 */
const pct = (v: unknown): number | null => {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[,\s%]/g, ''));
  if (!Number.isFinite(n)) return null;
  const value = n > 0 && n <= 1 ? n * 100 : n;
  return Math.min(Math.round(value * 100) / 100, 9999.99);
};

const isoDay = (d: Date): string =>
  new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);

const toDate = (v: unknown): string | null => {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : isoDay(v);
  if (typeof v === 'number' && Number.isFinite(v) && v > 1 && v < 100_000) {
    return new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86_400_000).toISOString().slice(0, 10);
  }
  const t = String(v ?? '').trim();
  if (!t) return null;
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : isoDay(d);
};

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december'];

/** "Month :- AUGUST 2026", "JAN", "January" -> 2026-08-01. */
function monthStart(raw: unknown, fallbackYear: number): string | null {
  const s = String(raw ?? '').toLowerCase();
  const idx = MONTHS.findIndex((m) => s.includes(m) || s.includes(m.slice(0, 3)));
  if (idx < 0) return null;
  const year = /(20\d{2})/.exec(s)?.[1];
  return `${year ? Number(year) : fallbackYear}-${String(idx + 1).padStart(2, '0')}-01`;
}

/** Year hinted by the filename, for sheets that name a month but never a year. */
const yearFromName = (fileName: string): number =>
  Number(/(20\d{2})/.exec(fileName)?.[1] ?? new Date().getFullYear());

// ---------------------------------------------------------------------------
// Stage bands
// ---------------------------------------------------------------------------

/** Order matters: "PRE FINAL" must be tested before "FINAL". */
function stageOf(raw: unknown): QualityStage | null {
  const k = norm(raw);
  if (!k) return null;
  if (k.includes('aql')) return 'aql';
  if (k.includes('inline')) return 'in_line';
  if (k.includes('endline')) return 'end_line';
  if (k.includes('appearance')) return 'appearance';
  if (k.includes('prefinal')) return 'pre_final';
  if (k.includes('final')) return 'final';
  return null;
}

interface Band { stage: QualityStage; start: number; end: number; }

/** The banner row names each stage once, above the block of columns it owns. */
function bandsOf(row: unknown[]): Band[] {
  const marks: { stage: QualityStage; at: number }[] = [];
  row.forEach((cell, i) => {
    const stage = stageOf(cell);
    if (stage && !marks.some((m) => m.stage === stage)) marks.push({ stage, at: i });
  });
  return marks.map((m, i) => ({
    stage: m.stage,
    start: m.at,
    end: i + 1 < marks.length ? marks[i + 1]!.at - 1 : row.length - 1
  }));
}

/** First column in [from,to] whose sub-header matches; earlier patterns win. */
function findCol(sub: unknown[], from: number, to: number, patterns: RegExp[]): number {
  for (const re of patterns) {
    for (let i = Math.max(0, from); i <= to && i < sub.length; i += 1) {
      if (re.test(norm(sub[i]))) return i;
    }
  }
  return -1;
}

interface ColSpec {
  checked: RegExp[];
  passQty?: RegExp[];
  defectQty?: RegExp[];
  passPct?: RegExp[];
  defectPct?: RegExp[];
}

interface StageCols {
  stage: QualityStage;
  checked: number; passQty: number; defectQty: number; passPct: number; defectPct: number;
}

function resolveBands(band: unknown[], sub: unknown[], spec: ColSpec): StageCols[] {
  return bandsOf(band).map((b) => ({
    stage: b.stage,
    checked: findCol(sub, b.start, b.end, spec.checked),
    passQty: spec.passQty ? findCol(sub, b.start, b.end, spec.passQty) : -1,
    defectQty: spec.defectQty ? findCol(sub, b.start, b.end, spec.defectQty) : -1,
    passPct: spec.passPct ? findCol(sub, b.start, b.end, spec.passPct) : -1,
    defectPct: spec.defectPct ? findCol(sub, b.start, b.end, spec.defectPct) : -1
  }));
}

const at = (row: unknown[], i: number): unknown => (i >= 0 ? row[i] : null);

/**
 * A stage contributes nothing when nothing was inspected. Zero is treated as
 * blank rather than as data: the blank template rows in the KPI sheets carry a
 * stray 0 in the PASS column, and importing those would plant 0%-pass points on
 * every chart for stages the floor simply did not run that day.
 */
function stageValues(row: unknown[], c: StageCols) {
  const checkedQty = int(at(row, c.checked));
  const passQty = int(at(row, c.passQty));
  const defectQty = int(at(row, c.defectQty));
  const passPct = pct(at(row, c.passPct));
  const defectPct = pct(at(row, c.defectPct));
  const blank = (n: number | null) => n == null || n === 0;
  const empty = blank(checkedQty) && blank(passQty) && blank(defectQty)
    && passPct == null && defectPct == null;
  return { checkedQty, passQty, defectQty, passPct, defectPct, empty };
}

/** Fills in whichever of pass/defect the sheet left implicit. */
function complete(v: ReturnType<typeof stageValues>) {
  let { checkedQty, passQty, defectQty, passPct, defectPct } = v;
  if (checkedQty != null && passQty != null && defectQty == null) defectQty = checkedQty - passQty;
  if (checkedQty != null && defectQty != null && passQty == null) passQty = checkedQty - defectQty;
  if (passPct == null && checkedQty && passQty != null) {
    passPct = Math.round((passQty / checkedQty) * 10_000) / 100;
  }
  if (defectPct == null && checkedQty && defectQty != null) {
    defectPct = Math.round((defectQty / checkedQty) * 10_000) / 100;
  }
  return { checkedQty, passQty, defectQty, passPct, defectPct };
}

// ---------------------------------------------------------------------------
// Row identity: which line/team a data row belongs to
// ---------------------------------------------------------------------------

interface RowId { lineNo: number | null; lineLabel: string | null; isFactory: boolean; }

function rowIdentity(cell: unknown): RowId | null {
  const raw = text(cell);
  if (!raw) return null;
  const k = norm(raw);
  if (k === 'factory' || k === 'total') {
    return { lineNo: null, lineLabel: 'Factory', isFactory: true };
  }
  const n = int(raw);
  if (n == null) return null;
  return { lineNo: n, lineLabel: `Line ${String(n).padStart(2, '0')}`, isFactory: false };
}

// ---------------------------------------------------------------------------
// Parser 1 — KPI REPORT: one sheet per line, one row per date
// ---------------------------------------------------------------------------

const KPI_SPEC: ColSpec = {
  checked: [/^checked$/],
  passQty: [/^pass$/],
  defectQty: [/^fail$/]
};

function parseLineKpi(wb: XLSX.WorkBook, fileName: string): QualityParseResult {
  const inspections: InspectionRow[] = [];
  const used: string[] = [];
  const skipped: { sheet: string; reason: string }[] = [];
  const warnings: string[] = [];
  const linesSeen = new Set<number>();

  for (const name of wb.SheetNames) {
    const lineMatch = /^line\s*0*(\d+)$/i.exec(name.trim());
    if (!lineMatch) {
      skipped.push({ sheet: name, reason: 'not a per-line sheet' });
      continue;
    }
    // A sheet named for a line is proof the line exists, even when every row on
    // it is still blank -- a new line gets its tab before its first inspection.
    linesSeen.add(Number(lineMatch[1]));

    const grid = readGrid(wb.Sheets[name]!);
    if (grid.length < 3) { skipped.push({ sheet: name, reason: 'empty' }); continue; }

    const lineNo = Number(lineMatch[1]);
    const cols = resolveBands(grid[0]!, grid[1]!, KPI_SPEC).filter((c) => c.checked >= 0);
    if (!cols.length) { skipped.push({ sheet: name, reason: 'no inspection stages found' }); continue; }

    let rows = 0;
    for (let r = 2; r < grid.length; r += 1) {
      const row = grid[r]!;
      const date = toDate(row[0]);
      if (!date) continue; // blank template rows carry a stray 0 but no date

      for (const c of cols) {
        const v = stageValues(row, c);
        if (v.empty) continue;
        const f = complete(v);
        inspections.push({
          lineNo,
          lineLabel: `Line ${String(lineNo).padStart(2, '0')}`,
          isFactory: false,
          styleNumber: null,
          inspectionDate: date,
          periodMonth: null,
          stage: c.stage,
          ...f
        });
        rows += 1;
      }
    }
    if (rows === 0) skipped.push({ sheet: name, reason: 'no dated rows' });
    else used.push(name);
  }

  if (!used.length) warnings.push('No per-line sheet contained dated inspection rows.');
  return finish('line_kpi', inspections, [], used, skipped, warnings, fileName, linesSeen);
}

// ---------------------------------------------------------------------------
// Parser 2 — Daily quality performance report
// ---------------------------------------------------------------------------

const DAILY_SPEC: ColSpec = {
  checked: [/^checkqty$/],
  defectQty: [/^defectqty$/],
  defectPct: [/^defect$/],
  passPct: [/^pass$/]
};

/**
 * The AQL block does not follow the band layout: its counts sit under a third
 * header row ("Results of Audit" splits into PASS and FAIL), so it is resolved by
 * name across the whole header rather than within a band.
 */
function aqlDaily(sub: unknown[], sub2: unknown[]): StageCols | null {
  const checked = findCol(sub, 0, sub.length - 1, [/^noofaudits$/, /noofaudits/]);
  if (checked < 0) return null;
  return {
    stage: 'aql',
    checked,
    passQty: findCol(sub2, 0, sub2.length - 1, [/^pass$/]),
    defectQty: findCol(sub2, 0, sub2.length - 1, [/^fail$/]),
    passPct: findCol(sub, 0, sub.length - 1, [/^ofpass$/]),
    defectPct: -1
  };
}

function parseDailyQuality(wb: XLSX.WorkBook, fileName: string): QualityParseResult {
  const name = wb.SheetNames[0]!;
  const grid = readGrid(wb.Sheets[name]!);
  const warnings: string[] = [];

  const bandRow = grid.findIndex((r) => bandsOf(r).length >= 2);
  if (bandRow < 0) throw new Error('No inspection stage banner row was found in this workbook.');

  const band = grid[bandRow]!;
  const sub = grid[bandRow + 1] ?? [];
  const sub2 = grid[bandRow + 2] ?? [];

  // "Date :- 03 August 2026" sits in the title block above the table.
  const titleBlock = grid.slice(0, bandRow).flat().map((c) => String(c ?? '')).join(' ');
  const date = toDate(/date\s*:?-?\s*(.+)$/i.exec(titleBlock)?.[1]?.trim() ?? '')
    ?? toDate(titleBlock.replace(/^.*date\s*:?-?\s*/i, ''));
  if (!date) warnings.push('The report date could not be read from the title block.');

  const cols = resolveBands(band, sub, DAILY_SPEC).filter((c) => c.checked >= 0);
  const aql = aqlDaily(sub, sub2);
  if (aql) cols.push(aql);

  const teamCol = findCol(sub, 0, sub.length - 1, [/^teamno$/, /^line$/]);
  const styleCol = findCol(sub, 0, sub.length - 1, [/^styleno$/, /^style$/]);

  const inspections: InspectionRow[] = [];
  const linesSeen = new Set<number>();
  for (let r = bandRow + 3; r < grid.length; r += 1) {
    const row = grid[r]!;
    const id = rowIdentity(row[teamCol >= 0 ? teamCol : 0]);
    if (!id) continue;
    // A team with a row but no figures did not run that day; it is still a line.
    if (!id.isFactory && id.lineNo != null) linesSeen.add(id.lineNo);

    let wrote = false;
    for (const c of cols) {
      const v = stageValues(row, c);
      if (v.empty) continue;
      inspections.push({
        ...id,
        styleNumber: styleCol >= 0 ? text(row[styleCol]) : null,
        inspectionDate: date,
        periodMonth: null,
        stage: c.stage,
        ...complete(v)
      });
      wrote = true;
    }
    // The stage table ends at the Factory roll-up; everything after it is the
    // defect summary block, which has its own header.
    if (id.isFactory && wrote) break;
  }

  const defects = dailyDefects(grid, bandRow, date);
  return finish('daily_quality', inspections, defects, [name],
    wb.SheetNames.slice(1).map((s) => ({ sheet: s, reason: 'not the report sheet' })),
    warnings, fileName, linesSeen);
}

/**
 * The "Appearance Defect Summary" block below the stage table is laid out by hand
 * with repeated Line columns, so it is read by locating its own header row and
 * matching category names, and it is best-effort: a layout change costs the defect
 * breakdown, never the inspection figures above.
 */
function dailyDefects(grid: Grid, bandRow: number, date: string | null): DefectRow[] {
  const headerIdx = grid.findIndex((r, i) =>
    i > bandRow && norm(r[0]) === 'line' && r.some((c) => /qty/.test(norm(c))));
  if (headerIdx < 0) return [];

  const header = grid[headerIdx]!;

  /**
   * The block repeats bare sub-labels under grouping banners, so "End Line" and
   * "Appearance" both appear beneath "Uncut Threads" and would otherwise collapse
   * into one category and double-count. The banner above disambiguates them.
   */
  const banner = grid[headerIdx - 1] ?? [];
  const bannerAt = (col: number): string | null => {
    for (let i = col; i > 0; i -= 1) {
      const label = text(banner[i]);
      if (label) return label.replace(/\s+/g, ' ').trim();
    }
    return null; // column 0 holds the block title, which names nothing
  };

  const categories: { col: number; name: string }[] = [];
  header.forEach((cell, i) => {
    const label = text(cell);
    if (!label) return;
    const k = norm(label);
    if (['line', 'checkqty', 'total', ''].includes(k)) return;
    if (k === 'defect' || k === 'totaldefect') return; // derived columns, not categories
    const group = bannerAt(i);
    const own = label.replace(/\s+/g, ' ').trim();
    if (!group) { categories.push({ col: i, name: own }); return; }
    // "Oil Marks" + a column headed only "Qty" is just "Oil Marks".
    categories.push({ col: i, name: k === 'qty' ? group : `${group} (${own})` });
  });
  if (!categories.length) return [];

  const out: DefectRow[] = [];
  for (let r = headerIdx + 1; r < grid.length; r += 1) {
    const id = rowIdentity(grid[r]![0]);
    if (!id) continue;
    for (const cat of categories) {
      const qty = int(grid[r]![cat.col]);
      if (qty == null || qty === 0) continue;
      out.push({ ...id, inspectionDate: date, periodMonth: null, category: cat.name, qty });
    }
    if (id.isFactory) break;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Parser 3 — Monthly quality performance report
// ---------------------------------------------------------------------------

const MONTHLY_SPEC: ColSpec = {
  checked: [/checkqty$/],
  defectQty: [/defectqty$/],
  defectPct: [/defect$/],
  passPct: [/pass$/]
};

function aqlMonthly(sub: unknown[]): StageCols | null {
  const checked = findCol(sub, 0, sub.length - 1, [/^totalnoofaudits$/, /noofaudits/]);
  if (checked < 0) return null;
  return {
    stage: 'aql',
    checked,
    passQty: findCol(sub, 0, sub.length - 1, [/^ofauditpass$/]),
    defectQty: findCol(sub, 0, sub.length - 1, [/^ofauditfailtotal$/, /^ofauditfail$/]),
    passPct: findCol(sub, 0, sub.length - 1, [/^aqlpass$/]),
    defectPct: findCol(sub, 0, sub.length - 1, [/^aqlfail$/])
  };
}

function parseMonthlyQuality(wb: XLSX.WorkBook, fileName: string): QualityParseResult {
  const inspections: InspectionRow[] = [];
  const used: string[] = [];
  const skipped: { sheet: string; reason: string }[] = [];
  const warnings: string[] = [];
  const year = yearFromName(fileName);
  const linesSeen = new Set<number>();

  for (const name of wb.SheetNames) {
    const grid = readGrid(wb.Sheets[name]!);
    if (!grid.length) { skipped.push({ sheet: name, reason: 'empty' }); continue; }

    const bandRow = grid.findIndex((r) => bandsOf(r).length >= 2);
    if (bandRow < 0) { skipped.push({ sheet: name, reason: 'no inspection stages' }); continue; }

    // Each sheet names its own month, and they are not always the same month --
    // reading the filename alone would file May's figures under August.
    const title = grid.slice(0, bandRow).flat().map((c) => String(c ?? '')).join(' ');
    const month = monthStart(title, year);
    if (!month) { skipped.push({ sheet: name, reason: 'no month in the title block' }); continue; }

    const sub = grid[bandRow + 1] ?? [];
    const cols = resolveBands(grid[bandRow]!, sub, MONTHLY_SPEC).filter((c) => c.checked >= 0);
    const aql = aqlMonthly(sub);
    if (aql) cols.push(aql);
    if (!cols.length) { skipped.push({ sheet: name, reason: 'no readable stage columns' }); continue; }

    const teamCol = findCol(sub, 0, sub.length - 1, [/^teamno$/, /^line$/]);
    let wrote = 0;
    for (let r = bandRow + 2; r < grid.length; r += 1) {
      const row = grid[r]!;
      const id = rowIdentity(row[teamCol >= 0 ? teamCol : 0]);
      if (!id) continue;
      if (!id.isFactory && id.lineNo != null) linesSeen.add(id.lineNo);
      let any = false;
      for (const c of cols) {
        const v = stageValues(row, c);
        if (v.empty) continue;
        inspections.push({
          ...id, styleNumber: null, inspectionDate: null, periodMonth: month,
          stage: c.stage, ...complete(v)
        });
        any = true; wrote += 1;
      }
      if (id.isFactory && any) break;
    }
    if (wrote > 0) used.push(name);
    else skipped.push({ sheet: name, reason: 'no team rows with figures' });
  }

  if (!used.length) warnings.push('No sheet in this workbook contained monthly quality figures.');
  return finish('monthly_quality', inspections, [], used, skipped, warnings, fileName, linesSeen);
}

// ---------------------------------------------------------------------------
// Parser 4 — Monthly inspection report (the "Summary" month-by-metric grid)
// ---------------------------------------------------------------------------

function parseMonthlyInspection(wb: XLSX.WorkBook, fileName: string): QualityParseResult {
  const year = yearFromName(fileName);
  const sheetName = wb.SheetNames.find((n) => norm(n) === 'summary');
  if (!sheetName) throw new Error('This workbook has no "Summary" sheet to read.');

  const grid = readGrid(wb.Sheets[sheetName]!);
  const headerIdx = grid.findIndex((r) => norm(r[0]) === 'month');
  if (headerIdx < 0) throw new Error('The Summary sheet has no "Month" header row.');
  const header = grid[headerIdx]!;

  const col = (patterns: RegExp[]) => findCol(header, 0, header.length - 1, patterns);
  const cSample = col([/^sampleinspected$/, /sampleinspected/]);
  const cDefects = col([/^deffects$/, /^defects$/]);
  const cPassRate = col([/1sttimepassrate/, /passrate/]);
  const cShipped = col([/^qtyshipped$/]);

  // Everything after the rate columns is a defect category (Fabric, Sewing, ...).
  const firstCategory = Math.max(cPassRate, cDefects, cSample) + 1;
  const categories: { col: number; name: string }[] = [];
  for (let i = firstCategory; i < header.length; i += 1) {
    const label = text(header[i]);
    if (label && norm(label) !== 'oql') categories.push({ col: i, name: label.trim() });
  }

  const inspections: InspectionRow[] = [];
  const defects: DefectRow[] = [];
  const warnings: string[] = [];

  for (let r = headerIdx + 1; r < grid.length; r += 1) {
    const row = grid[r]!;
    if (norm(row[0]) === 'total') break;
    const month = monthStart(row[0], year);
    if (!month) continue;

    const checked = int(at(row, cSample));
    const defectQty = int(at(row, cDefects));
    const passPct = pct(at(row, cPassRate));
    const shipped = int(at(row, cShipped));

    // A month the client has not filled in yet is all zeroes; importing it would
    // draw a cliff to 0% on every chart.
    const hasFigures = (checked ?? 0) > 0 || (defectQty ?? 0) > 0 || (shipped ?? 0) > 0;
    if (hasFigures) {
      // Deliberately not derived here. "1st time Pass Rate" counts styles that
      // passed first time (7 of 8), while Sample Inspected and Deffects count
      // pieces (125 and 2). Deriving a pass quantity from the piece counts would
      // sit beside a styles-based percentage and read as a contradiction.
      inspections.push({
        lineNo: null, lineLabel: 'Factory', isFactory: true, styleNumber: null,
        inspectionDate: null, periodMonth: month, stage: 'final',
        checkedQty: checked, passQty: null, defectQty, passPct,
        defectPct: checked && defectQty != null
          ? Math.round((defectQty / checked) * 10_000) / 100
          : null
      });
    }

    for (const cat of categories) {
      const qty = int(row[cat.col]);
      if (qty == null || qty === 0) continue;
      defects.push({
        lineNo: null, lineLabel: 'Factory', isFactory: true,
        inspectionDate: null, periodMonth: month, category: cat.name, qty
      });
    }
  }

  if (!inspections.length) warnings.push('Every month in the Summary sheet is still empty.');
  return finish('monthly_inspection', inspections, defects, [sheetName],
    wb.SheetNames.filter((n) => n !== sheetName).map((s) => ({ sheet: s, reason: 'not the Summary sheet' })),
    warnings, fileName);
}

// ---------------------------------------------------------------------------
// Parser 5 — Monthly second summary (month x defect category matrix)
// ---------------------------------------------------------------------------

function parseDefectSummary(wb: XLSX.WorkBook, fileName: string): QualityParseResult {
  const defects: DefectRow[] = [];
  const used: string[] = [];
  const skipped: { sheet: string; reason: string }[] = [];
  const warnings: string[] = [];

  for (const name of wb.SheetNames) {
    const grid = readGrid(wb.Sheets[name]!);
    const headerIdx = grid.findIndex((r) => norm(r[0]) === 'month');
    if (headerIdx < 0) { skipped.push({ sheet: name, reason: 'no "Month" header row' }); continue; }

    // A sheet named for a year dates rows the month names cannot.
    const year = Number(/(20\d{2})/.exec(name)?.[1] ?? yearFromName(fileName));
    const header = grid[headerIdx]!;
    const categories: { col: number; name: string }[] = [];
    header.forEach((cell, i) => {
      const label = text(cell);
      if (!label || i === 0) return;
      if (norm(label) === 'total') return;
      categories.push({ col: i, name: label.trim() });
    });

    let wrote = 0;
    for (let r = headerIdx + 1; r < grid.length; r += 1) {
      const row = grid[r]!;
      const month = monthStart(row[0], year);
      if (!month) continue;
      for (const cat of categories) {
        const qty = int(row[cat.col]);
        if (qty == null || qty === 0) continue;
        defects.push({
          lineNo: null, lineLabel: 'Factory', isFactory: true,
          inspectionDate: null, periodMonth: month, category: cat.name, qty
        });
        wrote += 1;
      }
    }
    if (wrote > 0) used.push(name);
    else skipped.push({ sheet: name, reason: 'no defect figures recorded yet' });
  }

  if (!defects.length) {
    warnings.push('This workbook has the right shape but every month is still blank, so there is nothing to import.');
  }
  return finish('defect_summary', [], defects, used, skipped, warnings, fileName);
}

// ---------------------------------------------------------------------------
// Detection and entry point
// ---------------------------------------------------------------------------

function firstRowsText(wb: XLSX.WorkBook, sheet: string, rows = 6): string {
  return readGrid(wb.Sheets[sheet]!).slice(0, rows).flat().map((c) => String(c ?? '')).join(' ').toLowerCase();
}

export function detectKind(wb: XLSX.WorkBook): QualityReportKind | null {
  if (wb.SheetNames.some((n) => /^line\s*0*\d+$/i.test(n.trim()))) return 'line_kpi';

  for (const name of wb.SheetNames) {
    const head = firstRowsText(wb, name);
    if (/daily\s+quality/.test(head)) return 'daily_quality';
    if (/monthly\s+quality/.test(head)) return 'monthly_quality';
    if (/second\s+summary/.test(head)) return 'defect_summary';
  }

  if (wb.SheetNames.some((n) => norm(n) === 'summary')) {
    const summary = firstRowsText(wb, wb.SheetNames.find((n) => norm(n) === 'summary')!, 2);
    if (/pass\s*rate|inspected/.test(summary)) return 'monthly_inspection';
  }
  return null;
}

/** Parses a workbook already known to be a quality report. */
export function parseQualityWorkbook(wb: XLSX.WorkBook, fileName: string): QualityParseResult {
  const kind = detectKind(wb);
  if (!kind) throw new Error('This workbook does not match any quality report layout the importer knows.');

  switch (kind) {
    case 'line_kpi': return parseLineKpi(wb, fileName);
    case 'daily_quality': return parseDailyQuality(wb, fileName);
    case 'monthly_quality': return parseMonthlyQuality(wb, fileName);
    case 'monthly_inspection': return parseMonthlyInspection(wb, fileName);
    case 'defect_summary': return parseDefectSummary(wb, fileName);
  }
}

/**
 * Returns null when the workbook is not a quality report, so the caller can fall
 * through to the production importer. Only a workbook that matches a known
 * quality layout is parsed here.
 */
export async function tryParseQualityFile(file: File): Promise<QualityParseResult | null> {
  const wb = XLSX.read(await file.arrayBuffer(), { cellDates: true });
  if (!detectKind(wb)) return null;
  return parseQualityWorkbook(wb, file.name);
}

function finish(
  kind: QualityReportKind,
  inspections: InspectionRow[],
  defects: DefectRow[],
  sheetsUsed: string[],
  sheetsSkipped: { sheet: string; reason: string }[],
  warnings: string[],
  _fileName: string,
  linesSeen: Set<number> = new Set()
): QualityParseResult {
  const days = inspections.map((i) => i.inspectionDate).filter(Boolean) as string[];
  const months = [...inspections, ...defects].map((i) => i.periodMonth).filter(Boolean) as string[];
  const all = [...days, ...months].sort();

  // A line that did produce figures is named by its own rows, so the two sources
  // are merged rather than the blank-row scan being trusted on its own.
  for (const row of [...inspections, ...defects]) {
    if (!row.isFactory && row.lineNo != null && row.lineNo > 0) linesSeen.add(row.lineNo);
  }

  return {
    kind,
    label: REPORT_LABEL[kind],
    sheetsUsed,
    sheetsSkipped,
    inspections,
    defects,
    linesSeen: [...linesSeen].sort((a, b) => a - b),
    periodStart: all[0] ?? null,
    periodEnd: all[all.length - 1] ?? null,
    warnings
  };
}
