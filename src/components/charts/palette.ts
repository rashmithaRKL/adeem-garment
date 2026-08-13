/**
 * Chart colour, decided once for the whole system.
 *
 * The eight slots are handed out in this fixed order and never cycled. The order
 * itself is the accessibility mechanism: every adjacent pair was measured to
 * clear the colour-vision separation floor against both the light and the dark
 * card surface, so shuffling them or generating a ninth hue breaks a guarantee
 * that cannot be seen by looking at the screen.
 *
 * A ninth category is therefore never given a new colour — it is folded into
 * "Other" by toSlices below.
 */
export const SERIES: readonly string[] = [
  'var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)',
  'var(--chart-5)', 'var(--chart-6)', 'var(--chart-7)', 'var(--chart-8)'
];

/** Everything past the eighth slot, and anything unranked. */
export const OTHER_COLOR = 'var(--text-faint)';

/**
 * One hue, light to dark, for a single ordered measure. Sequential and
 * categorical are different jobs: this ramp says "more", the slots above say
 * "different", and using either for the other's job is how a chart starts lying.
 */
export const SEQUENTIAL: readonly string[] = [
  'var(--seq-1)', 'var(--seq-2)', 'var(--seq-3)', 'var(--seq-4)', 'var(--seq-5)'
];

export const seriesColor = (index: number): string => SERIES[index] ?? OTHER_COLOR;

/** Darkest step for the largest value, so rank reads without a legend. */
export function sequentialColor(rank: number, total: number): string {
  if (total <= 1) return SEQUENTIAL[SEQUENTIAL.length - 1]!;
  const step = Math.round((1 - rank / (total - 1)) * (SEQUENTIAL.length - 1));
  return SEQUENTIAL[Math.max(0, Math.min(SEQUENTIAL.length - 1, step))]!;
}

export interface Slice {
  label: string;
  value: number;
  color: string;
}

/** One named measure on a chart that carries several. */
export interface ChartSeries {
  key: string;
  label: string;
  /** Defaults to the slot matching its position in the list. */
  color?: string | undefined;
}

/**
 * Ranks rows by value and gives the top `max` a slot each. The tail is summed
 * into a single grey "Other" slice rather than being dropped, so the parts still
 * add up to the total printed in the middle of a donut.
 */
export function toSlices<T>(
  rows: readonly T[],
  label: (row: T) => string,
  value: (row: T) => number,
  max = 8
): Slice[] {
  const ranked = rows
    .map((row) => ({ label: label(row), value: value(row) }))
    .filter((s) => s.value > 0)
    .sort((a, b) => b.value - a.value);

  const head = ranked.slice(0, max).map((s, i) => ({ ...s, color: seriesColor(i) }));
  const tail = ranked.slice(max);
  if (tail.length > 0) {
    head.push({
      label: `Other (${tail.length})`,
      value: tail.reduce((sum, s) => sum + s.value, 0),
      color: OTHER_COLOR
    });
  }
  return head;
}

/**
 * Rounds an axis maximum up to a 1/2/5 × 10ⁿ step so the gridlines land on
 * numbers a human would have chosen — 4,000 rather than 3,847.
 */
export function niceMax(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 1;
  const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
  const scaled = value / magnitude;
  const step = scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10;
  return step * magnitude;
}

/**
 * A bar whose top two corners are rounded and whose base stays square against
 * the axis. A plain rx on a <rect> rounds all four, which lifts the bar off its
 * own baseline and makes short bars read as floating pills.
 */
export function roundedTop(x: number, y: number, w: number, h: number, r = 4): string {
  const radius = Math.max(0, Math.min(r, w / 2, h));
  return [
    `M${x},${y + h}`,
    `V${y + radius}`,
    `Q${x},${y} ${x + radius},${y}`,
    `H${x + w - radius}`,
    `Q${x + w},${y} ${x + w},${y + radius}`,
    `V${y + h}`,
    'Z'
  ].join(' ');
}
