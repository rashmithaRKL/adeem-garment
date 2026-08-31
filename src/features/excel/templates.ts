/**
 * Building the blank workbook for any of the reports the system accepts.
 *
 * The importer does not require these layouts — it matches headers by synonym,
 * so a factory's own sheet usually imports as it stands. The templates exist so
 * that someone starting from a blank workbook has a layout known to work: a
 * titled, ruled table with the required columns marked, a few shaded example
 * rows to type over, empty ruled rows waiting underneath, and a guide sheet
 * naming every column.
 *
 * One file per report rather than one workbook for all of them: they are kept by
 * different people on different days, and a combined file would have to be
 * pulled apart before any of it could be filled in.
 *
 * ExcelJS rather than the xlsx the importers read with: SheetJS's community
 * build writes values only and silently drops every style, so a template written
 * with it arrives as an unreadable grey grid no matter what it was given. Both
 * libraries are loaded on demand — a button nobody has pressed should not cost
 * anything to have on the page — and only this file writes workbooks, so the
 * reading side is untouched.
 */
import type { Workbook, Worksheet } from 'exceljs';
import { GUIDE_SHEET, LISTS_SHEET } from './guideSheet';
import {
  REQUIREMENT_LABEL, templateById,
  type Requirement, type SheetStyle, type TemplateId, type TemplateSheet, type UploadTemplate
} from './templateCatalog';

/**
 * One palette for all nine workbooks, so a factory that keeps four of them sees
 * one system rather than four spreadsheets. Deep navy titles, blue headings, a
 * darker blue on the columns the import cannot run without, and the only warm
 * colour in the file reserved for the rows meant to be replaced.
 */
const INK = {
  title: 'FF0F2A47',
  titleText: 'FFFFFFFF',
  hint: 'FFE8F0FB',
  hintText: 'FF1F3B5C',
  banner: 'FF334E68',
  header: 'FF1D4ED8',
  headerRequired: 'FF0B2E73',
  headerText: 'FFFFFFFF',
  example: 'FFFFF6E0',
  rowAlt: 'FFF7F9FC',
  row: 'FFFFFFFF',
  grid: 'FFD5DEE8',
  section: 'FFEFF4FA',
  text: 'FF1F2A37',
  muted: 'FF5B6B7F',
  required: 'FFB91C1C',
  recommended: 'FF1D4ED8',
  optional: 'FF64748B',
  dataTab: 'FF1D4ED8',
  guideTab: 'FF94A3B8',
  listsTab: 'FF64748B'
} as const;

const FONT = 'Calibri';

const thin = { style: 'thin' as const, color: { argb: INK.grid } };
const GRID_BORDER = { top: thin, left: thin, bottom: thin, right: thin };

const solid = (argb: string) => ({ type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb } });

/** The number format a column gets, if it is one of the kinds worth formatting. */
function formatOf(style: SheetStyle, column: number): string | null {
  if (style.dates?.includes(column)) return 'yyyy-mm-dd';
  if (style.percents?.includes(column)) return '0.00';
  if (style.integers?.includes(column)) return '#,##0';
  return null;
}

/** Merges each run of a banner row from its label to the column before the next. */
function mergeBanner(ws: Worksheet, rowNumber: number, width: number): void {
  const row = ws.getRow(rowNumber);
  const marks: number[] = [];
  for (let c = 1; c <= width; c += 1) {
    if (String(row.getCell(c).value ?? '').trim()) marks.push(c);
  }
  marks.forEach((start, i) => {
    const end = i + 1 < marks.length ? marks[i + 1]! - 1 : width;
    if (end > start) ws.mergeCells(rowNumber, start, rowNumber, end);
  });
}

/**
 * Where each dropdown's values live on the Lists sheet, keyed by the values
 * themselves. A validation points at that range rather than carrying its own
 * copy, so the values can be read, added to and corrected in a table of their
 * own instead of being locked inside the cell.
 */
type ListRefs = Map<string, string>;

const listKey = (values: string[]): string => values.join('|');

