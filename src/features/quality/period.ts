/**
 * The window of time a quality screen is showing.
 *
 * The client reads quality three ways — today, the last seven days, and the month
 * — so the window is a range with an anchor rather than one value picked from a
 * list of every period ever imported. A list works while there are six days of
 * reports and becomes unusable at six hundred, which is the whole reason this
 * exists: the anchor is typed into a date field or stepped with the arrows, and
 * neither gets slower as the history grows.
 *
 * Every date here is an ISO `YYYY-MM-DD` string handled in UTC. The rows carry
 * calendar dates, not instants, so parsing them in the browser's local zone would
 * move a report over midnight for anyone west of London.
 */

export type QualityRange = 'day' | 'week' | 'month';

/** Inclusive at both ends. */
export interface QualitySpan {
  range: QualityRange;
  from: string;
  to: string;
  /** The date the user picked; the span is derived from it. */
  anchor: string;
}

export const WEEK_DAYS = 7;

export const RANGE_LABEL: Record<QualityRange, string> = {
  day: 'Daily',
  week: 'Weekly',
  month: 'Monthly'
};

/** What each button actually selects, for the control's tooltip. */
export const RANGE_HINT: Record<QualityRange, string> = {
  day: 'one day',
  week: 'the calendar week, Monday to Sunday',
  month: 'one calendar month'
};

/** What one press of an arrow moves by. */
export const RANGE_STEP: Record<QualityRange, string> = {
  day: 'day',
  week: 'week',
  month: 'month'
};

const utc = (iso: string): Date => new Date(iso.slice(0, 10) + 'T00:00:00Z');
const iso = (d: Date): string => d.toISOString().slice(0, 10);

export function addDays(date: string, days: number): string {
  const d = utc(date);
  d.setUTCDate(d.getUTCDate() + days);
  return iso(d);
}

export function addMonths(date: string, months: number): string {
  const d = utc(date);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  // Clamp: stepping back a month from the 31st must not land in the month before.
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return iso(d);
}

/** The first of the anchor's month — the key the monthly report rows are filed under. */
export const monthStart = (date: string): string => date.slice(0, 7) + '-01';

export const monthEnd = (date: string): string => {
  const d = utc(date);
  return iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)));
};

/**
 * The Monday that starts the calendar week the date falls in.
 *
 * The factory's week runs Monday to Sunday, so a week is that week and not the
 * seven days behind wherever the cursor happens to be: two people asking for
 * "this week" on different days must get the same figures, or the number stops
 * being something they can quote to each other.
 */
export function weekStart(date: string): string {
  const dow = utc(date).getUTCDay(); // 0 = Sunday
  return addDays(date, -(dow === 0 ? 6 : dow - 1));
}

export const weekEnd = (date: string): string => addDays(weekStart(date), WEEK_DAYS - 1);

export const today = (): string => iso(new Date());

/** The dates a range covers, given the day the user is pointing at. */
export function spanFor(range: QualityRange, anchor: string): QualitySpan {
  if (range === 'day') return { range, anchor, from: anchor, to: anchor };
  if (range === 'week') return { range, anchor, from: weekStart(anchor), to: weekEnd(anchor) };
  return { range, anchor, from: monthStart(anchor), to: monthEnd(anchor) };
}

/** One window earlier or later: a day, a calendar week, or a calendar month. */
export function stepAnchor(range: QualityRange, anchor: string, step: -1 | 1): string {
  if (range === 'day') return addDays(anchor, step);
  // From the Monday, so stepping never drifts off the week boundary.
  if (range === 'week') return addDays(weekStart(anchor), step * WEEK_DAYS);
  return addMonths(monthStart(anchor), step);
}

export const withinSpan = (date: string, span: QualitySpan): boolean =>
  date >= span.from && date <= span.to;

const dateFormat = (opts: Intl.DateTimeFormatOptions) => (date: string): string =>
  utc(date).toLocaleDateString('en-GB', { ...opts, timeZone: 'UTC' });

const fullDate = dateFormat({ day: '2-digit', month: 'short', year: 'numeric' });
const dayMonth = dateFormat({ day: '2-digit', month: 'short' });
const fullMonth = dateFormat({ month: 'long', year: 'numeric' });

/** Short enough for a chart axis. */
export const axisLabel = (date: string, range: QualityRange): string =>
  range === 'month'
    ? dateFormat({ month: 'short', year: '2-digit' })(date)
    : dayMonth(date);

/**
 * What the window is called on screen: one date, a dated week, or a month. A week
 * inside one month drops the repeated month name — "17 – 23 Aug 2026" reads
 * faster than spelling it twice.
 */
export function spanLabel(span: QualitySpan): string {
  if (span.range === 'day') return fullDate(span.anchor);
  if (span.range === 'month') return fullMonth(span.anchor);
  const sameMonth = span.from.slice(0, 7) === span.to.slice(0, 7);
  return (sameMonth ? span.from.slice(8, 10) : dayMonth(span.from)) + ' – ' + fullDate(span.to);
}
