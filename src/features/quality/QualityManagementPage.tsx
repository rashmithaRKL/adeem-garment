import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/Card';
import { Kpi } from '@/components/Kpi';
import { QueryState } from '@/components/QueryState';
import { Donut, BarChart, DefectMatrix, LineChart, seriesColor } from '@/components/charts';
import { formatDate, formatNumber } from '@/lib/format';
import { QUALITY_TARGET } from '@/lib/env';
import { useAuth } from '@/features/auth/AuthProvider';
import {
  fetchQualityRecords, buildQualityMatrix, buildTrend, datasetGrain, latestDate,
  FLOOR_STAGES, DEFECT_STAGES, openingDate, openingAnchorFor,
  type FinalLineStat, type FinalStatus, type LineQualityRow, type QualityGrain,
  type QualityMatrix, type QualityRecords, type StageStat
} from './queries';
import {
  axisLabel, spanFor, spanLabel, today, RANGE_LABEL, type QualitySpan, type QualityRange
} from './period';
import { QualityPeriodPicker } from './QualityPeriodPicker';
import { TemplateLibrary } from '@/features/excel/TemplateLibrary';
import { STAGE_LABEL, type QualityStage } from './types';

/** "In line, End line and Appearance" — the phrase every caption below needs. */
const stageList = (stages: QualityStage[]): string => {
  const names = stages.map((s) => STAGE_LABEL[s]);
  return names.length < 2
    ? names.join('')
    : names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
};

/**
 * The gates the client asked to see line by line, in floor order. Final is not
 * among them: it is the verdict column at the end of the row instead.
 */
const COLUMNS: QualityStage[] = ['in_line', 'end_line', 'appearance', 'aql'];

/** The chart shows Final as well — a line that records it should be able to see it. */
const CHART_STAGES: QualityStage[] = [...COLUMNS, 'final'];

/**
 * The gates that get a headline tile of their own, in the order the client reads
 * them: the four sewing-floor gates from earliest to latest. AQL is not here —
 * it is a sampled audit rather than a gate every piece passes through, so it
 * keeps its own tile beside the factory-wide figures.
 */
const TILE_STAGES: { stage: QualityStage; icon: string }[] = [
  { stage: 'in_line', icon: '🧵' },
  { stage: 'end_line', icon: '🏁' },
  { stage: 'appearance', icon: '👁️' },
  { stage: 'final', icon: '📦' }
];

const FINAL_LABEL: Record<FinalStatus, string> = {
  passed: 'Passed',
  below: 'Below target',
  not_inspected: 'Not inspected'
};

const FINAL_COLOR: Record<FinalStatus, string> = {
  passed: 'var(--green-500)',
  below: 'var(--red-500)',
  not_inspected: 'var(--text-faint)'
};

const pctText = (n: number | null): string => (n == null ? '—' : n.toFixed(1) + '%');

/**
 * The ring for "Top 5 defects", made to add up to the defects found at the gates
 * it breaks down — the figure the tile above already shows.
 *
 * Two things used to go missing from the middle of it. The list is capped at five,
 * so a sixth category was dropped from a total still labelled plainly "defects";
 * and the categories are typed into their own block on the sheet, so they can
 * account for fewer defects than the gate columns beside them — 89 of 91, in the
 * report that prompted this. Both are shown as their own slice rather than left
 * out, because a ring whose centre disagrees with the tile above it is read as a
 * broken number, and the honest answer to "where are the other two" is a label.
 *
 * A breakdown that runs *ahead* of the gate columns is left to stand on its own:
 * one piece can carry two defects, so categories outnumbering pieces is a real
 * reading of a sheet rather than something to reconcile away.
 */
function defectSlices(matrix: QualityMatrix) {
  const slices = matrix.topDefects.map((d, i) => ({
    label: d.category, value: d.qty, color: seriesColor(i)
  }));
  const shown = matrix.topDefects.reduce((sum, d) => sum + d.qty, 0);
  const tail = matrix.defectsCategorised - shown;
  if (tail > 0) {
    slices.push({ label: 'Other categories', value: tail, color: seriesColor(slices.length) });
  }
  const unCategorised = matrix.defectsAtBreakdownGates - matrix.defectsCategorised;
  if (unCategorised > 0) {
    slices.push({ label: 'Not broken down', value: unCategorised, color: 'var(--text-faint)' });
  }
  return slices;
}

