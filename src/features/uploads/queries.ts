import { supabase } from '@/lib/supabase';
import type { Database } from '@/types/database';

export type UploadRow = Database['public']['Tables']['excel_uploads']['Row'] & {
  profiles?: { full_name: string } | null;
};

/** Admin view. RLS still applies, so a non-admin call returns only their own rows. */
export async function fetchAllUploads(): Promise<UploadRow[]> {
  const { data, error } = await supabase
    .from('excel_uploads')
    .select('*, profiles!excel_uploads_uploaded_by_fkey ( full_name )')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as UploadRow[];
}

export async function fetchMyUploads(profileId: string): Promise<UploadRow[]> {
  const { data, error } = await supabase
    .from('excel_uploads')
    .select('*')
    .eq('uploaded_by', profileId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as UploadRow[];
}

export async function fetchUpload(uploadId: string) {
  const [upload, errors, warnings] = await Promise.all([
    supabase.from('excel_uploads').select('*').eq('id', uploadId).single(),
    supabase.from('import_errors').select('*').eq('upload_id', uploadId).order('row_number'),
    supabase.from('import_warnings').select('*').eq('upload_id', uploadId).order('row_number')
  ]);

  if (upload.error) throw upload.error;
  return {
    upload: upload.data,
    errors: errors.data ?? [],
    warnings: warnings.data ?? []
  };
}

/** Groups versions of the same document by filename for the history screen. */
export function groupByDocument(uploads: UploadRow[]): { filename: string; versions: UploadRow[] }[] {
  const map = new Map<string, UploadRow[]>();
  for (const u of uploads) {
    const list = map.get(u.original_filename) ?? [];
    list.push(u);
    map.set(u.original_filename, list);
  }
  return [...map.entries()].map(([filename, versions]) => ({
    filename,
    versions: versions.sort((a, b) => b.upload_version - a.upload_version)
  }));
}
