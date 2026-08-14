import {
  readTables, matchColumns, cellDate, cellInt, cellText,
  type ColumnSpec, type ImportIssue
} from '@/features/excel/sheetKit';

/**
 * An HR attendance workbook: one row per day per department, with headcount and
 * how much of it turned up.
 *
 * No template is imposed. The columns below list the spellings these sheets
 * actually use — "Direct Cadre", "Direct Carder", "Direct Manpower" are all the
 * same column — and anything unrecognised is simply left behind rather than
 * failing the file.
 */
const COLUMNS: ColumnSpec[] = [
  { key: 'date', required: true, synonyms: [
    'date', 'workdate', 'workingdate', 'attendancedate', 'day', 'dated'] },
  { key: 'department', synonyms: [
    'department', 'dept', 'section', 'division', 'unit', 'floor'] },
  { key: 'direct', synonyms: [
    'direct', 'directcarder', 'directcardare', 'directcadre', 'directmanpower',
    'directlabour', 'directlabor', 'directworkers', 'directstaff', 'directheadcount'] },
  { key: 'indirect', synonyms: [
    'indirect', 'indirectcarder', 'indirectcardare', 'indirectcadre', 'indirectmanpower',
    'indirectlabour', 'indirectlabor', 'indirectworkers', 'indirectstaff', 'indirectheadcount'] },
  { key: 'present', synonyms: [
    'present', 'attended', 'attendance', 'presentcount', 'actualmanpower', 'reported'] },
  { key: 'absent', synonyms: [
    'absent', 'absentees', 'absentee', 'absence', 'noofabsent', 'absentcount'] },
  { key: 'leave', synonyms: [
    'leave', 'onleave', 'approvedleave', 'authorisedleave', 'authorizedleave', 'holiday'] },
  { key: 'remarks', synonyms: ['remarks', 'remark', 'note', 'notes', 'comment', 'comments'] }
];

export interface HrParseRow {
  sheet: string;
  rowNumber: number;
  work_date: string;
  department: string;
  direct_carder: number;
  indirect_carder: number;
  present: number;
  absent: number;
  on_leave: number;
  remarks: string | null;
}

export interface HrParseResult {
  kind: 'hr';
  label: string;
  sheetsUsed: string[];
  rows: HrParseRow[];
  errors: ImportIssue[];
  warnings: string[];
  periodStart: string | null;
  periodEnd: string | null;
}

/**
 * Returns null when the workbook is not an attendance sheet, so the upload flow
 * can go on and try the next parser. A date column alone is not enough — every
 * production sheet has one — so a manpower or attendance column is required
 * before the file is claimed.
 */
export async function tryParseHrFile(file: File): Promise<HrParseResult | null> {
  const tables = await readTables(file, COLUMNS);
  if (tables.length === 0) return null;

  const rows: HrParseRow[] = [];
  const errors: ImportIssue[] = [];
  const warnings: string[] = [];
  const sheetsUsed: string[] = [];
  // Two rows for the same day and department cannot both be written: the table
  // holds one entry per pair, so the later row is a correction of the earlier.
  const seen = new Map<string, HrParseRow>();

  for (const table of tables) {
    const col = matchColumns(table.headers, COLUMNS);
    const identifying = ['direct', 'indirect', 'present', 'absent', 'leave']
      .filter((key) => col[key] != null);
    if (identifying.length === 0) continue;

    sheetsUsed.push(table.sheet);
    const at = (raw: unknown[], key: string): unknown =>
      (col[key] != null ? raw[col[key]!] : undefined);

    table.rows.forEach((raw, i) => {
      const rowNumber = table.headerRow + 2 + i;

      // Almost every one of these sheets ends in a totals line. It carries real
      // figures and no date, so without this it would be reported as a broken row.
      const label = cellText(at(raw, 'department')) ?? '';
      if (/^(total|sub\s?total|grand\s?total|average|avg)\b/i.test(label)) return;

      const date = cellDate(at(raw, 'date'));
      if (!date) {
        // A blank line or a "Total" row at the foot of the sheet, not a failure.
        const hasFigures = identifying.some((key) => cellInt(at(raw, key)) != null);
        if (hasFigures) {
          errors.push({ sheet: table.sheet, rowNumber, message: 'The date could not be read, so the row cannot be filed.' });
        }
        return;
      }

      const direct = cellInt(at(raw, 'direct')) ?? 0;
      const indirect = cellInt(at(raw, 'indirect')) ?? 0;
      const present = cellInt(at(raw, 'present')) ?? 0;
      const absent = cellInt(at(raw, 'absent')) ?? 0;
      const leave = cellInt(at(raw, 'leave')) ?? 0;

      if (direct + indirect + present + absent + leave === 0) return;

      const department = label || 'Factory';
      const row: HrParseRow = {
        sheet: table.sheet,
        rowNumber,
        work_date: date,
        department,
        direct_carder: Math.max(0, direct),
        indirect_carder: Math.max(0, indirect),
        present: Math.max(0, present),
        absent: Math.max(0, absent),
        on_leave: Math.max(0, leave),
        remarks: cellText(at(raw, 'remarks'))
      };

      const key = `${date}|${department.toLowerCase()}`;
      if (seen.has(key)) {
        warnings.push(
          `${date} · ${department} appears more than once; the last row in the file was kept.`
        );
      }
      seen.set(key, row);
    });
  }

  if (sheetsUsed.length === 0) return null;
  rows.push(...seen.values());
  rows.sort((a, b) => a.work_date.localeCompare(b.work_date) || a.department.localeCompare(b.department));
  if (rows.length === 0) return null;

  // Headcount with nobody accounted for is usually a sheet where the attendance
  // columns are named something this parser has not met yet.
  if (rows.every((r) => r.present + r.absent + r.on_leave === 0)) {
    warnings.push(
      'No present, absent or leave figures were recognised — only headcount was read. '
      + 'Absenteeism will show as 0% until those columns are named recognisably.'
    );
  }

  const dates = rows.map((r) => r.work_date).sort();
  return {
    kind: 'hr',
    label: 'HR attendance sheet — one row per day per department',
    sheetsUsed,
    rows,
    errors,
    warnings: [...new Set(warnings)],
    periodStart: dates[0] ?? null,
    periodEnd: dates[dates.length - 1] ?? null
  };
}