/**
 * The final-inspection ring, made to add up to every defect it was given: the top
 * five, and the rest as one slice — the same rule as the floor ring above, so its
 * centre reads the same total as the "major defects" figure beside it.
 */
function finalDefectSlices(summary: QualityMatrix['finalInspection']) {
  const slices = summary.topDefects.map((d, i) => ({
    label: d.category, value: d.qty, color: seriesColor(i)
  }));
  const tail = summary.defectsCategorised - summary.topDefects.reduce((sum, d) => sum + d.qty, 0);
  if (tail > 0) {
    slices.push({ label: 'Other categories', value: tail, color: seriesColor(slices.length) });
  }
  return slices;
}

/**
 * An empty window is almost never an empty database, so the message says which of
 * the two it is and where the figures actually are. "No data" on a screen holding
 * a year of reports is the kind of message that gets a working import declared
 * broken.
 */
function emptyBody(matrix: QualityMatrix, latest: string | null): string {
  if (latest == null) {
    return 'Import a KPI report, a daily quality performance report or a monthly summary '
      + 'from the Upload Excel screen. Every figure on this page is read from those workbooks.';
  }
  if (matrix.span.range !== 'month' && !matrix.hasDailyReports && matrix.hasMonthlySummaries) {
    return 'The reports imported here are monthly summaries, and a summary covers a whole '
      + 'month — switch to Monthly to read it. Charging a month of production against a '
      + 'single day would be a different figure entirely.';
  }
  return 'Nothing was inspected in this window. The newest report reaches '
    + formatDate(latest) + ' — press Latest to jump to it, or step back with the arrows.';
}

const NO_RECORDS: QualityRecords = { inspections: [], defects: [], lines: [], finals: [], verdicts: [] };

/**
 * Quality, line by line, over the window the client reads it in: today, the
 * calendar week, or the month. Daily and monthly rows are never mixed — a monthly
 * summary already contains its own days, and adding them together counts every
 * piece twice.
 */
