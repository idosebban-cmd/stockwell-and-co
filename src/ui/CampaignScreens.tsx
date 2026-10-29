/**
 * The week's own screens: before opening (forecast and order), the
 * improvement offers at closing, and the end of the week.
 */
import { useMemo, useState } from 'react';
import { CONFIG, deptName, hourLabel, type ChilledLife, type DeptId } from '../sim/config';
import { checkSetup, defaultPlan, deliveryUnitCost, money, pounds, weekdayName } from '../sim/engine';
import { ROSTER } from '../sim/roster';
import {
  allOffers,
  businessValue,
  CAMPAIGN_DAYS,
  campaignGoal,
  carriedQty,
  dayConfig,
  dayContext,
  dayScenario,
  orderFunds,
  recommendOrder,
  startCampaignDay,
  topOffers,
  type CampaignState,
  type Offer,
  type UpgradeId,
} from '../sim/campaign';
import type { SetupPlan, SimState } from '../sim/types';
import { PanelHead } from './PlanPanel';
import { ShopPicture, ShopScreen } from './ShopScreen';

const K = CONFIG.campaign;

export function dayKicker(day: number): string {
  return `${weekdayName(day)} · day ${day + 1} of ${CAMPAIGN_DAYS}`;
}

// ---------------------------------------------------------------------------
// Before opening
// ---------------------------------------------------------------------------

const EMPTY_ORDER = (camp: CampaignState): SetupPlan => ({
  orders: { produce: { morning: 0, midday: 0 }, chilled: { morning: 0, midday: 0 }, ambient: { morning: 0, midday: 0 } },
  chilledLife: { morning: 'short', midday: 'long' },
  pricing: { ...camp.pricing },
});

