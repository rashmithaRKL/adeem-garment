// Stores a compressed workbook and imports its validated rows.
// The browser sends the zip it built plus the rows it previewed; this function
// re-checks identity, hash and duplicates before anything is written.
// Deploy: supabase functions deploy process-excel
import { corsHeaders, json } from '../_shared/cors.ts';
import { requireCaller, serviceClient, audit } from '../_shared/auth.ts';

interface OrderFields {
  buyer: string | null;
  styleNumber: string | null;
  productName: string | null;
  color: string | null;
  size: string | null;
  orderQuantity: number | null;
  deliveryDate: string | null;
}

interface ImportRow {
  rowNumber: number;
  lineNumber: number;
  orderNumber: string;
  productionDate: string;
  targetQuantity: number;
  actualQuantity: number;
  efficiency: number | null;
  order?: OrderFields;
  raw: Record<string, unknown>;
}

interface Payload {
  originalFilename: string;
  originalSize: number;
  fileHash: string;
  archiveBase64: string;
  sheetCount: number;
  rowCount: number;
  columnCount: number;
  rows: ImportRow[];
  errors: { rowNumber: number; column: string; type: string; message: string }[];
  warnings: { rowNumber: number; column: string; message: string }[];
  parentUploadId?: string;
}

const BUCKET = 'garment-excel-files';
const MAX_ARCHIVE_BYTES = 25 * 1024 * 1024;
const CHUNK = 500;

/** A day of production for one order on one line, however many sheet rows said so. */
interface AggregatedRecord {
  lineNumber: number;
  orderNumber: string;
  productionDate: string;
  targetQuantity: number;
  actualQuantity: number;
  efficiency: number | null;
  sourceRowNumber: number;
}

/**
 * A sheet routinely carries several rows for the same line, order and day - one
 * per colour or size. Those must be summed before they reach Postgres: the
 * unique index on (line, date, order) means a batch containing the same key
 * twice would abort the whole upsert with "cannot affect row a second time".
 */