/** Paints one table: title, headings, examples and the empty rows below them. */
function paintTable(ws: Worksheet, style: SheetStyle, refs: ListRefs, offset = 0): void {
  const width = style.width;
  const at = (index: number): number => index + 1 + offset;

  style.title?.forEach((index, i) => {
    const rowNumber = at(index);
    if (width > 1) ws.mergeCells(rowNumber, 1, rowNumber, width);
    const row = ws.getRow(rowNumber);
    const lead = i === 0;
    row.height = lead ? 30 : 32;
    const cell = row.getCell(1);
    cell.fill = solid(lead ? INK.title : INK.hint);
    cell.font = {
      name: FONT, size: lead ? 14 : 10.5, bold: lead, italic: !lead,
      color: { argb: lead ? INK.titleText : INK.hintText }
    };
    cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: !lead, indent: 1 };
  });

  style.banner?.forEach((index) => {
    const rowNumber = at(index);
    mergeBanner(ws, rowNumber, width);
    const row = ws.getRow(rowNumber);
    row.height = 22;
    for (let c = 1; c <= width; c += 1) {
      const cell = row.getCell(c);
      cell.fill = solid(INK.banner);
      cell.font = { name: FONT, size: 11, bold: true, color: { argb: INK.headerText } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = GRID_BORDER;
    }
  });

  style.headers?.forEach((index) => {
    const rowNumber = at(index);
    const row = ws.getRow(rowNumber);
    row.height = 30;
    for (let c = 1; c <= width; c += 1) {
      const cell = row.getCell(c);
      const isRequired = style.required?.includes(c - 1) ?? false;
      cell.fill = solid(isRequired ? INK.headerRequired : INK.header);
      cell.font = { name: FONT, size: 11, bold: true, color: { argb: INK.headerText } };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      cell.border = GRID_BORDER;
    }
  });

  if (style.data) {
    const [from, to] = style.data;
    for (let index = from; index <= to; index += 1) {
      const rowNumber = at(index);
      const row = ws.getRow(rowNumber);
      const isExample = style.examples?.includes(index) ?? false;
      row.height = 19;
      for (let c = 1; c <= width; c += 1) {
        const cell = row.getCell(c);
        cell.border = GRID_BORDER;
        cell.fill = solid(isExample ? INK.example : (index - from) % 2 === 1 ? INK.rowAlt : INK.row);
        cell.font = {
          name: FONT, size: 11, italic: isExample,
          color: { argb: isExample ? INK.muted : INK.text }
        };
        const numFmt = formatOf(style, c - 1);
        if (numFmt) cell.numFmt = numFmt;
        cell.alignment = { vertical: 'middle', horizontal: numFmt ? 'center' : 'left', indent: numFmt ? 0 : 1 };
      }

      for (const [column, values] of Object.entries(style.choices ?? {})) {
        row.getCell(Number(column) + 1).dataValidation = {
          type: 'list',
          allowBlank: true,
          // The Lists sheet when there is one, the values inline if not.
          formulae: [refs.get(listKey(values)) ?? `"${values.join(',')}"`],
          showErrorMessage: true,
          errorTitle: 'Pick one of the listed values',
          error: values.join(', ')
        };
      }
    }
  }

  const lastHeader = style.headers?.[style.headers.length - 1];
  if (style.filter && lastHeader != null && style.data) {
    ws.autoFilter = {
      from: { row: at(lastHeader), column: 1 },
      to: { row: at(style.data[1]), column: width }
    };
  }

  if (style.extra) paintTable(ws, style.extra, refs, offset);
}

function addSheet(wb: Workbook, sheet: TemplateSheet, refs: ListRefs, tab: string = INK.dataTab): void {
  const style = sheet.style;
  const lastHeader = style.headers?.[style.headers.length - 1] ?? style.banner?.[0];
  const frozen = lastHeader != null ? lastHeader + 1 : 0;
  const ws = wb.addWorksheet(sheet.name.slice(0, 31), {
    // Only ever a real split: see addGuide for what a zero-row freeze does.
    views: frozen > 0 ? [{ state: 'frozen', ySplit: frozen }] : [],
    properties: { tabColor: { argb: tab }, defaultRowHeight: 18 }
  });

  for (const row of sheet.rows) ws.addRow([...row]);
  fitColumns(ws, sheet);

  paintTable(ws, style, refs);
}