/** The shop before opening, with the day's forecast and the recommended order to confirm. */
export function MorningScreen({ camp, onOpen, reduced }: { camp: CampaignState; onOpen: (s: SetupPlan) => void; reduced: boolean }) {
  const [order, setOrder] = useState<SetupPlan>(() => recommendOrder(camp));
  const [adjust, setAdjust] = useState(false);
  const ctx = dayContext(camp);
  const sc = useMemo(() => dayScenario(camp), [camp]);
  const have = carriedQty(camp);
  const check = checkSetup(order, sc.forecast, { cash: orderFunds(camp), carried: have, ctx });
  const preview = useMemo(() => {
    try {
      return startCampaignDay(camp, check.errors.length ? EMPTY_ORDER(camp) : order);
    } catch {
      return startCampaignDay(camp, EMPTY_ORDER(camp));
    }
  }, [camp, order, check.errors.length]);
  const plan = useMemo(() => defaultPlan(preview), [preview]);
  const cfg = dayConfig(camp.day);
  const after = camp.cash - check.cost;
  const goal = campaignGoal(camp);
  const set = (d: DeptId, k: 'morning' | 'midday', v: number) => setOrder((o) => ({ ...o, orders: { ...o.orders, [d]: { ...o.orders[d], [k]: Math.max(0, Math.round(v)) } } }));
  const setLife = (k: 'morning' | 'midday', l: ChilledLife) => setOrder((o) => ({ ...o, chilledLife: { ...o.chilledLife, [k]: l } }));
  const customers = sc.forecast.reduce((t, x) => t + x, 0);
  const peak = Math.max(...sc.forecast);
  return (
    <ShopScreen
      state={preview}
      plan={plan}
      setPlan={() => {}}
      phase="plan"
      report={null}
      onRun={() => !check.errors.length && onOpen(order)}
      onReplayDone={() => {}}
      reduced={reduced}
      replaySpeed="normal"
      steps={6}
      interactive={false}
      primary={{
        label: 'Open the shop ▶',
        onClick: () => onOpen(order),
        disabled: check.errors.length > 0,
        note: check.errors[0] ?? (after < 0 ? `Uses ${money(-after)} of the overdraft` : undefined),
        noteTone: check.errors.length ? 'bad' : undefined,
      }}
      panel={() => (
        <div className="panel-inner morning">
          <PanelHead title="Before opening" kicker={dayKicker(camp.day)} />
          <p className="morning-line">
            Open {hourLabel(0)}–{hourLabel(cfg.hours)} · about {customers} customers, busiest {hourLabel(sc.forecast.indexOf(peak))}
          </p>
          <MiniForecast forecast={sc.forecast} />
          <p className="morning-goal">
            Today’s goal: <strong>{pounds(cfg.profitTarget)} profit</strong>
          </p>
          <p className="morning-intro">{cfg.intro}</p>
          {sc.events.some((e) => e.kind === 'fridgeFault') && <p className="morning-intro">The chiller compressor is rattling. The engineer is on call if it gives up.</p>}

          <div className="order">
            <div className="order-head">
              <strong>Stock order</strong>
              <button type="button" className="btn-link" aria-expanded={adjust} onClick={() => setAdjust((a) => !a)}>
                {adjust ? 'Done' : 'Adjust'}
              </button>
            </div>
            <ul className="order-list">
              {ctx.depts.map((d) => (
                <li key={d}>
                  <span className="ol-dept">{deptName(d)}</span>
                  {adjust ? (
                    <span className="ol-edit">
                      <Qty label={`${deptName(d)} morning delivery`} value={order.orders[d].morning} onChange={(v) => set(d, 'morning', v)} />
                      {ctx.middayHour !== null && (
                        <>
                          <span className="muted">+ {hourLabel(ctx.middayHour)}</span>
                          <Qty label={`${deptName(d)} midday delivery`} value={order.orders[d].midday} onChange={(v) => set(d, 'midday', v)} />
                        </>
                      )}
                    </span>
                  ) : (
                    <span>
                      {order.orders[d].morning + order.orders[d].midday === 0
                        ? `None (${Math.round(have[d])} in stock)`
                        : `${order.orders[d].morning} now${order.orders[d].midday ? ` + ${order.orders[d].midday} at ${hourLabel(ctx.middayHour!)}` : ''}`}
                    </span>
                  )}
                  {adjust && d === 'chilled' && (
                    <span className="ol-life">
                      {(['morning', 'midday'] as const)
                        .filter((k) => k === 'morning' || ctx.middayHour !== null)
                        .map((k) => (
                          <label key={k}>
                            {k === 'morning' ? 'Morning' : 'Midday'}:{' '}
                            <select value={order.chilledLife[k]} onChange={(e) => setLife(k, e.target.value as ChilledLife)}>
                              <option value="short">Use by today · {money(deliveryUnitCost('chilled', 'short'))}</option>
                              <option value="long">Keeps 3 days · {money(deliveryUnitCost('chilled', 'long'))}</option>
                            </select>
                          </label>
                        ))}
                    </span>
                  )}
                </li>
              ))}
            </ul>
            <p className="order-total">
              Cost <strong>{money(check.cost)}</strong> · cash after <strong className={after < 0 ? 'bad' : ''}>{money(after)}</strong>
            </p>
            {adjust && (
              <button type="button" className="btn-link" onClick={() => setOrder(recommendOrder(camp))}>
                Back to the recommended order
              </button>
            )}
            <p className="report-note">Recommended from today’s forecast, the stock already in the shop, the space and your cash.</p>
          </div>
          <p className="week-goal">
            <strong>This week:</strong> finish Saturday with business value {pounds(goal.target)}+ (now {pounds(goal.value)}), reputation {K.objective.reputation}+ (now{' '}
            {Math.round(goal.reputation)}) and team {K.objective.wellbeing}+ (now {Math.round(goal.wellbeing)}).
          </p>
          <details className="more">
            <summary>What is business value?</summary>
            <p className="tiny">Cash, plus stock and equipment at what they cost, minus any overdraft. Buying stock or equipment moves money into the business; it doesn’t lose it.</p>
          </details>
        </div>
      )}
    />
  );
}

function Qty({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <span className="qty-row small">
      <button type="button" className="btn-qty" aria-label={`20 fewer: ${label}`} onClick={() => onChange(Math.max(0, value - 20))}>
        −
      </button>
      <input type="number" aria-label={label} min={0} step={20} value={value} onChange={(e) => onChange(Number(e.target.value) || 0)} />
      <button type="button" className="btn-qty" aria-label={`20 more: ${label}`} onClick={() => onChange(value + 20)}>
        +
      </button>
    </span>
  );
}

function MiniForecast({ forecast }: { forecast: number[] }) {
  const max = Math.max(...forecast);
  return (
    <ol className="mini-forecast" aria-label={`Expected customers: ${forecast.map((f, h) => `${hourLabel(h)} ${f}`).join(', ')}`}>
      {forecast.map((f, h) => (
        <li key={h} aria-hidden="true">
          <span className="mf-bar" style={{ height: `${Math.max(8, (f / max) * 100)}%` }} />
          <span className="mf-h">{hourLabel(h).slice(0, 2)}</span>
        </li>
      ))}
    </ol>
  );
}

