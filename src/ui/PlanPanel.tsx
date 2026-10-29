import { useMemo, useState } from 'react';
import { CONFIG, DEPTS, PRICE_TIERS, deptName, hourLabel, hourRange, type DeptId, type PriceTier } from '../sim/config';
import {
  actionKey,
  assignmentLimit,
  describeAction,
  deptUnits,
  expectedCustomers,
  money,
  onShift,
  planErrors,
  priceFor,
  productivity,
  shelfCapacity,
  shortDatedUnits,
} from '../sim/engine';
import { previewWarnings, type Note } from '../sim/explain';
import { ASSIGNMENT_LABEL, ROSTER, SPECIALITY_TEXT, TEMP_ENTRY } from '../sim/roster';
import { total } from '../sim/stock';
import { ASSIGNMENTS, type ActionRequest, type AssignmentId, type HourPlan, type SimState, type StaffMember } from '../sim/types';
import { ZONE_JOB, ZONE_NAME, type ZoneId } from './Store';

interface Props {
  state: SimState;
  plan: HourPlan;
  onChange: (p: HourPlan) => void;
  selected: string | null;
  onSelect: (id: string | null) => void;
  context: ZoneId | null;
  onContext: (z: ZoneId | null) => void;
  onRun: () => void;
}

const TIPS: Record<number, string> = {
  0: 'Click a department in the shop to see its stock, prices and actions. To move someone, click them (or their name below), then click where they should work. Each person has a modest speciality, shown on their card.',
  1: 'The break room fits two. Quieter morning hours are the cheapest time for breaks; tired staff slow down later.',
  2: 'The midday lorry reaches the dock at 12:00. Shelves can only be filled from the stockroom, so someone needs to receive it.',
  3: 'Watch the till lanes. Once the wait passes about six minutes, shoppers start to give up and leave their baskets.',
  4: "Friday's leftover produce has just gone past its best. Anything left of it was binned at 13:00.",
  5: 'Short-dated chilled that hasn’t sold by 17:00 is binned. A markdown in the last couple of hours turns some of it into small sales.',
};

export function energyWord(e: number): string {
  if (e < CONFIG.staff.exhaustedBelow) return 'Exhausted';
  if (e < CONFIG.staff.tiredBelow) return 'Tired';
  if (e < 75) return 'Fine';
  return 'Fresh';
}