/**
 * Never narrower than this, however short the heading. Ten rather than nine:
 * ExcelJS treats a width of exactly 9 as the default and leaves the column out
 * of the file altogether, so "Line" was rendering at Excel own default width
 * with the filter button crowding it.
 */
const MIN_WIDTH = 10;
/** And never wider: one long remark should not push the table off the screen. */
const MAX_WIDTH = 28;
/** What the filter button takes out of the heading cell, in character widths. */
const FILTER_BUTTON = 3;

/**
 * Widths measured from the content, not guessed at.
 *
 * A heading has to fit on one line — with room for the filter button beside it
 * where there is one, or the button sits on top of the word and "Delivery Date"
 * reads as "Delivery Dat". Title rows and stage banners are excluded: they are
 * merged across the table, and measuring a sentence would make one column as
 * wide as the sheet.
 */
function fitColumns(ws: Worksheet, sheet: TemplateSheet): void {
  const style = sheet.style;
  const rowsOf = (pick: (s: SheetStyle) => number[] | undefined): Set<number> =>
    new Set([...(pick(style) ?? []), ...(style.extra ? pick(style.extra) ?? [] : [])]);

  const merged = new Set([...rowsOf((s) => s.title), ...rowsOf((s) => s.banner)]);
  const headings = rowsOf((s) => s.headers);
  const filtered = style.filter || style.extra?.filter;

  const needed = new Map<number, number>();
  sheet.rows.forEach((row, index) => {
    if (merged.has(index)) return;
    const padding = headings.has(index) ? 2 + (filtered ? FILTER_BUTTON : 0) : 2;
    row.forEach((value, column) => {
      const text = value == null ? '' : String(value);
      if (!text) return;
      needed.set(column, Math.max(needed.get(column) ?? 0, text.length + padding));
    });
  });

  const columns = Math.max(style.width, style.extra?.width ?? 0, sheet.widths?.length ?? 0);
  for (let column = 0; column < columns; column += 1) {
    // The catalogue's own width is a floor, not the last word: a column whose
    // heading is longer than the figures under it still has to show its heading.
    const wanted = Math.max(needed.get(column) ?? 0, sheet.widths?.[column] ?? 0, MIN_WIDTH);
    ws.getColumn(column + 1).width = Math.min(wanted, MAX_WIDTH);
  }
}

// ---------------------------------------------------------------------------
// The Lists sheet
// ---------------------------------------------------------------------------

interface ChoiceList {
  /** The heading of the column it fills, read from the sheet itself. */
  label: string;
  values: string[];
}

