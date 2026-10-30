import { useState, type ReactNode } from 'react';
import { CONFIG, deptName } from '../sim/config';
import { money } from '../sim/engine';
import { summarise, type ScoreTargets, type Summary } from '../sim/summary';
import type { SimState } from '../sim/types';
import { Forecast } from './Forecast';
import { ResultIcon } from './Illustrations';

interface Action {
  label: string;
  onClick: () => void;
}

interface Props {
  state: SimState;
  targets: ScoreTargets;
  /** e.g. "Sunday complete". */
  title: string;
  /** e.g. "Day 1 of 7". */
  kicker: string;
  /** Cash shown beside the main action (the week). */
  cash?: number;
  primary: Action;
  /** Quieter actions (New Saturday, Restart day). */
  others?: Action[];
  /** Campaign: cash and improvement offers under the takeaway. */
  extra?: ReactNode;
  /** Campaign: business value at closing, shown under the takeaway. */
  value?: ReactNode;
  /** Campaign: business value lines for the Accounts tab. */
  accountsExtra?: ReactNode;
  /** Figures only, with no targets, ticks or crosses (your shop has no pass or fail). */
  plain?: boolean;
  /** Your shop: wages paid at closing. */
  wages?: number;
}

type Tab = 'accounts' | 'operations' | 'team';

