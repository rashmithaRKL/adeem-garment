import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/Card';
import { Kpi } from '@/components/Kpi';
import { QueryState } from '@/components/QueryState';
import { Donut, BarChart, LineChart, seriesColor } from '@/components/charts';
import { formatNumber, formatDate } from '@/lib/format';
import { EFFICIENCY_THRESHOLD } from '@/lib/env';
import {
  fetchQualityRecords, buildQualityMatrix,
  type QualityBasis, type FinalStatus, type LineQualityRow
} from './queries';
import { STAGE_LABEL, type QualityStage } from './types';

/** The four gates the client asked to see line by line, in floor order. */
const COLUMNS: QualityStage[] = ['in_line', 'end_line', 'appearance', 'aql'];

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

const periodLabel = (period: string, basis: QualityBasis): string =>
  basis === 'daily'
    ? formatDate(period)
    : new Date(period).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

/** Short enough for an axis: "12 Aug" daily, "Aug 26" monthly. */
const shortPeriod = (period: string, basis: QualityBasis): string =>
  new Date(period).toLocaleDateString('en-GB',
    basis === 'daily' ? { day: '2-digit', month: 'short' } : { month: 'short', year: '2-digit' });

/**
 * Quality, line by line, on the basis the client reads it: daily during the week
 * and monthly at review. The two are never mixed — a monthly summary already
 * contains its own days, and adding them together counts every piece twice.
 */
