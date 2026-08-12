import { supabase } from '@/lib/supabase';
import type { Database } from '@/types/database';

export type ProfileRow = Database['public']['Tables']['profiles']['Row'] & {
  uploadCount?: number;
};

/** Admin only in practice: RLS returns just the caller's own row for an employee. */
export async function fetchEmployees(): Promise<ProfileRow[]> {
  const [{ data: profiles, error }, { data: uploads }] = await Promise.all([
    supabase.from('profiles').select('*').order('full_name'),
    supabase.from('excel_uploads').select('uploaded_by')
  ]);
  if (error) throw error;

  const counts = new Map<string, number>();
  for (const u of uploads ?? []) {
    counts.set(u.uploaded_by, (counts.get(u.uploaded_by) ?? 0) + 1);
  }
  return (profiles ?? []).map((p) => ({ ...p, uploadCount: counts.get(p.id) ?? 0 }));
}

export async function setEmployeeStatus(id: string, status: 'active' | 'disabled') {
  const { error } = await supabase.from('profiles').update({ status }).eq('id', id);
  if (error) throw error;
}

export async function setEmployeeRole(id: string, role: 'admin' | 'employee') {
  const { error } = await supabase.from('profiles').update({ role }).eq('id', id);
  if (error) throw error;
}