export function QualityManagementPage() {
  // null means "follow the reports": the range opens on the grain the factory
  // actually files, and the window on today — or on the closest day that carries
  // figures, so a Monday before the weekend's sheets are keyed in shows Friday
  // rather than a wall of dashes. Both pin the moment the user touches the control.
  const [range, setRange] = useState<QualityRange | null>(null);
  const [anchor, setAnchor] = useState<string | null>(null);
  const { profile } = useAuth();

  const records = useQuery({ queryKey: ['quality', 'records'], queryFn: fetchQualityRecords });
  const data = records.data ?? NO_RECORDS;

  const latest = latestDate(data);
  const span = spanFor(
    range ?? (datasetGrain(data) === 'daily' ? 'day' : 'month'),
    anchor ?? openingDate(data) ?? today()
  );
  const matrix = buildQualityMatrix(data, span, QUALITY_TARGET);

  /**
   * The manager's tile, and only the manager's. Rejection is the same figures as
   * the pass rate read the other way up, and the client wants that framing to sit
   * with the person who answers for the floor — not with the administrator, who
   * outranks them everywhere else but does not run the lines.
   */
  const showRejection = profile?.role === 'manager';

  // matrix.stages is ordered by volume for the charts; the tiles want it by name.
  const byStage = new Map(matrix.stages.map((s) => [s.stage, s]));

  /** Short enough for a tile's sub-line, and written the way the client says it. */
  const floorNote = FLOOR_STAGES.map((s) => STAGE_LABEL[s]).join(' + ');

  const stageSeries = CHART_STAGES.map((stage, i) => ({
    key: stage, label: STAGE_LABEL[stage], color: seriesColor(i)
  }));

  return (
    <>
      <QualityPeriodPicker
        span={span}
        latest={latest}
        onRange={(r) => { setRange(r); setAnchor(openingAnchorFor(r, data)); }}
        onAnchor={setAnchor}
        note={<>
          Pass{showRejection && ', rejection'} and final inspection are judged against
          the {QUALITY_TARGET}% threshold.
        </>}
      />

      {/* The five quality workbooks, where the people who keep them are. Folded
          away by default: this is a reading screen, and the templates are what
          someone needs on the day they are asked to start filing a new report. */}
      <TemplateLibrary
        modules={['Quality management']}
        title="Quality Excel templates"
        collapsible
        intro={'The five quality reports this screen is built from, each with its own workbook. '
          + 'Download one, fill in the shaded table, and upload it on the Upload Excel screen — '
          + 'the report is recognised from its own layout, so nothing has to be labelled.'}
      />

      <QueryState
        isLoading={records.isLoading}
        error={records.error}
        isEmpty={!matrix.hasData}
        emptyTitle={latest == null
          ? 'No quality reports yet'
          : 'Nothing inspected in ' + spanLabel(span)}
        emptyBody={emptyBody(matrix, latest)}
      >
        <div className="grid grid--kpi">
          {/* Checked, defects, pass and rejection are all one figure read four
              ways, and all four are the three floor gates added together. The
              sub-lines say so on the tiles themselves rather than in a footnote
              nobody reaches. */}
          <Kpi index={0} label="Pieces checked" icon="🔎" tone="blue"
            value={formatNumber(matrix.checked)}
            sub={floorNote} />
          <Kpi index={1} label="Pass rate" icon="✅"
            tone={(matrix.passPct ?? 0) >= QUALITY_TARGET ? 'green' : 'red'}
            value={pctText(matrix.passPct)}
            sub={'target ' + QUALITY_TARGET + '% · ' + floorNote} />
          <Kpi index={2} label="Defects found" icon="🧷" tone="orange"
            value={formatNumber(matrix.defects)}
            sub={floorNote} />
          <Kpi index={3} label="AQL audit" icon="📐" tone="purple"
            value={pctText(matrix.aqlPassPct)}
            sub={matrix.aqlPassPct == null
              ? 'no AQL rows in this report'
              : 'sampled pass rate, counted separately'} />
          {TILE_STAGES.map(({ stage, icon }, i) => (
            <StageKpi key={stage} stage={stage} icon={icon} index={4 + i}
              stat={byStage.get(stage)} />
          ))}
          {showRejection && (
            <Kpi index={8} label="Rejection" icon="🚫" tone="orange"
              value={pctText(matrix.rejectionPct)}
              sub={formatNumber(matrix.defects) + ' defects · ' + floorNote} />
          )}
        </div>

        <p style={{ margin: '12px 0 0', fontSize: 11.5, color: 'var(--text-faint)', lineHeight: 1.6 }}>
          Pieces checked and defects are {stageList(FLOOR_STAGES)} added together, for{' '}
          {spanLabel(span)}.
          Final inspection and the AQL audit sample goods already counted at those gates, so they
          keep their own tiles and are never added in — counting them twice would drag the pass
          rate towards whatever the sample said.
        </p>

        <Card title="Pass rate by line and stage" style={{ marginTop: 16 }}
          aside={<span style={{ fontSize: 12, color: 'var(--text-faint)' }}>
            {CHART_STAGES.map((s) => STAGE_LABEL[s]).join(' · ')}
          </span>}>
          <BarChart
            height={250}
            format={(n) => n.toFixed(1) + '%'}
            data={matrix.lines.map((line) => ({
              label: line.label.replace(/^line\s*/i, 'L'),
              values: CHART_STAGES.reduce<Record<string, number>>((acc, stage) => {
                const cell = line.stages[stage];
                if (cell?.passPct != null) acc[stage] = cell.passPct;
                return acc;
              }, {})
            }))}
            series={stageSeries}
            empty="No stage figures in this period."
          />
          <p style={{ margin: '12px 0 0', fontSize: 11.5, color: 'var(--text-faint)', lineHeight: 1.6 }}>
            Every line the factory runs is shown. A missing bar means that line was not
            inspected at that stage in this period — it is not a zero pass rate — and a line
            with no bars at all was not inspected in this period.
          </p>
        </Card>

        <div className="grid grid--split" style={{ marginTop: 16 }}>
          {/* A grid, not a stack. In a stack only the bottom segment sits on a
              common baseline, so comparing one defect across four lines — the
              question this panel exists to answer — meant judging floating
              blocks at different heights, and a four-piece category drew a
              sliver with no number on it anywhere. */}
          <Card title="Where the top defects came from"
            aside={<span style={{ fontSize: 12, color: 'var(--text-faint)' }}>
              pieces per line · {spanLabel(span)}
            </span>}>
            <DefectMatrix
              lines={matrix.defectsByLine}
              categories={matrix.topDefects}
              periodLabel={spanLabel(span)}
              empty="This report carried no per-line defect breakdown. The overall split is beside this panel."
            />
          </Card>

          <Card title="Top 5 defects"
            aside={<span style={{ fontSize: 12, color: 'var(--text-faint)' }}>
              {matrix.defectsGated ? stageList(DEFECT_STAGES) : 'every gate the report names'}
            </span>}>
            <Donut
              size={158}
              centerLabel="defects"
              slices={defectSlices(matrix)}
              empty={'No defect categories were recorded in ' + spanLabel(span) + '.'}
            />
            <p style={{ margin: '12px 0 0', fontSize: 11.5, color: 'var(--text-faint)', lineHeight: 1.6 }}>
              {matrix.defectsGated
                ? `Counted at ${stageList(DEFECT_STAGES).toLowerCase()} — the two gates that judge `
                  + 'finished work. In line is a running check on pieces still being sewn, so its '
                  + 'counts are rework rather than defects leaving the line, and are left out here.'
                : 'The reports imported for this period do not say which gate each category was '
                  + 'counted at, so every category they carry is shown.'}
              {' '}The ring adds up to the {formatNumber(matrix.defectsAtBreakdownGates)} defects
              found at {stageList(matrix.defectsGated ? DEFECT_STAGES : FLOOR_STAGES).toLowerCase()},
              so it reads against the tile above rather than against a total of its own.
              {' '}Counted over {spanLabel(span)}.
            </p>
          </Card>
        </div>

        <Card title={matrix.grain === 'daily' ? 'Pass rate day by day' : 'Pass rate month by month'}
          style={{ marginTop: 16 }}
          aside={<span style={{ fontSize: 12, color: 'var(--text-faint)' }}>
            the whole history, not just the selected window
          </span>}>
          {/* Deliberately built from the full history rather than the selected
              window: a trend of one point is not a trend, and the point of the
              panel is the shape either side of wherever the window sits. */}
          <TrendPanel grain={matrix.grain} data={data} />
        </Card>

        <FinalInspectionCard summary={matrix.finalInspection} />

        <Card title="Line by line" style={{ marginTop: 16 }}
          aside={<span style={{ fontSize: 12, color: 'var(--text-faint)' }}>
            {spanLabel(span)}
          </span>}>
          <div className="table-scroll">
            <table className="table" style={{ minWidth: 860 }}>
              <thead>
                <tr>
                  <th>Line</th>
                  {COLUMNS.map((stage) => <th key={stage} className="num">{STAGE_LABEL[stage]}</th>)}
                  <th className="num">Checked</th>
                  <th className="num">Defects</th>
                  {/* The same rule as the tile: leaving the column here while
                      hiding the tile would hide nothing at all. */}
                  {showRejection && <th className="num">Rejection</th>}
                  <th>Final inspection</th>
                </tr>
              </thead>
              <tbody>
                {matrix.lines.map((line) => (
                  <LineRow key={line.key} line={line} showRejection={showRejection} />
                ))}
              </tbody>
            </table>
          </div>
          <p style={{ margin: '14px 0 0', fontSize: 11.5, color: 'var(--text-faint)', lineHeight: 1.6 }}>
            Checked and Defects are the {stageList(FLOOR_STAGES).toLowerCase()} columns beside them
            added together; the AQL column is a sampled audit and is not part of that sum.{' '}
            {showRejection && 'Rejection is defects found for every hundred pieces checked. '}
            Final inspection is
            the pass rate of the final gate on its own
            {matrix.finalInspection.basis === 'styles'
              && ' — the share of styles that passed, from the final inspection report'}
            , so a line can clear every earlier stage
            and still read below target here. A line reads “Not inspected” when the reports
            imported for this period record no final gate for it — the pre-shipment audit above
            is filed for the factory as a whole and is not attributed to a line.
          </p>
        </Card>
      </QueryState>
    </>
  );
}

