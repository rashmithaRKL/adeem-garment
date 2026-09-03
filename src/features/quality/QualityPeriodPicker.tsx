import type { ReactNode } from 'react';
import {
  RANGE_HINT, RANGE_LABEL, RANGE_STEP, spanLabel, stepAnchor,
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
 * The field is deliberately unbounded. It used to be clamped to the range the
 * reports themselves covered, which reads as a broken calendar rather than as a
 * helpful limit: months greyed out with no reason given, and no way to check a
 * month before the earliest import or to look ahead at one not yet filed. Asking
 * for a period with nothing in it is a fair question, and the empty state answers
 * it in words. The three range buttons are the shortcut to where the figures
 * actually are; the calendar is for going wherever the user means to go.
 *
 * Shared by the Quality Management screen and the Production Lines screen rather
 * than copied into both: the two read the same inspection rows through the same
 * builder, and a control that drifted apart on one of them would put two different
 * pass rates for the same line on two screens at once.
 */
export function QualityPeriodPicker({
  span, latest, onRange, onAnchor, note
}: {
  span: QualitySpan;
  /** Newest date the reports reach — offered by the "Latest" shortcut. */
  latest: string | null;
  onRange: (range: QualityRange) => void;
  onAnchor: (anchor: string | null) => void;
  note?: ReactNode;
}) {
  const isMonth = span.range === 'month';

  const stepTo = (step: -1 | 1) => stepAnchor(span.range, span.anchor, step);

  const pick = (value: string) => {
    if (!value) return;
    // A month field hands back "2026-08"; the anchor is always a full date.
    onAnchor(isMonth ? value + '-01' : value);
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
            // These three are the shortcut to where the figures are: the screen
            // answers a range change by moving to the newest day, week or month
            // that carries any. Browsing to a particular period is the calendar's
            // job, and it is free to go anywhere.
            onClick={() => onRange(r)}
          >
            {RANGE_LABEL[r]}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Step label={'Previous ' + RANGE_STEP[span.range]} glyph="‹"
          onClick={() => onAnchor(stepTo(-1))} />

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
          onChange={(e) => pick(e.target.value)}
        />

        <Step label={'Next ' + RANGE_STEP[span.range]} glyph="›"
          onClick={() => onAnchor(stepTo(1))} />
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

/** One arrow. It always steps: the window it lands on is allowed to be empty, and
 *  the screen says so in words rather than by refusing to move. */
function Step({ label, glyph, onClick }: {
  label: string; glyph: string; onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="btn btn--ghost"
      aria-label={label}
      title={label}
      onClick={onClick}
      style={{ padding: '6px 11px', fontSize: 16, lineHeight: 1, cursor: 'pointer' }}
    >
      {glyph}
    </button>
  );
}