/** Closing time: a compact result first, the full report on request. */
export function Closing({ state, targets, title, kicker, cash, primary, others = [], extra, value, accountsExtra, plain, wages }: Props) {
  const s = summarise(state, targets);
  const [report, setReport] = useState(false);
  const [tab, setTab] = useState<Tab>('accounts');
  return (
    <main className="result" id="main">
      <section className="result-card" aria-labelledby="result-h">
        <div className="result-top">
          <div>
            <p className="panel-kicker">{kicker}</p>
            <h1 id="result-h">{title}</h1>
          </div>
          <ul className="indicators" aria-label={plain ? 'Today’s figures' : `${s.metCount} of ${s.scores.length} targets met`}>
            {s.scores.map((x) => (
              <li key={x.key} className={plain ? 'plain' : x.met ? 'met' : 'missed'}>
                <ResultIcon kind={x.key} />
                <span className="ind-text">
                  <span className="ind-label">{x.key === 'customers' ? 'Customer satisfaction' : x.key === 'staff' ? 'Staff wellbeing' : 'Profit'}</span>
                  <span className="ind-value">{x.display}</span>
                  {!plain && <span className="ind-target">
                    <span aria-hidden="true">{x.met ? '✓' : '✗'}</span> target {x.targetDisplay}
                    <span className="sr-only">{x.met ? ', met' : ', missed'}</span>
                  </span>}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {!report && (
          <>
            {s.takeaway && <p className="takeaway">{s.takeaway}</p>}
            {value}
            {extra}
          </>
        )}

        {report && <Report s={s} state={state} tab={tab} setTab={setTab} accountsExtra={accountsExtra} />}

        <div className="result-actions">
          {cash !== undefined && (
            <span className="result-cash">
              Cash <strong>{money(cash)}</strong>
              {wages !== undefined && <span className="muted"> · wages paid {money(wages)}</span>}
            </span>
          )}
          <button type="button" className="btn-primary btn-run" onClick={primary.onClick} autoFocus>
            {primary.label}
          </button>
          <button type="button" className="btn-secondary" aria-expanded={report} onClick={() => setReport((r) => !r)}>
            {report ? 'Hide report' : 'View report'}
          </button>
          {others.map((o) => (
            <button key={o.label} type="button" className="btn-link" onClick={o.onClick}>
              {o.label}
            </button>
          ))}
        </div>
      </section>
    </main>
  );
}

function Report({ s, state, tab, setTab, accountsExtra }: { s: Summary; state: SimState; tab: Tab; setTab: (t: Tab) => void; accountsExtra?: ReactNode }) {
  const tabs: [Tab, string][] = [
    ['accounts', 'Accounts'],
    ['operations', 'Operations'],
    ['team', 'Team'],
  ];
  return (
    <section className="report" aria-label="Report">
      <div className="tabs" role="tablist" aria-label="Report">
        {tabs.map(([k, label]) => (
          <button key={k} id={`rt-${k}`} role="tab" type="button" aria-selected={tab === k} aria-controls="report-panel" className={tab === k ? 'tab tab-on' : 'tab'} onClick={() => setTab(k)}>
            {label}
          </button>
        ))}
      </div>
      <div id="report-panel" role="tabpanel" aria-labelledby={`rt-${tab}`} className="report-panel">
        {tab === 'accounts' && <Accounts s={s} extra={accountsExtra} />}
        {tab === 'operations' && <Operations s={s} state={state} />}
        {tab === 'team' && <Team s={s} />}
      </div>
    </section>
  );
}

function Accounts({ s, extra }: { s: Summary; extra?: ReactNode }) {
  return (
    <div className="report-cols">
      <table className="pl">
        <caption>Profit</caption>
        <tbody>
          <tr>
            <th scope="row">Takings</th>
            <td>{money(s.revenue)}</td>
          </tr>
          <tr>
            <th scope="row">Cost of goods sold</th>
            <td>−{money(s.cogs)}</td>
          </tr>
          <tr className="sub">
            <th scope="row">Gross profit</th>
            <td>{money(s.grossProfit)}</td>
          </tr>
          <tr>
            <th scope="row">Waste written off</th>
            <td>−{money(s.waste)}</td>
          </tr>
          <tr>
            <th scope="row">Wages</th>
            <td>−{money(s.wages)}</td>
          </tr>
          {s.extras.map((x) => (
            <tr key={x.label}>
              <th scope="row">{x.label}</th>
              <td>−{money(x.amount)}</td>
            </tr>
          ))}
          <tr className="total">
            <th scope="row">Operating profit</th>
            <td>{money(s.operatingProfit)}</td>
          </tr>
        </tbody>
      </table>
      <div>
        <table className="pl">
          <caption>Cash and stock</caption>
          <tbody>
            <tr>
              <th scope="row">Cash before the order</th>
              <td>{money(s.cashBeforeOrder)}</td>
            </tr>
            <tr className="total">
              <th scope="row">Cash at close</th>
              <td>{money(s.cash)}</td>
            </tr>
            {s.inventory.map((i) => (
              <tr key={i.dept}>
                <th scope="row">
                  {deptName(i.dept)} left ({Math.round(i.units)})
                </th>
                <td>{money(i.value)}</td>
              </tr>
            ))}
            <tr className="sub">
              <th scope="row">Stock left, at cost</th>
              <td>{money(s.inventoryValue)}</td>
            </tr>
          </tbody>
        </table>
        {extra}
        <p className="report-note">Stock bought but not sold is not a cost: it is still in the shop at what it cost.</p>
      </div>
    </div>
  );
}

function Operations({ s, state }: { s: Summary; state: SimState }) {
  return (
    <div className="report-cols">
      <div>
        <h3>Customers</h3>
        <p>
          {Math.round(s.customers.arrived)} came in, {Math.round(s.customers.served)} paid, {Math.round(s.customers.abandoned)} gave up queueing.
        </p>
        <h3>Availability</h3>
        <table className="mini-table">
          <thead>
            <tr>
              <th scope="col">Department</th>
              <th scope="col">Sold</th>
              <th scope="col">Empty shelf</th>
              <th scope="col">Not in shop</th>
            </tr>
          </thead>
          <tbody>
            {s.availability.map((a) => (
              <tr key={a.dept}>
                <th scope="row">{deptName(a.dept)}</th>
                <td>{Math.round(a.sold)}</td>
                <td>{Math.round(a.shelfGap)}</td>
                <td>{Math.round(a.noStock)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <Forecast scenario={state.scenario} currentHour={99} knownUpTo={99} reports={state.history} compact />
      </div>
      <div>
        <h3>Money spent</h3>
        {s.wasteBy.length + s.actionCosts.length === 0 ? (
          <p>No waste or extra costs.</p>
        ) : (
          <ul className="report-list">
            {s.wasteBy.map((w) => (
              <li key={w.label}>
                <span>
                  Waste: {w.label.toLowerCase()} ({Math.round(w.qty)})
                </span>
                <span>{money(w.cost)}</span>
              </li>
            ))}
            {s.actionCosts.map((c) => (
              <li key={c.label}>
                <span>
                  {c.label} <span className="muted">· {c.note}</span>
                </span>
                <span>{money(c.amount)}</span>
              </li>
            ))}
          </ul>
        )}
        <h3>Estimated profit missed</h3>
        {s.estimates.length === 0 ? (
          <p>None worth mentioning.</p>
        ) : (
          <ul className="report-list">
            {s.estimates.map((e) => (
              <li key={e.label}>
                <span>
                  {e.label} <span className="muted">· {e.detail}</span>
                </span>
                <span>~{money(e.amount)}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="report-note">Estimates are the margin those sales would roughly have made. They are not money spent.</p>
        {s.missed.length > 0 && (
          <>
            <h3>Missed opportunities</h3>
            <ul className="missed">
              {s.missed.map((m, i) => (
                <li key={i}>{m}</li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

function Team({ s }: { s: Summary }) {
  return (
    <div>
      <table className="mini-table team-table">
        <thead>
          <tr>
            <th scope="col">Name</th>
            <th scope="col">Hours worked</th>
            <th scope="col">Breaks</th>
            <th scope="col">Energy at close</th>
            <th scope="col">Quiet hours</th>
            <th scope="col">Condition</th>
          </tr>
        </thead>
        <tbody>
          {s.team.map((t) => (
            <tr key={t.id}>
              <th scope="row">{t.name}</th>
              <td>{t.hours}</td>
              <td>{t.breaks}</td>
              <td>{Math.round(t.energy)}</td>
              <td>{t.quietHours.toFixed(1)}</td>
              <td>{t.state}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="report-note">
        Staff wellbeing {Math.round(s.wellbeing)}. Working more than {CONFIG.wellbeing.hoursBeforeBreakNeeded} hours in a row, or on low energy, adds strain; a break of half an hour or more resets the run.
      </p>
    </div>
  );
}
