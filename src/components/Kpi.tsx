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
}

export function Kpi({ label, value, sub, delta, icon = '', tone = 'blue' }: KpiProps) {
  const { fg, bg } = TONE[tone];
  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 12 }}>
        <span className="kpi__icon" style={{ background: bg, color: fg }} aria-hidden>{icon}</span>
        <span className="kpi__label">{label}</span>
      </div>
      <div className="kpi__value">{value}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 9 }}>
        {delta && <span className="chip" style={{ background: bg, color: fg }}>{delta}</span>}
        {sub && <span style={{ fontSize: 11.5, color: 'var(--text-faint)' }}>{sub}</span>}
      </div>
    </div>
  );
}
