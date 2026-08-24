import type { ReactNode } from 'react';
import {
  RANGE_HINT, RANGE_LABEL, RANGE_STEP, monthStart, spanLabel, stepAnchor, today,
  type QualityRange, type QualitySpan
} from './period';

const RANGES: QualityRange[] = ['day', 'week', 'month'];

/**
 * Which window of time a quality screen is showing: a day, a calendar week, or a
 * calendar month.
 *
 * The period was a dropdown listing every day ever imported. That is fine for the
 * six days the factory has now and unusable at a year of them, so the date is
 * typed or picked in a date field and stepped a window at a time with the arrows —
 * neither of which grows with the history. The browser's own date picker is used
 * rather than a hand-built calendar: it is already localised, keyboard-navigable
 * and familiar on the tablets the floor uses.
 *
 * Shared by the Quality Management screen and the Production Lines screen rather
 * than copied into both: the two read the same inspection rows through the same
 * builder, and a control that drifted apart on one of them would put two different
 * pass rates for the same line on two screens at once.
 */
export function QualityPeriodPicker({
  span, latest, earliest, onRange, onAnchor, note
}: {
  span: QualitySpan;
  /** Newest date the reports reach; the arrows and the field stop here. */
  latest: string | null;
  /** Oldest date the reports reach; the field will not go below it. */
  earliest: string | null;
  onRange: (range: QualityRange) => void;
  onAnchor: (anchor: string | null) => void;
  note?: ReactNode;
}) {
  // The ceiling is today or the newest report, whichever is later: a factory that
  // has not filed yet this week must still be able to ask about this week, and one
  // whose sheet is dated ahead must still be able to reach it.
  const now = today();
  const max = latest != null && latest > now ? latest : now;
  const min = earliest ?? undefined;
  const isMonth = span.range === 'month';

  const stepTo = (step: -1 | 1) => stepAnchor(span.range, span.anchor, step);
  const nextAnchor = stepTo(1);
  // Stepping forward is blocked once the window already reaches the ceiling,
  // rather than letting the user walk into empty months for ever.
  const atLatest = (isMonth ? monthStart(span.anchor) >= monthStart(max) : span.to >= max);
  const atEarliest = min != null && span.from <= min;

  const pick = (value: string) => {
    if (!value) return;
    // A month field hands back "2026-08"; the anchor is always a full date.
    const anchor = isMonth ? value + '-01' : value;
    onAnchor(anchor > max ? max : anchor);
  };

  return (
    <div style={{
      display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16
    }}>
      <div className="segmented" role="group" aria-label="Reporting period">
        {RANGES.map((r) => (
          <button
            key={r}
            type="button"
            className={'segmented__btn' + (span.range === r ? ' segmented__btn--on' : '')}
            aria-pressed={span.range === r}
            title={RANGE_LABEL[r] + ' — ' + RANGE_HINT[r]}
            // The anchor is kept when the range changes: a manager looking at
            // Friday who asks for the week means the week Friday falls in.
            onClick={() => onRange(r)}
          >
            {RANGE_LABEL[r]}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Step label={'Previous ' + RANGE_STEP[span.range]} glyph="‹"
          disabled={atEarliest} onClick={() => onAnchor(stepTo(-1))} />

        <input
          className="input"
          type={isMonth ? 'month' : 'date'}
          // No color-scheme of its own: the browser paints the calendar popup from
          // the one :root already sets, so it follows the app's light/dark theme.
          style={{ padding: '7px 10px', fontSize: 13 }}
          aria-label={isMonth ? 'Month' : span.range === 'week' ? 'Any day in the week' : 'Date'}
          // A week shows its Monday, not the day that was clicked: the field then
          // reads as the week it selected rather than as an arbitrary date inside it.
          value={isMonth ? span.anchor.slice(0, 7) : span.range === 'week' ? span.from : span.anchor}
          min={isMonth ? min?.slice(0, 7) : min}
          max={isMonth ? max.slice(0, 7) : max}
          onChange={(e) => pick(e.target.value)}
        />

        <Step label={'Next ' + RANGE_STEP[span.range]} glyph="›"
          disabled={atLatest} onClick={() => onAnchor(nextAnchor > max ? max : nextAnchor)} />
      </div>

      <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
        {spanLabel(span)}
        {span.range === 'week' && (
          <span style={{ color: 'var(--text-faint)' }}> · Mon–Sun</span>
        )}
      </span>

      {latest != null && span.to < latest && (
        // Only offered when it would do something. Stepping back through a year of
        // history and having to step forward again is the cost the dropdown used
        // to cover, and one button covers it without listing anything.
        <button type="button" className="btn btn--ghost" style={{ fontSize: 12, padding: '5px 10px' }}
          onClick={() => onAnchor(latest)}>
          Latest
        </button>
      )}

      {note && <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>{note}</span>}
    </div>
  );
}

/** One arrow. Disabled at the ends of the history rather than hidden, so the
 *  control keeps its shape and its position on the row. */
function Step({ label, glyph, disabled, onClick }: {
  label: string; glyph: string; disabled: boolean; onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="btn btn--ghost"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      style={{
        padding: '6px 11px', fontSize: 16, lineHeight: 1,
        opacity: disabled ? 0.35 : 1, cursor: disabled ? 'default' : 'pointer'
      }}
    >
      {glyph}
    </button>
  );
}
