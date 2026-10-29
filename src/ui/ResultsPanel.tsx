import { CONFIG, DEPTS, deptName, hourLabel, hourRange } from '../sim/config';
import { money } from '../sim/engine';
import { explainHour } from '../sim/explain';
import { ASSIGNMENT_LABEL } from '../sim/roster';
import type { HourReport } from '../sim/types';

const KIND_LABEL: Record<string, string> = {
  checkout: 'Checkout',
  shelfGap: 'Shelves',
  noStock: 'Stock',
  staff: 'Staff',
  idle: 'Staff',
  waste: 'Waste',
  dock: 'Dock',
  event: 'Event',
  good: 'Good',
  money: 'Summary',
};

export function ResultsPanel({ report, onContinue, last }: { report: HourReport; onContinue: () => void; last: boolean }) {
  const notes = explainHour(report);
  const m = report.money;
  const hourProfit = m.revenue - m.cogs - m.waste - m.wages - m.extras;
  return (
    <div className="panel-inner">
      <section className="hour-head">
        <h2>What happened, {hourRange(report.hour)}</h2>
      </section>
      <div className="result-stats">
        <div>
          <span className="stat-label">Served</span>
          <strong>
            {Math.round(report.customersServed)}/{Math.round(report.customersArrived)}
          </strong>
        </div>
        <div>
          <span className="stat-label">Walked out</span>
          <strong className={report.customersAbandoned >= 1 ? 'bad' : ''}>{Math.round(report.customersAbandoned)}</strong>
        </div>
        <div>
          <span className="stat-label">Hour’s profit</span>
          <strong className={hourProfit < 0 ? 'bad' : ''}>{money(hourProfit)}</strong>
        </div>
        <div>
          <span className="stat-label">Satisfaction</span>
          <strong>{Math.round(report.satisfaction.score)}</strong>
        </div>
      </div>

      <section aria-labelledby="exp-h">
        <h3 id="exp-h">Why</h3>
        <ul className="explain">
          {notes.map((n, i) => (
            <li key={i} className={`note note-${n.level}`}>
              <span className={`kind kind-${n.kind}`}>{KIND_LABEL[n.kind]}</span> {n.text}
            </li>
          ))}
          {report.messages.map((msg, i) => (
            <li key={`m${i}`} className="note note-info">
              <span className="kind kind-event">Event</span> {msg}
            </li>
          ))}
        </ul>
      </section>

      {report.satisfaction.reasons.length > 0 && (
        <section aria-labelledby="sat-h">
          <h3 id="sat-h">Customer mood this hour: {Math.round(report.satisfaction.score)}</h3>
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
        </section>
      )}

      <details className="details">
        <summary>Departments and staff in detail</summary>
        <table className="mini-table">
          <thead>
            <tr>
              <th scope="col">Dept</th>
              <th scope="col">Sold</th>
              <th scope="col">Missed (shelf / none)</th>
              <th scope="col">Refilled</th>
              <th scope="col">Shelf at end</th>
            </tr>
          </thead>
          <tbody>
            {DEPTS.map((d) => {
              const r = report.dept[d];
              return (
                <tr key={d}>
                  <th scope="row">{deptName(d)}</th>
                  <td>{Math.round(r.sold)}</td>
                  <td>
                    {Math.round(r.lostShelfGap)} / {Math.round(r.lostNoStock)}
                  </td>
                  <td>{Math.round(r.replenished)}</td>
                  <td>{Math.round(r.shelfEnd)}</td>
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
        <p className="tiny muted">
          Takings {money(m.revenue)} · goods sold {money(m.cogs)} · waste {money(m.waste)} · wages {money(m.wages)} · other {money(m.extras)}
        </p>
      </details>

      <div className="run-bar">
        <button type="button" className="btn-primary btn-run" onClick={onContinue} autoFocus>
          {last ? 'Close up and count the takings ▶' : `Plan ${hourLabel(report.hour + 1)} ▶`}
        </button>
      </div>
    </div>
  );
}

export function ReplayPanel({ report, step, onSkip }: { report: HourReport; step: number; onSkip: () => void }) {
  const s = report.steps[Math.min(step, report.steps.length - 1)];
  const mins = String(Math.min(step + 1, 6) * 10).padStart(2, '0');
  const served = report.steps.slice(0, step + 1).reduce((t, x) => t + x.served, 0);
  const left = report.steps.slice(0, step + 1).reduce((t, x) => t + x.abandoned, 0);
  return (
    <div className="panel-inner">
      <section className="hour-head">
        <h2>{hourRange(report.hour)} in progress</h2>
        <p className="replay-clock" aria-live="polite">
          {hourLabel(report.hour).slice(0, 2)}:{mins === '60' ? '59' : mins}
        </p>
      </section>
      <ul className="replay-facts">
        <li>Paid so far: {Math.round(served)}</li>
        <li>Queue: {Math.round(s?.queue ?? 0)}</li>
        <li className={left >= 1 ? 'bad' : ''}>Walked out: {Math.round(left)}</li>
        {s?.emptyDepts.length ? <li className="bad">Empty: {s.emptyDepts.map((d) => deptName(d)).join(', ')}</li> : null}
      </ul>
      <p className="tiny muted">The replay shows results already calculated. Its speed never changes the outcome.</p>
      <button type="button" className="btn-primary" onClick={onSkip} autoFocus>
        Skip to results
      </button>
    </div>
  );
}