export function QualityManagementPage() {
  const [basis, setBasis] = useState<QualityBasis>('daily');
  const [period, setPeriod] = useState<string | null>(null);

  const records = useQuery({ queryKey: ['quality', 'records'], queryFn: fetchQualityRecords });
  const data = records.data ?? { inspections: [], defects: [] };

  // The period picker is per basis, so switching basis drops a selection that
  // no longer names anything — the builder falls back to every period.
  const matrix = buildQualityMatrix(data, basis, period, EFFICIENCY_THRESHOLD);

  const stageSeries = COLUMNS.map((stage, i) => ({
    key: stage, label: STAGE_LABEL[stage], color: seriesColor(i)
  }));

  const defectSeries = matrix.topDefects.map((d, i) => ({
    key: d.category, label: d.category, color: seriesColor(i)
  }));

  return (
    <>
      <div style={{
        display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16
      }}>
        <div className="segmented" role="group" aria-label="Reporting basis">
          {(['daily', 'monthly'] as QualityBasis[]).map((b) => (
            <button
              key={b}
              type="button"
              className={'segmented__btn' + (basis === b ? ' segmented__btn--on' : '')}
              aria-pressed={basis === b}
              onClick={() => { setBasis(b); setPeriod(null); }}
            >
              {b === 'daily' ? 'Daily' : 'Monthly'}
            </button>
          ))}
        </div>

        <select
          className="input"
          style={{ padding: '8px 10px', fontSize: 13, flex: '0 1 240px' }}
          aria-label="Period"
          value={matrix.period ?? ''}
          onChange={(e) => setPeriod(e.target.value === '' ? null : e.target.value)}
        >
          <option value="">
            {matrix.periods.length > 0
              ? `All ${matrix.periods.length} ${basis === 'daily' ? 'days' : 'months'}`
              : 'No periods yet'}
          </option>
          {matrix.periods.map((p) => (
            <option key={p} value={p}>{periodLabel(p, basis)}</option>
          ))}
        </select>

        <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>
          Pass, rejection and final inspection are judged against the {EFFICIENCY_THRESHOLD}% threshold.
        </span>
      </div>

      <QueryState
        isLoading={records.isLoading}
        error={records.error}
        isEmpty={!matrix.hasData}
        emptyTitle={basis === 'daily' ? 'No daily quality reports' : 'No monthly quality reports'}
        emptyBody={
          'Import a KPI report, a daily quality performance report or a monthly summary from '
          + 'the Upload Excel screen. This page reads the ' + basis + ' rows in those workbooks; '
          + (basis === 'daily'
            ? 'a factory that only files monthly summaries will find its figures under Monthly.'
            : 'daily reports appear under Daily instead.')
        }
      >
        <div className="grid grid--kpi">
          <Kpi index={0} label="Pieces checked" icon="🔎" tone="blue"
            value={formatNumber(matrix.checked)}
            sub={matrix.period ? periodLabel(matrix.period, basis) : `${matrix.periods.length} periods`} />
          <Kpi index={1} label="Pass rate" icon="✅"
            tone={(matrix.passPct ?? 0) >= EFFICIENCY_THRESHOLD ? 'green' : 'red'}
            value={pctText(matrix.passPct)}
            sub={'target ' + EFFICIENCY_THRESHOLD + '%'} />
          <Kpi index={2} label="Rejection" icon="🚫" tone="orange"
            value={pctText(matrix.rejectionPct)}
            sub={formatNumber(matrix.defects) + ' defects found'} />
          <Kpi index={3} label="AQL audit" icon="📐" tone="purple"
            value={pctText(matrix.aqlPassPct)}
            sub={matrix.aqlPassPct == null ? 'no AQL rows in this report' : 'sampled pass rate'} />
        </div>

        <Card title="Pass rate by line and stage" style={{ marginTop: 16 }}
          aside={<span style={{ fontSize: 12, color: 'var(--text-faint)' }}>
            in line · end line · appearance · AQL
          </span>}>
          <BarChart
            height={250}
            format={(n) => n.toFixed(1) + '%'}
            data={matrix.lines.map((line) => ({
              label: line.label.replace(/^line\s*/i, 'L'),
              values: COLUMNS.reduce<Record<string, number>>((acc, stage) => {
                const cell = line.stages[stage];
                if (cell?.passPct != null) acc[stage] = cell.passPct;
                return acc;
              }, {})
            }))}
            series={stageSeries}
            empty="No stage figures in this period."
          />
          <p style={{ margin: '12px 0 0', fontSize: 11.5, color: 'var(--text-faint)', lineHeight: 1.6 }}>
            A missing bar means that line was not inspected at that stage in this period — it
            is not a zero pass rate.
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

          <Card title="Top 5 defects">
            <Donut
              size={158}
              centerLabel="defects"
              slices={matrix.topDefects.map((d, i) => ({
                label: d.category, value: d.qty, color: seriesColor(i)
              }))}
              empty="No defect categories recorded in this period."
            />
          </Card>
        </div>

        <Card title={basis === 'daily' ? 'Pass rate day by day' : 'Pass rate month by month'}
          style={{ marginTop: 16 }}
          aside={<span style={{ fontSize: 12, color: 'var(--text-faint)' }}>
            every period in the report, not just the one selected
          </span>}>
          {/* Deliberately built from the full history rather than the selected
              period: a trend of one point is not a trend. */}
          <TrendPanel basis={basis} data={data} />
        </Card>

        <Card title="Line by line" style={{ marginTop: 16 }}
          aside={<span style={{ fontSize: 12, color: 'var(--text-faint)' }}>
            {matrix.period ? periodLabel(matrix.period, basis) : 'all periods'}
          </span>}>
          <div className="table-scroll">
            <table className="table" style={{ minWidth: 860 }}>
              <thead>
                <tr>
                  <th>Line</th>
                  {COLUMNS.map((stage) => <th key={stage} className="num">{STAGE_LABEL[stage]}</th>)}
                  <th className="num">Checked</th>
                  <th className="num">Defects</th>
                  <th className="num">Rejection</th>
                  <th>Final inspection</th>
                </tr>
              </thead>
              <tbody>
                {matrix.lines.map((line) => <LineRow key={line.key} line={line} />)}
              </tbody>
            </table>
          </div>
          <p style={{ margin: '14px 0 0', fontSize: 11.5, color: 'var(--text-faint)', lineHeight: 1.6 }}>
            Rejection is defects found for every hundred pieces checked. Final inspection is
            the pass rate of the final gate on its own, so a line can clear every earlier stage
            and still read below target here.
          </p>
        </Card>
      </QueryState>
    </>
  );
}

function LineRow({ line }: { line: LineQualityRow }) {
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
      <td className="num" style={{
        fontWeight: 600,
        color: (line.rejectionPct ?? 0) > 100 - EFFICIENCY_THRESHOLD ? 'var(--red-500)' : 'var(--text)'
      }}>
        {pctText(line.rejectionPct)}
      </td>
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

/** The trend ignores the period filter on purpose, so it is built separately. */
function TrendPanel({ basis, data }: {
  basis: QualityBasis;
  data: Parameters<typeof buildQualityMatrix>[0];
}) {
  const full = buildQualityMatrix(data, basis, null, EFFICIENCY_THRESHOLD);
  return (
    <LineChart
      domain="percent"
      area
      height={220}
      threshold={{ value: EFFICIENCY_THRESHOLD, label: EFFICIENCY_THRESHOLD + '% target' }}
      format={(n) => n.toFixed(1) + '%'}
      points={full.trend.map((p) => ({
        label: shortPeriod(p.date, basis),
        values: { pass: p.passPct }
      }))}
      series={[{ key: 'pass', label: 'Pass rate', color: 'var(--chart-1)' }]}
      empty={`Two or more ${basis === 'daily' ? 'days' : 'months'} are needed before a trend means anything.`}
    />
  );
}