/** A1-style column name: 1 → A. */
function columnLetter(index: number): string {
  let n = index - 1;
  let name = '';
  do {
    name = String.fromCharCode(65 + (n % 26)) + name;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return name;
}

/** Every dropdown in the workbook, named after the column it belongs to. */
function collectLists(sheets: TemplateSheet[]): ChoiceList[] {
  const lists: ChoiceList[] = [];
  const seen = new Set<string>();

  for (const sheet of sheets) {
    const headerRow = sheet.style.headers?.[0];
    for (const [column, values] of Object.entries(sheet.style.choices ?? {})) {
      const key = listKey(values);
      if (seen.has(key)) continue;
      seen.add(key);
      const heading = headerRow != null ? sheet.rows[headerRow]?.[Number(column)] : null;
      lists.push({ label: String(heading ?? 'Values'), values });
    }
  }
  return lists;
}

const LISTS_FIRST_VALUE_ROW = 4; // title, hint, heading, then the values

/**
 * The dropdown values, in a table of their own beside the sheet they serve.
 *
 * Kept off the data sheet on purpose. A list buried inside a validation rule can
 * only be read by opening the rule, and adding a department then means editing a
 * dialog; here it is a column anyone can read, correct and extend, and the
 * dropdown follows it. The sheet is named so the importers skip it — see
 * guideSheet.ts — so nothing on it is ever read as data.
 */
function listRefs(lists: ChoiceList[]): ListRefs {
  const refs: ListRefs = new Map();
  lists.forEach((list, i) => {
    const letter = columnLetter(i + 1);
    const last = LISTS_FIRST_VALUE_ROW + list.values.length - 1;
    refs.set(
      listKey(list.values),
      `${LISTS_SHEET}!$${letter}$${LISTS_FIRST_VALUE_ROW}:$${letter}$${last}`
    );
  });
  return refs;
}

function addLists(wb: Workbook, lists: ChoiceList[]): void {
  if (!lists.length) return;

  const depth = Math.max(...lists.map((l) => l.values.length));
  const rows: unknown[][] = [
    ['DROPDOWN LISTS'],
    ['The values behind the dropdowns on the other sheet. To add one, right-click a value below and choose Insert, so the new row sits inside the list — the dropdown then offers it. This sheet is never imported.'],
    lists.map((l) => l.label),
    ...Array.from({ length: depth }, (_, i) => lists.map((l) => l.values[i] ?? ''))
  ];

  const sheet: TemplateSheet = {
    name: LISTS_SHEET,
    rows,
    widths: lists.map((l) => Math.max(16, l.label.length + 4)),
    style: {
      width: lists.length,
      title: [0, 1],
      headers: [2],
      data: [3, 2 + depth]
    }
  };
  // Nothing on this sheet has a dropdown of its own, so it needs no references.
  addSheet(wb, sheet, new Map(), INK.listsTab);
}

// ---------------------------------------------------------------------------
// The guide sheet
// ---------------------------------------------------------------------------

const REQUIREMENT_INK: Record<Requirement, string> = {
  required: INK.required,
  recommended: INK.recommended,
  optional: INK.optional
};

/**
 * The sheet that explains the workbook to whoever has to fill it in, built from
 * the same column list the Upload screen renders. Every template carries one, and
 * every importer skips it by name — see guideSheet.ts.
 */
function addGuide(wb: Workbook, template: UploadTemplate, hasLists: boolean): void {
  // No frozen view here. A frozen pane split at zero rows writes a <pane> element
  // for a pane that does not exist, and Excel treats that as damaged content: it
  // is what put the "we found a problem with some content" prompt in front of a
  // file that was otherwise perfectly readable.
  const ws = wb.addWorksheet(GUIDE_SHEET, {
    properties: { tabColor: { argb: INK.guideTab } }
  });
  const WIDTH = 5;
  [30, 15, 30, 68, 38].forEach((width, i) => { ws.getColumn(i + 1).width = width; });

  const banner = (text: string, fill: string, textColour: string, size: number, height: number) => {
    const row = ws.addRow([text]);
    ws.mergeCells(row.number, 1, row.number, WIDTH);
    row.height = height;
    const cell = row.getCell(1);
    cell.fill = solid(fill);
    cell.font = { name: FONT, size, bold: true, color: { argb: textColour } };
    cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true, indent: 1 };
    return row;
  };

  banner(template.title, INK.title, INK.titleText, 14, 30);
  banner(template.purpose, INK.hint, INK.hintText, 10.5, 28).getCell(1).font =
    { name: FONT, size: 10.5, italic: true, color: { argb: INK.hintText } };
  ws.addRow([]);

  const fact = (label: string, value: string) => {
    const row = ws.addRow([label, value]);
    ws.mergeCells(row.number, 2, row.number, WIDTH);
    row.height = 20;
    row.getCell(1).font = { name: FONT, size: 11, bold: true, color: { argb: INK.muted } };
    row.getCell(1).alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    row.getCell(2).font = { name: FONT, size: 11, color: { argb: INK.text } };
    row.getCell(2).alignment = { vertical: 'middle', wrapText: true };
  };
  fact('Where it lands', template.landsIn);
  fact('How often', template.cadence);
  fact('Recognised by', template.recognisedBy);
  ws.addRow([]);

  const header = ws.addRow(['Column', 'Required?', 'Format', 'What it means', 'Other headings accepted']);
  header.height = 26;
  for (let c = 1; c <= WIDTH; c += 1) {
    const cell = header.getCell(c);
    cell.fill = solid(INK.header);
    cell.font = { name: FONT, size: 11, bold: true, color: { argb: INK.headerText } };
    cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true, indent: 1 };
    cell.border = GRID_BORDER;
  }

  template.columns.forEach((column, i) => {
    const row = ws.addRow([
      column.header,
      REQUIREMENT_LABEL[column.requirement],
      column.format,
      column.meaning,
      column.alsoAccepted?.join(', ') ?? '—'
    ]);
    for (let c = 1; c <= WIDTH; c += 1) {
      const cell = row.getCell(c);
      cell.border = GRID_BORDER;
      cell.fill = solid(i % 2 === 1 ? INK.rowAlt : INK.row);
      cell.font = { name: FONT, size: 10.5, color: { argb: c === 5 ? INK.muted : INK.text } };
      cell.alignment = { vertical: 'top', horizontal: 'left', wrapText: true, indent: 1 };
    }
    row.getCell(1).font = { name: FONT, size: 10.5, bold: true, color: { argb: INK.text } };
    row.getCell(2).font = {
      name: FONT, size: 10.5, bold: true, color: { argb: REQUIREMENT_INK[column.requirement] }
    };
  });

  ws.addRow([]);
  banner('Good to know', INK.section, INK.text, 11.5, 22);
  const notes = hasLists
    ? [...template.notes,
      'The dropdown values live on the Lists sheet. Change one there and the dropdown changes with it; to add one, right-click a value and choose Insert so the new row falls inside the list.']
    : template.notes;
  for (const note of notes) {
    const row = ws.addRow([`•  ${note}`]);
    ws.mergeCells(row.number, 1, row.number, WIDTH);
    row.getCell(1).font = { name: FONT, size: 10.5, color: { argb: INK.text } };
    row.getCell(1).alignment = { vertical: 'top', horizontal: 'left', wrapText: true, indent: 1 };
    row.height = 30;
  }

  ws.addRow([]);
  const footer = ws.addRow(['This sheet is documentation and is never imported. Fill in the other sheet.']);
  ws.mergeCells(footer.number, 1, footer.number, WIDTH);
  footer.getCell(1).font = { name: FONT, size: 10, italic: true, color: { argb: INK.muted } };
  footer.getCell(1).alignment = { horizontal: 'left', indent: 1 };
}

