import { supabase } from '@/lib/supabase';
import type { HrParseRow } from './parseHr';

export interface SheetImportResult {
  written: number;
  processingMs: number;
}

/** Postgrest rejects very large single statements; these sheets are small. */
const CHUNK = 400;

const chunks = <T,>(rows: T[]): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += CHUNK) out.push(rows.slice(i, i + CHUNK));
  return out;
};

/**
 * Writes an attendance sheet, upserting on (work_date, department).
 *
 * Re-uploading a corrected sheet therefore updates the days it covers and leaves
 * every other day alone. That is deliberately different from the production
 * import, which refuses a duplicate file outright: an attendance sheet is a
 * living document that gets amended as a shift is counted, and a second upload
 * is nearly always a correction rather than a mistake.
 */
export async function importHrRows(
  rows: HrParseRow[],
  profileId: string | null
): Promise<SheetImportResult> {
  const started = performance.now();

  for (const batch of chunks(rows)) {
    const { error } = await supabase
      .from('hr_attendance')
      .upsert(
        batch.map((r) => ({
          work_date: r.work_date,
          department: r.department,
          direct_carder: r.direct_carder,
          indirect_carder: r.indirect_carder,
          present: r.present,
          absent: r.absent,
          on_leave: r.on_leave,
          remarks: r.remarks,
          recorded_by: profileId
        })),
        { onConflict: 'work_date,department' }
      );
    if (error) throw new Error(error.message);
  }

  return { written: rows.length, processingMs: Math.round(performance.now() - started) };
}
