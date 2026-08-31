import { supabase } from '@/lib/supabase';
import type { RejectionParseResult } from './parseRejection';

export interface RejectionImportResult {
  uploadId: string;
  records: number;
  processingMs: number;
}

export interface RejectionDuplicate {
  duplicate: true;
  previous: { id: string; original_filename: string; created_at: string };
}

/** Postgrest rejects very large single statements; these sheets are small. */
const CHUNK = 400;

const chunks = <T,>(rows: T[]): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += CHUNK) out.push(rows.slice(i, i + CHUNK));
  return out;
};

/**
 * A rejection report names the lines it covers, so importing one is also how the
 * system learns the factory's shape. Best-effort and deliberately last: the
 * figures are the point of the import, and losing them because a line could not
 * be created would be the wrong trade.
 */
async function registerLines(parsed: RejectionParseResult): Promise<void> {
  for (const lineNo of parsed.linesSeen) {
    if (lineNo <= 0) continue;
    const { error } = await supabase.rpc('register_production_line', {
      p_line_no: lineNo,
      p_name: `LINE ${String(lineNo).padStart(2, '0')}`
    });
    if (error) {
      // eslint-disable-next-line no-console
      console.warn(`Could not register line ${lineNo}: ${error.message}`);
    }
  }
}

/**
 * Writes a parsed rejection workbook straight to Postgres under the caller's own
 * session, exactly as the quality import does. There is no Edge Function in this
 * path: RLS is the gate, and the insert policy only accepts child rows whose
 * upload row is owned by the caller, so a forged upload_id is refused by the
 * database rather than by the browser.
 *
 * The upload row is written first on purpose. If the child inserts fail it is
 * removed again — cascading to whatever did land — so a half-imported report
 * never appears in the history as a successful one.
 *
 * Rows are appended, not upserted. A rejection report is a record of what was
 * found on a given day; re-uploading a corrected sheet is caught by the file
 * hash, and importing past that is a deliberate choice the user makes on the
 * duplicate screen.
 */
export async function importRejection(
  parsed: RejectionParseResult,
  file: File,
  fileHash: string,
  profileId: string,
  opts: { allowDuplicate?: boolean } = {}
): Promise<RejectionImportResult | RejectionDuplicate> {
  const started = performance.now();

  if (!opts.allowDuplicate) {
    const { data: prior, error } = await supabase
      .from('rejection_uploads')
      .select('id, original_filename, created_at')
      .eq('file_hash', fileHash)
      .order('created_at', { ascending: false })
      .limit(1);
    if (error) throw new Error(error.message);
    if (prior && prior.length > 0) return { duplicate: true, previous: prior[0]! };
  }

  const { data: upload, error: uploadError } = await supabase
    .from('rejection_uploads')
    .insert({
      uploaded_by: profileId,
      original_filename: file.name,
      file_hash: fileHash,
      sheet_names: parsed.sheetsUsed,
      period_start: parsed.periodStart,
      period_end: parsed.periodEnd,
      record_count: parsed.rows.length
    })
    .select('id')
    .single();

  if (uploadError) throw new Error(uploadError.message);
  const uploadId = (upload as { id: string }).id;

  try {
    for (const batch of chunks(parsed.rows)) {
      const { error } = await supabase.from('rejection_records').insert(
        batch.map((r) => ({
          upload_id: uploadId,
          line_no: r.line_no,
          line_label: r.line_label,
          production_date: r.production_date,
          style_number: r.style_number,
          order_qty: r.order_qty,
          reject_qty: r.reject_qty,
          reject_pct: r.reject_pct
        }))
      );
      if (error) throw new Error(error.message);
    }
    await registerLines(parsed);
  } catch (err) {
    // Cascades to the child rows that did land.
    await supabase.from('rejection_uploads').delete().eq('id', uploadId);
    throw err;
  }

  return {
    uploadId,
    records: parsed.rows.length,
    processingMs: Math.round(performance.now() - started)
  };
}
