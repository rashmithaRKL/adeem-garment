import { supabase } from '@/lib/supabase';
import type { QualityParseResult } from './types';

export interface QualityImportResult {
  uploadId: string;
  inspections: number;
  defects: number;
  processingMs: number;
}

export interface QualityDuplicate {
  duplicate: true;
  previous: { id: string; original_filename: string; created_at: string };
}

/** Postgrest rejects very large single statements; the sheets never exceed a few thousand rows. */
const CHUNK = 400;

const chunks = <T,>(rows: T[]): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += CHUNK) out.push(rows.slice(i, i + CHUNK));
  return out;
};

/**
 * A report names the lines it measures, so importing one is also how the system
 * learns the factory's shape. Registering is best-effort and deliberately last:
 * the inspection figures are the point of the import, and losing them because a
 * line could not be created would be the wrong trade.
 */
async function registerLines(parsed: QualityParseResult): Promise<void> {
  const seen = new Map<number, string>();
  // linesSeen also carries the lines whose row or sheet the workbook left blank,
  // so a line that has not been inspected yet still gets registered and shows up
  // on the Quality screens as "not inspected" rather than not existing.
  for (const lineNo of parsed.linesSeen) {
    if (lineNo > 0) seen.set(lineNo, `LINE ${String(lineNo).padStart(2, '0')}`);
  }
  for (const row of [...parsed.inspections, ...parsed.defects]) {
    if (row.isFactory || row.lineNo == null || row.lineNo <= 0) continue;
    if (row.lineLabel) seen.set(row.lineNo, row.lineLabel);
  }

  for (const [lineNo, label] of seen) {
    const { error } = await supabase.rpc('register_production_line', {
      p_line_no: lineNo,
      p_name: label.toUpperCase()
    });
    if (error) {
      // eslint-disable-next-line no-console
      console.warn(`Could not register line ${lineNo}: ${error.message}`);
    }
  }
}

/**
 * Writes a parsed quality workbook straight to Postgres under the caller's own
 * session. There is no Edge Function in this path: RLS is the gate, and the
 * insert policies only accept child rows whose upload row is owned by the caller,
 * so a forged upload_id is rejected by the database rather than by the browser.
 *
 * The upload row is written first on purpose. If the child inserts fail, the
 * upload row is removed again, so a half-imported report never shows up as a
 * successful one in the history.
 */
export async function importQuality(
  parsed: QualityParseResult,
  file: File,
  fileHash: string,
  profileId: string,
  opts: { allowDuplicate?: boolean } = {}
): Promise<QualityImportResult | QualityDuplicate> {
  const started = performance.now();

  if (!opts.allowDuplicate) {
    const { data: prior, error } = await supabase
      .from('quality_uploads')
      .select('id, original_filename, created_at')
      .eq('file_hash', fileHash)
      .order('created_at', { ascending: false })
      .limit(1);
    if (error) throw new Error(error.message);
    if (prior && prior.length > 0) return { duplicate: true, previous: prior[0]! };
  }

  const { data: upload, error: uploadError } = await supabase
    .from('quality_uploads')
    .insert({
      uploaded_by: profileId,
      report_kind: parsed.kind,
      original_filename: file.name,
      file_hash: fileHash,
      sheet_names: parsed.sheetsUsed,
      period_start: parsed.periodStart,
      period_end: parsed.periodEnd,
      inspection_rows: parsed.inspections.length,
      defect_rows: parsed.defects.length
    })
    .select('id')
    .single();

  if (uploadError) throw new Error(uploadError.message);
  const uploadId = (upload as { id: string }).id;

  try {
    for (const batch of chunks(parsed.inspections)) {
      const { error } = await supabase.from('quality_inspections').insert(
        batch.map((r) => ({
          upload_id: uploadId,
          line_no: r.lineNo,
          line_label: r.lineLabel,
          is_factory: r.isFactory,
          style_number: r.styleNumber,
          inspection_date: r.inspectionDate,
          period_month: r.periodMonth,
          stage: r.stage,
          checked_qty: r.checkedQty,
          pass_qty: r.passQty,
          defect_qty: r.defectQty,
          pass_pct: r.passPct,
          defect_pct: r.defectPct,
          verdict: r.verdict ?? null,
          shared_lines: r.sharedLines?.length ? r.sharedLines : null
        }))
      );
      if (error) throw new Error(error.message);
    }

    for (const batch of chunks(parsed.defects)) {
      const { error } = await supabase.from('quality_defects').insert(
        batch.map((r) => ({
          upload_id: uploadId,
          line_no: r.lineNo,
          line_label: r.lineLabel,
          is_factory: r.isFactory,
          inspection_date: r.inspectionDate,
          period_month: r.periodMonth,
          category: r.category,
          qty: r.qty
        }))
      );
      if (error) throw new Error(error.message);
    }
    await registerLines(parsed);
  } catch (err) {
    // Cascades to the child rows that did land.
    await supabase.from('quality_uploads').delete().eq('id', uploadId);
    throw err;
  }

  return {
    uploadId,
    inspections: parsed.inspections.length,
    defects: parsed.defects.length,
    processingMs: Math.round(performance.now() - started)
  };
}
