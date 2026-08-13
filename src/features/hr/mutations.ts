import { supabase } from '@/lib/supabase';

export interface HrEdit {
  work_date: string;
  department: string;
  direct_carder: number;
  indirect_carder: number;
  present: number;
  absent: number;
  on_leave: number;
  remarks: string;
}

/** The departments HR reports on. Free text underneath, so the list can grow. */
export const HR_DEPARTMENTS = ['Factory', 'Sewing', 'Cutting', 'Finishing', 'Quality', 'Stores'];

const payload = (patch: HrEdit, profileId: string | null) => ({
  work_date: patch.work_date,
  department: patch.department.trim() || 'Factory',
  direct_carder: Math.max(0, Math.round(patch.direct_carder)),
  indirect_carder: Math.max(0, Math.round(patch.indirect_carder)),
  present: Math.max(0, Math.round(patch.present)),
  absent: Math.max(0, Math.round(patch.absent)),
  on_leave: Math.max(0, Math.round(patch.on_leave)),
  remarks: patch.remarks.trim() || null,
  recorded_by: profileId
});

/**
 * One entry per department per day is enforced by the database. Saying so plainly
 * beats the generic duplicate-key sentence, because the fix — edit the existing
 * row rather than add a second one — is not otherwise obvious.
 */
export async function createHrEntry(patch: HrEdit, profileId: string | null) {
  const { error } = await supabase.from('hr_attendance').insert(payload(patch, profileId));
  if (error) {
    if (error.code === '23505') {
      throw new Error(
        `${patch.department} already has an entry for ${patch.work_date}. Edit that entry `
        + 'instead — a second one would count the same people twice.'
      );
    }
    throw new Error(error.message);
  }
}

export async function updateHrEntry(id: string, patch: HrEdit, profileId: string | null) {
  const { error } = await supabase.from('hr_attendance').update(payload(patch, profileId)).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteHrEntry(id: string) {
  const { error } = await supabase.from('hr_attendance').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