// ---------------------------------------------------------------------------
// Closing: improvements
// ---------------------------------------------------------------------------

/** Cash and up to three relevant improvements, with the full list on request. */
export function Offers({ camp, closed, bought, onBuy, onUndo }: { camp: CampaignState; closed: SimState; bought: UpgradeId[]; onBuy: (id: UpgradeId) => void; onUndo: (id: UpgradeId) => void }) {
  const [all, setAll] = useState(false);
  const last = camp.day >= CAMPAIGN_DAYS;
  const top = topOffers(camp, closed);
  const list = all ? allOffers(camp, closed) : top;
  const names = allOffers({ ...camp, owned: [] }, closed);
  return (
    <section className="offers" aria-labelledby="offers-h">
      <div className="offers-head">
        <h2 id="offers-h">Improve the shop</h2>
        <span>
          Cash <strong>{money(camp.cash)}</strong>
        </span>
      </div>
      {bought.length > 0 && (
        <ul className="bought">
          {bought.map((id) => (
            <li key={id}>
              ✓ {id.startsWith('hire:') ? `Hired ${ROSTER.find((r) => r.id === id.slice(5))?.name ?? id.slice(5)}` : (names.find((o) => o.id === id)?.name ?? id)}{' '}
              <button type="button" className="btn-link" onClick={() => onUndo(id)}>
                Undo
              </button>
            </li>
          ))}
        </ul>
      )}
      {last ? null : list.length === 0 ? (
        <p className="muted">Nothing you can buy right now. Saving is fine too.</p>
      ) : (
        <ul className={`offer-list ${all ? 'all' : ''}`}>
          {list.map((o) => (
            <OfferRow key={o.id} o={o} onBuy={() => onBuy(o.id)} />
          ))}
        </ul>
      )}
      {!last && (
        <button type="button" className="btn-link" aria-expanded={all} onClick={() => setAll((a) => !a)}>
          {all ? 'Show suggestions only' : 'All improvements'}
        </button>
      )}
    </section>
  );
}

function OfferRow({ o, onBuy }: { o: Offer; onBuy: () => void }) {
  return (
    <li className={`offer ${o.available ? '' : 'off'}`} title={o.effect}>
      <strong>{o.name}</strong>
      <span className="offer-brief">{o.brief}</span>
      {o.why && <span className="offer-why">{o.why}</span>}
      <span className="offer-cost">
        {money(o.cost)}
        {o.recurring && <span className="offer-rec"> + {o.recurring}</span>}
      </span>
      {o.available ? (
        <button type="button" className="btn-action" onClick={onBuy} aria-label={`Buy ${o.name} for ${money(o.cost)}. ${o.effect} Cash after ${money(o.cashAfter)}.`}>
          Buy · cash after {money(o.cashAfter)}
        </button>
      ) : (
        <span className="offer-reason">{o.reason}</span>
      )}
    </li>
  );
}

/** Business value lines for the Accounts tab of a campaign day. */
export function ValueLines({ camp }: { camp: CampaignState }) {
  const v = businessValue(camp);
  return (
    <table className="pl">
      <caption>Business value</caption>
      <tbody>
        <tr>
          <th scope="row">Cash</th>
          <td>{money(v.cash)}</td>
        </tr>
        <tr>
          <th scope="row">Stock, at cost</th>
          <td>{money(v.inventory)}</td>
        </tr>
        <tr>
          <th scope="row">Equipment, at cost</th>
          <td>{money(v.equipment)}</td>
        </tr>
        {v.debt > 0 && (
          <tr>
            <th scope="row">Overdraft</th>
            <td>−{money(v.debt)}</td>
          </tr>
        )}
        <tr className="total">
          <th scope="row">Business value</th>
          <td>{money(v.total)}</td>
        </tr>
        <tr>
          <th scope="row">At the start of the week</th>
          <td>{money(camp.startValue)}</td>
        </tr>
      </tbody>
    </table>
  );
}

// ---------------------------------------------------------------------------
// The end of the week
// ---------------------------------------------------------------------------

