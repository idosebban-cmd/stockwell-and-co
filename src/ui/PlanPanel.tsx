import { useEffect, useMemo, useRef, useState } from 'react';
import { CONFIG, DEPTS, deptName, hourLabel, hourRange, type DeptId, type PriceTier } from '../sim/config';
import {
  actionKey,
  assignmentLimit,
  describeAction,
  deptUnits,
  expectedCustomers,
  money,
  onShift,
  planErrors,
  productivity,
  shelfCapacity,
  shortDatedUnits,
} from '../sim/engine';
import { previewWarnings } from '../sim/explain';
import {
  fridgeFacts,
  jobPreview,
  outlook as computeOutlook,
  outlookChanges,
  priceModifiers,
  priceOptions,
  priceTradeOff,
  problems as computeProblems,
  type Outlook,
  type Zone,
} from '../sim/insight';
import { ASSIGNMENT_LABEL, ROSTER, SPECIALITY_TEXT, TEMP_ENTRY } from '../sim/roster';
import { total } from '../sim/stock';
import { ASSIGNMENTS, type ActionRequest, type AssignmentId, type HourPlan, type SimState, type StaffMember } from '../sim/types';
import { ZONE_NAME, type ZoneId } from './Store';

export function energyWord(e: number): string {
  if (e < CONFIG.staff.exhaustedBelow) return 'Exhausted';
  if (e < CONFIG.staff.tiredBelow) return 'Tired';
  if (e < 75) return 'Fine';
  return 'Fresh';
}

export interface PanelOptions {
  /** Steps the next run covers (6 = an hour). */
  steps: number;
  /** Purchasing, promotions and the like (off during lessons). */
  allowActions: boolean;
  /** Which departments show the price comparison. */
  pricing: 'all' | DeptId | 'none';
}

interface Props {
  state: SimState;
  plan: HourPlan;
  onChange: (p: HourPlan) => void;
  selected: string | null;
  onSelect: (id: string | null) => void;
  context: ZoneId | null;
  onContext: (z: ZoneId | null) => void;
  onRun: () => void;
  opts?: PanelOptions;
}

export const FULL_GAME: PanelOptions = { steps: 6, allowActions: true, pricing: 'all' };

export function intervalLabel(steps: number): string {
  return steps >= 6 ? 'hour' : `${steps * 10} minutes`;
}

