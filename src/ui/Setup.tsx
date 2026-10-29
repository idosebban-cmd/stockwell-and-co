import { useState } from 'react';
import { CONFIG, DEPTS, PRICE_TIERS, deptName, type DeptId, type PriceTier } from '../sim/config';
import { carriedQty, checkSetup, money, recommendedSetup } from '../sim/engine';
import { makeScenario } from '../sim/scenario';
import { ROSTER, SPECIALITY_TEXT } from '../sim/roster';
import type { SetupPlan } from '../sim/types';
import { Forecast } from './Forecast';

interface Props {
  seed: number;
  onConfirm: (s: SetupPlan) => void;
}

const DEPT_NOTES: Record<DeptId, string> = {
  produce: "Friday's 120 items go past their best at 13:00. Bruises on display (about 1.5% an hour).",
  chilled: '60% of each delivery is "use by Sunday" (we are closed Sunday, so binned at close). Spoils fast on the dock.',
  ambient: 'Tins and packets keep. Whatever is left is next week’s stock.',
};

export function Setup({ seed, onConfirm }: Props) {
  const [setup, setSetup] = useState<SetupPlan>(() => recommendedSetup());
  const scenario = makeScenario(seed);
  const check = checkSetup(setup);
  const T = CONFIG.targets;

  const setQty = (d: DeptId, k: 'morning' | 'midday', v: number) =>
    setSetup((s) => ({ ...s, orders: { ...s.orders, [d]: { ...s.orders[d], [k]: Math.max(0, Math.round(v)) } } }));
  const setTier = (d: DeptId, t: PriceTier) => setSetup((s) => ({ ...s, pricing: { ...s.pricing, [d]: t } }));

  return (
    <main className="setup" id="main">
      <section className="setup-intro">
        <h1>Saturday at Stockwell &amp; Co</h1>
        <p className="lede">
          {scenario.curated ? 'Your first Saturday in charge.' : `${scenario.name}.`} Order the stock, set prices, then run the shop for eight hours, 09:00 to 17:00.
        </p>
        <div className="targets-card">
          <h2>To win by closing time</h2>
          <ul>
            <li>
              Operating profit of <strong>{money(T.operatingProfit)}</strong> or more
            </li>
            <li>
              Customer satisfaction of <strong>{T.satisfaction}</strong> or more
            </li>
            <li>
              Staff wellbeing of <strong>{T.wellbeing}</strong> or more
            </li>
          </ul>
        </div>
        <Forecast scenario={scenario} currentHour={-1} knownUpTo={0} />
        <h2>Your team</h2>
        <ul className="team">
          {ROSTER.map((r) => (
            <li key={r.id}>
              <span className="chip-token" aria-hidden="true">
                {r.name.slice(0, 2)}
              </span>
              <div>
                <strong>{r.name}</strong> <span className="tiny">{SPECIALITY_TEXT[r.speciality]}</span>
                <div className="tiny muted">
                  {r.bio}
                  {r.startEnergy < 100 ? ` Starts at ${r.startEnergy} energy.` : ''}
                </div>
              </div>
            </li>
          ))}
        </ul>
        <p className="tiny muted">Anyone can do any job. Wages are {money(CONFIG.wagePerHour)} an hour each; overheads {money(CONFIG.overheadPerDay)} for the day.</p>
      </section>

      <section className="setup-orders" aria-labelledby="orders-h">
        <h2 id="orders-h">Opening order</h2>
        <p className="tiny muted">
          The morning delivery is already put away. The midday lorry reaches the dock at 12:00 and someone has to receive it. Orders are paid upfront; the
          wholesaler remembers 2019.
        </p>
        {DEPTS.map((d) => {
          const cfg = CONFIG.departments[d];
          const o = setup.orders[d];
          const pd = check.perDept[d];
          const carried = carriedQty(d);
          const room = cfg.shelfCapacity + cfg.backroomCapacity;
          const fill = Math.min(1, (carried + o.morning) / room);
          return (
            <fieldset key={d} className="order-card">
              <legend>{deptName(d)}</legend>
              <p className="tiny muted">{DEPT_NOTES[d]}</p>
              <div className="order-grid">
                <QtyInput label="Morning delivery" value={o.morning} onChange={(v) => setQty(d, 'morning', v)} max={pd.space} />
                <QtyInput label="Midday delivery (12:00)" value={o.midday} onChange={(v) => setQty(d, 'midday', v)} max={CONFIG.openingOrder.maxMidday} />
                <div className="order-cost">
                  <span className="tiny muted">Cost at {money(cfg.unitCost)} each</span>
                  <strong>{money(pd.cost)}</strong>
                </div>
              </div>
              <div className="capacity" aria-label={`Opening stock ${carried + o.morning} of ${room} shelf and stockroom space`}>
                <div className="capacity-bar">
                  <span className={`capacity-fill ${pd.morningFits ? '' : 'over'}`} style={{ width: `${fill * 100}%` }} />
                </div>
                <span className="tiny">
                  Opening stock {carried} carried + {o.morning} new = {carried + o.morning} of {room} space (shelf {cfg.shelfCapacity}, stockroom {cfg.backroomCapacity})
                  {!pd.morningFits && <strong className="bad"> · too much</strong>}
                </span>
                {pd.middayOverflow > 0 && (
                  <span className="tiny note-warn">Midday delivery is bigger than the stockroom; the extra waits on the dock until there is room.</span>
                )}
              </div>
              <div className="tiny muted">
                Expected demand today: about {Math.round(scenario.forecast.reduce((t, x) => t + x, 0) * cfg.basket)} items at standard prices.
              </div>
              <div className="price-row">
                <span className="tiny">Prices:</span>
                {PRICE_TIERS.map((t) => (
                  <label key={t} className={`seg ${setup.pricing[d] === t ? 'seg-on' : ''}`}>
                    <input type="radio" name={`setup-price-${d}`} checked={setup.pricing[d] === t} onChange={() => setTier(d, t)} />
                    {CONFIG.pricing[t].label} {money(cfg.standardPrice * CONFIG.pricing[t].priceMult)}
                  </label>
                ))}
              </div>
            </fieldset>
          );
        })}
        <div className="setup-total">
          <div>
            <span className="tiny muted">Starting cash</span>
            <strong>{money(CONFIG.startingCash)}</strong>
          </div>
          <div>
            <span className="tiny muted">Stock to buy</span>
            <strong>{money(check.cost)}</strong>
          </div>
          <div>
            <span className="tiny muted">Cash left to open with</span>
            <strong className={check.cashAfter < 0 ? 'bad' : ''}>{money(check.cashAfter)}</strong>
          </div>
        </div>
        {check.errors.length > 0 && (
          <ul className="errors" role="alert">
            {check.errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        )}
        <div className="setup-buttons">
          <button type="button" className="btn-ghost" onClick={() => setSetup(recommendedSetup())}>
            Use the recommended order
          </button>
          <button type="button" className="btn-primary" disabled={check.errors.length > 0} onClick={() => onConfirm(setup)}>
            Open the doors ▶
          </button>
        </div>
        <p className="tiny muted">Stock you don't sell isn't lost money: it stays on the books at cost. Waste is what hurts.</p>
      </section>
    </main>
  );
}

function QtyInput({ label, value, onChange, max }: { label: string; value: number; onChange: (v: number) => void; max: number }) {
  const step = 20;
  return (
    <label className="qty">
      <span className="tiny">{label}</span>
      <span className="qty-row">
        <button type="button" className="btn-small" aria-label={`Less: ${label}`} onClick={() => onChange(Math.max(0, value - step))}>
          −
        </button>
        <input type="number" inputMode="numeric" min={0} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value) || 0)} />
        <button type="button" className="btn-small" aria-label={`More: ${label}`} onClick={() => onChange(value + step)}>
          +
        </button>
      </span>
    </label>
  );
}
