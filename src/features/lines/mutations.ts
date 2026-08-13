import { supabase } from '@/lib/supabase';
import type { Database } from '@/types/database';

export type LineStatus = Database['public']['Enums']['line_status'];

export interface LineEdit {
  line_number: number;
  line_name: string;
  department: string;
  status: LineStatus;
  active: boolean;
}

export const LINE_STATUSES: LineStatus[] = ['running', 'behind', 'changeover', 'idle'];

export interface LineRow {
  id: string;
  line_number: number;
  line_name: string;
  department: string | null;
  status: LineStatus;
  active: boolean;
}

/**
 * Every line, including deactivated ones. The dashboard query filters those out
 * on purpose, which would make a line an admin had just deactivated vanish from
 * the very screen they manage it on.
 */
export async function fetchAllLines(): Promise<LineRow[]> {
  const { data, error } = await supabase
    .from('production_lines')
    .select('id, line_number, line_name, department, status, active')
    .order('line_number');
  if (error) throw new Error(error.message);
  return (data ?? []) as LineRow[];
}

export async function createLine(patch: LineEdit) {
  const { error } = await supabase.from('production_lines').insert({
    line_number: patch.line_number,
    line_name: patch.line_name.trim(),
    department: patch.department.trim() || null,
    status: patch.status,
    active: patch.active
  });
  if (error) throw new Error(error.message);
}

export async function updateLine(id: string, patch: LineEdit) {
  const { error } = await supabase
    .from('production_lines')
    .update({
      line_number: patch.line_number,
      line_name: patch.line_name.trim(),
      department: patch.department.trim() || null,
      status: patch.status,
      active: patch.active
    })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

/**
 * Production records and orders reference a line, so Postgres refuses to delete
 * one that is still in use rather than orphaning history. The UI turns that
 * foreign-key error into a sentence and points at deactivating instead, which is
 * the reversible answer and keeps the line out of every dashboard.
 */
export async function deleteLine(id: string) {
  const { error } = await supabase.from('production_lines').delete().eq('id', id);
  if (error) {
    if (error.code === '23503') {
      throw new Error(
        'This line still has production records or orders attached, so it cannot be '
        + 'deleted without destroying that history. Deactivate it instead — it will '
        + 'disappear from the dashboards and can be brought back later.'
      );
    }
    throw new Error(error.message);
  }
}