/** The full-game planning panel. */
export function PlanPanel({ state, plan, onChange, selected, onSelect, context, onContext, onRun, opts = FULL_GAME }: Props) {
  const errors = planErrors(state, plan);
  const [tab, setTab] = useState<'staff' | 'commercial'>('staff');
  return (
    <div className="panel-inner">
      <section className="hour-head">
        <h2>{hourRange(state.hour)}</h2>
        <p className="muted">~{Math.round(expectedCustomers(state))} customers expected</p>
        {state.announcements.length > 0 && (
          <div className="tannoy" role="status">
            <ul>
              {state.announcements.map((a, i) => (
                <li key={i}>{a}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {context ? (
        <ContextCard state={state} plan={plan} onChange={onChange} zone={context} onClose={() => onContext(null)} opts={opts} onOpen={onContext} />
      ) : (
        <OutlookPanel state={state} plan={plan} steps={opts.steps} onOpen={onContext} />
      )}

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
          Prices &amp; actions{plan.actions.length ? ` (${plan.actions.length})` : ''}
        </button>
      </div>
      {tab === 'staff' ? (
        <StaffList state={state} plan={plan} onChange={onChange} selected={selected} onSelect={onSelect} />
      ) : (
        <Commercial state={state} plan={plan} onChange={onChange} onOpen={onContext} />
      )}

      <RunBar errors={errors} onRun={onRun} label={`Run ${intervalLabel(opts.steps)} ▶`} plan={plan} state={state} />
    </div>
  );
}

export function RunBar({ errors, onRun, label, plan, state }: { errors: string[]; onRun: () => void; label: string; plan?: HourPlan; state?: SimState }) {
  const spend = plan && state ? plan.actions.reduce((t, a) => t + describeAction(state, a).cost, 0) : 0;
  return (
    <div className="run-bar">
      {errors.length > 0 && (
        <ul className="errors" role="alert">
          {errors.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      )}
      {state && spend > 0 && (
        <p className="tiny run-spend">
          Spending {money(spend)} · cash after {money(state.cash - spend)}
        </p>
      )}
      <button type="button" className="btn-primary btn-run" disabled={errors.length > 0} onClick={onRun}>
        {label}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Outlook: estimates for the coming interval, with what the last move changed
// ---------------------------------------------------------------------------

export function OutlookPanel({ state, plan, steps, onOpen }: { state: SimState; plan: HourPlan; steps: number; onOpen: (z: ZoneId) => void }) {
  const look = useMemo(() => computeOutlook(state, plan, steps), [state, plan, steps]);
  const probs = useMemo(() => computeProblems(state, plan, look), [state, plan, look]);
  const prev = useRef<{ plan: HourPlan; look: Outlook | null } | null>(null);
  const [changes, setChanges] = useState<Partial<Record<Zone, number>>>({});
  useEffect(() => {
    if (prev.current && JSON.stringify(prev.current.plan.assignments) !== JSON.stringify(plan.assignments)) setChanges(outlookChanges(prev.current.look, look));
    prev.current = { plan, look };
  }, [plan, look]);
  useEffect(() => setChanges({}), [state]);
  if (!look) return null;
  const urgent = probs.filter((p) => p.level === 'urgent' && !look.rows.some((r) => r.zone === p.zone && r.status !== 'ok'));
  const notes = previewWarnings(state, plan).filter((n) => n.kind === 'event' || n.kind === 'waste' || (n.kind === 'staff' && n.level === 'warn' && !n.text.includes('reduced capacity')));
  return (
    <section className="outlook" aria-labelledby="outlook-h">
      <h3 id="outlook-h">
        Next {intervalLabel(steps)} <span className="est">estimate</span>
      </h3>
      {urgent.map((p) => (
        <button key={p.title} type="button" className="problem-chip urgent" onClick={() => onOpen(p.zone)}>
          <span aria-hidden="true">!</span> {p.title}
        </button>
      ))}
      <ul className="outlook-rows">
        {look.rows.map((r) => {
          const ratio = r.need > 0 ? Math.min(1, r.can / r.need) : 1;
          const delta = changes[r.zone];
          return (
            <li key={r.zone}>
              <button type="button" className={`outlook-row st-${r.status}`} onClick={() => onOpen(r.zone)} aria-label={`${r.label}: ${r.text}. ${statusWord(r.status)}. Open.`}>
                <span className="or-label">{r.label}</span>
                <span className="or-bar" aria-hidden="true">
                  <span style={{ width: `${ratio * 100}%` }} />
                </span>
                <span className="or-status">{statusWord(r.status)}</span>
                {delta !== undefined && (
                  <span className={`or-delta ${delta > 0 ? 'up' : 'down'}`}>
                    {delta > 0 ? '▲' : '▼'} {Math.abs(Math.round(delta))}
                  </span>
                )}
                <span className="or-text">{r.text}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {look.tired.length > 0 && (
        <button type="button" className="problem-chip" onClick={() => onOpen('break')}>
          Tired: {look.tired.map((t) => `${t.name} ${Math.round(t.productivity * 100)}%`).join(', ')}
        </button>
      )}
      {notes.slice(0, 2).map((n, i) => (
        <p key={i} className="tiny outlook-note">
          {n.text}
        </p>
      ))}
    </section>
  );
}

function statusWord(s: 'ok' | 'tight' | 'short'): string {
  return s === 'ok' ? 'OK' : s === 'tight' ? 'Tight' : 'Short';
}

// ---------------------------------------------------------------------------
// Decision cards: whatever is selected in the shop
// ---------------------------------------------------------------------------

export function ContextCard({
  state,
  plan,
  onChange,
  zone,
  onClose,
  opts = FULL_GAME,
  onOpen,
}: {
  state: SimState;
  plan: HourPlan;
  onChange: (p: HourPlan) => void;
  zone: ZoneId;
  onClose: () => void;
  opts?: PanelOptions;
  onOpen?: (z: ZoneId) => void;
}) {
  return (
    <section className="context-card" aria-labelledby="ctx-h">
      <div className="context-head">
        <h3 id="ctx-h">{ZONE_NAME[zone]}</h3>
        <button type="button" className="callout-x dark" onClick={onClose} aria-label={`Close ${ZONE_NAME[zone]}`}>
          ✕
        </button>
      </div>
      {zone === 'chilled' && state.fridge.status === 'fault' && <FridgeCard state={state} plan={plan} onChange={onChange} allowActions={opts.allowActions} />}
      {(zone === 'produce' || zone === 'chilled' || zone === 'ambient') && <DeptCard state={state} plan={plan} onChange={onChange} d={zone} opts={opts} onOpen={onOpen} />}
      {zone === 'tills' && <TillCard state={state} plan={plan} onChange={onChange} opts={opts} />}
      {zone === 'dock' && <DockCard state={state} plan={plan} onChange={onChange} opts={opts} />}
      {zone === 'break' && <BreakCard state={state} plan={plan} onChange={onChange} />}
    </section>
  );
}

function FridgeCard({ state, plan, onChange, allowActions }: { state: SimState; plan: HourPlan; onChange: (p: HourPlan) => void; allowActions: boolean }) {
  const f = fridgeFacts(state, plan);
  const repair: ActionRequest = { kind: 'repair' };
  const planned = plan.actions.some((a) => a.kind === 'repair');
  const info = describeAction(state, repair, plan.actions.filter((a) => a.kind !== 'repair'));
  return (
    <div className="decision urgent">
      <p className="decision-title">
        <span aria-hidden="true">!</span> Chiller fault: half the cabinets are off
      </p>
      <dl className="facts">
        <dt>Shelf space</dt>
        <dd>
          {Math.round(f.capacity)} of {f.fullCapacity}
        </dd>
        <dt>At risk now</dt>
        <dd className={f.atRisk > 0 ? 'bad' : ''}>
          {Math.round(f.atRisk)} items · {money(f.atRiskValue)}
        </dd>
        <dt>If you wait</dt>
        <dd>Stranded stock spoils (~{f.spoilPerHour}%/h); shelf stays half size</dd>
      </dl>
      <div className="responses">
        <div className="response">
          <div>
            <strong>Book the engineer</strong>
            <span className="tiny">
              {money(f.cost)} · fixed ~{f.engineerAt} · no staff needed
            </span>
          </div>
          {state.fridge.repairAtStep !== null ? (
            <span className="status-pill">Engineer booked · {f.engineerAt}</span>
          ) : !allowActions ? null : planned ? (
            <button type="button" className="btn-action btn-action-on" onClick={() => onChange({ ...plan, actions: plan.actions.filter((a) => a.kind !== 'repair') })}>
              Booked ✓ (undo)
            </button>
          ) : (
            <button type="button" className="btn-action" disabled={!info.available} onClick={() => onChange({ ...plan, actions: [...plan.actions, repair] })} title={info.reason ?? ''}>
              Book · {money(f.cost)}
            </button>
          )}
        </div>
        <div className="response">
          <div>
            <strong>Move stock to the cold room</strong>
            <span className="tiny">Whoever is on Fill chilled shelves does this first · cold-room space {Math.round(f.coldRoomSpace)}</span>
          </div>
          {f.movers.length ? <span className="status-pill">Moving stock: {f.movers.join(', ')}</span> : <span className="status-pill warn">Nobody moving stock</span>}
        </div>
      </div>
      {!f.movers.length && <StaffPicker state={state} plan={plan} onChange={onChange} job="replenish:chilled" title="Put someone on chilled" />}
    </div>
  );
}

function DeptCard({ state, plan, onChange, d, opts, onOpen }: { state: SimState; plan: HourPlan; onChange: (p: HourPlan) => void; d: DeptId; opts: PanelOptions; onOpen?: (z: ZoneId) => void }) {
  const u = deptUnits(state, d);
  const cap = shelfCapacity(state, d);
  const job: AssignmentId = `replenish:${d}` as AssignmentId;
  const fillers = onShift(state).filter((s) => plan.assignments[s.id] === job);
  const look = useMemo(() => computeOutlook(state, plan, opts.steps), [state, plan, opts.steps]);
  const row = look?.rows.find((r) => r.zone === d);
  const short = shortDatedUnits(state, d);
  const friday = d === 'produce' ? total([...state.stock.produce.shelf, ...state.stock.produce.backroom].filter((b) => b.label === "Friday's produce")) : 0;
  const incoming = state.deliveries.filter((x) => x.dept === d);
  const problem = row && row.status !== 'ok';
  const actions: ActionRequest[] = [];
  if (opts.allowActions) {
    if (CONFIG.departments[d].perishable) actions.push({ kind: 'markdown', dept: d });
    actions.push({ kind: 'promotion', dept: d }, { kind: 'emergency', dept: d });
  }
  return (
    <>
      {problem && (
        <div className="decision">
          <p className="decision-title">
            <span aria-hidden="true">!</span> {row!.status === 'short' ? 'Shelves likely to run short' : 'Shelves running low'}
          </p>
          <p className="tiny">{row!.text} (estimate)</p>
          {u.backroom < 1 && u.dock > 0 ? (
            <button type="button" className="btn-action" onClick={() => onOpen?.('dock')}>
              Stock is on the dock: unload it first →
            </button>
          ) : u.backroom < 1 && opts.allowActions ? (
            <p className="tiny bad">None in the stockroom. An emergency order arrives next hour.</p>
          ) : null}
        </div>
      )}
      <dl className="facts">
        <dt>Shelf</dt>
        <dd>
          {Math.round(u.shelf)} / {Math.round(cap)}
        </dd>
        <dt>Stockroom</dt>
        <dd className={u.backroom < 1 ? 'bad' : ''}>{Math.round(u.backroom)}</dd>
        {u.dock > 0 && (
          <>
            <dt>On the dock</dt>
            <dd className="bad">{Math.round(u.dock)} to unload</dd>
          </>
        )}
        {incoming.map((x) => (
          <div key={x.id} className="contents">
            <dt>Delivery: {hourLabel(x.arrivesAt)}</dt>
            <dd>{Math.round(x.qty)}</dd>
          </div>
        ))}
        {d === 'chilled' && short >= 1 && (
          <>
            <dt>Expires tonight</dt>
            <dd>{Math.round(short)}</dd>
          </>
        )}
        {friday >= 1 && state.hour < 4 && (
          <>
            <dt>Expires 13:00</dt>
            <dd>{Math.round(friday)}</dd>
          </>
        )}
        <dt>Filling</dt>
        <dd>{fillers.length ? fillers.map((s) => s.name).join(', ') : 'nobody'}</dd>
      </dl>
      <StaffPicker state={state} plan={plan} onChange={onChange} job={job} title={fillers.length ? 'Add another filler' : 'Put someone on these shelves'} compact={!problem} />
      {(opts.pricing === 'all' || opts.pricing === d) && <PriceComparison state={state} plan={plan} onChange={onChange} d={d} steps={opts.steps} />}
      {actions.length > 0 && (
        <details className="more-actions">
          <summary>More actions</summary>
          <ActionList state={state} plan={plan} onChange={onChange} actions={actions} label={actionShortLabel} />
        </details>
      )}
    </>
  );
}

function TillCard({ state, plan, onChange, opts }: { state: SimState; plan: HourPlan; onChange: (p: HourPlan) => void; opts: PanelOptions }) {
  const look = useMemo(() => computeOutlook(state, plan, opts.steps), [state, plan, opts.steps]);
  const row = look?.rows.find((r) => r.zone === 'tills');
  const tillers = onShift(state).filter((s) => plan.assignments[s.id] === 'tills');
  return (
    <>
      {row && row.status !== 'ok' && (
        <div className="decision">
          <p className="decision-title">
            <span aria-hidden="true">!</span> {row.status === 'short' ? 'Shoppers likely to give up queueing' : 'Tills stretched'}
          </p>
          <p className="tiny">{row.text} (estimate)</p>
        </div>
      )}
      <dl className="facts">
        <dt>Queue now</dt>
        <dd>{Math.round(state.queue.customers)}</dd>
        <dt>Serving</dt>
        <dd>{tillers.length ? tillers.map((s) => s.name).join(', ') : 'nobody'}</dd>
        <dt>Walk-outs</dt>
        <dd>after a ~{CONFIG.checkout.patienceMinutes}-minute wait</dd>
      </dl>
      <StaffPicker state={state} plan={plan} onChange={onChange} job="tills" title="Open another till" compact={!row || row.status === 'ok'} />
      {opts.allowActions && <ActionList state={state} plan={plan} onChange={onChange} actions={[{ kind: 'temp' }]} label={() => 'Book an agency temp'} />}
    </>
  );
}

function DockCard({ state, plan, onChange, opts }: { state: SimState; plan: HourPlan; onChange: (p: HourPlan) => void; opts: PanelOptions }) {
  const waiting = DEPTS.reduce((t, d) => t + deptUnits(state, d).dock, 0);
  const unloaders = onShift(state).filter((s) => plan.assignments[s.id] === 'receive');
  return (
    <>
      {waiting > 0 && (
        <div className={`decision ${unloaders.length ? '' : 'urgent'}`}>
          <p className="decision-title">
            <span aria-hidden="true">!</span> {Math.round(waiting)} items on the dock
          </p>
          <p className="flow" aria-label="Dock, then stockroom, then shelves">
            <span className={unloaders.length ? 'flow-on' : 'flow-off'}>Dock</span> → <span>Stockroom</span> → <span>Shelves</span>
          </p>
          <p className="tiny">{unloaders.length ? `Unloading: ${unloaders.map((s) => s.name).join(', ')}` : 'Nobody unloading. Shelves can only be filled from the stockroom.'}</p>
        </div>
      )}
      <dl className="facts">
        {DEPTS.map((d) => {
          const u = deptUnits(state, d);
          if (u.dock < 1) return null;
          return (
            <div key={d} className="contents">
              <dt>{deptName(d)}</dt>
              <dd>
                {Math.round(u.dock)} waiting · space {Math.round(Math.max(0, CONFIG.departments[d].backroomCapacity - u.backroom))}
                {d === 'chilled' ? ' · spoils here' : ''}
              </dd>
            </div>
          );
        })}
        {state.deliveries.map((x) => (
          <div key={x.id} className="contents">
            <dt>Delivery: {hourLabel(x.arrivesAt)}</dt>
            <dd>
              {Math.round(x.qty)} {deptName(x.dept).toLowerCase()}
            </dd>
          </div>
        ))}
      </dl>
      <StaffPicker state={state} plan={plan} onChange={onChange} job="receive" title={unloaders.length ? 'Add another unloader' : 'Put someone on Unload delivery'} compact={waiting < 1} />
      {opts.allowActions && (
        <details className="more-actions">
          <summary>Emergency orders</summary>
          <ActionList state={state} plan={plan} onChange={onChange} actions={DEPTS.map((d) => ({ kind: 'emergency', dept: d }) as ActionRequest)} label={(a) => ('dept' in a ? deptName(a.dept) : '')} />
        </details>
      )}
    </>
  );
}

function BreakCard({ state, plan, onChange }: { state: SimState; plan: HourPlan; onChange: (p: HourPlan) => void }) {
  const staff = onShift(state)
    .filter((s) => !s.isTemp)
    .sort((a, b) => a.energy - b.energy);
  const onBreak = staff.filter((s) => plan.assignments[s.id] === 'break').length;
  const seats = CONFIG.staff.limits.break;
  return (
    <>
      <p className="tiny">
        Seats {onBreak}/{seats} · +{CONFIG.staff.energy.break} energy an hour
      </p>
      <ul className="break-list">
        {staff.map((s) => {
          const job = plan.assignments[s.id];
          const prod = productivity(s.energy);
          return (
            <li key={s.id} className={prod < 1 ? 'tired' : ''}>
              <span>
                <strong>{s.name}</strong> · {energyWord(s.energy)} {Math.round(s.energy)}
                {prod < 1 ? ` · ${Math.round(prod * 100)}% speed` : ''} · {s.consecutive}h worked
              </span>
              {job === 'break' ? (
                <span className="status-pill">On break</span>
              ) : (
                <button type="button" className="btn-action" disabled={onBreak >= seats} onClick={() => onChange({ ...plan, assignments: { ...plan.assignments, [s.id]: 'break' } })}>
                  {onBreak >= seats ? 'Seats full' : 'Send on break'}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      <p className="tiny muted">Their job is left uncovered: check the outlook.</p>
    </>
  );
}

/** Choose who to move into a job, with what they would achieve there. */
function StaffPicker({ state, plan, onChange, job, title, compact }: { state: SimState; plan: HourPlan; onChange: (p: HourPlan) => void; job: AssignmentId; title: string; compact?: boolean }) {
  const [open, setOpen] = useState(!compact);
  const inJob = Object.values(plan.assignments).filter((a) => a === job).length;
  const full = inJob >= assignmentLimit(job);
  const candidates = onShift(state).filter((s) => plan.assignments[s.id] !== job);
  if (!open)
    return (
      <button type="button" className="btn-link" onClick={() => setOpen(true)}>
        {title}…
      </button>
    );
  return (
    <div className="picker">
      <p className="picker-title">
        {title} <span className="tiny muted">({inJob}/{assignmentLimit(job)})</span>
      </p>
      {full ? (
        <p className="tiny">Full. Move someone out first.</p>
      ) : (
        <ul>
          {candidates.map((s) => {
            const pv = jobPreview(state, plan, s.id, job);
            return (
              <li key={s.id}>
                <button type="button" className="picker-row" onClick={() => onChange({ ...plan, assignments: { ...plan.assignments, [s.id]: job } })} disabled={!!pv.blocked}>
                  <span className="pk-name">{s.name}</span>
                  <span className="pk-from tiny">now: {ASSIGNMENT_LABEL[plan.assignments[s.id]].toLowerCase()}</span>
                  <span className={`pk-yield tiny ${pv.blocked ? 'bad' : ''}`}>{pv.blocked ?? pv.yield}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Price comparison
// ---------------------------------------------------------------------------

export function PriceComparison({ state, plan, onChange, d, steps }: { state: SimState; plan: HourPlan; onChange: (p: HourPlan) => void; d: DeptId; steps: number }) {
  const opts = useMemo(() => priceOptions(state, plan, d, steps), [state, plan, d, steps]);
  const tier = plan.pricing[d];
  const sel = opts.find((o) => o.tier === tier)!;
  const tradeOff = priceTradeOff(state, opts, tier, d);
  const mods = priceModifiers(state, plan, d);
  const warn =
    sel.shortDatedLeft > 20 && CONFIG.hours - state.hour <= 3
      ? `~${Math.round(sel.shortDatedLeft)} short-dated left after this ${intervalLabel(steps)}`
      : sel.walkouts >= 2
        ? `~${Math.round(sel.walkouts)} may give up queueing`
        : null;
  const set = (t: PriceTier) => onChange({ ...plan, pricing: { ...plan.pricing, [d]: t } });
  return (
    <div className="price-compare">
      <p className="picker-title">
        Price <span className="est">estimate · next {intervalLabel(steps)}</span>
      </p>
      <table>
        <thead>
          <tr>
            <th scope="col">Option</th>
            <th scope="col">Price</th>
            <th scope="col">Margin</th>
            <th scope="col">Sold</th>
            <th scope="col">Gross profit</th>
          </tr>
        </thead>
        <tbody>
          {opts.map((o) => (
            <tr key={o.tier} className={o.tier === tier ? 'pc-on' : ''} onClick={() => set(o.tier)}>
              <th scope="row">
                <label>
                  <input type="radio" name={`pc-${d}`} checked={o.tier === tier} onChange={() => set(o.tier)} /> {CONFIG.pricing[o.tier].label}
                </label>
              </th>
              <td>{money(o.price)}</td>
              <td>{money(o.margin)}</td>
              <td>~{Math.round(o.sold)}</td>
              <td>~£{Math.round(o.grossProfit)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="pc-tradeoff">{tradeOff}</p>
      {warn && <p className="tiny bad">⚠ {warn}</p>}
      {mods.map((m) => (
        <p key={m} className="tiny">
          {m}
        </p>
      ))}
      <details>
        <summary>Details</summary>
        <table className="mini-table">
          <thead>
            <tr>
              <th scope="col"></th>
              {opts.map((o) => (
                <th key={o.tier} scope="col">
                  {CONFIG.pricing[o.tier].label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">Wanted</th>
              {opts.map((o) => (
                <td key={o.tier}>~{Math.round(o.wanted)}</td>
              ))}
            </tr>
            <tr>
              <th scope="row">Takings</th>
              {opts.map((o) => (
                <td key={o.tier}>~£{Math.round(o.revenue)}</td>
              ))}
            </tr>
            <tr>
              <th scope="row">Not on shelf</th>
              {opts.map((o) => (
                <td key={o.tier}>~{Math.round(o.unmet)}</td>
              ))}
            </tr>
            <tr>
              <th scope="row">Left after</th>
              {opts.map((o) => (
                <td key={o.tier}>~{Math.round(o.leftover)}</td>
              ))}
            </tr>
            {opts.some((o) => o.shortDatedLeft >= 1) && (
              <tr>
                <th scope="row">Short-dated left</th>
                {opts.map((o) => (
                  <td key={o.tier}>~{Math.round(o.shortDatedLeft)}</td>
                ))}
              </tr>
            )}
            <tr>
              <th scope="row">Customer mood</th>
              {opts.map((o) => (
                <td key={o.tier}>{o.satisfaction > 0 ? 'better' : o.satisfaction < 0 ? 'worse' : '—'}</td>
              ))}
            </tr>
          </tbody>
        </table>
        <p className="tiny muted">Sold = paid at the tills, limited by stock, shelf-filling and checkout. Estimates use the forecast; real footfall varies.</p>
      </details>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Staff list, actions
// ---------------------------------------------------------------------------

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

export function StaffList({
  state,
  plan,
  onChange,
  selected,
  onSelect,
  highlight = [],
}: {
  state: SimState;
  plan: HourPlan;
  onChange: (p: HourPlan) => void;
  selected: string | null;
  onSelect: (id: string | null) => void;
  highlight?: string[];
}) {
  const staff = onShift(state);
  const coming = state.staff.filter((s) => s.availableFrom > state.hour && s.availableFrom < 99);
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
            lesson={highlight.includes(s.id)}
            onSelect={() => onSelect(selected === s.id ? null : s.id)}
            onAssign={(a) => assign(s.id, a)}
            state={state}
            plan={plan}
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
  lesson,
  onSelect,
  onAssign,
  state,
  plan,
}: {
  s: StaffMember;
  a: AssignmentId | undefined;
  counts: Map<AssignmentId, number>;
  selected: boolean;
  lesson: boolean;
  onSelect: () => void;
  onAssign: (a: AssignmentId) => void;
  state: SimState;
  plan: HourPlan;
}) {
  const entry = ROSTER.find((r) => r.id === s.id) ?? TEMP_ENTRY;
  const prod = productivity(s.energy);
  const word = energyWord(s.energy);
  const id = `job-${s.id}`;
  const current = a ? jobPreview(state, plan, s.id, a) : null;
  const blocked = current?.blocked && a !== 'break' ? current.blocked : null;
  return (
    <li className={`staff-row ${selected ? 'staff-row-selected' : ''} ${lesson ? 'staff-row-lesson' : ''}`}>
      <button type="button" className="staff-pick" aria-pressed={selected} onClick={onSelect} title="Select, then click a place in the shop">
        {s.name}
      </button>
      <label className="sr-only" htmlFor={id}>
        Job for {s.name}
      </label>
      <select id={id} value={a ?? ''} onChange={(e) => onAssign(e.target.value as AssignmentId)}>
        {ASSIGNMENTS.map((opt) => {
          const n = counts.get(opt) ?? 0;
          const full = n >= assignmentLimit(opt) && opt !== a;
          return (
            <option key={opt} value={opt} disabled={full}>
              {ASSIGNMENT_LABEL[opt]}
              {full ? ' (full)' : ''}
            </option>
          );
        })}
      </select>
      <div className="energy" aria-label={`Energy ${Math.round(s.energy)} out of 100, ${word}`}>
        <span className="energy-bar">
          <span className={`energy-fill energy-${word.toLowerCase()}`} style={{ width: `${s.energy}%` }} />
        </span>
        <span className="tiny">
          {word}
          {prod < 1 ? ` · ${Math.round(prod * 100)}% speed` : ''}
        </span>
      </div>
      {blocked && <p className="row-warn tiny">✕ {blocked}</p>}
      {selected && (
        <div className="staff-more tiny">
          <span>
            Now: {a ? ASSIGNMENT_LABEL[a] : '—'}
            {current && !blocked ? ` · ${current.yield}` : ''}
          </span>
          <span>{SPECIALITY_TEXT[s.speciality]}</span>
          <span className="muted">
            Energy {Math.round(s.energy)} · {s.consecutive}h since rest · {s.isTemp ? entry.bio : s.breaks ? `${s.breaks} break` : 'no break yet'}
          </span>
        </div>
      )}
    </li>
  );
}

function Commercial({ state, plan, onChange, onOpen }: { state: SimState; plan: HourPlan; onChange: (p: HourPlan) => void; onOpen: (z: ZoneId) => void }) {
  return (
    <section className="commercial" aria-label="Prices and actions">
      {state.fridge.status === 'fault' && (
        <button type="button" className="problem-chip urgent" onClick={() => onOpen('chilled')}>
          ! Chiller fault: see responses
        </button>
      )}
      {DEPTS.map((d) => (
        <div key={d} className="dept-block">
          <div className="dept-block-head">
            <strong>{deptName(d)}</strong>
            <button type="button" className="btn-link" onClick={() => onOpen(d)}>
              {CONFIG.pricing[plan.pricing[d]].label} · compare prices
            </button>
          </div>
          <ActionList
            state={state}
            plan={plan}
            onChange={onChange}
            actions={[
              ...(CONFIG.departments[d].perishable ? [{ kind: 'markdown', dept: d } as ActionRequest] : []),
              { kind: 'promotion', dept: d },
              { kind: 'emergency', dept: d },
            ]}
            label={actionShortLabel}
          />
        </div>
      ))}
      <div className="dept-block">
        <strong className="tiny">Extra help</strong>
        <ActionList state={state} plan={plan} onChange={onChange} actions={[{ kind: 'temp' }]} label={() => 'Book an agency temp'} />
      </div>
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
  const spent = planned.reduce((t, x) => t + describeAction(state, x).cost, 0);
  return (
    <div className="confirm" role="dialog" aria-modal="false" aria-labelledby="confirm-h">
      <h4 id="confirm-h">{info.title}</h4>
      <dl>
        <dt>Cost</dt>
        <dd>
          {info.cost > 0 ? money(info.cost) : 'Nothing upfront'} · cash after {money(state.cash - spent - info.cost)}
        </dd>
        <dt>When</dt>
        <dd>{info.timing}</dd>
        <dt>Effect</dt>
        <dd>{info.effect}</dd>
      </dl>
      {!info.available && <p className="note-warn">{info.reason}</p>}
      <div className="confirm-buttons">
        <button type="button" className="btn-primary" disabled={!info.available} onClick={onConfirm} autoFocus>
          Add to plan
        </button>
        <button type="button" className="btn-ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
