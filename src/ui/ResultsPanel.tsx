import { useState } from 'react';
import { CONFIG, DEPTS, deptName, hourLabel } from '../sim/config';
import { money } from '../sim/engine';
import { explainHour } from '../sim/explain';
import { intervalOutcomes } from '../sim/insight';
import { ASSIGNMENT_LABEL } from '../sim/roster';
import type { HourReport } from '../sim/types';
import { stepActivity } from './activity';

export function intervalRange(r: HourReport): string {
  const t = (step: number) => `${String(CONFIG.openingHour + r.hour + Math.floor(step / 6)).padStart(2, '0')}:${String((step % 6) * 10).padStart(2, '0')}`;
  return `${t(r.fromStep)}–${t(r.toStep)}`;
}

export function OutcomeList({ report, max = 3 }: { report: HourReport; max?: number }) {
  const outcomes = intervalOutcomes(report).slice(0, max);
  return (
    <ul className="outcomes">
      {outcomes.map((o, i) => (
        <li key={i} className={`outcome outcome-${o.tone}`}>
          <span className="outcome-mark" aria-hidden="true">
            {o.tone === 'good' ? '✓' : '!'}
          </span>
          {o.text}
        </li>
      ))}
    </ul>
  );
}

export function ResultsPanel({ report, onContinue, last }: { report: HourReport; onContinue: () => void; last: boolean }) {
  const [details, setDetails] = useState(false);
  const notes = explainHour(report);
  const m = report.money;
  const profit = m.revenue - m.cogs - m.waste - m.wages - m.extras;
  return (
    <div className="panel-inner">
      <section className="hour-head">
        <h2>{intervalRange(report)}: what happened</h2>
      </section>
      <OutcomeList report={report} />
      <p className="tiny muted">
        Takings {money(m.revenue)} · profit this hour {money(profit)} · customer mood {Math.round(report.satisfaction.score)}
      </p>
      <button type="button" className="btn-link" aria-expanded={details} onClick={() => setDetails((d) => !d)}>
        {details ? 'Hide details' : 'Details'}
      </button>
      {details && (
        <div className="details-body">
          <ul className="explain">
            {notes.map((n, i) => (
              <li key={i} className={`note note-${n.level}`}>
                {n.text}
              </li>
            ))}
            {report.messages.map((msg, i) => (
              <li key={`m${i}`} className="note note-info">
                {msg}
              </li>
            ))}
          </ul>
          {report.satisfaction.reasons.length > 0 && (
            <ul className="reasons">
              <li>
                <span>An ordinary visit</span>
                <span>{CONFIG.satisfaction.base}</span>
              </li>
              {report.satisfaction.reasons.map((r, i) => (
                <li key={i}>
                  <span>{r.label}</span>
                  <span className={r.delta < 0 ? 'bad' : 'good'}>
                    {r.delta > 0 ? '+' : '−'}
                    {Math.abs(r.delta).toFixed(1)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <table className="mini-table">
            <thead>
              <tr>
                <th scope="col">Dept</th>
                <th scope="col">Sold</th>
                <th scope="col">Not found</th>
                <th scope="col">Filled</th>
                <th scope="col">Shelf</th>
              </tr>
            </thead>
            <tbody>
              {DEPTS.map((d) => {
                const r = report.dept[d];
                return (
                  <tr key={d}>
                    <th scope="row">{deptName(d)}</th>
                    <td>{Math.round(r.sold)}</td>
                    <td>{Math.round(r.lostShelfGap + r.lostNoStock)}</td>
                    <td>{Math.round(r.replenished)}</td>
                    <td>
                      {Math.round(r.shelfStart)} → {Math.round(r.shelfEnd)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <table className="mini-table">
            <thead>
              <tr>
                <th scope="col">Staff</th>
                <th scope="col">Job</th>
                <th scope="col">Busy</th>
                <th scope="col">Energy</th>
              </tr>
            </thead>
            <tbody>
              {report.staff.map((s) => (
                <tr key={s.id}>
                  <th scope="row">{s.name}</th>
                  <td>{ASSIGNMENT_LABEL[s.assignment]}</td>
                  <td>{s.utilisation === null ? '—' : `${Math.round(s.utilisation * 100)}%`}</td>
                  <td>
                    {Math.round(s.energyBefore)} → {Math.round(s.energyAfter)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="run-bar">
        <button type="button" className="btn-primary btn-run" onClick={onContinue} autoFocus>
          {last ? 'Close up and count the takings ▶' : `Plan ${hourLabel(report.hour + 1)} ▶`}
        </button>
      </div>
    </div>
  );
}

export function ReplayPanel({ report, step, onSkip }: { report: HourReport; step: number; onSkip: () => void }) {
  const steps = report.steps;
  const s = steps[Math.min(step, steps.length - 1)];
  const absStep = report.fromStep + Math.min(step, steps.length - 1) + 1;
  const mins = String(Math.min(absStep, 6) * 10).padStart(2, '0');
  const served = steps.slice(0, step + 1).reduce((t, x) => t + x.served, 0);
  const left = steps.slice(0, step + 1).reduce((t, x) => t + x.abandoned, 0);
  return (
    <div className="panel-inner">
      <section className="hour-head">
        <p className="live-badge">Recorded result · playing back</p>
        <p className="replay-clock" aria-live="polite">
          {hourLabel(report.hour).slice(0, 2)}:{mins === '60' ? '59' : mins}
        </p>
      </section>
      <ul className="replay-facts">
        <li>Paid so far: {Math.round(served)}</li>
        <li>Queue: {Math.round(s?.queue ?? 0)}</li>
        <li className={left >= 1 ? 'bad' : ''}>Gave up: {Math.round(left)}</li>
      </ul>
      <h3>Staff now</h3>
      <ul className="activity-list">
        {stepActivity(report, step).map((a) => (
          <li key={a.id} className={a.activity === 'idle' ? 'idle' : ''}>
            <strong>{a.name}</strong> — {a.why}
            {a.activity === 'idle' && <span className="sr-only"> (idle)</span>}
          </li>
        ))}
      </ul>
      <button type="button" className="btn-primary" onClick={onSkip} autoFocus>
        Skip to results
      </button>
    </div>
  );
}
