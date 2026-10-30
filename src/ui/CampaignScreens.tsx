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
import { ShopScreen } from './ShopScreen';
import { Clock, CueArt, EquipArt, Lorry, Person, ResultIcon, Sunrise, SPECIALITY_LABEL, SpecialitySymbol, type CueId, type EquipId } from './Illustrations';
import { SPECIALITY_TEXT } from '../sim/roster';
import type { ShopNotice, ZoneId } from './Store';

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

interface Cue {
  id: CueId;
  label: string;
  zones: ZoneId[];
  text: string;
}

/** Three things worth knowing today, as pictures: they point at places in the shop and assign nobody. */
function cuesFor(camp: CampaignState, ctx: ReturnType<typeof dayContext>): Cue[] {
  const all: Record<CueId, Cue> = {
    serve: { id: 'serve', label: 'Serve', zones: ['tills'], text: `Each open till serves about ${CONFIG.checkout.customersPerHour} customers an hour. Waits over ${CONFIG.checkout.patienceMinutes} minutes start losing shoppers.` },
    restock: { id: 'restock', label: 'Restock', zones: ctx.depts.filter((d) => d !== 'chilled'), text: 'Shoppers only buy what is on the shelf. Whoever fills a department moves stock out from the stockroom.' },
    rest: { id: 'rest', label: 'Rest', zones: ['break'], text: 'Energy falls while working. Half an hour in the break room restores it; tired people work slower.' },
    unload: { id: 'unload', label: 'Unload', zones: ['dock'], text: `The midday lorry${ctx.middayHour !== null ? ` (${hourLabel(ctx.middayHour)})` : ''} leaves stock on the dock. Someone must unload it before shelves can be filled from it.` },
    prices: { id: 'prices', label: 'Prices', zones: ctx.depts, text: 'During the day, click a department, then Change prices, to compare Low, Regular and High.' },
    chilled: { id: 'chilled', label: 'Chilled', zones: ['chilled'], text: 'Chilled needs filling like any shelf, and spoils quickly if left on the dock.' },
  };
  const ids: CueId[] =
    camp.day === 1 ? ['unload', 'restock', 'rest'] : camp.day === 2 ? ['prices', 'serve', 'rest'] : ctx.depts.includes('chilled') ? ['serve', 'chilled', 'rest'] : ['serve', 'restock', 'rest'];
  return ids.map((x) => all[x]);
}

