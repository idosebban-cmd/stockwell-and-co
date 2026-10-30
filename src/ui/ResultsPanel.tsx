import { CONFIG } from '../sim/config';
import { clockLabel } from '../sim/engine';
import type { HourReport } from '../sim/types';
import { stepActivity } from './activity';

export function ReplayPanel({ report, step }: { report: HourReport; step: number }) {
  const steps = report.steps;
  const s = steps[Math.min(step, steps.length - 1)];
  const absStep = report.fromStep + Math.min(step, steps.length - 1) + 1;
  const clock = clockLabel(report.hour, Math.min(absStep, CONFIG.stepsPerHour - 1));
  const served = steps.slice(0, step + 1).reduce((t, x) => t + x.served, 0);
  const left = steps.slice(0, step + 1).reduce((t, x) => t + x.abandoned, 0);
  return (
    <div className="panel-inner">
      <div className="panel-head">
        <div>
          <p className="panel-kicker">Replay · already decided</p>
          <h2 aria-live="polite">
            {clock}
          </h2>
        </div>
      </div>
      <ul className="replay-facts">
        <li>Paid so far: {Math.round(served)}</li>
        <li>Queue: {Math.round(s?.queue ?? 0)}</li>
        <li className={left >= 1 ? 'bad' : ''}>Gave up: {Math.round(left)}</li>
      </ul>
      <p className="picker-title">Staff now</p>
      <ul className="activity-list">
        {stepActivity(report, step).map((a) => (
          <li key={a.id} className={a.activity === 'idle' ? 'idle' : ''}>
            <strong>{a.name}</strong> — {a.why}
            {a.activity === 'idle' && <span className="sr-only"> (idle)</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