/**
 * One gate's pass rate as a headline tile. Coloured against the threshold rather
 * than decoratively: the reason for putting every gate on the same row is to see
 * at a glance which one is under target, and a palette chosen for variety would
 * throw that away. A gate with nothing recorded reads "—" and stays neutral —
 * an uninspected gate is not a failing one.
 */
function StageKpi({ stat, stage, icon, index }: {
  stat: StageStat | undefined;
  stage: QualityStage;
  icon: string;
  index: number;
}) {
  const passPct = stat?.passPct ?? null;
  return (
    <Kpi
      index={index}
      label={STAGE_LABEL[stage]}
      icon={icon}
      tone={passPct == null ? 'blue' : passPct >= QUALITY_TARGET ? 'green' : 'red'}
      value={pctText(passPct)}
      sub={!stat
        ? 'not inspected in this period'
        : stat.unit === 'styles'
          ? `${formatNumber(stat.checked - stat.defects)} of ${formatNumber(stat.checked)} styles passed`
          : `${formatNumber(stat.checked)} checked · ${formatNumber(stat.defects)} defects`}
    />
  );
}

const monthLabel = (month: string): string =>
  new Date(month).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

/** One figure in a strip: the number, what it measures, and its qualifier. */
function Figure({ label, value, sub, color }: {
  label: string; value: string; sub: string; color?: string;
}) {
  return (
    <div>
      <div style={{ font: '600 26px/1 var(--font-heading)', color: color ?? 'var(--text)' }}>{value}</div>
      <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 7 }}>{label}</div>
      <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 3 }}>{sub}</div>
    </div>
  );
}

