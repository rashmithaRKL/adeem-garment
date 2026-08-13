import { supabase } from '@/lib/supabase';
import type { PlanStatus } from './queries';

export interface PlanEdit {
  line_no: number;
  style_number: string;
  order_number: string;
  school_name: string;
  order_qty: number;
  pp_date: string;
  pcd: string;
  psd: string;
  ped: string;
  status: PlanStatus;
  sequence: number;
  remarks: string;
}

/** An empty date input is no date, not the epoch. */
const orNull = (v: string): string | null => (v.trim() === '' ? null : v);

const payload = (patch: PlanEdit, profileId: string | null) => ({
  line_no: Math.max(1, Math.round(patch.line_no)),
  style_number: patch.style_number.trim(),
  order_number: orNull(patch.order_number),
  school_name: orNull(patch.school_name),
  order_qty: Math.max(0, Math.round(patch.order_qty)),
  pp_date: orNull(patch.pp_date),
  pcd: orNull(patch.pcd),
  psd: orNull(patch.psd),
  ped: orNull(patch.ped),
  status: patch.status,
  sequence: Math.max(1, Math.round(patch.sequence)),
  remarks: orNull(patch.remarks),
  created_by: profileId
});

/**
 * Creating a plan row also registers the line it names, exactly as importing a
 * quality report does. A plan is frequently entered for a line before anyone has
 * set that line up, and silently planning work for a line the rest of the system
 * has never heard of is how a style goes missing.
 */
export async function createPlanRow(patch: PlanEdit, profileId: string | null) {
  const { error } = await supabase.from('loading_plan').insert(payload(patch, profileId));
  if (error) throw new Error(error.message);

  const { error: lineError } = await supabase.rpc('register_production_line', {
    p_line_no: Math.max(1, Math.round(patch.line_no)),
    p_name: null
  });
  // Best effort: the plan row is the point of the save, and losing it because a
  // line could not be auto-created would be the wrong trade.
  // eslint-disable-next-line no-console
  if (lineError) console.warn(`Could not register line ${patch.line_no}: ${lineError.message}`);
}

export async function updatePlanRow(id: string, patch: PlanEdit, profileId: string | null) {
  const { error } = await supabase.from('loading_plan').update(payload(patch, profileId)).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deletePlanRow(id: string) {
  const { error } = await supabase.from('loading_plan').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