export function WeekResult({ camp, picture, onNewWeek, onQuick }: { camp: CampaignState; picture: SimState | null; onNewWeek: () => void; onQuick: () => void }) {
  const [report, setReport] = useState(false);
  const g = campaignGoal(camp);
  const scores = [
    { key: 'value', label: 'Business value', display: money(g.value), target: money(g.target), met: g.met.value },
    { key: 'rep', label: 'Reputation', display: `${Math.round(g.reputation)}`, target: `${K.objective.reputation}`, met: g.met.reputation },
    { key: 'team', label: 'Team', display: `${Math.round(g.wellbeing)}`, target: `${K.objective.wellbeing}`, met: g.met.wellbeing },
  ];
  const met = scores.filter((s) => s.met).length;
  const best = [...camp.results].sort((a, b) => b.profit - a.profit)[0];
  const invested = camp.equipment;
  const takeaway = `${met === 3 ? 'A stronger shop than on Sunday.' : g.met.value ? 'The shop is worth more than on Sunday.' : `Business value ended ${money(g.target - g.value)} short of the goal.`} Best day: ${weekdayName(best?.day ?? 6)}, ${money(best?.profit ?? 0)} profit.${invested > 0 ? ` You put ${money(invested)} into equipment.` : ''}`;
  return (
    <main className="result" id="main">
      <section className="result-card" aria-labelledby="week-h">
        <div className="result-head">
          {picture && <ShopPicture state={picture} label="The shop on Saturday night" />}
          <div>
            <p className="panel-kicker">The end of the week</p>
            <h1 id="week-h">Week complete</h1>
            <p className="result-outcome">
              {met} of 3 goals met
            </p>
          </div>
        </div>
        <ul className="scores" aria-label="Scores">
          {scores.map((x) => (
            <li key={x.key} className={`score ${x.met ? 'met' : 'missed'}`}>
              <span className="score-label">{x.label}</span>
              <span className="score-value">
                {x.display} <span className="score-target">/ {x.target}</span>
              </span>
              <span className="score-mark">
                <span aria-hidden="true">{x.met ? '✓' : '✗'}</span> {x.met ? 'Met' : 'Missed'}
              </span>
            </li>
          ))}
        </ul>
        {!report && <p className="takeaway">{takeaway}</p>}
        {report && (
          <div className="report-panel">
            <table className="mini-table">
              <thead>
                <tr>
                  <th scope="col">Day</th>
                  <th scope="col">Profit</th>
                  <th scope="col">Goal</th>
                  <th scope="col">Customers</th>
                  <th scope="col">Gave up</th>
                  <th scope="col">Reputation</th>
                  <th scope="col">Business value</th>
                </tr>
              </thead>
              <tbody>
                {camp.results.map((r) => (
                  <tr key={r.day}>
                    <th scope="row">{weekdayName(r.day)}</th>
                    <td>{money(r.profit)}</td>
                    <td>{r.met ? '✓' : '✗'} {money(r.target)}</td>
                    <td>{Math.round(r.customers)}</td>
                    <td>{Math.round(r.walkouts)}</td>
                    <td>{Math.round(r.reputationAfter)}</td>
                    <td>{money(r.valueEnd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <ValueLines camp={camp} />
          </div>
        )}
        <div className="result-actions">
          <button type="button" className="btn-primary btn-run" onClick={onNewWeek} autoFocus>
            Play another week
          </button>
          <button type="button" className="btn-secondary" aria-expanded={report} onClick={() => setReport((r) => !r)}>
            {report ? 'Hide report' : 'View report'}
          </button>
          <button type="button" className="btn-link" onClick={onQuick}>
            Quick play
          </button>
        </div>
      </section>
    </main>
  );
}

export function FailedWeek({ camp, onRestart, onNewWeek }: { camp: CampaignState; onRestart: () => void; onNewWeek: () => void }) {
  return (
    <main className="result" id="main">
      <section className="result-card">
        <p className="panel-kicker">{weekdayName(Math.max(0, camp.day - 1))}</p>
        <h1>The bank has called time</h1>
        <p className="takeaway">{camp.failed} The shop can’t buy stock or pay wages tomorrow, so the week ends here.</p>
        <div className="result-actions">
          <button type="button" className="btn-primary btn-run" onClick={onRestart} autoFocus>
            Restart {weekdayName(Math.max(0, camp.day - 1))}
          </button>
          <button type="button" className="btn-link" onClick={onNewWeek}>
            Start a new week
          </button>
        </div>
      </section>
    </main>
  );
}

/** The closed day's shop, drawn with whatever has just been bought for tomorrow. */
export function closingPicture(closed: SimState, campAfter: CampaignState): SimState {
  if (campAfter.day >= CAMPAIGN_DAYS) return closed;
  return { ...closed, ctx: { ...dayContext(campAfter), hours: closed.ctx.hours } };
}
