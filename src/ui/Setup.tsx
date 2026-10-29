import { useState } from 'react';
import { CONFIG, DEPTS, PRICE_TIERS, deptName, hourLabel, type ChilledLife, type DeptId, type PriceTier } from '../sim/config';
import { carriedQty, checkSetup, deliveryUnitCost, money, recommendedSetup } from '../sim/engine';
import { makeScenario } from '../sim/scenario';
import type { SetupPlan } from '../sim/types';
import { Opening } from './Opening';

interface Props {
  seed: number;
  onConfirm: (s: SetupPlan) => void;
  onLearn: () => void;
  returning: boolean;
}

export function Setup({ seed, onConfirm, onLearn, returning }: Props) {
  const [mode, setMode] = useState<'opening' | 'custom'>('opening');
  if (mode === 'custom') return <CustomSetup seed={seed} onConfirm={onConfirm} onBack={() => setMode('opening')} />;
  return <Opening seed={seed} returning={returning} onLearn={onLearn} onStart={() => onConfirm(recommendedSetup())} onCustom={() => setMode('custom')} />;
}

const LIFE_TAG: Record<ChilledLife, string> = { short: 'Expires tonight', long: 'Keeps till Wednesday' };

function CustomSetup({ seed, onConfirm, onBack }: { seed: number; onConfirm: (s: SetupPlan) => void; onBack: () => void }) {
  const [setup, setSetup] = useState<SetupPlan>(() => recommendedSetup());
  const [tab, setTab] = useState<DeptId>('produce');
  const scenario = makeScenario(seed);
  const check = checkSetup(setup, scenario.forecast);

  const setQty = (d: DeptId, k: 'morning' | 'midday', v: number) =>
    setSetup((s) => ({ ...s, orders: { ...s.orders, [d]: { ...s.orders[d], [k]: Math.max(0, Math.round(v)) } } }));
  const setTier = (d: DeptId, t: PriceTier) => setSetup((s) => ({ ...s, pricing: { ...s.pricing, [d]: t } }));
  const setLife = (k: 'morning' | 'midday', l: ChilledLife) => setSetup((s) => ({ ...s, chilledLife: { ...s.chilledLife, [k]: l } }));

  const d = tab;
  const cfg = CONFIG.departments[d];
  const o = setup.orders[d];
  const pd = check.perDept[d];
  const carried = carriedQty(d);
  const space = cfg.shelfCapacity + cfg.backroomCapacity;
  const m = pd.midday;
  const deptError = (x: DeptId) => !check.perDept[x].morningFits;

  return (
    <main className="custom" id="main">
      <div className="custom-head">
        <button type="button" className="btn-link" onClick={onBack}>
          ← Back
        </button>
        <h1>Custom setup</h1>
      </div>

      <div className="dept-tabs" role="tablist" aria-label="Departments">
        {DEPTS.map((x) => (
          <button
            key={x}
            id={`tab-${x}`}
            role="tab"
            type="button"
            aria-selected={tab === x}
            aria-controls="dept-panel"
            className={`dept-tab ${tab === x ? 'dept-tab-on' : ''}`}
            onClick={() => setTab(x)}
          >
            <span>{deptName(x)}</span>
            <span className="dept-tab-cost">
              {money(check.perDept[x].cost)}
              {deptError(x) && <strong className="bad"> · too much</strong>}
            </span>
          </button>
        ))}
      </div>

      <section className="dept-panel" id="dept-panel" role="tabpanel" aria-labelledby={`tab-${d}`}>
        <div className="order-rows">
          <OrderRow
            id={`${d}-morning`}
            title="Morning delivery"
            tag="Ready at opening"
            dept={deptName(d)}
            value={o.morning}
            onChange={(v) => setQty(d, 'morning', v)}
            life={d === 'chilled' ? setup.chilledLife.morning : undefined}
            onLife={(l) => setLife('morning', l)}
          />
          <OrderRow
            id={`${d}-midday`}
            title="Midday delivery"
            tag={`Delivery: ${hourLabel(CONFIG.openingOrder.middayHour)}`}
            dept={deptName(d)}
            value={o.midday}
            onChange={(v) => setQty(d, 'midday', v)}
            life={d === 'chilled' ? setup.chilledLife.midday : undefined}
            onLife={(l) => setLife('midday', l)}
          />
        </div>

        <fieldset className="price-row big-seg">
          <legend>Price</legend>
          {PRICE_TIERS.map((t) => (
            <label key={t} className={`seg ${setup.pricing[d] === t ? 'seg-on' : ''}`}>
              <input type="radio" name={`setup-price-${d}`} checked={setup.pricing[d] === t} onChange={() => setTier(d, t)} />
              {CONFIG.pricing[t].label} {money(cfg.standardPrice * CONFIG.pricing[t].priceMult)}
            </label>
          ))}
        </fieldset>

        <dl className="dept-facts">
          <div>
            <dt>Cost</dt>
            <dd>{money(pd.cost)}</dd>
          </div>
          <div>
            <dt>Space at opening</dt>
            <dd className={pd.morningFits ? '' : 'bad'}>
              {carried + o.morning} / {space}
              <span className="capacity-bar" aria-hidden="true">
                <span className={`capacity-fill ${pd.morningFits ? '' : 'over'}`} style={{ width: `${Math.min(1, (carried + o.morning) / space) * 100}%` }} />
              </span>
            </dd>
          </div>
          <div>
            <dt>At {hourLabel(CONFIG.openingOrder.middayHour)}</dt>
            <dd className={m.overflow > 0 && (m.clearsBy === null || m.clearsBy > CONFIG.openingOrder.middayHour + 1) ? 'bad' : ''}>
              {o.midday === 0
                ? 'No delivery'
                : m.overflow > 0
                  ? `Estimated overflow: ${Math.round(m.overflow)}${m.clearsBy !== null ? ` · clears ~${hourLabel(m.clearsBy)}` : ' · won’t fit today'}`
                  : 'Fits'}
            </dd>
          </div>
          {d !== 'ambient' && (
            <div>
              <dt>Left from Friday</dt>
              <dd>{d === 'produce' ? `${carried} · expire 13:00` : `${carried} · expire tonight`}</dd>
            </div>
          )}
        </dl>

        <details className="setup-details">
          <summary>Details</summary>
          <ul>
            <li>
              Carried from Friday: {carried}. Shelf holds {cfg.shelfCapacity}, stockroom {cfg.backroomCapacity}.
            </li>
            <li>
              Unit cost:{' '}
              {d === 'chilled'
                ? `${money(CONFIG.chilledLife.short.unitCost)} short-dated, ${money(CONFIG.chilledLife.long.unitCost)} longer-life`
                : money(cfg.unitCost)}
              .
            </li>
            <li>
              Forecast sales before {hourLabel(CONFIG.openingOrder.middayHour)}: about {Math.round(carried + o.morning - m.expectedLeft)}, leaving about{' '}
              {Math.round(m.expectedLeft)} and room for about {Math.round(m.room)}. Overflow waits on the dock until shelves sell down
              {d === 'chilled' ? '; chilled on the dock spoils' : ''}. Estimate assumes the forecast and full shelves.
            </li>
            <li>
              Demand today: about {Math.round(scenario.forecast.reduce((t, x) => t + x, 0) * cfg.basket * CONFIG.pricing[setup.pricing[d]].demandMult)} items at{' '}
              {CONFIG.pricing[setup.pricing[d]].label.toLowerCase()} prices (value +{Math.round((CONFIG.pricing.value.demandMult - 1) * 100)}%, premium −
              {Math.round((1 - CONFIG.pricing.premium.demandMult) * 100)}%).
            </li>
            {d === 'chilled' && <li>“Use by Sunday” stock unsold at 17:00 is binned: the shop is closed on Sundays.</li>}
            {d === 'produce' && <li>Fruit on display bruises slowly, about 1.5% an hour.</li>}
            {d === 'ambient' && <li>Tins and packets keep; leftovers are next week’s stock.</li>}
            <li>Unsold stock keeps its value at cost. Waste is what costs money.</li>
          </ul>
          <button type="button" className="btn-link" onClick={() => setSetup(recommendedSetup())}>
            Reset all to recommended
          </button>
        </details>
      </section>

      <footer className="setup-footer" aria-label="Order total">
        <div>
          <span className="foot-label">Order</span>
          <strong>{money(check.cost)}</strong>
        </div>
        <div>
          <span className="foot-label">Cash left</span>
          <strong className={check.cashAfter < 0 ? 'bad' : ''}>{money(check.cashAfter)}</strong>
        </div>
        <div className="foot-msg" role="status">
          {check.errors[0] ?? ''}
        </div>
        <button type="button" className="btn-primary btn-start-small" disabled={check.errors.length > 0} onClick={() => onConfirm(setup)}>
          Start shift
        </button>
      </footer>
    </main>
  );
}

