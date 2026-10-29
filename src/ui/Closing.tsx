import { deptName } from '../sim/config';
import { money } from '../sim/engine';
import { summarise } from '../sim/summary';
import type { SimState } from '../sim/types';
import { Forecast } from './Forecast';

export function Closing({ state, onRetry, onNew }: { state: SimState; onRetry: () => void; onNew: () => void }) {
  const s = summarise(state);
  return (
    <main className="closing" id="main">
      <header className={`closing-head ${s.won ? 'won' : 'lost'}`}>
        <h1>{s.won ? 'A good Saturday.' : 'Not quite the Saturday you wanted.'}</h1>
        <p className="lede">
          {s.won
            ? 'All three targets met. The owner has been heard to say “not bad”, which is a first.'
            : 'Some targets were missed. The till roll tells the story below.'}
        </p>
      </header>

      <div className="closing-grid">
        <section className="card" aria-labelledby="t-h">
          <h2 id="t-h">Targets</h2>
          <ul className="target-list">
            {s.targets.map((t) => (
              <li key={t.label} className={t.met ? 'good' : 'bad'}>
                <span aria-hidden="true">{t.met ? '✓' : '✗'}</span>
                <span>
                  <strong>{t.label}</strong>: {t.value} <span className="tiny muted">(target {t.target})</span>
                  <span className="sr-only">{t.met ? ' met' : ' missed'}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="tiny">
            Customers: {Math.round(s.customers.arrived)} came in, {Math.round(s.customers.served)} paid, {Math.round(s.customers.abandoned)} walked out of the queue.
          </p>
        </section>

        <section className="card" aria-labelledby="pl-h">
          <h2 id="pl-h">The day’s accounts</h2>
          <table className="pl">
            <tbody>
              <tr>
                <th scope="row">Takings (revenue)</th>
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
          <p className="tiny muted">Stock bought but not sold is not a cost yet: it is still on the shelves at what it cost.</p>
        </section>

        <section className="card" aria-labelledby="cash-h">
          <h2 id="cash-h">Cash and stock</h2>
          <table className="pl">
            <tbody>
              <tr>
                <th scope="row">Cash at opening</th>
                <td>{money(s.startingCash)}</td>
              </tr>
              <tr className="total">
                <th scope="row">Cash at close</th>
                <td>{money(s.cash)}</td>
              </tr>
              {s.inventory.map((i) => (
                <tr key={i.dept}>
                  <th scope="row">
                    {deptName(i.dept)} left ({Math.round(i.units)} items)
                    <div className="tiny muted">{i.note}</div>
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
        </section>

        <section className="card" aria-labelledby="f-h">
          <h2 id="f-h">Biggest effects on your profit</h2>
          <ol className="factors">
            {s.factors.map((f) => (
              <li key={f.label}>
                <div className="factor-head">
                  <strong>{f.label}</strong>
                  <span className={f.amount < 0 ? 'bad' : 'good'}>
                    {f.amount < 0 ? '−' : '+'}
                    {money(Math.abs(f.amount))}
                  </span>
                </div>
                <p className="tiny">{f.detail}</p>
              </li>
            ))}
          </ol>
          <p className="tiny muted">Lost-sales figures are the margin those items would have made, roughly.</p>
        </section>

        <section className="card wide" aria-labelledby="m-h">
          <h2 id="m-h">Missed opportunities</h2>
          {s.missed.length ? (
            <ul className="missed">
              {s.missed.map((m, i) => (
                <li key={i}>{m}</li>
              ))}
            </ul>
          ) : (
            <p>Honestly? Not many. Have a biscuit.</p>
          )}
        </section>
        <section className="card" aria-labelledby="mood-h">
          <h2 id="mood-h">People</h2>
          <p>
            Customer satisfaction <strong>{Math.round(s.satisfaction)}</strong>. Staff wellbeing <strong>{Math.round(s.wellbeing)}</strong>.
          </p>
          <ul className="tiny">
            {state.staff
              .filter((x) => !x.isTemp)
              .map((x) => (
                <li key={x.id}>
                  {x.name}: {x.hoursWorked} hours worked, {x.breaks} break{x.breaks === 1 ? '' : 's'}, energy {Math.round(x.energy)} at close
                  {x.strain >= 8 ? ' — worn out' : x.strain > 0 ? ' — a bit stretched' : ' — fine'}
                </li>
              ))}
          </ul>
        </section>
        <section className="card wide" aria-labelledby="ff-h">
          <h2 id="ff-h">Footfall</h2>
          <Forecast scenario={state.scenario} currentHour={99} knownUpTo={99} reports={state.history} />
        </section>

      </div>

      <div className="closing-buttons">
        <button type="button" className="btn-primary" onClick={onRetry}>
          Retry same Saturday
        </button>
        <button type="button" className="btn-ghost" onClick={onNew}>
          New Saturday
        </button>
      </div>
      <p className="tiny muted center">Same Saturday: identical customers and events, so the same decisions give the same result. Seed {state.seed}.</p>
    </main>
  );
}
