import { TONE, type Tone } from './Kpi';

const TONE_BY_STATUS: Record<string, Tone> = {
  running: 'green', in_production: 'blue', completed: 'green',
  behind: 'red', at_risk: 'red', delayed: 'red', failed: 'red',
  changeover: 'amber', warnings: 'amber', pending: 'orange',
  idle: 'cyan', on_time: 'green', upcoming: 'blue', imported: 'green'
};

const LABELS: Record<string, string> = {
  in_production: 'In production', at_risk: 'At risk', on_time: 'On time',
  running: 'Running', behind: 'Behind', changeover: 'Changeover', idle: 'Idle',
  pending: 'Pending', completed: 'Completed', delayed: 'Delayed',
  upcoming: 'Upcoming', imported: 'Imported', warnings: 'Warnings', failed: 'Failed'
};

export function StatusChip({ status }: { status: string }) {
  const tone = TONE_BY_STATUS[status] ?? 'cyan';
  const { fg, bg } = TONE[tone];
  return <span className="chip" style={{ background: bg, color: fg }}>{LABELS[status] ?? status}</span>;
}
