import { formatNumber } from '@/lib/format';
import { ChartEmpty } from './chrome';
import { seriesColor } from './palette';

/**
 * Which line produced which defect, as a grid rather than a stack.
 *
 * This replaced a stacked bar chart, and the reason is perceptual rather than
 * decorative. In a stack only the bottom segment sits on a common baseline;
 * every segment above it starts at whatever height the ones below happened to
 * reach. So "is there more Oil Marks on L01 or on L03" — the actual question
 * this panel exists to answer — meant comparing two floating blocks at different
 * offsets, which the eye cannot do. The small categories were worse: four pieces
 * of Stain drew a three-pixel sliver with no number anywhere on the chart.
 *
 * Laid out as a grid, every cell starts at the same edge, so a row is read
 * straight across, and each figure is printed beside its bar. Nothing has to be
 * estimated against an axis, and a category with four pieces reads "4" instead
 * of disappearing.
 *
 * The bars all share one scale — the largest cell in the grid — so a bar means
 * the same thing everywhere. Scaling each row to its own maximum would make a
 * row whose worst cell is 4 look as alarming as one whose worst cell is 64.
 *
 * Colour carries identity, not magnitude: one hue per defect, constant across
 * its row, matching the slice colours in the panel beside this one. Length does
 * all the comparing.
 */

export interface DefectMatrixLine {
  lineNo: number | null;
  label: string;
  byCategory: Record<string, number>;
}

export interface DefectMatrixCategory {
  category: string;
  qty: number;
}

export interface DefectMatrixProps {
  lines: DefectMatrixLine[];
  /** In the order they are coloured elsewhere — biggest first. */
  categories: DefectMatrixCategory[];
  /** What to say when the report carried no per-line breakdown. */
  empty: string;
  /** Names the window the figures cover, for the headline sentence. */
  periodLabel?: string | undefined;
}

/** "Line 01" is four characters of nothing in a column header. */
const shortLine = (label: string): string => label.replace(/^line\s*/i, 'L');

export function DefectMatrix({ lines, categories, empty, periodLabel }: DefectMatrixProps) {
  const cellsPresent = lines.some((l) => Object.values(l.byCategory).some((v) => v > 0));
  if (categories.length === 0 || lines.length === 0 || !cellsPresent) {
    return <ChartEmpty>{empty}</ChartEmpty>;
  }

  const qty = (line: DefectMatrixLine, category: string): number => line.byCategory[category] ?? 0;

  const rows = categories.map((c, i) => ({
    category: c.category,
    color: seriesColor(i),
    cells: lines.map((line) => qty(line, c.category)),
    total: lines.reduce((sum, line) => sum + qty(line, c.category), 0)
  }));

  const columnTotals = lines.map((line) =>
    categories.reduce((sum, c) => sum + qty(line, c.category), 0));
  const grandTotal = columnTotals.reduce((a, b) => a + b, 0);

  // One scale for every bar in the grid, so a bar means the same thing wherever
  // it is drawn. Guarded against a grid of zeroes, which would divide by nothing.
  const scale = Math.max(1, ...rows.flatMap((r) => r.cells));

  // The single worst cell — the one thing a supervisor would act on, and the
  // reason for reading the panel at all. It is called out in words above the
  // grid and ringed inside it, because "which is the biggest" should not itself
  // be a task the reader has to perform.
  let peak = { row: -1, col: -1, value: 0 };
  rows.forEach((r, ri) => r.cells.forEach((v, ci) => {
    if (v > peak.value) peak = { row: ri, col: ci, value: v };
  }));
  const peakRow = rows[peak.row];
  const peakLine = lines[peak.col];
  const peakShare = grandTotal > 0 ? Math.round((peak.value / grandTotal) * 100) : 0;

  return (
    <>
      {peakRow && peakLine && (
        <p className="dmx__lead">
          <span className="dmx__chip" style={{ background: peakRow.color }} aria-hidden />
          <strong>{peakRow.category}</strong> on <strong>{peakLine.label}</strong> is the single
          biggest source — {formatNumber(peak.value)} pieces, {peakShare}% of everything counted
          {periodLabel ? ' in ' + periodLabel : ''}.
        </p>
      )}

      <div className="table-scroll">
        <table className="dmx" style={{ minWidth: 180 + lines.length * 108 }}>
          <thead>
            <tr>
              <th scope="col" className="dmx__corner">Defect</th>
              {lines.map((line) => (
                <th key={line.label} scope="col" className="dmx__colhead">{shortLine(line.label)}</th>
              ))}
              <th scope="col" className="dmx__colhead dmx__total">Total</th>
            </tr>
          </thead>

          <tbody>
            {rows.map((row, ri) => (
              <tr key={row.category}>
                <th scope="row" className="dmx__rowhead">
                  <span className="dmx__rowlabel">
                    <span className="dmx__chip" style={{ background: row.color }} aria-hidden />
                    <span className="dmx__name" title={row.category}>{row.category}</span>
                  </span>
                </th>

                {row.cells.map((value, ci) => (
                  <td key={lines[ci]!.label} className="dmx__cell">
                    {/* A zero is written rather than drawn. A bar of no length
                        reads as a rendering fault, and "·" reads as "none". */}
                    {value === 0 ? (
                      <span className="dmx__zero" aria-label="none">·</span>
                    ) : (
                      <span className={'dmx__mark' + (ri === peak.row && ci === peak.col ? ' is-peak' : '')}>
                        <span className="dmx__track" aria-hidden>
                          <span className="dmx__bar" style={{
                            width: Math.max(3, (value / scale) * 100) + '%',
                            background: row.color
                          }} />
                        </span>
                        <span className="dmx__value">{formatNumber(value)}</span>
                      </span>
                    )}
                  </td>
                ))}

                <td className="dmx__cell dmx__total">
                  <span className="dmx__value dmx__value--bold">{formatNumber(row.total)}</span>
                </td>
              </tr>
            ))}
          </tbody>

          <tfoot>
            <tr>
              <th scope="row" className="dmx__rowhead">All defects</th>
              {columnTotals.map((total, i) => (
                <td key={lines[i]!.label} className="dmx__cell">
                  <span className="dmx__value dmx__value--bold">{formatNumber(total)}</span>
                </td>
              ))}
              <td className="dmx__cell dmx__total">
                <span className="dmx__value dmx__value--bold">{formatNumber(grandTotal)}</span>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </>
  );
}
