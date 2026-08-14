/**
 * Downloadable starting points for the two sheets that are typed up rather than
 * exported from another system.
 *
 * The importer does not require these layouts — it matches headers by synonym,
 * so a factory's own sheet usually imports as it stands. The templates exist so
 * that someone starting from a blank workbook has a layout known to work, with
 * one example row showing the date format and where the figures go.
 *
 * xlsx is loaded on demand: it is by far the largest dependency in the bundle,
 * and a button nobody has pressed should not cost anything to have on the page.
 */

const stamp = (): string => new Date().toISOString().slice(0, 10);

async function download(rows: unknown[][], sheetName: string, fileName: string): Promise<void> {
  // writeFileXLSX, not writeFile: the general writer drags in every output format
  // the library supports — xls, ods, csv, dbf — and this app only ever needs to
  // emit one .xlsx. That difference is about 90 kB of bundle.
  const { utils, writeFileXLSX } = await import('xlsx');
  const sheet = utils.aoa_to_sheet(rows);
  // Widths, so the headers are readable the moment the file opens.
  sheet['!cols'] = (rows[0] ?? []).map(() => ({ wch: 16 }));
  const book = utils.book_new();
  utils.book_append_sheet(book, sheet, sheetName);
  writeFileXLSX(book, fileName);
}

const day = (offset: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
};

export async function downloadHrTemplate(): Promise<void> {
  await download(
    [
      ['Date', 'Department', 'Direct Carder', 'Indirect Carder', 'Present', 'Absent', 'On Leave', 'Remarks'],
      [day(-2), 'Sewing', 180, 24, 192, 9, 3, ''],
      [day(-2), 'Cutting', 42, 8, 47, 2, 1, ''],
      [day(-1), 'Sewing', 180, 24, 188, 12, 4, 'Two machines down']
    ],
    'Attendance',
    `hr-attendance-template-${stamp()}.xlsx`
  );
}

export async function downloadPlanTemplate(): Promise<void> {
  await download(
    [
      ['Line', 'Sequence', 'Style No', 'Order No', 'School Name', 'Order Qty',
       'PP Date', 'PCD', 'PSD', 'PED', 'Status', 'Remarks'],
      [1, 1, 'AU-4471', 'PO-10233', 'St Anthony College', 6400,
       day(3), day(6), day(9), day(24), 'Upcoming', ''],
      [1, 2, 'AU-4482', 'PO-10241', 'Royal Institute', 3800,
       day(12), day(15), day(18), day(31), 'Upcoming', ''],
      [2, 1, 'AU-4390', 'PO-10199', 'Holy Family Convent', 5200,
       day(-6), day(-2), day(1), day(17), 'In progress', '']
    ],
    'Loading plan',
    `loading-plan-template-${stamp()}.xlsx`
  );
}
