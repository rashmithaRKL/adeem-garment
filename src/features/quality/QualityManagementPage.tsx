import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/Card';
import { Kpi } from '@/components/Kpi';
import { QueryState } from '@/components/QueryState';
import { Donut, BarChart, LineChart, seriesColor } from '@/components/charts';
import { formatDate, formatNumber } from '@/lib/format';
import { EFFICIENCY_THRESHOLD } from '@/lib/env';
import { useAuth } from '@/features/auth/AuthProvider';
import {
  fetchQualityRecords, buildQualityMatrix, buildTrend, datasetGrain, earliestDate, latestDate,
  FLOOR_STAGES, DEFECT_STAGES, openingDate,
  type FinalStatus, type LineQualityRow, type QualityGrain, type QualityMatrix, type QualityRecords,
  type StageStat
} from './queries';
import {
  axisLabel, spanFor, spanLabel, today, type QualityRange
} from './period';
import { QualityPeriodPicker } from './QualityPeriodPicker';
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

const NO_RECORDS: QualityRecords = { inspections: [], defects: [], lines: [], finals: [] };

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
  const earliest = earliestDate(data);
  const span = spanFor(
    range ?? (datasetGrain(data) === 'daily' ? 'day' : 'month'),
    anchor ?? openingDate(data) ?? today()
  );
  const matrix = buildQualityMatrix(data, span, EFFICIENCY_THRESHOLD);

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

  const defectSeries = matrix.topDefects.map((d, i) => ({
    key: d.category, label: d.category, color: seriesColor(i)
  }));

  return (
    <>
      <QualityPeriodPicker
        span={span}
        latest={latest}
        earliest={earliest}
        onRange={setRange}
        onAnchor={setAnchor}
        note={<>
          Pass{showRejection && ', rejection'} and final inspection are judged against
          the {EFFICIENCY_THRESHOLD}% threshold.
        </>}
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
            tone={(matrix.passPct ?? 0) >= EFFICIENCY_THRESHOLD ? 'green' : 'red'}
            value={pctText(matrix.passPct)}
            sub={'target ' + EFFICIENCY_THRESHOLD + '% · ' + floorNote} />
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
          <Card title="Where the top defects came from"
            aside={<span style={{ fontSize: 12, color: 'var(--text-faint)' }}>
              quantity, stacked per line
            </span>}>
            <BarChart
              stacked
              height={240}
              data={matrix.defectsByLine.map((line) => ({
                label: line.label.replace(/^line\s*/i, 'L'),
                values: line.byCategory
              }))}
              series={defectSeries}
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
              slices={matrix.topDefects.map((d, i) => ({
                label: d.category, value: d.qty, color: seriesColor(i)
              }))}
              empty={'No defect categories were recorded in ' + spanLabel(span) + '.'}
            />
            <p style={{ margin: '12px 0 0', fontSize: 11.5, color: 'var(--text-faint)', lineHeight: 1.6 }}>
              {matrix.defectsGated
                ? `Counted at ${stageList(DEFECT_STAGES).toLowerCase()} — the two gates that judge `
                  + 'finished work. In line is a running check on pieces still being sewn, so its '
                  + 'counts are rework rather than defects leaving the line, and are left out here.'
                : 'The reports imported for this period do not say which gate each category was '
                  + 'counted at, so every category they carry is shown.'}
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

        <FinalInspectionCard
          summary={matrix.finalInspection}
          month={span.range === 'month' ? span.anchor : null} />

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
            the pass rate of the final gate on its own, so a line can clear every earlier stage
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
      tone={passPct == null ? 'blue' : passPct >= EFFICIENCY_THRESHOLD ? 'green' : 'red'}
      value={pctText(passPct)}
      sub={stat
        ? `${formatNumber(stat.checked)} checked · ${formatNumber(stat.defects)} defects`
        : 'not inspected in this period'}
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

/**
 * The pre-shipment final inspection — the gate the buyer sees, filed per month
 * for the factory rather than per line. It was being imported and then dropped:
 * every quality query excludes the sheets' Factory roll-up rows, and final
 * inspection is the one stage that is only ever filed that way, so the report
 * had nowhere on the screen to land.
 */
function FinalInspectionCard({ summary, month }: {
  summary: QualityMatrix['finalInspection'];
  /** The month the picker is on, or null for every month at once. */
  month: string | null;
}) {
  return (
    <Card title="Final inspection" style={{ marginTop: 16 }}
      aside={<span style={{ fontSize: 12, color: 'var(--text-faint)' }}>
        pre-shipment audit, factory-wide
      </span>}>
      {!summary.hasData ? (
        <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.7 }}>
          {month
            ? `No final inspection was filed for ${monthLabel(month)}. Pick another month, or `
              + 'switch to all months, to see the ones that were.'
            : 'No final inspection figures have been imported yet. They come from the monthly '
              + 'inspection report — the workbook with the Summary sheet listing qty shipped, '
              + 'sample inspected, defects and the first-time pass rate — uploaded from the '
              + 'Upload Excel screen.'}
        </p>
      ) : (
        <>
          {/* A flat strip rather than KPI tiles: those render as cards of their
              own, and a card inside a card reads as a nesting that means nothing. */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '18px 40px' }}>
            <Figure
              label="First-time pass rate"
              value={pctText(summary.latest?.passPct ?? null)}
              sub={summary.latest ? monthLabel(summary.latest.month) : 'no month with figures'}
              color={summary.latest?.passPct != null && summary.latest.passPct < EFFICIENCY_THRESHOLD
                ? 'var(--red-500)'
                : 'var(--green-500)'} />
            <Figure
              label="Sample inspected"
              value={formatNumber(summary.checked)}
              sub={summary.months.length + (summary.months.length === 1 ? ' month' : ' months')} />
            <Figure
              label="Audit defects"
              value={formatNumber(summary.defects)}
              sub={summary.defectPct == null
                ? 'nothing sampled yet'
                : pctText(summary.defectPct) + ' of the sample'} />
          </div>

          <div className="table-scroll" style={{ marginTop: 14 }}>
            <table className="table" style={{ minWidth: 460 }}>
              <thead>
                <tr>
                  <th>Month</th>
                  <th className="num">Sample inspected</th>
                  <th className="num">Defects</th>
                  <th className="num">First-time pass</th>
                </tr>
              </thead>
              <tbody>
                {summary.months.map((m) => (
                  <tr key={m.month}>
                    <td>{monthLabel(m.month)}</td>
                    <td className="num">{formatNumber(m.checked)}</td>
                    <td className="num">{formatNumber(m.defects)}</td>
                    <td className="num" style={{
                      fontWeight: 600,
                      color: m.passPct == null
                        ? 'var(--text-faint)'
                        : m.passPct >= EFFICIENCY_THRESHOLD ? 'var(--text)' : 'var(--red-500)'
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
            attempt, while sample inspected and defects count pieces. The two are shown side
            by side rather than reconciled, because the report measures them that way.
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
          color: value.passPct >= EFFICIENCY_THRESHOLD ? 'var(--text)' : 'var(--red-500)'
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
          color: (line.rejectionPct ?? 0) > 100 - EFFICIENCY_THRESHOLD ? 'var(--red-500)' : 'var(--text)'
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
      threshold={{ value: EFFICIENCY_THRESHOLD, label: EFFICIENCY_THRESHOLD + '% target' }}
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