export function PlanPanel({ state, plan, onChange, selected, onSelect, context, onContext, onRun }: Props) {
  const errors = planErrors(state, plan);
  const notes = useMemo(() => previewWarnings(state, plan), [state, plan]);
  const [tab, setTab] = useState<'staff' | 'commercial'>('staff');

  return (
    <div className="panel-inner">
      <section className="hour-head">
        <h2>Planning {hourRange(state.hour)}</h2>
        <p className="muted">
          About <strong>{Math.round(expectedCustomers(state))}</strong> customers expected this hour.
          {state.hour < CONFIG.hours - 1 && <> Next hour: about {Math.round(expectedCustomers(state, state.hour + 1))}.</>}
        </p>
        {state.announcements.length > 0 && (
          <div className="tannoy" role="status">
            <span className="tannoy-label">Tannoy</span>
            <ul>
              {state.announcements.map((a, i) => (
                <li key={i}>{a}</li>
              ))}
            </ul>
          </div>
        )}
        {state.scenario.curated && TIPS[state.hour] && (
          <p className="tip">
            <strong>Tip:</strong> {TIPS[state.hour]}
          </p>
        )}
      </section>

      {context && <ContextCard state={state} plan={plan} onChange={onChange} zone={context} onClose={() => onContext(null)} selected={selected} />}

      <div className="tabs" role="tablist" aria-label="Decisions">
        <button role="tab" type="button" aria-selected={tab === 'staff'} className={tab === 'staff' ? 'tab tab-on' : 'tab'} onClick={() => setTab('staff')}>
          Staff
        </button>
        <button
          role="tab"
          type="button"
          aria-selected={tab === 'commercial'}
          className={tab === 'commercial' ? 'tab tab-on' : 'tab'}
          onClick={() => setTab('commercial')}
        >
          All prices &amp; actions{plan.actions.length ? ` (${plan.actions.length})` : ''}
        </button>
      </div>

      {tab === 'staff' ? (
        <StaffList state={state} plan={plan} onChange={onChange} selected={selected} onSelect={onSelect} />
      ) : (
        <Commercial state={state} plan={plan} onChange={onChange} />
      )}

      <Notes notes={notes} />

      <div className="run-bar">
        {errors.length > 0 && (
          <ul className="errors" role="alert">
            {errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        )}
        <button type="button" className="btn-primary btn-run" disabled={errors.length > 0} onClick={onRun}>
          Run {hourRange(state.hour)} ▶
        </button>
        <p className="tiny muted">Nothing is final until you run the hour. Press R to run.</p>
      </div>
    </div>
  );
}

function Notes({ notes }: { notes: Note[] }) {
  return (
    <section className="notes" aria-labelledby="notes-h">
      <h3 id="notes-h">Shift manager’s notes</h3>
      <p className="tiny muted">Likely issues for this hour, based on the forecast. Not guarantees.</p>
      <ul>
        {notes.map((n, i) => (
          <li key={i} className={`note note-${n.level}`}>
            <span className="note-icon" aria-hidden="true">
              {n.level === 'warn' ? '!' : n.level === 'good' ? '✓' : 'i'}
            </span>
            <span className="sr-only">{n.level === 'warn' ? 'Warning: ' : n.level === 'good' ? 'Good: ' : 'Note: '}</span>
            {n.text}
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Context card: whatever is selected in the shop
// ---------------------------------------------------------------------------

function ContextCard({
  state,
  plan,
  onChange,
  zone,
  onClose,
  selected,
}: {
  state: SimState;
  plan: HourPlan;
  onChange: (p: HourPlan) => void;
  zone: ZoneId;
  onClose: () => void;
  selected: string | null;
}) {
  const job = ZONE_JOB[zone];
  const people = onShift(state).filter((s) => plan.assignments[s.id] === job);
  const names = people.length ? people.map((s) => s.name).join(', ') : 'nobody';
  return (
    <section className="context-card" aria-labelledby="ctx-h">
      <div className="context-head">
        <h3 id="ctx-h">{ZONE_NAME[zone]}</h3>
        <button type="button" className="btn-ghost btn-small-ghost" onClick={onClose} aria-label={`Close ${ZONE_NAME[zone]} controls`}>
          ✕
        </button>
      </div>
      <p className="tiny">
        {ASSIGNMENT_LABEL[job]}: <strong>{names}</strong> ({people.length}/{assignmentLimit(job)})
        {selected ? '' : '. Select someone, then click here in the shop, to add them.'}
      </p>
      {(zone === 'produce' || zone === 'chilled' || zone === 'ambient') && <DeptDetails state={state} plan={plan} onChange={onChange} d={zone} />}
      {zone === 'tills' && <TillDetails state={state} plan={plan} onChange={onChange} />}
      {zone === 'dock' && <DockDetails state={state} plan={plan} onChange={onChange} />}
      {zone === 'break' && <BreakDetails state={state} plan={plan} />}
    </section>
  );
}

function DeptDetails({ state, plan, onChange, d }: { state: SimState; plan: HourPlan; onChange: (p: HourPlan) => void; d: DeptId }) {
  const u = deptUnits(state, d);
  const cfg = CONFIG.departments[d];
  const cap = shelfCapacity(state, d);
  const wanted = expectedCustomers(state) * cfg.basket * CONFIG.pricing[plan.pricing[d]].demandMult;
  const short = shortDatedUnits(state, d);
  const friday = total([...state.stock.produce.shelf, ...state.stock.produce.backroom].filter((b) => b.label === "Friday's produce"));
  const incoming = state.deliveries.filter((x) => x.dept === d);
  const actions: ActionRequest[] = [];
  if (cfg.perishable) actions.push({ kind: 'markdown', dept: d });
  actions.push({ kind: 'promotion', dept: d }, { kind: 'emergency', dept: d });
  if (d === 'chilled' && state.fridge.status === 'fault') actions.unshift({ kind: 'repair' });
  return (
    <>
      <dl className="facts">
        <dt>On the shelf</dt>
        <dd>
          {Math.round(u.shelf)} of {Math.round(cap)}
          {d === 'chilled' && state.fridge.status === 'fault' ? ' (half the cabinets are broken)' : ''}
        </dd>
        <dt>Stockroom</dt>
        <dd>{Math.round(u.backroom)}</dd>
        {u.dock > 0 && (
          <>
            <dt>On the dock</dt>
            <dd className="bad">{Math.round(u.dock)} waiting to be received</dd>
          </>
        )}
        {incoming.map((x) => (
          <div key={x.id} className="contents">
            <dt>Due {hourLabel(x.arrivesAt)}</dt>
            <dd>
              {Math.round(x.qty)} ({x.kind === 'emergency' ? 'emergency order' : 'midday lorry'}
              {x.life ? `, ${CONFIG.chilledLife[x.life].name.toLowerCase()}` : ''})
            </dd>
          </div>
        ))}
        <dt>Wanted this hour</dt>
        <dd>about {Math.round(wanted)} items</dd>
        {d === 'chilled' && (
          <>
            <dt>Short-dated</dt>
            <dd>{Math.round(short)} must sell by 17:00 or be binned</dd>
          </>
        )}
        {d === 'produce' && state.hour < 4 && friday > 0.5 && (
          <>
            <dt>Friday’s produce</dt>
            <dd>{Math.round(friday)} past its best at 13:00</dd>
          </>
        )}
      </dl>
      <PriceSelector state={state} plan={plan} onChange={onChange} d={d} />
      <ActionList state={state} plan={plan} onChange={onChange} actions={actions} label={(a) => actionShortLabel(a)} />
    </>
  );
}

function TillDetails({ state, plan, onChange }: { state: SimState; plan: HourPlan; onChange: (p: HourPlan) => void }) {
  const tillers = onShift(state).filter((s) => plan.assignments[s.id] === 'tills');
  const cap = tillers.reduce((t, s) => {
    const k = (s.speciality === 'checkout' ? 1 + CONFIG.staff.specialityBonus : 1) * (s.isTemp ? CONFIG.actions.temp.productivity : 1) * productivity(s.energy);
    return t + CONFIG.checkout.customersPerHour * k;
  }, 0);
  return (
    <>
      <dl className="facts">
        <dt>Queue now</dt>
        <dd>{Math.round(state.queue.customers)}</dd>
        <dt>Customers expected</dt>
        <dd>about {Math.round(expectedCustomers(state))} this hour</dd>
        <dt>Till capacity</dt>
        <dd>about {Math.round(cap)} an hour with this staffing</dd>
      </dl>
      <p className="tiny muted">
        One person serves about {CONFIG.checkout.customersPerHour} customers an hour when fresh. Past a {CONFIG.checkout.patienceMinutes}-minute wait, shoppers start to
        give up and leave their baskets.
      </p>
      <ActionList state={state} plan={plan} onChange={onChange} actions={[{ kind: 'temp' }]} label={() => 'Book an agency temp'} />
    </>
  );
}

function DockDetails({ state, plan, onChange }: { state: SimState; plan: HourPlan; onChange: (p: HourPlan) => void }) {
  return (
    <>
      <dl className="facts">
        {DEPTS.map((d) => {
          const u = deptUnits(state, d);
          const space = Math.max(0, CONFIG.departments[d].backroomCapacity - u.backroom);
          return (
            <div key={d} className="contents">
              <dt>{deptName(d)}</dt>
              <dd>
                {u.dock > 0 ? <strong className="bad">{Math.round(u.dock)} waiting</strong> : 'nothing waiting'} · stockroom space {Math.round(space)}
              </dd>
            </div>
          );
        })}
        {state.deliveries.map((x) => (
          <div key={x.id} className="contents">
            <dt>Due {hourLabel(x.arrivesAt)}</dt>
            <dd>
              {Math.round(x.qty)} {deptName(x.dept).toLowerCase()}
            </dd>
          </div>
        ))}
      </dl>
      <p className="tiny muted">
        One person receives about {CONFIG.staff.receiveRate} items an hour, chilled first. Chilled left on the dock spoils quickly; nothing can be received into a full
        stockroom.
      </p>
      <ActionList state={state} plan={plan} onChange={onChange} actions={DEPTS.map((d) => ({ kind: 'emergency', dept: d }) as ActionRequest)} label={(a) => `Emergency: ${'dept' in a ? deptName(a.dept) : ''}`} />
    </>
  );
}

function BreakDetails({ state, plan }: { state: SimState; plan: HourPlan }) {
  const staff = onShift(state).filter((s) => !s.isTemp);
  const owed = staff.filter((s) => s.breaks === 0);
  return (
    <>
      <p className="tiny">
        A break restores {CONFIG.staff.energy.break} energy. Working more than {CONFIG.wellbeing.hoursBeforeBreakNeeded} hours in a row, or running low on energy, adds strain
        that a late rest doesn’t undo.
      </p>
      <ul className="break-list">
        {staff.map((s) => (
          <li key={s.id}>
            <strong>{s.name}</strong> · energy {Math.round(s.energy)} · {s.consecutive}h since rest · {s.breaks ? `${s.breaks} break` : 'no break yet'}
            {plan.assignments[s.id] === 'break' ? ' · on break this hour' : ''}
          </li>
        ))}
      </ul>
      <p className="tiny muted">
        {owed.length} still need{owed.length === 1 ? 's' : ''} a break; {CONFIG.hours - state.hour} hours left and two seats.
      </p>
    </>
  );
}

// ---------------------------------------------------------------------------
// Shared controls
// ---------------------------------------------------------------------------

function PriceSelector({ state, plan, onChange, d }: { state: SimState; plan: HourPlan; onChange: (p: HourPlan) => void; d: DeptId }) {
  const setTier = (t: PriceTier) => onChange({ ...plan, pricing: { ...plan.pricing, [d]: t } });
  return (
    <fieldset className="price-row">
      <legend>{deptName(d)} prices</legend>
      {PRICE_TIERS.map((t) => (
        <label key={t} className={`seg ${plan.pricing[d] === t ? 'seg-on' : ''}`}>
          <input type="radio" name={`price-${d}`} value={t} checked={plan.pricing[d] === t} onChange={() => setTier(t)} />
          {CONFIG.pricing[t].label} <span className="tiny">{money(priceFor(state, d, state.hour, t))}</span>
        </label>
      ))}
    </fieldset>
  );
}

function actionShortLabel(a: ActionRequest): string {
  switch (a.kind) {
    case 'markdown':
      return 'Mark down';
    case 'promotion':
      return 'Promote';
    case 'emergency':
      return 'Emergency order';
    case 'temp':
      return 'Book temp';
    case 'repair':
      return 'Call engineer';
  }
}

function ActionList({
  state,
  plan,
  onChange,
  actions,
  label,
}: {
  state: SimState;
  plan: HourPlan;
  onChange: (p: HourPlan) => void;
  actions: ActionRequest[];
  label: (a: ActionRequest) => string;
}) {
  const [pending, setPending] = useState<ActionRequest | null>(null);
  const add = (a: ActionRequest) => {
    onChange({ ...plan, actions: [...plan.actions, a] });
    setPending(null);
  };
  const remove = (a: ActionRequest) => onChange({ ...plan, actions: plan.actions.filter((x) => actionKey(x) !== actionKey(a)) });
  return (
    <div className="action-list">
      <div className="action-buttons">
        {actions.map((a) => {
          const planned = plan.actions.some((x) => actionKey(x) === actionKey(a));
          const info = describeAction(state, a, plan.actions);
          return (
            <button
              key={actionKey(a)}
              type="button"
              className={`btn-action ${planned ? 'btn-action-on' : ''}`}
              disabled={!planned && !info.available}
              aria-pressed={planned}
              title={info.reason ?? info.effect}
              onClick={() => (planned ? remove(a) : setPending(a))}
            >
              {label(a)}
              {planned ? ' ✓ (undo)' : info.cost > 0 ? ` · ${money(info.cost)}` : ''}
              {!planned && !info.available && <span className="sr-only"> (unavailable: {info.reason})</span>}
            </button>
          );
        })}
      </div>
      {actions.some((a) => !plan.actions.some((x) => actionKey(x) === actionKey(a)) && !describeAction(state, a, plan.actions).available) && (
        <ul className="tiny muted unavailable">
          {actions
            .filter((a) => !plan.actions.some((x) => actionKey(x) === actionKey(a)))
            .map((a) => ({ a, info: describeAction(state, a, plan.actions) }))
            .filter(({ info }) => !info.available)
            .map(({ a, info }) => (
              <li key={actionKey(a)}>
                {label(a)}: {info.reason}
              </li>
            ))}
        </ul>
      )}
      {pending && <ConfirmAction state={state} a={pending} planned={plan.actions} onConfirm={() => add(pending)} onCancel={() => setPending(null)} />}
    </div>
  );
}

function StaffList({ state, plan, onChange, selected, onSelect }: Omit<Props, 'onRun' | 'context' | 'onContext'>) {
  const staff = onShift(state);
  const coming = state.staff.filter((s) => s.availableFrom > state.hour);
  const counts = new Map<AssignmentId, number>();
  for (const s of staff) {
    const a = plan.assignments[s.id];
    if (a) counts.set(a, (counts.get(a) ?? 0) + 1);
  }
  const assign = (id: string, a: AssignmentId) => onChange({ ...plan, assignments: { ...plan.assignments, [id]: a } });

  return (
    <section className="staff-list" aria-label="Staff assignments">
      <ul>
        {staff.map((s) => (
          <StaffRow
            key={s.id}
            s={s}
            a={plan.assignments[s.id]}
            counts={counts}
            selected={selected === s.id}
            onSelect={() => onSelect(selected === s.id ? null : s.id)}
            onAssign={(a) => assign(s.id, a)}
          />
        ))}
      </ul>
      {coming.map((s) => (
        <p key={s.id} className="tiny note-info">
          {s.name} arrives at {hourLabel(s.availableFrom)}.
        </p>
      ))}
    </section>
  );
}

function StaffRow({
  s,
  a,
  counts,
  selected,
  onSelect,
  onAssign,
}: {
  s: StaffMember;
  a: AssignmentId | undefined;
  counts: Map<AssignmentId, number>;
  selected: boolean;
  onSelect: () => void;
  onAssign: (a: AssignmentId) => void;
}) {
  const entry = ROSTER.find((r) => r.id === s.id) ?? TEMP_ENTRY;
  const prod = productivity(s.energy);
  const word = energyWord(s.energy);
  const id = `job-${s.id}`;
  return (
    <li className={`staff-row ${selected ? 'staff-row-selected' : ''}`}>
      <button type="button" className="staff-pick" aria-pressed={selected} onClick={onSelect} title="Select, then click a zone in the shop">
        <span className="staff-name">{s.name}</span>
        <span className="tiny muted">{selected ? 'Selected' : 'Select'}</span>
      </button>
      <div className="staff-info">
        <span className="tiny">{SPECIALITY_TEXT[s.speciality]}</span>
        <div className="energy" aria-label={`Energy ${Math.round(s.energy)} out of 100, ${word}`}>
          <span className="energy-bar">
            <span className={`energy-fill energy-${word.toLowerCase()}`} style={{ width: `${s.energy}%` }} />
          </span>
          <span className="tiny">
            {word} {Math.round(s.energy)}
            {prod < 1 ? ` · ${Math.round(prod * 100)}% speed` : ''}
          </span>
        </div>
        <span className="tiny muted">
          {s.isTemp ? entry.bio : s.breaks > 0 ? `Had ${s.breaks} break${s.breaks > 1 ? 's' : ''}` : 'No break yet'} · {s.consecutive}h since rest
        </span>
      </div>
      <label className="sr-only" htmlFor={id}>
        Job for {s.name}
      </label>
      <select id={id} value={a ?? ''} onChange={(e) => onAssign(e.target.value as AssignmentId)}>
        {ASSIGNMENTS.map((opt) => {
          const n = counts.get(opt) ?? 0;
          const full = n >= assignmentLimit(opt) && opt !== a;
          return (
            <option key={opt} value={opt} disabled={full}>
              {ASSIGNMENT_LABEL[opt]} ({n}/{assignmentLimit(opt)}){full ? ' full' : ''}
            </option>
          );
        })}
      </select>
    </li>
  );
}

function Commercial({ state, plan, onChange }: { state: SimState; plan: HourPlan; onChange: (p: HourPlan) => void }) {
  return (
    <section className="commercial" aria-label="Prices and actions">
      <p className="tiny muted">
        Lower prices bring more demand and goodwill but less margin per item. Higher prices do the opposite. Click a department in the shop for its details.
      </p>
      {DEPTS.map((d) => (
        <div key={d} className="dept-block">
          <PriceSelector state={state} plan={plan} onChange={onChange} d={d} />
          <ActionList
            state={state}
            plan={plan}
            onChange={onChange}
            actions={[
              ...(CONFIG.departments[d].perishable ? [{ kind: 'markdown', dept: d } as ActionRequest] : []),
              { kind: 'promotion', dept: d },
              { kind: 'emergency', dept: d },
              ...(d === 'chilled' && state.fridge.status === 'fault' ? [{ kind: 'repair' } as ActionRequest] : []),
            ]}
            label={actionShortLabel}
          />
        </div>
      ))}
      <div className="dept-block">
        <strong className="tiny">Extra help</strong>
        <ActionList state={state} plan={plan} onChange={onChange} actions={[{ kind: 'temp' }]} label={() => 'Book an agency temp'} />
      </div>
      <p className="tiny muted">
        Limits: markdown once per fresh department, {CONFIG.actions.promotion.maxPerDay} promotions (one at a time), {CONFIG.actions.emergency.maxPerDay} emergency orders, one temp.
      </p>
    </section>
  );
}

function ConfirmAction({
  state,
  a,
  planned,
  onConfirm,
  onCancel,
}: {
  state: SimState;
  a: ActionRequest;
  planned: ActionRequest[];
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const info = describeAction(state, a, planned);
  return (
    <div className="confirm" role="dialog" aria-modal="false" aria-labelledby="confirm-h">
      <h4 id="confirm-h">{info.title}</h4>
      <dl>
        <dt>Cost</dt>
        <dd>{info.cost > 0 ? money(info.cost) : 'Nothing upfront'}</dd>
        <dt>When</dt>
        <dd>{info.timing}</dd>
        <dt>Effect</dt>
        <dd>{info.effect}</dd>
      </dl>
      {!info.available && <p className="note-warn">{info.reason}</p>}
      <div className="confirm-buttons">
        <button type="button" className="btn-primary" disabled={!info.available} onClick={onConfirm} autoFocus>
          Add to this hour’s plan
        </button>
        <button type="button" className="btn-ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
      <p className="tiny muted">You can undo it any time before running the hour.</p>
    </div>
  );
}
