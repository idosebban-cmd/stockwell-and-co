import { useState } from 'react';
import { CONFIG, DEPTS, PRICE_TIERS, deptName, hourLabel, type ChilledLife, type DeptId, type PriceTier } from '../sim/config';
import { carriedQty, checkSetup, deliveryUnitCost, money, recommendedSetup } from '../sim/engine';
import { makeScenario } from '../sim/scenario';
import type { SetupPlan } from '../sim/types';
import { Forecast } from './Forecast';

interface Props {
  seed: number;
  onConfirm: (s: SetupPlan) => void;
}

const DEPT_NOTES: Record<DeptId, string> = {
  produce: '120 items are left from Friday; they go past their best at 13:00. Fruit on display bruises slowly (about 1.5% an hour).',
  chilled: '90 items from Friday are "use by today". You choose the dates on today’s deliveries below.',
  ambient: 'Tins and packets keep. Whatever is left is next week’s stock.',
};

export function Setup({ seed, onConfirm }: Props) {
  const [mode, setMode] = useState<'simple' | 'custom'>('simple');
  const scenario = makeScenario(seed);
  const T = CONFIG.targets;
  const rec = recommendedSetup();
  const recCheck = checkSetup(rec, scenario.forecast);

  if (mode === 'custom') return <CustomOrder seed={seed} onConfirm={onConfirm} onBack={() => setMode('simple')} />;

  return (
    <main className="setup-simple" id="main">
      <section className="opening-card">
        <h1>Saturday at Stockwell &amp; Co</h1>
        <p className="lede">
          {scenario.curated ? 'Your first Saturday in charge.' : `${scenario.name}.`} Run the shop from 09:00 to 17:00: keep the shelves full, the queues short and
          the staff on their feet.
        </p>
        <ul className="target-chips" aria-label="Targets">
          <li>
            <strong>{money(T.operatingProfit)}</strong> profit
          </li>
          <li>
            <strong>{T.satisfaction}+</strong> customer satisfaction
          </li>
          <li>
            <strong>{T.wellbeing}+</strong> staff wellbeing
          </li>
        </ul>
        <Forecast scenario={scenario} currentHour={-1} knownUpTo={0} />
        <div className="rec-card">
          <h2>Recommended opening stock</h2>
          <p>
            <strong>{money(recCheck.cost)}</strong> of stock, leaving <strong>{money(recCheck.cashAfter)}</strong> in cash. It covers the morning; a midday lorry tops
            up at 12:00 and someone will need to receive it. Morning chilled is short-dated (cheaper, sells today); the midday chilled keeps longer. Standard prices
            everywhere.
          </p>
        </div>
        <div className="opening-buttons">
          <button type="button" className="btn-primary btn-big" onClick={() => onConfirm(rec)} autoFocus>
            Start with recommended stock ▶
          </button>
          <button type="button" className="btn-secondary" onClick={() => setMode('custom')}>
            Customise opening order
          </button>
        </div>
        <p className="tiny muted">Each hour you’ll give your six staff jobs and run the shop. “How to play” at the top explains the rest. Progress saves automatically.</p>
      </section>
    </main>
  );
}