function aggregate(rows: ImportRow[]): AggregatedRecord[] {
  const byKey = new Map<string, AggregatedRecord>();

  for (const row of rows) {
    const key = row.lineNumber + '|' + row.productionDate + '|' + row.orderNumber;
    const existing = byKey.get(key);

    if (!existing) {
      byKey.set(key, {
        lineNumber: row.lineNumber,
        orderNumber: row.orderNumber,
        productionDate: row.productionDate,
        targetQuantity: row.targetQuantity,
        actualQuantity: row.actualQuantity,
        efficiency: row.efficiency,
        sourceRowNumber: row.rowNumber
      });
      continue;
    }

    existing.targetQuantity += row.targetQuantity;
    existing.actualQuantity += row.actualQuantity;
    existing.efficiency = null; // recomputed below from the summed totals
  }

  for (const record of byKey.values()) {
    if (record.efficiency == null && record.targetQuantity > 0) {
      record.efficiency = Math.min(
        Math.round((record.actualQuantity / record.targetQuantity) * 10_000) / 100,
        999.99
      );
    }
  }

  return [...byKey.values()];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const startedAt = Date.now();
  let uploadId: string | null = null;
  const db = serviceClient();

  try {
    const caller = await requireCaller(req);
    const body = await req.json() as Payload;

    if (!body?.originalFilename || !body?.fileHash || !body?.archiveBase64) {
      return json({ error: 'The upload payload is incomplete. Please re-scan the file.' }, 400);
    }
    if (!Array.isArray(body.rows) || body.rows.length === 0) {
      return json({ error: 'There are no valid rows to import.' }, 400);
    }
    if (!/^[0-9a-f]{64}$/.test(body.fileHash)) {
      return json({ error: 'The file fingerprint is malformed.' }, 400);
    }

    // Duplicate detection is server-side so it cannot be skipped by the client.
    const { data: existing } = await db
      .from('excel_uploads')
      .select('id, upload_version, original_filename, created_at')
      .eq('file_hash', body.fileHash)
      .order('upload_version', { ascending: false })
      .limit(1);

    const previous = existing?.[0];
    if (previous && !body.parentUploadId) {
      // 200, not 409: supabase-js turns any non-2xx into a thrown FunctionsHttpError,
      // which would hide this from the "create a new version?" prompt in the UI.
      return json({ duplicate: true, previousUpload: previous });
    }

    const archive = Uint8Array.from(atob(body.archiveBase64), (c) => c.charCodeAt(0));
    if (archive.byteLength > MAX_ARCHIVE_BYTES) {
      return json({ error: 'That file is larger than the 25 MB limit.' }, 413);
    }

    const version = previous ? previous.upload_version + 1 : 1;
    const base = body.originalFilename.replace(/\.(xlsx|xls)$/i, '');
    const compressedFilename = base + '_v' + version + '.zip';
    const now = new Date();
    const storagePath = [
      now.getUTCFullYear(),
      String(now.getUTCMonth() + 1).padStart(2, '0'),
      crypto.randomUUID() + '_' + compressedFilename
    ].join('/');

    const { error: storageErr } = await db.storage
      .from(BUCKET)
      .upload(storagePath, archive, { contentType: 'application/zip', upsert: false });

    if (storageErr) return json({ error: 'Could not store the document. ' + storageErr.message }, 500);

    const { data: upload, error: uploadErr } = await db
      .from('excel_uploads')
      .insert({
        uploaded_by: caller.profileId,
        original_filename: body.originalFilename,
        compressed_filename: compressedFilename,
        storage_path: storagePath,
        original_file_size: body.originalSize,
        compressed_file_size: archive.byteLength,
        compression_type: 'deflate',
        file_hash: body.fileHash,
        row_count: body.rowCount,
        column_count: body.columnCount,
        sheet_count: body.sheetCount,
        valid_record_count: body.rows.length,
        warning_count: body.warnings?.length ?? 0,
        error_count: body.errors?.length ?? 0,
        duplicate_count: previous ? 1 : 0,
        processing_status: 'scanning',
        upload_version: version,
        parent_upload_id: previous?.id ?? null
      })
      .select('id')
      .single();

    if (uploadErr || !upload) {
      await db.storage.from(BUCKET).remove([storagePath]);
      return json({ error: 'Could not save upload metadata.' }, 500);
    }
    uploadId = upload.id;

    await db.from('excel_versions').insert({
      upload_id: upload.id,
      parent_upload_id: previous?.id ?? null,
      version_number: version,
      original_filename: body.originalFilename,
      storage_path: storagePath,
      file_hash: body.fileHash,
      created_by: caller.profileId
    });

    const records = aggregate(body.rows);

    // --- resolve lines -------------------------------------------------------
    const { data: lines } = await db.from('production_lines').select('id, line_number');
    const lineByNumber = new Map<number, string>((lines ?? []).map((l) => [l.line_number, l.id]));

    const unknownLines = [...new Set(
      records.filter((r) => !lineByNumber.has(r.lineNumber)).map((r) => r.lineNumber)
    )];

    // --- resolve orders, creating the ones the sheet introduces --------------
    // Without this every record from a sheet naming a new order would land with
    // order_id NULL, and the order KPIs would never move.
    const orderFieldsByNumber = new Map<string, OrderFields>();
    for (const row of body.rows) {
      if (row.order && !orderFieldsByNumber.has(row.orderNumber)) {
        orderFieldsByNumber.set(row.orderNumber, row.order);
      }
    }

    const wantedOrders = [...new Set(records.map((r) => r.orderNumber))];
    const orderByNumber = new Map<string, string>();

    for (let i = 0; i < wantedOrders.length; i += CHUNK) {
      const { data: found } = await db
        .from('orders')
        .select('id, order_number')
        .in('order_number', wantedOrders.slice(i, i + CHUNK));
      for (const o of found ?? []) orderByNumber.set(o.order_number, o.id);
    }

    const missingOrders = wantedOrders
      .filter((number) => !orderByNumber.has(number))
      .map((number) => {
        const fields = orderFieldsByNumber.get(number);
        const lineNumber = records.find((r) => r.orderNumber === number)?.lineNumber;
        return {
          order_number: number,
          // buyer is NOT NULL; a sheet without a buyer column still has to import.
          buyer: fields?.buyer ?? 'Unassigned',
          style_number: fields?.styleNumber ?? null,
          product_name: fields?.productName ?? null,
          color: fields?.color ?? null,
          size: fields?.size ?? null,
          order_quantity: fields?.orderQuantity ?? 0,
          delivery_date: fields?.deliveryDate ?? null,
          production_status: 'in_production',
          production_line_id: lineNumber != null ? lineByNumber.get(lineNumber) ?? null : null
        };
      });

    for (let i = 0; i < missingOrders.length; i += CHUNK) {
      const { data: created, error } = await db
        .from('orders')
        .upsert(missingOrders.slice(i, i + CHUNK), { onConflict: 'order_number' })
        .select('id, order_number');
      if (error) {
        await markFailed(db, upload.id);
        return json({ error: 'Import failed while creating orders: ' + error.message }, 500);
      }
      for (const o of created ?? []) orderByNumber.set(o.order_number, o.id);
    }

    // --- write the production records ---------------------------------------
    const importable = records.flatMap((r) => {
      const lineId = lineByNumber.get(r.lineNumber);
      const orderId = orderByNumber.get(r.orderNumber);
      if (!lineId || !orderId) return [];
      return [{
        order_id: orderId,
        production_line_id: lineId,
        production_date: r.productionDate,
        target_quantity: r.targetQuantity,
        actual_quantity: r.actualQuantity,
        efficiency: r.efficiency,
        source_upload_id: upload.id,
        source_row_number: r.sourceRowNumber
      }];
    });

    for (let i = 0; i < importable.length; i += CHUNK) {
      const { error } = await db
        .from('production_records')
        .upsert(importable.slice(i, i + CHUNK), {
          onConflict: 'production_line_id,production_date,order_id'
        });
      if (error) {
        await markFailed(db, upload.id);
        return json({ error: 'Import failed while saving records: ' + error.message }, 500);
      }
    }

    // --- issue log ------------------------------------------------------------
    const skippedForUnknownLine = records.length - importable.length;
    const issues = [...(body.errors ?? [])];
    for (const lineNumber of unknownLines) {
      issues.push({
        rowNumber: 0,
        column: 'Line No',
        type: 'unknown_line',
        message: 'Line ' + lineNumber + ' is not configured, so its rows were skipped. ' +
          'Add it under production_lines and re-import.'
      });
    }

    if (issues.length) {
      await db.from('import_errors').insert(issues.map((e) => ({
        upload_id: upload.id, row_number: e.rowNumber || null, column_name: e.column,
        error_type: e.type, error_message: e.message
      })));
    }
    if (body.warnings?.length) {
      await db.from('import_warnings').insert(body.warnings.map((w) => ({
        upload_id: upload.id, row_number: w.rowNumber, column_name: w.column,
        warning_message: w.message
      })));
    }

    // Sweeps open orders past their delivery date into 'delayed' — the status
    // trigger only fires on change, and a date passing is not a change.
    await db.rpc('refresh_order_statuses');

    const ms = Date.now() - startedAt;
    await db.from('excel_uploads').update({
      processing_ms: ms,
      error_count: issues.length,
      valid_record_count: importable.length,
      processing_status: importable.length === 0 ? 'failed' : issues.length > 0 ? 'warnings' : 'imported',
      completed_at: new Date().toISOString()
    }).eq('id', upload.id);

    await audit(db, caller.profileId, 'EXCEL_IMPORT',
      'Imported ' + importable.length + ' production records from ' + body.originalFilename + ' v' + version,
      { entity_type: 'excel_upload', upload_id: upload.id, ms });

    return json({
      uploadId: upload.id,
      version,
      importedRecords: importable.length,
      skippedRows: (body.errors?.length ?? 0) + skippedForUnknownLine,
      ordersCreated: missingOrders.length,
      compressedFilename,
      originalSize: body.originalSize,
      compressedSize: archive.byteLength,
      processingMs: ms
    });
  } catch (e) {
    if (uploadId) await markFailed(db, uploadId);
    if (e instanceof Response) return json({ error: await e.text() }, e.status);
    console.error('process-excel failed', e);
    return json({ error: 'Unexpected error while processing the workbook.' }, 500);
  }
});

/** Leaves a truthful trail rather than an upload row that claims success. */
async function markFailed(db: ReturnType<typeof serviceClient>, id: string): Promise<void> {
  await db.from('excel_uploads')
    .update({ processing_status: 'failed', completed_at: new Date().toISOString() })
    .eq('id', id);
}
