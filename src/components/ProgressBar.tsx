interface ProgressBarProps {
  value: number;
  tone?: string;
  /** Position in a list, so a column of bars grows in sequence. */
  index?: number;
}

/** Colour follows performance, so a glance at the bar is enough. */
export function toneForEfficiency(efficiency: number): string {
  if (efficiency >= 90) return 'var(--green-500)';
  if (efficiency >= 80) return 'var(--blue-500)';
  if (efficiency >= 60) return 'var(--amber-500)';
  return 'var(--red-500)';
}

export function ProgressBar({ value, tone, index = 0 }: ProgressBarProps) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className="bar" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <div
        className="bar__fill grow-x"
        style={{ width: pct + '%', background: tone ?? toneForEfficiency(value), ['--i' as string]: index }}
      />
    </div>
  );
}
