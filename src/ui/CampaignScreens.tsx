/**
 * Your shop's own screens: before opening (forecast and order) and the
 * improvement offers at closing.
 */
import { useMemo, useState } from 'react';
import { CONFIG } from '../sim/config';
import { defaultPlan, money, pounds, weekdayName } from '../sim/engine';
import { ROSTER } from '../sim/roster';
import {
  allOffers,
  businessValue,
  dayConfig,
  spendable,
  recommendOrder,
  startCampaignDay,
  topOffers,
  type CampaignState,
  type Offer,
  type UpgradeId,
  campaignPool,
  teamLimit,
  weekOf,
} from '../sim/campaign';
import type { SetupPlan, SimState } from '../sim/types';
import { ShopScreen } from './ShopScreen';
import { EquipArt, Person, SPECIALITY_LABEL, SpecialitySymbol, type EquipId } from './Illustrations';
import { SPECIALITY_TEXT } from '../sim/roster';
import { HiringPanel } from './Hiring';

const K = CONFIG.campaign;

export function dayKicker(day: number): string {
  return `${weekdayName(day)} · week ${weekOf(day) + 1}`;
}

// ---------------------------------------------------------------------------
// Before opening
// ---------------------------------------------------------------------------

/** The shop before opening: the morning's stock is already in. One button opens the doors. */
export function MorningScreen({ camp, onOpen, reduced }: { camp: CampaignState; onOpen: (s: SetupPlan) => void; reduced: boolean }) {
  const order = useMemo(() => recommendOrder(camp), [camp]);
  const preview = useMemo(() => startCampaignDay(camp, order), [camp, order]);
  const plan = useMemo(() => defaultPlan(preview), [preview]);
  return (
    <ShopScreen
      state={preview}
      plan={plan}
      setPlan={() => {}}
      phase="plan"
      report={null}
      onRun={() => onOpen(order)}
      onReplayDone={() => {}}
      reduced={reduced}
      replaySpeed="normal"
      steps={6}
      interactive={false}
      primary={{ label: 'Open the shop ▶', onClick: () => onOpen(order) }}
      panel={() => (
        <div className="panel-inner briefing">
          <h2 className="morning-day">{weekdayName(camp.day)}</h2>
          <p className="morning-line">Stock is in!</p>
        </div>
      )}
    />
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
    case 'breakRoom':
      return { benefit: `Team of ${CONFIG.hiring.teamLimit + U.breakRoom.extraTeam} · ${CONFIG.staff.limits.break + U.breakRoom.extraBreak} on a break`, before: `Team of ${CONFIG.hiring.teamLimit}`, after: `Team of ${CONFIG.hiring.teamLimit + U.breakRoom.extraTeam}` };
  }
}

function shortReason(o: Offer, camp: CampaignState): string {
  if (!o.reason) return '';
  if (o.reason.startsWith('Needs £')) return `Short of ${money(o.cost - spendable(camp))}`;
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
  const [hiring, setHiring] = useState(false);
  // Hiring is done from the office; here it's a shortcut to the same candidates (they start tomorrow).
  const pool = campaignPool(camp).filter((p) => !bought.includes(`hire:${p.id}`));
  const hireNames = Object.fromEntries(campaignPool(camp).map((p) => [p.id, p.name]));
  // Chilled extras appear once there is a chilled department to extend.
  const equipment = offers.filter((o) => !o.id.startsWith('hire:') && !(o.reason ?? '').startsWith('Already') && !(o.reason ?? '').startsWith('Needs the chilled'));
  const chosen = offers.find((o) => o.id === sel) ?? null;
  const nextHours = dayConfig(camp.day).hours;
  const name = (id: UpgradeId) => (id.startsWith('hire:') ? (hireNames[id.slice(5)] ?? ROSTER.find((r) => r.id === id.slice(5))?.name ?? id) : (K.upgrades[id as EquipId]?.name ?? id));
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
          <button type="button" className={`choice hire-shortcut ${hiring ? 'on' : ''}`} aria-expanded={hiring} onClick={() => { setHiring((h) => !h); setSel(null); }}>
            <Person id="office" look={pool[0]?.look} />
            <strong>Hire from the office</strong>
            <span className="choice-benefit">{pool.length} looking for work · start tomorrow</span>
          </button>
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
                    {!o.available && <span className="choice-off">{shortReason(o, camp)}</span>}
                    {o.available && suggested.has(o.id) && <span className="choice-tag">Suggested</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
        <div className="invest-detail" aria-live="polite">
          {hiring ? (
            <HiringPanel
              candidates={pool}
              teamSize={camp.staff.length}
              teamLimit={teamLimit(camp)}
              cash={camp.cash}
              step={null}
              hours={nextHours}
              onHire={(p) => onBuy(`hire:${p.id}`)}
              reasonFor={(p) => allOffers(camp, closed).find((o) => o.id === `hire:${p.id}`)?.reason ?? null}
            />
          ) : !chosen ? (
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

/** Business value at closing: the total, how it changed today, and what it is made of. */
export function ValueSummary({ camp }: { camp: CampaignState }) {
  const v = businessValue(camp);
  const before = camp.results.length >= 2 ? camp.results[camp.results.length - 2].valueEnd : camp.startValue;
  const change = v.total - before;
  const parts: [string, number][] = [
    ['Cash', v.cash],
    ['Stock', v.inventory],
    ['Equipment', v.equipment],
  ];
  return (
    <section className="value-sum" aria-label="Business value">
      <p className="value-head">
        <span>Business value</span> <strong>{pounds(v.total)}</strong>{' '}
        <span className={`value-change ${change >= 0 ? 'up' : 'down'}`}>
          {change >= 0 ? '▲ +' : '▼ −'}
          {pounds(Math.abs(change))} today
        </span>
      </p>
      <ul className="value-parts">
        {parts.map(([k, x]) => (
          <li key={k}>
            {k} <strong>{pounds(x)}</strong>
          </li>
        ))}
        {v.debt > 0.5 && (
          <li className="bad">
            Owed <strong>−{pounds(v.debt)}</strong>
          </li>
        )}
      </ul>
    </section>
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
            <th scope="row">{camp.credit > 0.5 ? 'Owed (bank and wholesaler)' : 'Owed to the bank'}</th>
            <td>−{money(v.debt)}</td>
          </tr>
        )}
        <tr className="total">
          <th scope="row">Business value</th>
          <td>{money(v.total)}</td>
        </tr>
        <tr>
          <th scope="row">When you took over</th>
          <td>{money(camp.startValue)}</td>
        </tr>
      </tbody>
    </table>
  );
}
