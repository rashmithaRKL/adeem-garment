import { invokeFunction } from '@/lib/supabase';
import { compressWorkbook, toBase64, decompressWorkbook, saveBlob } from './compress';
import { hashFile } from './hash';
import type { ImportRow, RowIssue } from '@/types/domain';
import { MAX_UPLOAD_BYTES } from '@/lib/env';

const ALLOWED_EXTENSIONS = ['.xlsx', '.xls'];
const ALLOWED_MIME = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel'
];

export function validateFile(file: File): void {
  const lower = file.name.toLowerCase();
  if (!ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext))) {
    throw new Error('Only .xlsx and .xls files can be uploaded.');
  }
  if (file.type && !ALLOWED_MIME.includes(file.type)) {
    throw new Error('That file is not a valid Excel document.');
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error('That file is larger than the 25 MB limit.');
  }
}

export interface ImportPayloadMeta {
  sheetCount: number;
  rowCount: number;
  columnCount: number;
  rows: ImportRow[];
  warnings: RowIssue[];
  errors: (RowIssue & { type: string })[];
  /** Set when the user chose "Create new version" after a duplicate warning. */
  parentUploadId?: string;
}

export interface ImportResult {
  uploadId: string;
  version: number;
  importedRecords: number;
  skippedRows: number;
  /** Orders the sheet introduced that the database had not seen before. */
  ordersCreated: number;
  compressedFilename: string;
  originalSize: number;
  compressedSize: number;
  processingMs: number;
}

export interface DuplicateResult {
  duplicate: true;
  previousUpload: {
    id: string;
    upload_version: number;
    original_filename: string;
    created_at: string;
  };
}

/**
 * Compresses the workbook in the browser, then hands the archive and the
 * previewed rows to the Edge Function, which re-checks everything with the
 * service role. The browser never touches Storage directly.
 */
export async function importWorkbook(
  file: File,
  meta: ImportPayloadMeta
): Promise<ImportResult | DuplicateResult> {
  validateFile(file);
  const [fileHash, archive] = await Promise.all([hashFile(file), compressWorkbook(file)]);

  return invokeFunction<ImportResult | DuplicateResult>('process-excel', {
    originalFilename: file.name,
    originalSize: file.size,
    fileHash,
    archiveBase64: toBase64(archive),
    ...meta
  });
}

/** Fetches the archive through a signed URL and writes the original .xlsx to disk. */
export async function downloadOriginal(uploadId: string): Promise<void> {
  const { signedUrl, originalFilename } = await invokeFunction<{
    signedUrl: string; originalFilename: string;
  }>('download-excel', { uploadId });

  const response = await fetch(signedUrl);
  if (!response.ok) throw new Error('The download link has expired. Please try again.');

  const archive = new Uint8Array(await response.arrayBuffer());
  const { bytes, filename } = await decompressWorkbook(archive);
  saveBlob(bytes, filename || originalFilename);
}
