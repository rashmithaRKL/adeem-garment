import type { ReactNode } from 'react';
import { formatDate } from '@/lib/format';
import type { QualityBasis } from './queries';

/**
 * Daily or monthly, and which day or month.
 *
 * Shared by the Quality Management screen and the Production Lines screen rather
 * than copied into both: the two read the same inspection rows through the same
 * builder, and a control that drifted apart on one of them would put two
 * different pass rates for the same line on two screens at once.
 */
export function QualityPeriodPicker({ basis, period, periods, onBasis, onPeriod, note }: {
  basis: QualityBasis;
  /** null means every period on this basis at once. */
  period: string | null;
  periods: string[];
  onBasis: (basis: QualityBasis) => void;
  onPeriod: (period: string | null) => void;
  note?: ReactNode;
}) {
  return (
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
            // Switching basis drops the selection: a day is not a month, and the
            // builder falls back to every period rather than to nothing.
            onClick={() => { onBasis(b); onPeriod(null); }}
          >
            {b === 'daily' ? 'Daily' : 'Monthly'}
          </button>
        ))}
      </div>

      <select
        className="input"
        style={{ padding: '8px 10px', fontSize: 13, flex: '0 1 240px' }}
        aria-label="Period"
        value={period ?? ''}
        onChange={(e) => onPeriod(e.target.value === '' ? null : e.target.value)}
      >
        <option value="">
          {periods.length > 0
            ? `All ${periods.length} ${basis === 'daily' ? 'days' : 'months'}`
            : 'No periods yet'}
        </option>
        {periods.map((p) => (
          <option key={p} value={p}>{periodLabel(p, basis)}</option>
        ))}
      </select>

      {note && <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>{note}</span>}
    </div>
  );
}

export const periodLabel = (period: string, basis: QualityBasis): string =>
  basis === 'daily'
    ? formatDate(period)
    : new Date(period).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