function OrderRow({
  id,
  title,
  tag,
  dept,
  value,
  onChange,
  life,
  onLife,
}: {
  id: string;
  title: string;
  tag: string;
  dept: string;
  value: number;
  onChange: (v: number) => void;
  life?: ChilledLife;
  onLife: (l: ChilledLife) => void;
}) {
  const step = 20;
  return (
    <div className="order-row">
      <div className="order-row-head">
        <label htmlFor={id}>
          {title}
          <span className="sr-only"> of {dept}</span>
        </label>
        <span className="chip">{tag}</span>
      </div>
      <span className="qty-row">
        <button type="button" className="btn-qty" aria-label={`20 fewer: ${dept} ${title.toLowerCase()}`} onClick={() => onChange(Math.max(0, value - step))}>
          −
        </button>
        <input id={id} type="number" inputMode="numeric" min={0} step={step} value={value} onChange={(e) => onChange(Number(e.target.value) || 0)} />
        <button type="button" className="btn-qty" aria-label={`20 more: ${dept} ${title.toLowerCase()}`} onClick={() => onChange(value + step)}>
          +
        </button>
      </span>
      {life && (
        <fieldset className="price-row">
          <legend className="sr-only">{title} dates</legend>
          {(['short', 'long'] as const).map((l) => (
            <label key={l} className={`seg ${life === l ? 'seg-on' : ''}`}>
              <input type="radio" name={`life-${id}`} checked={life === l} onChange={() => onLife(l)} />
              {money(deliveryUnitCost('chilled', l))} · {LIFE_TAG[l]}
            </label>
          ))}
        </fieldset>
      )}
    </div>
  );
}
