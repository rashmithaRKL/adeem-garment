import { useTilt, useCountUp } from '@/lib/motion';

export type Tone = 'blue' | 'green' | 'amber' | 'red' | 'purple' | 'orange' | 'cyan';

export const TONE: Record<Tone, { fg: string; bg: string }> = {
  blue:   { fg: 'var(--blue-500)',   bg: 'var(--blue-50)' },
  green:  { fg: 'var(--green-500)',  bg: 'var(--green-50)' },
  amber:  { fg: 'var(--amber-500)',  bg: 'var(--amber-50)' },
  red:    { fg: 'var(--red-500)',    bg: 'var(--red-50)' },
  purple: { fg: 'var(--purple-500)', bg: 'var(--purple-50)' },
  orange: { fg: 'var(--orange-500)', bg: 'var(--orange-50)' },
  cyan:   { fg: 'var(--cyan-500)',   bg: 'var(--cyan-50)' }
};

interface KpiProps {
  label: string;
  value: string;
  sub?: string;
  delta?: string;
  icon?: string;
  tone?: Tone;
  /** Position in its row, so a row of tiles arrives in sequence. */
  index?: number;
}

/**
 * Digits are counted up only when the value is a plain number. A KPI can also be
 * a filename or a compression ratio, and animating "2.1 MB → 480 kB" digit by
 * digit would be nonsense, so anything unparseable is rendered as given.
 */
function useAnimatedValue(value: string): string {
  const numeric = Number(value.replace(/[,\s%]/g, ''));
  const animatable = value.trim() !== '' && Number.isFinite(numeric);
  const counted = useCountUp(animatable ? numeric : 0);

  if (!animatable) return value;

  const decimals = (value.split('.')[1] ?? '').replace(/[^0-9]/g, '').length;
  const suffix = value.trim().endsWith('%') ? '%' : '';
  return counted.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }) + suffix;
}

export function Kpi({ label, value, sub, delta, icon = '', tone = 'blue', index = 0 }: KpiProps) {
  const { fg, bg } = TONE[tone];
  const tilt = useTilt<HTMLDivElement>();
  const shown = useAnimatedValue(value);

  return (
    <div
      ref={tilt.ref}
      onPointerMove={tilt.onPointerMove}
      onPointerLeave={tilt.onPointerLeave}
      className="card tilt rise"
      style={{ ['--i' as string]: index }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 12 }}>
        <span className="kpi__icon" style={{ background: bg, color: fg }} aria-hidden>{icon}</span>
        <span className="kpi__label">{label}</span>
      </div>
      <div className="kpi__value tilt__pop">{shown}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 9 }}>
        {delta && <span className="chip" style={{ background: bg, color: fg }}>{delta}</span>}
        {sub && <span style={{ fontSize: 11.5, color: 'var(--text-faint)' }}>{sub}</span>}
      </div>
    </div>
  );
}