// ---------------------------------------------------------------------------
// Building and downloading
// ---------------------------------------------------------------------------

/** The finished workbook: every data sheet, then the guide. */
export async function buildTemplateWorkbook(template: UploadTemplate): Promise<Workbook> {
  const { Workbook: WorkbookClass } = await import('exceljs');
  const wb = new WorkbookClass();
  wb.creator = 'Adeem Garment PMS';
  wb.created = new Date();

  // The data sheets first, so the workbook opens on the table to fill in, then
  // the two helpers behind it.
  const sheets = template.build();
  const lists = collectLists(sheets);
  const refs = listRefs(lists);

  for (const sheet of sheets) addSheet(wb, sheet, refs);
  addLists(wb, lists);
  addGuide(wb, template, lists.length > 0);
  return wb;
}

const stamp = (): string => new Date().toISOString().slice(0, 10);

export async function downloadFor(template: UploadTemplate): Promise<void> {
  const wb = await buildTemplateWorkbook(template);
  const data = await wb.xlsx.writeBuffer();
  const blob = new Blob([data], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${template.fileStem}-${stamp()}.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoked on the next tick rather than immediately: Safari cancels a download
  // whose object URL has already gone by the time it starts fetching it.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Builds and downloads one report's template, guide sheet included. */
export async function downloadTemplate(id: TemplateId): Promise<void> {
  const template = templateById(id);
  if (!template) throw new Error(`No template is defined for "${id}".`);
  await downloadFor(template);
}

/** The two screens that offer a template of their own, by name. */
export const downloadHrTemplate = (): Promise<void> => downloadTemplate('hr-attendance');
export const downloadPlanTemplate = (): Promise<void> => downloadTemplate('loading-plan');