/** "17 – 23 Aug 2026, daily" — the window and the grain in one phrase. */
const windowLabel = (span: QualitySpan): string =>
  `${spanLabel(span)} · ${RANGE_LABEL[span.range].toLowerCase()}`;

/** The months a monthly breakdown was read from, written out. */
const monthList = (months: string[]): string =>
  months.length < 2
    ? months.map(monthLabel).join('')
    : months.slice(0, -1).map(monthLabel).join(', ') + ' and ' + monthLabel(months[months.length - 1]!);

/**
 * Final inspection — the gate the buyer sees, read the way the client reads every
 * other gate: over the selected day, week or month, line by line, with pass and
 * fail counted both ways and a total underneath.
 *
 * The per-line figures come from the final inspection report's month tabs where
 * they cover the window, and count styles judged PASS or FAIL; otherwise from the
 * FINAL block on the KPI and daily sheets, in pieces. Every label below says which,
 * because "2,074 pass" and "27 pass" are different kinds of number. The
 * pre-shipment audit at the foot of the card is the report's Summary, factory-wide
 * and monthly, and is never added into the totals row.
 */
function FinalInspectionCard({ summary }: { summary: QualityMatrix['finalInspection'] }) {
  const span = summary.span;
  const inspected = summary.lines.filter((l) => l.inspections > 0);
  const failing = inspected.filter((l) => (l.passPct ?? 100) < QUALITY_TARGET).length;
  const styles = summary.basis === 'styles';
  const of = (rate: number | null) => (summary.inspections === 0
    ? 'nothing inspected in this window'
    : pctText(rate) + (styles ? ' of styles inspected' : ' of pieces inspected'));

  return (
    <Card title="Final inspection" style={{ marginTop: 16 }}
      aside={<span style={{ fontSize: 12, color: 'var(--text-faint)' }}>
        {windowLabel(span)}
      </span>}>
      {!summary.hasData ? (
        <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.7 }}>
          No final inspection was recorded in {spanLabel(span)}. The figures come from the
          final inspection report — its month tabs and its Summary sheet — and from the
          FINAL block on the KPI and daily quality reports. Step back with the arrows, or
          press Latest, to reach a period that carries them.
        </p>
      ) : (
        <>
          {/* The total summary, up front: how many inspections, over how many
              pieces, and the pass/fail split both as a count and as a rate. A
              flat strip rather than KPI tiles — those render as cards of their
              own, and a card inside a card reads as a nesting that means nothing. */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '18px 40px' }}>
            <Figure
              label={styles ? 'Styles inspected' : 'Inspections'}
              value={formatNumber(summary.inspections)}
              sub={summary.lineWise
                ? `${inspected.length} of ${summary.lines.length} lines · ${styles ? 'one verdict per style' : summary.grain === 'daily' ? 'day by day' : 'month by month'}`
                : 'factory-wide audit only'} />
            <Figure
              label={styles ? 'Pieces sampled' : 'Pieces inspected'}
              value={formatNumber(summary.checked)}
              sub={summary.inspections === 0
                ? 'nothing inspected in this window'
                : styles
                  ? formatNumber(summary.defects) + ' major defects found'
                  : Math.round(summary.checked / summary.inspections) + ' per inspection'} />
            <Figure
              label={styles ? 'Passed' : 'Pass'}
              value={formatNumber(summary.pass)}
              sub={of(summary.passPct)}
              color="var(--green-500)" />
            <Figure
              label={styles ? 'Failed' : 'Fail'}
              value={formatNumber(summary.fail)}
              sub={of(summary.failPct)}
              color="var(--red-500)" />
          </div>

          {summary.lineWise ? (
            <div className="table-scroll" style={{ marginTop: 16 }}>
              <table className="table" style={{ minWidth: 780 }}>
                <thead>
                  <tr>
                    <th>Line</th>
                    <th className="num">{styles ? 'Styles' : 'Inspections'}</th>
                    <th className="num">{styles ? 'Sampled' : 'Checked'}</th>
                    <th className="num">{styles ? 'Passed' : 'Pass'}</th>
                    <th className="num">{styles ? 'Failed' : 'Fail'}</th>
                    <th className="num">Pass %</th>
                    <th className="num">Fail %</th>
                    <th>Result</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.lines.map((line) => <FinalLineRow key={line.key} line={line} />)}
                </tbody>
                {/* The totals are the column sums, except the two rates: those are
                    the factory's own pass and fail over the factory's own pieces,
                    which is not the average of the rates above them. A line that
                    inspected 20 pieces and one that inspected 2,000 do not carry
                    equal weight in the figure the client quotes. */}
                <tfoot>
                  <tr>
                    <td>Total</td>
                    <td className="num">{formatNumber(summary.inspections)}</td>
                    <td className="num">{formatNumber(summary.checked)}</td>
                    <td className="num">{formatNumber(summary.pass)}</td>
                    <td className="num">{formatNumber(summary.fail)}</td>
                    <td className="num" style={{
                      color: (summary.passPct ?? 0) >= QUALITY_TARGET
                        ? 'var(--text)' : 'var(--red-500)'
                    }}>
                      {pctText(summary.passPct)}
                    </td>
                    <td className="num">{pctText(summary.failPct)}</td>
                    <td style={{ fontWeight: 400, fontSize: 12, color: 'var(--text-faint)' }}>
                      {inspected.length === 0
                        ? 'no line inspected'
                        : failing === 0
                          ? 'every line at or above target'
                          : failing + (failing === 1 ? ' line' : ' lines') + ' below target'}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : (
            <p style={{ margin: '16px 0 0', fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.7 }}>
              The reports covering {spanLabel(span)} record the final inspection for the factory
              as a whole rather than line by line, so there is nothing to attribute — the
              pre-shipment audit below is the whole of it. Per-line pass and fail counts come
              from the month tabs of the final inspection report (Line # and Pass/Fail on each
              style), or from the FINAL block on the KPI reports.
            </p>
          )}

          <p style={{ margin: '14px 0 0', fontSize: 11.5, color: 'var(--text-faint)', lineHeight: 1.6 }}>
            {styles ? (
              <>
                Read from the month tabs of the final inspection report, over {spanLabel(span)}:
                each row there is one style, sampled and judged PASS or FAIL against AQL 2.5.
                Passed and Failed count those styles, and Pass % is styles passed over styles
                inspected — the way the report's own first-time pass rate counts them. A style
                inspected for two lines together counts toward both lines, and once in the
                total.{' '}
              </>
            ) : (
              <>
                Pass and fail count pieces at the final gate, over {spanLabel(span)}, from the
                FINAL block on the KPI reports. Pass % and Fail % are each line's own counts
                over its own pieces, so the pair reads to 100% on every row.{' '}
              </>
            )}
            A line reads “Not inspected” when the reports imported for this
            period record no final gate for it — that is not a zero pass rate. These figures
            are deliberately absent from the pieces-checked and pass-rate tiles at the top of
            the page: final inspection judges goods already counted at In line, End line and
            Appearance, and adding it in would count the same garments twice.
          </p>

          <div className="grid grid--split" style={{ marginTop: 16 }}>
            <Card title="Final inspection top 5 defects"
              aside={<span style={{ fontSize: 12, color: 'var(--text-faint)' }}>
                {summary.defectMonths.length > 0 ? 'filed monthly' : windowLabel(span)}
              </span>}>
              <Donut
                size={158}
                centerLabel="defects"
                slices={finalDefectSlices(summary)}
                empty={'No final inspection defects were recorded in ' + spanLabel(span) + '.'}
              />
              {summary.topDefects.length > 0 && (
                <p style={{ margin: '12px 0 0', fontSize: 11.5, color: 'var(--text-faint)', lineHeight: 1.6 }}>
                  {/* The breakdown is filed one column per category per month, so a
                      day or a week has to borrow its month — and say which one it
                      borrowed, rather than let a month of findings sit silently
                      under a Tuesday's heading. */}
                  {summary.defectsWiderThanSpan
                    ? `The final inspection defect breakdown is only filed monthly, so this covers ${monthList(summary.defectMonths)} in full — not just ${spanLabel(span)}.`
                    : 'Counted at the final gate only. The sewing-floor breakdown higher up the '
                      + 'page counts End line and Appearance, and the two are kept apart — a '
                      + 'defect caught before shipping is a different fact from one caught on '
                      + 'the line.'}
                </p>
              )}
            </Card>

            <FinalAuditCard audit={summary.audit} span={span} />
          </div>
        </>
      )}
    </Card>
  );
}