function CustomOrder({ seed, onConfirm, onBack }: { seed: number; onConfirm: (s: SetupPlan) => void; onBack: () => void }) {
  const [setup, setSetup] = useState<SetupPlan>(() => recommendedSetup());
  const scenario = makeScenario(seed);
  const check = checkSetup(setup, scenario.forecast);

  const setQty = (d: DeptId, k: 'morning' | 'midday', v: number) =>
    setSetup((s) => ({ ...s, orders: { ...s.orders, [d]: { ...s.orders[d], [k]: Math.max(0, Math.round(v)) } } }));
  const setTier = (d: DeptId, t: PriceTier) => setSetup((s) => ({ ...s, pricing: { ...s.pricing, [d]: t } }));
  const setLife = (k: 'morning' | 'midday', l: ChilledLife) => setSetup((s) => ({ ...s, chilledLife: { ...s.chilledLife, [k]: l } }));

  return (
    <main className="setup" id="main">
      <section className="setup-orders" aria-labelledby="orders-h">
        <div className="setup-orders-head">
          <h1 id="orders-h">Opening order</h1>
          <button type="button" className="btn-ghost" onClick={onBack}>
            ← Back
          </button>
        </div>
        <p className="tiny muted">
          The morning delivery is already put away (shelves first, then the stockroom). The midday lorry reaches the dock at 12:00 and has to be received before it can
          go on the shelves. Orders are paid upfront; the wholesaler remembers 2019. Unsold stock isn’t lost money: it stays on the books at cost. Waste is what hurts.
        </p>
        {DEPTS.map((d) => {
          const cfg = CONFIG.departments[d];
          const o = setup.orders[d];
          const pd = check.perDept[d];
          const carried = carriedQty(d);
          const room = cfg.shelfCapacity + cfg.backroomCapacity;
          const fill = Math.min(1, (carried + o.morning) / room);
          const m = pd.midday;
          const soon = m.clearsBy !== null && m.clearsBy <= CONFIG.openingOrder.middayHour + 1;
          return (
            <fieldset key={d} className="order-card">
              <legend>{deptName(d)}</legend>
              <p className="tiny muted">{DEPT_NOTES[d]}</p>
              <div className="order-grid">
                <QtyInput id={`${d}-morning`} label="Morning delivery" dept={deptName(d)} value={o.morning} onChange={(v) => setQty(d, 'morning', v)} max={pd.space} />
                <QtyInput
                  id={`${d}-midday`}
                  label="Midday delivery (12:00)"
                  dept={deptName(d)}
                  value={o.midday}
                  onChange={(v) => setQty(d, 'midday', v)}
                  max={CONFIG.openingOrder.maxMidday}
                />
                <div className="order-cost">
                  <span className="tiny muted">{d === 'chilled' ? 'Cost depends on dates' : `${money(cfg.unitCost)} each`}</span>
                  <strong>{money(pd.cost)}</strong>
                </div>
              </div>
              {d === 'chilled' && (
                <div className="life-choice">
                  <p className="tiny">
                    <strong>Dates.</strong> We’re closed on Sunday, so “use by Sunday” chilled that hasn’t sold by 17:00 is binned. Longer-life stock costs more but keeps
                    its value if it doesn’t sell.
                  </p>
                  {(['morning', 'midday'] as const).map((k) => (
                    <fieldset key={k} className="price-row">
                      <legend className="tiny">{k === 'morning' ? 'Morning delivery' : 'Midday delivery'}</legend>
                      {(['short', 'long'] as const).map((l) => (
                        <label key={l} className={`seg ${setup.chilledLife[k] === l ? 'seg-on' : ''}`}>
                          <input type="radio" name={`life-${k}`} checked={setup.chilledLife[k] === l} onChange={() => setLife(k, l)} />
                          {CONFIG.chilledLife[l].name} {money(deliveryUnitCost('chilled', l))}{' '}
                          <span className="tiny">({CONFIG.chilledLife[l].label})</span>
                        </label>
                      ))}
                    </fieldset>
                  ))}
                </div>
              )}
              <div className="capacity" aria-label={`Opening stock ${carried + o.morning} of ${room} shelf and stockroom space`}>
                <div className="capacity-bar">
                  <span className={`capacity-fill ${pd.morningFits ? '' : 'over'}`} style={{ width: `${fill * 100}%` }} />
                </div>
                <span className="tiny">
                  At opening: {carried} carried + {o.morning} new = {carried + o.morning} of {room} space (shelf {cfg.shelfCapacity}, stockroom {cfg.backroomCapacity})
                  {!pd.morningFits && <strong className="bad"> · too much</strong>}
                </span>
                {o.midday > 0 && (
                  <span className={`tiny ${m.overflow > 0 ? (soon ? 'note-info' : 'note-warn') : 'muted'}`}>
                    At 12:00 (estimate): forecast sales leave about {Math.round(m.expectedLeft)} in the shop, so there is room for about {Math.round(m.room)}.{' '}
                    {m.overflow > 0
                      ? m.clearsBy !== null
                        ? `About ${Math.round(m.overflow)} would wait on the dock until roughly ${hourLabel(m.clearsBy)} as shelves sell down${d === 'chilled' ? ' (chilled on the dock spoils)' : ''}.`
                        : `About ${Math.round(m.overflow)} may not fit today at all.`
                      : 'It should all fit.'}{' '}
                    Assumes the shelves are kept filled.
                  </span>
                )}
              </div>
              <div className="tiny muted">
                Expected demand today: about {Math.round(scenario.forecast.reduce((t, x) => t + x, 0) * cfg.basket * CONFIG.pricing[setup.pricing[d]].demandMult)} items
                at {CONFIG.pricing[setup.pricing[d]].label.toLowerCase()} prices.
              </div>
              <fieldset className="price-row">
                <legend className="tiny">Prices</legend>
                {PRICE_TIERS.map((t) => (
                  <label key={t} className={`seg ${setup.pricing[d] === t ? 'seg-on' : ''}`}>
                    <input type="radio" name={`setup-price-${d}`} checked={setup.pricing[d] === t} onChange={() => setTier(d, t)} />
                    {CONFIG.pricing[t].label} {money(cfg.standardPrice * CONFIG.pricing[t].priceMult)}
                  </label>
                ))}
              </fieldset>
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
            Reset to recommended
          </button>
          <button type="button" className="btn-primary" disabled={check.errors.length > 0} onClick={() => onConfirm(setup)}>
            Open the doors ▶
          </button>
        </div>
      </section>
      <aside className="setup-side">
        <Forecast scenario={scenario} currentHour={-1} knownUpTo={0} />
        <p className="tiny muted">
          Each customer wants about {CONFIG.departments.produce.basket} fruit & veg, {CONFIG.departments.chilled.basket} chilled and {CONFIG.departments.ambient.basket}{' '}
          cupboard items. Value prices bring about {Math.round((CONFIG.pricing.value.demandMult - 1) * 100)}% more demand; premium about{' '}
          {Math.round((1 - CONFIG.pricing.premium.demandMult) * 100)}% less.
        </p>
      </aside>
    </main>
  );
}

function QtyInput({
  id,
  label,
  dept,
  value,
  onChange,
  max,
}: {
  id: string;
  label: string;
  dept: string;
  value: number;
  onChange: (v: number) => void;
  max: number;
}) {
  const step = 20;
  return (
    <div className="qty">
      <label className="tiny" htmlFor={id}>
        {label}
        <span className="sr-only"> of {dept}</span>
      </label>
      <span className="qty-row">
        <button type="button" className="btn-small" aria-label={`20 fewer: ${dept} ${label.toLowerCase()}`} onClick={() => onChange(Math.max(0, value - step))}>
          −
        </button>
        <input id={id} type="number" inputMode="numeric" min={0} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value) || 0)} />
        <button type="button" className="btn-small" aria-label={`20 more: ${dept} ${label.toLowerCase()}`} onClick={() => onChange(value + step)}>
          +
        </button>
      </span>
    </div>
  );
}
