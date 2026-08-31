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
import { GUIDE_SHEET } from './guideSheet';
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
  guideTab: 'FF94A3B8'
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

/** Paints one table: title, headings, examples and the empty rows below them. */
function paintTable(ws: Worksheet, style: SheetStyle, offset = 0): void {
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
          formulae: [`"${values.join(',')}"`],
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

  if (style.extra) paintTable(ws, style.extra, offset);
}

function addSheet(wb: Workbook, sheet: TemplateSheet): void {
  const style = sheet.style;
  const lastHeader = style.headers?.[style.headers.length - 1] ?? style.banner?.[0];
  const frozen = lastHeader != null ? lastHeader + 1 : 0;
  const ws = wb.addWorksheet(sheet.name.slice(0, 31), {
    // Only ever a real split: see addGuide for what a zero-row freeze does.
    views: frozen > 0 ? [{ state: 'frozen', ySplit: frozen }] : [],
    properties: { tabColor: { argb: INK.dataTab }, defaultRowHeight: 18 }
  });

  for (const row of sheet.rows) ws.addRow([...row]);
  sheet.widths?.forEach((width, i) => { ws.getColumn(i + 1).width = width; });

  paintTable(ws, style);
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
function addGuide(wb: Workbook, template: UploadTemplate): void {
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
  for (const note of template.notes) {
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

  for (const sheet of template.build()) addSheet(wb, sheet);
  addGuide(wb, template);
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