function FinalLineRow({ line }: { line: FinalLineStat }) {
  const faint = { color: 'var(--text-faint)' };
  if (line.inspections === 0) {
    return (
      <tr>
        <td style={{ font: '600 13.5px var(--font-heading)', letterSpacing: '.06em' }}>{line.label}</td>
        <td className="num" style={faint}>—</td>
        <td className="num" style={faint}>—</td>
        <td className="num" style={faint}>—</td>
        <td className="num" style={faint}>—</td>
        <td className="num" style={faint}>—</td>
        <td className="num" style={faint}>—</td>
        <td>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12.5 }}>
            <span aria-hidden style={{
              width: 9, height: 9, borderRadius: '50%', background: FINAL_COLOR.not_inspected
            }} />
            {FINAL_LABEL.not_inspected}
          </span>
        </td>
      </tr>
    );
  }

  const passing = (line.passPct ?? 0) >= QUALITY_TARGET;
  return (
    <tr>
      <td style={{ font: '600 13.5px var(--font-heading)', letterSpacing: '.06em' }}>{line.label}</td>
      <td className="num">{formatNumber(line.inspections)}</td>
      <td className="num">{formatNumber(line.checked)}</td>
      <td className="num" style={{ color: 'var(--green-500)' }}>{formatNumber(line.pass)}</td>
      <td className="num" style={{ color: line.fail > 0 ? 'var(--red-500)' : 'var(--text-faint)' }}>
        {formatNumber(line.fail)}
      </td>
      <td className="num" style={{ fontWeight: 600, color: passing ? 'var(--text)' : 'var(--red-500)' }}>
        {pctText(line.passPct)}
      </td>
      <td className="num" style={{ color: 'var(--text-muted)' }}>{pctText(line.failPct)}</td>
      <td>
        {/* Colour plus a word: the status never rides on the swatch alone. */}
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12.5 }}>
          <span aria-hidden style={{
            width: 9, height: 9, borderRadius: '50%', background: FINAL_COLOR[line.status]
          }} />
          {FINAL_LABEL[line.status]}
        </span>
      </td>
    </tr>
  );
}