/** The shop before opening, with an illustrated briefing: when, how busy, what stock arrives, what it costs, today's goal. */
export function MorningScreen({ camp, onOpen, reduced }: { camp: CampaignState; onOpen: (s: SetupPlan) => void; reduced: boolean }) {
  const [order, setOrder] = useState<SetupPlan>(() => recommendOrder(camp));
  const [adjust, setAdjust] = useState(false);
  const [cue, setCue] = useState<CueId | null>(null);
  const [orderInfo, setOrderInfo] = useState(false);
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
  const set = (d: DeptId, k: 'morning' | 'midday', v: number) => setOrder((o) => ({ ...o, orders: { ...o.orders, [d]: { ...o.orders[d], [k]: Math.max(0, Math.round(v)) } } }));
  const setLife = (k: 'morning' | 'midday', l: ChilledLife) => setOrder((o) => ({ ...o, chilledLife: { ...o.chilledLife, [k]: l } }));
  const cues = cuesFor(camp, ctx);
  const active = cues.find((c) => c.id === cue) ?? null;

  // Stock labels beside the shelves, and the midday lorry by the dock.
  const notices: ShopNotice[] = ctx.depts.map((d) => {
    const n = order.orders[d].morning;
    return n > 0 ? { zone: d, text: `+${n} arriving`, tone: 'good' as const } : { zone: d, text: `${Math.round(have[d])} in stock · No order`, tone: 'info' as const };
  });
  const midday = ctx.depts.reduce((t, d) => t + order.orders[d].midday, 0);
  if (ctx.middayHour !== null && midday > 0) notices.push({ zone: 'dock', text: `Lorry ${hourLabel(ctx.middayHour)} · +${midday}`, tone: 'info' });

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
      focus={active ? { staff: [], zones: active.zones } : undefined}
      notices={notices}
      primary={{
        label: 'Confirm order & open ▶',
        onClick: () => onOpen(order),
        disabled: check.errors.length > 0,
        note: check.errors[0] ?? `Buys this order for ${money(check.cost)} and starts trading${after < 0 ? ` (uses ${money(-after)} of the overdraft)` : ''}`,
        noteTone: check.errors.length ? 'bad' : undefined,
      }}
      panel={() => (
        <div className="panel-inner briefing">
          <h2 className="sr-only">Before opening: {weekdayName(camp.day)}</h2>
          <DayMarkers day={camp.day} />
          <div className="brief-row">
            <Clock hour={9} />
            <strong className="brief-hours">
              {hourLabel(0)}–{hourLabel(cfg.hours)}
            </strong>
            <span className="today-badge">Today: {pounds(cfg.profitTarget)} profit</span>
          </div>
          <MiniForecast forecast={sc.forecast} />

          {adjust ? (
            <div className="order-edit">
              <p className="brief-sub">Adjust order</p>
              <ul className="order-list">
                {ctx.depts.map((d) => (
                  <li key={d}>
                    <span className="ol-dept">{deptName(d)}</span>
                    <span className="ol-edit">
                      {/* orders.morning: put away by the night crew before opening. */}
                      <span className="ol-delivery">
                        <span className="ol-when">
                          <Sunrise /> Before opening
                        </span>
                        <Qty label={`${deptName(d)}: before opening`} value={order.orders[d].morning} onChange={(v) => set(d, 'morning', v)} />
                      </span>
                      {/* orders.midday: reaches the dock at the day's midday hour; only on days that have one. */}
                      {ctx.middayHour !== null && (
                        <span className="ol-delivery">
                          <span className="ol-when">
                            <Lorry /> Delivery at {hourLabel(ctx.middayHour)}
                          </span>
                          <Qty label={`${deptName(d)}: delivery at ${hourLabel(ctx.middayHour)}`} value={order.orders[d].midday} onChange={(v) => set(d, 'midday', v)} />
                        </span>
                      )}
                    </span>
                    {d === 'chilled' && (
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
              <div className="brief-links">
                <button type="button" className="btn-link" onClick={() => setOrder(recommendOrder(camp))}>
                  Recommended order
                </button>
                <button type="button" className="btn-action" onClick={() => setAdjust(false)}>
                  Done
                </button>
              </div>
            </div>
          ) : (
            <>
              <ul className="cues" aria-label="Today’s basics">
                {cues.map((c) => (
                  <li key={c.id}>
                    <button type="button" className={`cue ${cue === c.id ? 'on' : ''}`} aria-pressed={cue === c.id} onClick={() => setCue(cue === c.id ? null : c.id)}>
                      <CueArt cue={c.id} />
                      <span>{c.label}</span>
                    </button>
                  </li>
                ))}
              </ul>
              <p className="cue-text" aria-live="polite">
                {active ? active.text : 'Select a picture to see where it happens.'}
              </p>
            </>
          )}

          <div className="order-sum">
            <span>
              Order <strong>{money(check.cost)}</strong>
            </span>
            <span>
              Cash after <strong className={after < 0 ? 'bad' : ''}>{money(after)}</strong>
            </span>
            {!adjust && (
              <button type="button" className="btn-link" onClick={() => setAdjust(true)}>
                Adjust order
              </button>
            )}
            <button type="button" className="info-btn" aria-expanded={orderInfo} aria-label="How the order is worked out" onClick={() => setOrderInfo((x) => !x)}>
              i
            </button>
          </div>
          {orderInfo && <p className="report-note">Recommended from today’s forecast, the stock already in the shop, the shelf and stockroom space, and your cash.</p>}
          <WeekGoals camp={camp} />
        </div>
      )}
    />
  );
}

function DayMarkers({ day }: { day: number }) {
  return (
    <ol className="days" aria-label={`Day ${day + 1} of ${CAMPAIGN_DAYS}: ${weekdayName(day)}`}>
      {Array.from({ length: CAMPAIGN_DAYS }, (_, i) => (
        <li key={i} className={i < day ? 'past' : i === day ? 'today' : ''} aria-hidden="true">
          {weekdayName(i, true)}
        </li>
      ))}
    </ol>
  );
}

/** "Week goals · 2 of 3 met now", opening to the three goals; the accounting behind a second control. */
export function WeekGoals({ camp }: { camp: CampaignState }) {
  const [open, setOpen] = useState(false);
  const [how, setHow] = useState(false);
  const g = campaignGoal(camp);
  const rows = [
    { label: 'Business value', now: pounds(g.value), target: pounds(g.target), met: g.met.value },
    { label: 'Reputation', now: `${Math.round(g.reputation)}`, target: `${K.objective.reputation}`, met: g.met.reputation },
    { label: 'Team wellbeing', now: `${Math.round(g.wellbeing)}`, target: `${K.objective.wellbeing}`, met: g.met.wellbeing },
  ];
  const met = rows.filter((r) => r.met).length;
  return (
    <div className="week-goals">
      <button type="button" className="tool-btn" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        Week goals · {met} of 3 met now
      </button>
      {open && (
        <div className="wg-body">
          <p className="report-note">Checked on Saturday night, at closing.</p>
          <ul>
            {rows.map((r) => (
              <li key={r.label}>
                <span>{r.label}</span>
                <span>
                  <strong>{r.now}</strong> / {r.target} <span className={r.met ? 'good' : 'muted'}>{r.met ? '✓' : '·'}</span>
                </span>
              </li>
            ))}
          </ul>
          <button type="button" className="btn-link" aria-expanded={how} onClick={() => setHow((h) => !h)}>
            How calculated
          </button>
          {how && (
            <p className="report-note">
              Business value is cash, plus stock and equipment at what they cost, minus any overdraft. The week started at {pounds(camp.startValue)}; the goal is{' '}
              {pounds(K.objective.growth)} more. Buying stock or equipment moves money into the business rather than spending it.
            </p>
          )}
        </div>
      )}
    </div>
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
  const peak = forecast.indexOf(max);
  const total = forecast.reduce((t, x) => t + x, 0);
  return (
    <figure className="mini-fc">
      <figcaption>Expected customers · {total}</figcaption>
      <ol className="mini-forecast" aria-label={`Expected customers: ${forecast.map((f, h) => `${hourLabel(h)} ${f}`).join(', ')}. Busiest ${hourLabel(peak)}.`}>
        {forecast.map((f, h) => (
          <li key={h} aria-hidden="true" className={h === peak ? 'peak' : ''}>
            {h === peak && <span className="mf-peak">busiest</span>}
            <span className="mf-bar" style={{ height: `${Math.max(8, (f / max) * 100)}%` }} />
            <span className="mf-h">{hourLabel(h).slice(0, 2)}</span>
          </li>
        ))}
      </ol>
    </figure>
  );
}

// ---------------------------------------------------------------------------
// Closing: improvements
// ---------------------------------------------------------------------------

interface EquipInfo {
  benefit: string;
  before: string;
  after: string;
}

/** Short, quantified benefits and before/after figures for each piece of equipment. */
function equipInfo(id: EquipId): EquipInfo {
  const U = K.upgrades;
  switch (id) {
    case 'till3':
      return { benefit: `+${CONFIG.checkout.customersPerHour} customers/hour`, before: `${K.startTills} tills`, after: `${K.startTills + 1} tills` };
    case 'shelfProduce':
      return { benefit: `+${U.shelfProduce.extra} on display`, before: `${K.shelf.produce}`, after: `${K.shelf.produce + U.shelfProduce.extra}` };
    case 'shelfAmbient':
      return { benefit: `+${U.shelfAmbient.extra} on shelves`, before: `${K.shelf.ambient}`, after: `${K.shelf.ambient + U.shelfAmbient.extra}` };
    case 'chilled':
      return { benefit: `New range · +${CONFIG.departments.chilled.basket * K.smallChilledRange} items per shopper`, before: 'No chilled', after: `${K.shelf.chilled} on shelf` };
    case 'shelfChilled':
      return { benefit: 'Full range · twice the chilled sales', before: `${K.shelf.chilled}`, after: `${K.shelf.chilled + U.shelfChilled.extra}` };
    case 'fridge':
      return { benefit: 'No cabinet faults · half the dock spoilage', before: 'Faults possible', after: 'No faults' };
  }
}

function shortReason(o: Offer): string {
  if (!o.reason) return '';
  if (o.reason.startsWith('Needs £')) return `Short of ${money(o.cost - Math.max(0, o.cashAfter + o.cost))}`;
  if (o.reason.startsWith('Available from')) return `From ${o.reason.replace('Available from ', '').replace('.', '').slice(0, 3)}`;
  if (o.reason.startsWith('Needs the chilled')) return 'Needs chilled';
  if (o.reason.startsWith('Already')) return 'Installed';
  return o.reason;
}

/** Hires as portraits and equipment as pictures; selecting one opens its details, buying is a separate action. */
export function Investments({ camp, closed, bought, onBuy, onUndo }: { camp: CampaignState; closed: SimState; bought: UpgradeId[]; onBuy: (id: UpgradeId) => void; onUndo: (id: UpgradeId) => void }) {
  const offers = allOffers(camp, closed);
  // "Suggested" only when the day's results give a reason.
  const suggested = new Set(topOffers(camp, closed).filter((o) => o.why).map((o) => o.id));
  const [sel, setSel] = useState<UpgradeId | null>(null);
  const hires = offers.filter((o) => o.id.startsWith('hire:'));
  // Chilled extras appear once there is a chilled department to extend.
  const equipment = offers.filter((o) => !o.id.startsWith('hire:') && !(o.reason ?? '').startsWith('Already') && !(o.reason ?? '').startsWith('Needs the chilled'));
  const chosen = offers.find((o) => o.id === sel) ?? null;
  const nextHours = dayConfig(camp.day).hours;
  const name = (id: UpgradeId) => (id.startsWith('hire:') ? ROSTER.find((r) => r.id === id.slice(5))?.name ?? id : (K.upgrades[id as EquipId]?.name ?? id));
  return (
    <section className="invest" aria-labelledby="invest-h">
      <div className="invest-head">
        <h2 id="invest-h">Improve the shop</h2>
        {bought.length > 0 && (
          <ul className="bought">
            {bought.map((id) => (
              <li key={id}>
                ✓ {id.startsWith('hire:') ? `Hired ${name(id)}` : name(id)}{' '}
                <button type="button" className="btn-link" onClick={() => onUndo(id)}>
                  Undo
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="invest-body">
        <div className="invest-choices">
          {hires.length > 0 && (
            <ul className="choice-row" aria-label="People you could hire">
              {hires.map((o) => {
                const r = ROSTER.find((x) => x.id === o.id.slice(5))!;
                return (
                  <li key={o.id}>
                    <button type="button" className={`choice ${sel === o.id ? 'on' : ''} ${o.available ? '' : 'off'}`} aria-pressed={sel === o.id} onClick={() => setSel(sel === o.id ? null : o.id)}>
                      <Person id={r.id} />
                      <strong>{r.name}</strong>
                      <span className="spec">
                        <SpecialitySymbol s={r.speciality} /> {SPECIALITY_LABEL[r.speciality]}
                      </span>
                      <span className="choice-cost">
                        {pounds(o.cost)} hire · {money(CONFIG.wagePerHour)}/hour
                      </span>
                      {!o.available && <span className="choice-off">{shortReason(o)}</span>}
                      {o.available && suggested.has(o.id) && <span className="choice-tag">Suggested</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <ul className="choice-row" aria-label="Equipment">
            {equipment.map((o) => {
              const id = o.id as EquipId;
              return (
                <li key={o.id}>
                  <button type="button" className={`choice ${sel === o.id ? 'on' : ''} ${o.available ? '' : 'off'}`} aria-pressed={sel === o.id} onClick={() => setSel(sel === o.id ? null : o.id)}>
                    <EquipArt id={id} after />
                    <strong>{o.name}</strong>
                    <span className="choice-benefit">{equipInfo(id).benefit}</span>
                    <span className="choice-cost">{pounds(o.cost)}</span>
                    {!o.available && <span className="choice-off">{shortReason(o)}</span>}
                    {o.available && suggested.has(o.id) && <span className="choice-tag">Suggested</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
        <div className="invest-detail" aria-live="polite">
          {!chosen ? (
            <p className="muted">Select a person or a piece of equipment to see what it would do. Saving the money is fine too.</p>
          ) : chosen.id.startsWith('hire:') ? (
            <HireDetail o={chosen} hours={nextHours} nextDay={weekdayName(camp.day)} onBuy={() => { onBuy(chosen.id); setSel(null); }} />
          ) : (
            <EquipDetail o={chosen} onBuy={() => { onBuy(chosen.id); setSel(null); }} />
          )}
        </div>
      </div>
    </section>
  );
}

function HireDetail({ o, hours, nextDay, onBuy }: { o: Offer; hours: number; nextDay: string; onBuy: () => void }) {
  const r = ROSTER.find((x) => x.id === o.id.slice(5))!;
  return (
    <div className="detail">
      <div className="detail-head">
        <Person id={r.id} pose="stand" />
        <div>
          <strong>{r.name}</strong>
          <span className="spec">
            <SpecialitySymbol s={r.speciality} /> {SPECIALITY_LABEL[r.speciality]}
          </span>
        </div>
      </div>
      <p>{SPECIALITY_TEXT[r.speciality]}.</p>
      <dl className="facts">
        <dt>Hiring</dt>
        <dd>{pounds(o.cost)} now</dd>
        <dt>Wages {nextDay}</dt>
        <dd>
          about {money(CONFIG.wagePerHour * hours)} ({hours} hours)
        </dd>
        <dt>Cash after</dt>
        <dd className={o.cashAfter < 0 ? 'bad' : ''}>{money(o.cashAfter)}</dd>
      </dl>
      {o.available ? (
        <button type="button" className="btn-primary" onClick={onBuy}>
          Hire {r.name}
        </button>
      ) : (
        <p className="bad">{o.reason}</p>
      )}
    </div>
  );
}

function EquipDetail({ o, onBuy }: { o: Offer; onBuy: () => void }) {
  const id = o.id as EquipId;
  const info = equipInfo(id);
  return (
    <div className="detail">
      <strong>{o.name}</strong>
      <div className="before-after" aria-label={`Before: ${info.before}. After: ${info.after}.`}>
        <figure>
          <EquipArt id={id} after={false} w={96} h={58} />
          <figcaption>Now · {info.before}</figcaption>
        </figure>
        <span aria-hidden="true">→</span>
        <figure>
          <EquipArt id={id} after w={96} h={58} />
          <figcaption>After · {info.after}</figcaption>
        </figure>
      </div>
      <dl className="facts">
        <dt>Cost</dt>
        <dd>{pounds(o.cost)}</dd>
        {o.recurring && (
          <>
            <dt>Running</dt>
            <dd>{o.recurring}</dd>
          </>
        )}
        <dt>Cash after</dt>
        <dd className={o.cashAfter < 0 ? 'bad' : ''}>{money(o.cashAfter)}</dd>
      </dl>
      {o.available ? (
        <button type="button" className="btn-primary" onClick={onBuy}>
          Buy {o.name.charAt(0).toLowerCase() + o.name.slice(1)}
        </button>
      ) : (
        <p className="bad">{o.reason}</p>
      )}
    </div>
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

export function WeekResult({ camp, onNewWeek, onQuick }: { camp: CampaignState; onNewWeek: () => void; onQuick: () => void }) {
  const [report, setReport] = useState(false);
  const g = campaignGoal(camp);
  const scores = [
    { key: 'value' as const, label: 'Business value', display: pounds(g.value), target: pounds(g.target), met: g.met.value },
    { key: 'customers' as const, label: 'Reputation', display: `${Math.round(g.reputation)}`, target: `${K.objective.reputation}`, met: g.met.reputation },
    { key: 'staff' as const, label: 'Team wellbeing', display: `${Math.round(g.wellbeing)}`, target: `${K.objective.wellbeing}`, met: g.met.wellbeing },
  ];
  const met = scores.filter((s) => s.met).length;
  const best = [...camp.results].sort((a, b) => b.profit - a.profit)[0];
  const invested = camp.equipment;
  const takeaway = `${met === 3 ? 'A stronger shop than on Sunday.' : g.met.value ? 'The shop is worth more than on Sunday.' : `Business value ended ${money(g.target - g.value)} short of the goal.`} Best day: ${weekdayName(best?.day ?? 6)}, ${money(best?.profit ?? 0)} profit.${invested > 0 ? ` You put ${money(invested)} into equipment.` : ''}`;
  return (
    <main className="result" id="main">
      <section className="result-card" aria-labelledby="week-h">
        <div className="result-top">
          <div>
            <p className="panel-kicker">Saturday night</p>
            <h1 id="week-h">Week complete</h1>
          </div>
          <ul className="indicators" aria-label={`${met} of 3 goals met`}>
            {scores.map((x) => (
              <li key={x.key} className={x.met ? 'met' : 'missed'}>
                <ResultIcon kind={x.key} />
                <span className="ind-text">
                  <span className="ind-label">{x.label}</span>
                  <span className="ind-value">{x.display}</span>
                  <span className="ind-target">
                    <span aria-hidden="true">{x.met ? '✓' : '✗'}</span> target {x.target}
                    <span className="sr-only">{x.met ? ', met' : ', missed'}</span>
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
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
