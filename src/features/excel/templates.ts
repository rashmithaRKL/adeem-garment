/**
 * Downloading a blank workbook for any of the reports the system accepts.
 *
 * The importer does not require these layouts — it matches headers by synonym,
 * so a factory's own sheet usually imports as it stands. The templates exist so
 * that someone starting from a blank workbook has a layout known to work, with
 * example rows showing the date format and where the figures go, and a guide
 * sheet naming every column.
 *
 * One file per report rather than one workbook for all of them: they are kept by
 * different people on different days, and a combined file would have to be
 * pulled apart before any of it could be filled in. What each file contains is
 * described in templateCatalog.ts, which is also what the Upload screen renders.
 *
 * xlsx is loaded on demand: it is by far the largest dependency in the bundle,
 * and a button nobody has pressed should not cost anything to have on the page.
 */
import {
  guideSheetFor, templateById, type TemplateId, type TemplateSheet, type UploadTemplate
} from './templateCatalog';

const stamp = (): string => new Date().toISOString().slice(0, 10);

async function writeWorkbook(sheets: TemplateSheet[], fileName: string): Promise<void> {
  // writeFileXLSX, not writeFile: the general writer drags in every output format
  // the library supports — xls, ods, csv, dbf — and this app only ever needs to
  // emit one .xlsx. That difference is about 90 kB of bundle.
  const { utils, writeFileXLSX } = await import('xlsx');
  const book = utils.book_new();

  for (const sheet of sheets) {
    const ws = utils.aoa_to_sheet(sheet.rows as unknown[][]);
    // Widths, so the headings are readable the moment the file opens.
    const widths = sheet.widths ?? (sheet.rows[0] ?? []).map(() => 16);
    ws['!cols'] = widths.map((wch) => ({ wch }));
    // Excel refuses a sheet name over 31 characters, and the whole file fails to
    // open rather than the one sheet being dropped.
    utils.book_append_sheet(book, ws, sheet.name.slice(0, 31));
  }

  writeFileXLSX(book, fileName);
}

/** Builds and downloads one report's template, guide sheet included. */
export async function downloadTemplate(id: TemplateId): Promise<void> {
  const template = templateById(id);
  if (!template) throw new Error(`No template is defined for "${id}".`);
  await downloadFor(template);
}

export async function downloadFor(template: UploadTemplate): Promise<void> {
  await writeWorkbook(
    [...template.build(), guideSheetFor(template)],
    `${template.fileStem}-${stamp()}.xlsx`
  );
}

/** The two screens that offer a template of their own, by name. */
export const downloadHrTemplate = (): Promise<void> => downloadTemplate('hr-attendance');
export const downloadPlanTemplate = (): Promise<void> => downloadTemplate('loading-plan');