/**
 * The pre-shipment audit, kept in a panel of its own.
 *
 * Its "1st time pass rate" counts styles that cleared the audit at the first
 * attempt, while the sample and defect columns beside it count pieces. That is
 * how the report measures it, and the two are shown side by side rather than
 * reconciled — a styles rate averaged into a pieces rate is a number with no
 * meaning at all, which is the reason this is not part of the totals above.
 */
function FinalAuditCard({ audit, span }: {
  audit: QualityMatrix['finalInspection']['audit'];
  span: QualitySpan;
}) {
  return (
    <Card title="Pre-shipment audit"
      aside={<span style={{ fontSize: 12, color: 'var(--text-faint)' }}>
        factory-wide, monthly
      </span>}>
      {!audit.hasData ? (
        <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.7 }}>
          No pre-shipment audit covers {spanLabel(span)}. It is read from the monthly
          inspection report — the workbook with the Summary sheet listing qty shipped,
          sample inspected, defects and the first-time pass rate.
        </p>
      ) : (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '18px 32px' }}>
            <Figure
              label="First-time pass rate"
              value={pctText(audit.latest?.passPct ?? null)}
              sub={audit.latest ? monthLabel(audit.latest.month) : 'no month with figures'}
              color={audit.latest?.passPct != null && audit.latest.passPct < QUALITY_TARGET
                ? 'var(--red-500)'
                : 'var(--green-500)'} />
            <Figure
              label="Sample inspected"
              value={formatNumber(audit.checked)}
              sub={audit.months.length + (audit.months.length === 1 ? ' month' : ' months')} />
            <Figure
              label="Audit defects"
              value={formatNumber(audit.defects)}
              sub={audit.defectPct == null
                ? 'nothing sampled yet'
                : pctText(audit.defectPct) + ' of the sample'} />
          </div>

          <div className="table-scroll" style={{ marginTop: 14 }}>
            <table className="table" style={{ minWidth: 420 }}>
              <thead>
                <tr>
                  <th>Month</th>
                  <th className="num">Sample</th>
                  <th className="num">Defects</th>
                  <th className="num">Defect %</th>
                  <th className="num">First-time pass</th>
                </tr>
              </thead>
              <tbody>
                {audit.months.map((m) => (
                  <tr key={m.month}>
                    <td>{monthLabel(m.month)}</td>
                    <td className="num">{formatNumber(m.checked)}</td>
                    <td className="num">{formatNumber(m.defects)}</td>
                    <td className="num" style={{ color: 'var(--text-muted)' }}>
                      {pctText(m.defectPct)}
                    </td>
                    <td className="num" style={{
                      fontWeight: 600,
                      color: m.passPct == null
                        ? 'var(--text-faint)'
                        : m.passPct >= QUALITY_TARGET ? 'var(--text)' : 'var(--red-500)'
                    }}>
                      {pctText(m.passPct)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p style={{ margin: '14px 0 0', fontSize: 11.5, color: 'var(--text-faint)', lineHeight: 1.6 }}>
            The first-time pass rate counts styles that cleared the audit at the first
            attempt; sample and defects count pieces. The report measures them that way, so
            they are shown that way rather than reconciled — and neither is added into the
            per-line totals above. Defect % is the report's own column where the sheet
            fills it in, and defects over sample where it leaves it blank.
          </p>
        </>
      )}
    </Card>
  );
}

