import { supabase } from '@/lib/supabase';
import type { SheetImportResult } from '@/features/hr/importHr';
import type { PlanParseRow } from './parsePlan';

const CHUNK = 400;

const chunks = <T,>(rows: T[]): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += CHUNK) out.push(rows.slice(i, i + CHUNK));
  return out;
};

/**
 * Writes a loading plan, upserting on (line_no, style_number) — so uploading a
 * revised plan moves the dates and states of the styles it names instead of
 * queueing a second copy of each. Styles the new sheet no longer mentions are
 * left in place rather than deleted: a plan sheet is often one line or one month
 * at a time, and treating it as the whole truth would silently wipe the rest.
 */
export async function importPlanRows(
  rows: PlanParseRow[],
  profileId: string | null
): Promise<SheetImportResult> {
  const started = performance.now();

  for (const batch of chunks(rows)) {
    const { error } = await supabase
      .from('loading_plan')
      .upsert(
        batch.map((r) => ({
          line_no: r.line_no,
          style_number: r.style_number,
          order_number: r.order_number,
          school_name: r.school_name,
          order_qty: r.order_qty,
          pp_date: r.pp_date,
          pcd: r.pcd,
          psd: r.psd,
          ped: r.ped,
          status: r.status,
          sequence: r.sequence,
          remarks: r.remarks,
          created_by: profileId
        })),
        { onConflict: 'line_no,style_number' }
      );
    if (error) throw new Error(error.message);
  }

  // A plan names the lines it loads, so importing one is also how the system
  // learns about a line nobody has set up yet. Best effort, and last: losing the
  // plan because a line could not be created would be the wrong trade.
  for (const lineNo of new Set(rows.map((r) => r.line_no))) {
    const { error } = await supabase.rpc('register_production_line', {
      p_line_no: lineNo,
      p_name: null
    });
    // eslint-disable-next-line no-console
    if (error) console.warn(`Could not register line ${lineNo}: ${error.message}`);
  }

  return { written: rows.length, processingMs: Math.round(performance.now() - started) };
}
