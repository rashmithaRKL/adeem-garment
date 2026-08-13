import { supabase } from '@/lib/supabase';

export interface HrRow {
  id: string;
  work_date: string;
  department: string;
  direct_carder: number;
  indirect_carder: number;
  present: number;
  absent: number;
  on_leave: number;
  remarks: string | null;
}

/**
 * The whole attendance history, newest first, capped at roughly a year of daily
 * entries across a handful of departments. Every figure on the HR screen is a
 * roll-up of these rows, computed in the browser: the aggregates are over a few
 * hundred numbers, and doing them here keeps a single fetch behind four charts
 * that would otherwise be four round trips telling four slightly different
 * stories about the same day.
 */
export async function fetchHrRows(): Promise<HrRow[]> {
  const { data, error } = await supabase
    .from('hr_attendance')
    .select('id, work_date, department, direct_carder, indirect_carder, present, absent, on_leave, remarks')
    .order('work_date', { ascending: false })
    .limit(2000);
  if (error) throw new Error(error.message);
  return (data ?? []) as HrRow[];
}

export interface DayStat {
  date: string;
  direct: number;
  indirect: number;
  /** Sanctioned headcount: direct plus indirect. */
  carder: number;
  present: number;
  absent: number;
  leave: number;
  absenteeism: number;
}

export interface MonthStat {
  month: string;
  label: string;
  carder: number;
  present: number;
  absent: number;
  absenteeism: number;
}

export interface DeptStat {
  department: string;
  direct: number;
  indirect: number;
  present: number;
  absent: number;
  absenteeism: number;
}

export interface HrOverview {
  hasData: boolean;
  /** The most recent day with any entry — "today" only if today was entered. */
  latest: DayStat | null;
  /** The last seven days that carry an entry, oldest first. */
  week: DayStat[];
  months: MonthStat[];
  /** The latest day's split, which is the only one where a department total is
   *  a headcount rather than a sum of man-days. */
  departments: DeptStat[];
}

/**
 * Absenteeism against sanctioned headcount, not against attendance.
 *
 * absent / (direct + indirect) answers "how much of the factory we pay for did
 * not show up", which is the question HR is asked. The tempting alternative,
 * absent / (present + absent), quietly excludes anyone not accounted for either
 * way and reports a smaller, friendlier number.
 */
const rate = (absent: number, carder: number): number =>
  carder > 0 ? Math.round((absent / carder) * 10_000) / 100 : 0;

const monthLabel = (month: string): string =>
  new Date(month + '-01T00:00:00').toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });

export function buildHrOverview(rows: HrRow[]): HrOverview {
  if (rows.length === 0) {
    return { hasData: false, latest: null, week: [], months: [], departments: [] };
  }

  const byDate = new Map<string, DayStat>();
  const byMonth = new Map<string, MonthStat>();

  for (const r of rows) {
    const carder = r.direct_carder + r.indirect_carder;

    const day = byDate.get(r.work_date) ?? {
      date: r.work_date, direct: 0, indirect: 0, carder: 0,
      present: 0, absent: 0, leave: 0, absenteeism: 0
    };
    day.direct += r.direct_carder;
    day.indirect += r.indirect_carder;
    day.carder += carder;
    day.present += r.present;
    day.absent += r.absent;
    day.leave += r.on_leave;
    byDate.set(r.work_date, day);

    const key = r.work_date.slice(0, 7);
    const month = byMonth.get(key) ?? {
      month: key, label: monthLabel(key), carder: 0, present: 0, absent: 0, absenteeism: 0
    };
    // Summed across days, so the denominator is man-days rather than heads —
    // which is what a monthly absenteeism percentage has to be measured against.
    month.carder += carder;
    month.present += r.present;
    month.absent += r.absent;
    byMonth.set(key, month);
  }

  for (const day of byDate.values()) day.absenteeism = rate(day.absent, day.carder);
  for (const month of byMonth.values()) month.absenteeism = rate(month.absent, month.carder);

  const days = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  const latest = days[days.length - 1] ?? null;

  const departments = latest
    ? [...rows.filter((r) => r.work_date === latest.date)
        .reduce((acc, r) => {
          const d = acc.get(r.department) ?? {
            department: r.department, direct: 0, indirect: 0, present: 0, absent: 0, absenteeism: 0
          };
          d.direct += r.direct_carder;
          d.indirect += r.indirect_carder;
          d.present += r.present;
          d.absent += r.absent;
          acc.set(r.department, d);
          return acc;
        }, new Map<string, DeptStat>())
        .values()]
        .map((d) => ({ ...d, absenteeism: rate(d.absent, d.direct + d.indirect) }))
        .sort((a, b) => (b.direct + b.indirect) - (a.direct + a.indirect))
    : [];

  return {
    hasData: true,
    latest,
    week: days.slice(-7),
    months: [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month)).slice(-12),
    departments
  };
}