function LineRow({ line, showRejection }: { line: LineQualityRow; showRejection: boolean }) {
  const cell = (stage: QualityStage) => {
    const value = line.stages[stage];
    if (!value || value.passPct == null) {
      return <td key={stage} className="num" style={{ color: 'var(--text-faint)' }}>—</td>;
    }
    return (
      <td key={stage} className="num" title={`${formatNumber(value.checked)} checked · ${formatNumber(value.defects)} defects`}
        style={{
          fontWeight: 600,
          color: value.passPct >= QUALITY_TARGET ? 'var(--text)' : 'var(--red-500)'
        }}>
        {pctText(value.passPct)}
      </td>
    );
  };

  return (
    <tr>
      <td style={{ font: '600 13.5px var(--font-heading)', letterSpacing: '.06em' }}>{line.label}</td>
      {COLUMNS.map(cell)}
      <td className="num">{formatNumber(line.checked)}</td>
      <td className="num">{formatNumber(line.defects)}</td>
      {showRejection && (
        <td className="num" style={{
          fontWeight: 600,
          color: (line.rejectionPct ?? 0) > 100 - QUALITY_TARGET ? 'var(--red-500)' : 'var(--text)'
        }}>
          {pctText(line.rejectionPct)}
        </td>
      )}
      <td>
        {/* Colour plus a word: the status never rides on the swatch alone. */}
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12.5 }}>
          <span aria-hidden style={{
            width: 9, height: 9, borderRadius: '50%', background: FINAL_COLOR[line.finalStatus]
          }} />
          {FINAL_LABEL[line.finalStatus]}
          {line.finalPassPct != null && (
            <span style={{ color: 'var(--text-faint)' }}>{pctText(line.finalPassPct)}</span>
          )}
        </span>
      </td>
    </tr>
  );
}

/** The trend ignores the window filter on purpose, so it is built separately. */
function TrendPanel({ grain, data }: {
  grain: QualityGrain;
  data: QualityRecords;
}) {
  const points = buildTrend(data, grain);
  return (
    <LineChart
      domain="percent"
      area
      height={220}
      threshold={{ value: QUALITY_TARGET, label: QUALITY_TARGET + '% target' }}
      format={(n) => n.toFixed(1) + '%'}
      points={points.map((p) => ({
        label: axisLabel(p.date, grain === 'daily' ? 'day' : 'month'),
        values: { pass: p.passPct }
      }))}
      series={[{ key: 'pass', label: 'Pass rate', color: 'var(--chart-1)' }]}
      empty={`Two or more ${grain === 'daily' ? 'days' : 'months'} are needed before a trend means anything.`}
    />
  );
}
