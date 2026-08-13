import { supabase } from '@/lib/supabase';

export type PlanStatus = 'upcoming' | 'in_progress' | 'completed' | 'hold';

export interface PlanRow {
  id: string;
  line_no: number;
  style_number: string;
  order_number: string | null;
  school_name: string | null;
  order_qty: number;
  /** Pre-production meeting. */
  pp_date: string | null;
  /** Planned cut date. */
  pcd: string | null;
  /** Planned sewing start date. */
  psd: string | null;
  /** Planned end date. */
  ped: string | null;
  status: PlanStatus;
  sequence: number;
  remarks: string | null;
}

export const PLAN_STATUSES: PlanStatus[] = ['upcoming', 'in_progress', 'completed', 'hold'];

export const PLAN_STATUS_LABEL: Record<PlanStatus, string> = {
  upcoming: 'Upcoming',
  in_progress: 'In progress',
  completed: 'Completed',
  hold: 'On hold'
};

/**
 * The whole plan, ordered the way a line reads it: line by line, and within a
 * line in the sequence the styles are meant to run.
 */
export async function fetchLoadingPlan(): Promise<PlanRow[]> {
  const { data, error } = await supabase
    .from('loading_plan')
    .select('id, line_no, style_number, order_number, school_name, order_qty, pp_date, pcd, psd, ped, status, sequence, remarks')
    .order('line_no', { ascending: true })
    .order('sequence', { ascending: true })
    .limit(2000);
  if (error) throw new Error(error.message);
  return (data ?? []) as PlanRow[];
}

/**
 * What each line takes next, keyed by line number.
 *
 * "Next" is the first style still queued — the lowest sequence that is neither
 * finished nor already on the machines. A style on hold is skipped rather than
 * announced as next, because a line cannot start it.
 */
export function nextStyleByLine(rows: PlanRow[]): Record<number, PlanRow> {
  const out: Record<number, PlanRow> = {};
  for (const row of rows) {
    if (row.status !== 'upcoming') continue;
    const held = out[row.line_no];
    if (!held || row.sequence < held.sequence) out[row.line_no] = row;
  }
  return out;
}

/** Same query, shaped for the Production Line cards. */
export async function fetchNextStyles(): Promise<Record<number, PlanRow>> {
  return nextStyleByLine(await fetchLoadingPlan());
}

/**
 * A milestone that has come and gone while its style is still waiting. This is
 * the whole point of storing PP, PCD, PSD and PED separately rather than as one
 * due date: the plan is late in a specific, actionable place.
 */
export function overdueMilestone(row: PlanRow, today = new Date().toISOString().slice(0, 10)):
  { field: string; date: string } | null {
  if (row.status === 'completed' || row.status === 'in_progress') return null;
  const checks: [string, string | null][] = [
    ['PP date', row.pp_date], ['PCD', row.pcd], ['PSD', row.psd], ['PED', row.ped]
  ];
  for (const [field, date] of checks) {
    if (date && date < today) return { field, date };
  }
  return null;
}
