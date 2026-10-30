import { useEffect, useMemo, useRef, useState } from 'react';
import { CONFIG, DEPTS, deptName, hourLabel, hourRange, type DeptId, type PriceTier } from '../sim/config';
import {
  STEP_MINUTES,
  clockLabel,
  actionKey,
  assignmentLimit,
  backroomCapacity,
  describeAction,
  deptUnits,
  expectedCustomers,
  money,
  onShift,
  productivity,
  shelfCapacity,
  shortDatedUnits,
} from '../sim/engine';
import { previewWarnings } from '../sim/explain';
import {
  runOutWarnings,
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
import { ASSIGNMENTS, type ActionRequest, type AssignmentId, type HourPlan, type SimState } from '../sim/types';
import { ZONE_NAME, type ZoneId } from './Store';
import { StockroomCard } from './StockroomCard';
import { HiringPanel, LetGo, PersonFacts, TraitChips, type HiringProps } from './Hiring';
import { Forecast } from './Forecast';
import type { Selection } from './ShopScreen';

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

export const FULL_GAME: PanelOptions = { steps: CONFIG.stepsPerHour, allowActions: true, pricing: 'all' };

export function intervalLabel(steps: number): string {
  return steps >= CONFIG.stepsPerHour ? 'hour' : `${Math.round(steps * STEP_MINUTES)} minutes`;
}

export function PanelHead({ title, kicker, onClose }: { title: string; kicker?: string; onClose?: () => void }) {
  return (
    <div className="panel-head">
      <div>
        {kicker && <p className="panel-kicker">{kicker}</p>}
        <h2>{title}</h2>
      </div>
      {onClose && (
        <button type="button" className="panel-x" onClick={onClose} aria-label={`Close ${title}`}>
          ✕
        </button>
      )}
    </div>
  );
}

interface GameProps {
  state: SimState;
  plan: HourPlan;
  onChange: (p: HourPlan) => void;
  sel: Selection;
  setSel: (s: Selection) => void;
  opts?: PanelOptions;
  /** Your shop: the office's hiring panel. */
  hiring?: HiringProps;
}

/** The one contextual panel for the full game while planning. */
export function GamePanel({ state, plan, onChange, sel, setSel, opts = FULL_GAME, hiring }: GameProps) {
  const close = () => setSel(null);
  const open = (z: ZoneId) => setSel({ kind: 'zone', zone: z });
  if (!sel) return <IdlePanel state={state} />;
  switch (sel.kind) {
    case 'staff':
      return <StaffCard state={state} plan={plan} onChange={onChange} id={sel.id} onClose={close} />;
    case 'zone':
      return <ContextCard state={state} plan={plan} onChange={onChange} zone={sel.zone} onClose={close} opts={opts} onOpen={open} onStockroom={() => setSel({ kind: 'stockroom' })} />;
    case 'office':
      return (
        <section className="panel-inner context-card" aria-label="Office: hiring">
          <PanelHead title="Hiring" kicker="The office" onClose={close} />
          {hiring ? <HiringPanel {...hiring} /> : <p className="idle-hint">Hiring is part of running your own shop.</p>}
        </section>
      );
    case 'stockroom':
      return (
        <section className="panel-inner context-card" aria-label="Stockroom">
          <PanelHead title="Stockroom" kicker="Order more stock" onClose={close} />
          <StockroomCard state={state} plan={plan} onOrder={(a) => onChange({ ...plan, actions: [...plan.actions, a] })} />
        </section>
      );
    case 'attention':
      return <AttentionPanel state={state} plan={plan} onOpen={open} onStockroom={() => setSel({ kind: 'stockroom' })} onClose={close} onOutlook={() => setSel({ kind: 'outlook' })} />;
    case 'team':
      return (
        <div className="panel-inner">
          <PanelHead title="Team" kicker={hourRange(state.hour)} onClose={close} />
          <StaffList state={state} plan={plan} onChange={onChange} onSelect={(id) => setSel({ kind: 'staff', id })} />
        </div>
      );
    case 'forecast':
      return (
        <div className="panel-inner">
          <PanelHead title="Forecast" kicker="Customers per hour" onClose={close} />
          <Forecast scenario={state.scenario} currentHour={state.hour} knownUpTo={state.hour} reports={state.history} />
          <ShopKey />
        </div>
      );
    case 'outlook':
      return (
        <div className="panel-inner">
          <PanelHead title={`Next ${intervalLabel(opts.steps)}`} kicker="Estimate from the forecast" onClose={close} />
          <OutlookPanel state={state} plan={plan} steps={opts.steps} onOpen={open} />
        </div>
      );
  }
}

/** Nothing selected: the hour, any announcements, and how to start. */
function IdlePanel({ state }: { state: SimState }) {
  return (
    <div className="panel-inner idle">
      <PanelHead title={hourRange(state.hour)} kicker={`~${Math.round(expectedCustomers(state))} customers expected`} />
      {state.announcements.length > 0 && (
        <ul className="tannoy" aria-label="Announcements">
          {state.announcements.map((a, i) => (
            <li key={i}>{a}</li>
          ))}
        </ul>
      )}
      <p className="idle-hint">Select a person or a place in the shop to see what you can do there.</p>
    </div>
  );
}

/** Everything that needs a decision, most urgent first. Selecting one opens its actions. */
export function attentionItems(state: SimState, plan: HourPlan) {
  const look = computeOutlook(state, plan);
  return computeProblems(state, plan, look).sort((a, b) => (a.level === b.level ? 0 : a.level === 'urgent' ? -1 : 1));
}

function AttentionPanel({ state, plan, onOpen, onStockroom, onClose, onOutlook }: { state: SimState; plan: HourPlan; onOpen: (z: ZoneId) => void; onStockroom: () => void; onClose: () => void; onOutlook: () => void }) {
  const items = useMemo(() => attentionItems(state, plan), [state, plan]);
  return (
    <div className="panel-inner">
      <PanelHead title="Needs attention" kicker={hourRange(state.hour)} onClose={onClose} />
      {items.length === 0 ? (
        <p className="idle-hint">Nothing needs attention with this plan.</p>
      ) : (
        <ul className="attention-list">
          {items.map((p, i) => (
            <li key={`${i}-${p.title}`}>
              <button type="button" className={`attention-item ${p.level}`} onClick={() => (p.stockroom ? onStockroom() : onOpen(p.zone as ZoneId))}>
                <span className="att-mark" aria-hidden="true">
                  !
                </span>
                <span>
                  <strong>{p.title}</strong>
                  <span className="att-where">{p.stockroom ? 'Stockroom · order more' : `${ZONE_NAME[p.zone as ZoneId]} · see actions`}</span>
                </span>
                <span className="sr-only">{p.level === 'urgent' ? ' (urgent)' : ''}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="btn-link" onClick={onOutlook}>
        Outlook for the hour (estimates)
      </button>
    </div>
  );
}

function ShopKey() {
  return (
    <ul className="legend" aria-label="Key">
      <li>
        <span aria-hidden="true">!</span> needs attention: click it
      </li>
      <li>
        <span aria-hidden="true">z</span> tired, slower
      </li>
      <li>
        <span aria-hidden="true">…</span> nothing to do
      </li>
      <li>
        <span aria-hidden="true">?</span> shopper can’t find stock
      </li>
    </ul>
  );
}

/** The selected employee: current job, energy, what each job would achieve. */
export function StaffCard({ state, plan, onChange, id, onClose, jobs }: { state: SimState; plan: HourPlan; onChange: (p: HourPlan) => void; id: string; onClose: () => void; jobs?: AssignmentId[] }) {
  const s = state.staff.find((x) => x.id === id);
  if (!s) return null;
  const a = plan.assignments[s.id];
  const prod = productivity(s.energy);
  const word = energyWord(s.energy);
  const current = a ? jobPreview(state, plan, s.id, a) : null;
  const entry = ROSTER.find((r) => r.id === s.id) ?? TEMP_ENTRY;
  return (
    <div className="panel-inner">
      <PanelHead title={s.name} kicker="Selected" onClose={onClose} />
      <dl className="facts">
        <dt>Now</dt>
        <dd>
          {a ? ASSIGNMENT_LABEL[a] : '—'}
          {current && (current.blocked && a !== 'break' ? <span className="bad"> · {current.blocked}</span> : ` · ${current.yield}`)}
        </dd>
        <dt>Energy</dt>
        <dd>
          <span className="energy" aria-label={`Energy ${Math.round(s.energy)} out of 100, ${word}`}>
            <span className="energy-bar">
              <span className={`energy-fill energy-${word.toLowerCase()}`} style={{ width: `${s.energy}%` }} />
            </span>
            {word} {Math.round(s.energy)}
            {prod < 1 ? ` · working at ${Math.round(prod * 100)}%` : ''}
          </span>
        </dd>
      </dl>
      <p className="picker-title">Move to</p>
      <ul className="job-options">
        {(jobs ?? ASSIGNMENTS.filter((x) => assignmentLimit(x, state) > 0)).map((j) => {
          const pv = jobPreview(state, plan, s.id, j);
          const n = Object.values(plan.assignments).filter((x) => x === j).length;
          const here = j === a;
          const off = !here && (pv.full || !!pv.blocked);
          return (
            <li key={j}>
              <button
                type="button"
                className={`job-option ${here ? 'here' : ''}`}
                disabled={here || pv.full}
                aria-pressed={here}
                onClick={() => {
                  onChange({ ...plan, assignments: { ...plan.assignments, [s.id]: j } });
                  onClose();
                }}
              >
                <span className="jo-name">{ASSIGNMENT_LABEL[j]}</span>
                <span className={`jo-yield ${off ? 'bad' : ''}`}>{here ? 'Current job' : pv.full ? `Full (${n}/${assignmentLimit(j, state)})` : (pv.blocked ?? pv.yield)}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="tiny muted">Or drag {s.name} to a place in the shop.</p>
      <PersonFacts
        s={s}
        onLetGo={
          state.ctx.mode === 'campaign' && !s.isTemp
            ? () => {
                onChange({ ...plan, actions: [...plan.actions, { kind: 'letGo', staffId: s.id }] });
                onClose();
              }
            : undefined
        }
        letGoReason={describeAction(state, { kind: 'letGo', staffId: s.id }).reason}
      />
      <details className="more">
        <summary>About {s.name}</summary>
        <p className="tiny">
          {SPECIALITY_TEXT[s.speciality]}. {s.consecutive}h since a rest · {s.isTemp ? entry.bio : s.breaks ? `${s.breaks} break so far` : 'no break yet'}.
        </p>
      </details>
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
    <section className="outlook" aria-label={`Next ${intervalLabel(steps)}: estimate`}>
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
  onStockroom,
}: {
  state: SimState;
  plan: HourPlan;
  onChange: (p: HourPlan) => void;
  zone: ZoneId;
  onClose: () => void;
  opts?: PanelOptions;
  onOpen?: (z: ZoneId) => void;
  /** Live play: open the stockroom to order more. */
  onStockroom?: () => void;
}) {
  return (
    <section className="panel-inner context-card" aria-label={ZONE_NAME[zone]}>
      <PanelHead title={ZONE_NAME[zone]} kicker="Selected" onClose={onClose} />
      {zone === 'chilled' && state.fridge.status === 'fault' && <FridgeCard state={state} plan={plan} onChange={onChange} allowActions={opts.allowActions} />}
      {(zone === 'produce' || zone === 'chilled' || zone === 'ambient') && <DeptCard state={state} plan={plan} onChange={onChange} d={zone} opts={opts} onOpen={onOpen} onStockroom={onStockroom} />}
      {zone === 'tills' && <TillCard state={state} plan={plan} onChange={onChange} opts={opts} />}
      {zone === 'dock' && <DockCard state={state} plan={plan} onChange={onChange} opts={opts} onStockroom={onStockroom} />}
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

function DeptCard({ state, plan, onChange, d, opts, onOpen, onStockroom }: { state: SimState; plan: HourPlan; onChange: (p: HourPlan) => void; d: DeptId; opts: PanelOptions; onOpen?: (z: ZoneId) => void; onStockroom?: () => void }) {
  const runOut = onStockroom ? runOutWarnings(state).find((w) => w.dept === d) : undefined;
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
  const [pricesOpen, setPricesOpen] = useState(opts.pricing === d);
  const actions: ActionRequest[] = [];
  if (opts.allowActions) {
    if (CONFIG.departments[d].perishable) actions.push({ kind: 'markdown', dept: d });
    actions.push({ kind: 'promotion', dept: d });
    // Ordering more stock lives in the stockroom panel (live play); the lessons keep the old emergency order.
    if (!onStockroom) actions.push({ kind: 'emergency', dept: d });
  }
  const allowed = actions.filter((a) => state.ctx.actions.includes(a.kind));
  return (
    <>
      {runOut && (
        <div className={`decision ${runOut.minutes <= 20 ? 'urgent' : ''}`}>
          <p className="decision-title">
            <span aria-hidden="true">!</span> Runs out ~{clockLabel(Math.floor(runOut.at / CONFIG.stepsPerHour), runOut.at % CONFIG.stepsPerHour)}
          </p>
          <p className="tiny">At today’s forecast, counting what’s on its way (estimate).</p>
          <button type="button" className="btn-action" onClick={onStockroom}>
            Order more in the stockroom →
          </button>
        </div>
      )}
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
          ) : u.backroom < 1 && onStockroom && !runOut ? (
            <button type="button" className="btn-action" onClick={onStockroom}>
              None in the stockroom: order more →
            </button>
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
            <dt>Delivery: {clockLabel(Math.floor((x.arrivesAtStep ?? x.arrivesAt * CONFIG.stepsPerHour) / CONFIG.stepsPerHour), (x.arrivesAtStep ?? 0) % CONFIG.stepsPerHour)}</dt>
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
      {!pricesOpen && <StaffPicker state={state} plan={plan} onChange={onChange} job={job} title={fillers.length ? 'Add another filler' : 'Put someone on these shelves'} compact={!problem} />}
      {(opts.pricing === 'all' || opts.pricing === d) && state.ctx.pricing && (
        <PriceSection state={state} plan={plan} onChange={onChange} d={d} steps={opts.steps} fixed={opts.pricing === d} open={pricesOpen} setOpen={setPricesOpen} />
      )}
      {allowed.length > 0 && (
        <details className="more-actions">
          <summary>More actions</summary>
          <ActionList state={state} plan={plan} onChange={onChange} actions={allowed} label={actionShortLabel} />
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
      {opts.allowActions && state.ctx.actions.includes('temp') && <ActionList state={state} plan={plan} onChange={onChange} actions={[{ kind: 'temp' }]} label={() => 'Book an agency temp'} />}
    </>
  );
}

function DockCard({ state, plan, onChange, opts, onStockroom }: { state: SimState; plan: HourPlan; onChange: (p: HourPlan) => void; opts: PanelOptions; onStockroom?: () => void }) {
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
                {Math.round(u.dock)} waiting · space {Math.round(Math.max(0, backroomCapacity(state, d) - u.backroom))}
                {d === 'chilled' ? ' · spoils here' : ''}
              </dd>
            </div>
          );
        })}
        {state.deliveries.map((x) => (
          <div key={x.id} className="contents">
            <dt>Delivery: {clockLabel(Math.floor((x.arrivesAtStep ?? x.arrivesAt * CONFIG.stepsPerHour) / CONFIG.stepsPerHour), (x.arrivesAtStep ?? 0) % CONFIG.stepsPerHour)}</dt>
            <dd>
              {Math.round(x.qty)} {deptName(x.dept).toLowerCase()}
            </dd>
          </div>
        ))}
      </dl>
      <StaffPicker state={state} plan={plan} onChange={onChange} job="receive" title={unloaders.length ? 'Add another unloader' : 'Put someone on Unload delivery'} compact={waiting < 1} />
      {opts.allowActions && onStockroom && (
        <button type="button" className="btn-link" onClick={onStockroom}>
          Order more stock (stockroom) →
        </button>
      )}
      {opts.allowActions && !onStockroom && state.ctx.actions.includes('emergency') && (
        <details className="more-actions">
          <summary>Emergency orders</summary>
          <ActionList state={state} plan={plan} onChange={onChange} actions={state.ctx.depts.map((d) => ({ kind: 'emergency', dept: d }) as ActionRequest)} label={(a) => ('dept' in a ? deptName(a.dept) : '')} />
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
  const full = inJob >= assignmentLimit(job, state);
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
        {title} <span className="tiny muted">({inJob}/{assignmentLimit(job, state)})</span>
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
// Price comparison (only when the player asks for it)
// ---------------------------------------------------------------------------

function PriceSection({
  state,
  plan,
  onChange,
  d,
  steps,
  fixed,
  open,
  setOpen,
}: {
  state: SimState;
  plan: HourPlan;
  onChange: (p: HourPlan) => void;
  d: DeptId;
  steps: number;
  fixed: boolean;
  open: boolean;
  setOpen: (f: (o: boolean) => boolean) => void;
}) {
  const tier = plan.pricing[d];
  return (
    <div className="price-section">
      <div className="price-line">
        <span>
          Price: <strong>{CONFIG.pricing[tier].label}</strong> {money(CONFIG.departments[d].standardPrice * CONFIG.pricing[tier].priceMult)}
        </span>
        {!fixed && (
          <button type="button" className="btn-action" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            {open ? 'Hide prices' : 'Change prices'}
          </button>
        )}
      </div>
      {open && <PriceComparison state={state} plan={plan} onChange={onChange} d={d} steps={steps} />}
    </div>
  );
}

export function PriceComparison({ state, plan, onChange, d, steps }: { state: SimState; plan: HourPlan; onChange: (p: HourPlan) => void; d: DeptId; steps: number }) {
  const opts = useMemo(() => priceOptions(state, plan, d, steps), [state, plan, d, steps]);
  const tier = plan.pricing[d];
  const sel = opts.find((o) => o.tier === tier)!;
  const tradeOff = priceTradeOff(state, opts, tier, d);
  const mods = priceModifiers(state, plan, d);
  const warn =
    sel.shortDatedLeft > 20 && state.ctx.hours - state.hour <= 3
      ? `~${Math.round(sel.shortDatedLeft)} short-dated left after this ${intervalLabel(steps)}`
      : sel.walkouts >= 2
        ? `~${Math.round(sel.walkouts)} may give up queueing`
        : null;
  const set = (t: PriceTier) => onChange({ ...plan, pricing: { ...plan.pricing, [d]: t } });
  return (
    <div className="price-compare">
      <p className="picker-title">
        <span className="est">Estimate · next {intervalLabel(steps)}</span>
      </p>
      <table>
        <thead>
          <tr>
            <th scope="col">Price</th>
            <th scope="col">Each</th>
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
                  <input type="radio" name={`pc-${d}`} checked={o.tier === tier} onChange={() => set(o.tier)} /> {CONFIG.pricing[o.tier].short}
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
                  {CONFIG.pricing[o.tier].short}
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
              <th scope="row">Binned (cost)</th>
              {opts.map((o) => (
                <td key={o.tier}>~£{Math.round(o.waste)}</td>
              ))}
            </tr>
            <tr>
              <th scope="row">Gross profit after waste</th>
              {opts.map((o) => (
                <td key={o.tier}>~£{Math.round(o.grossProfit - o.waste)}</td>
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
        <p className="tiny muted">
          Sold = paid at the tills, limited by stock, shelf-filling and checkout. Fuller baskets take longer to scan. Quality is the same at every price. Estimates use the
          forecast; real footfall varies.
        </p>
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
      return 'Rush delivery';
    case 'nextDelivery':
      return 'Add to the next delivery';
    case 'hire':
      return `Hire ${a.person.name}`;
    case 'letGo':
      return 'Let go';
    case 'cashAndCarry':
      return `Cash-and-carry: send ${ROSTER.find((r) => r.id === a.staffId)?.name ?? 'someone'}`;
    case 'letRunOut':
      return 'Let it run out';
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

/** Team overview: everyone's job (changeable here too), energy and speed. */
export function StaffList({ state, plan, onChange, onSelect }: { state: SimState; plan: HourPlan; onChange: (p: HourPlan) => void; onSelect: (id: string) => void }) {
  const staff = onShift(state);
  const coming = state.staff.filter((s) => !onShift(state).includes(s) && s.availableFrom < 99);
  const counts = new Map<AssignmentId, number>();
  for (const s of staff) {
    const a = plan.assignments[s.id];
    if (a) counts.set(a, (counts.get(a) ?? 0) + 1);
  }
  return (
    <section className="staff-list" aria-label="Staff assignments">
      <ul>
        {staff.map((s) => {
          const a = plan.assignments[s.id];
          const word = energyWord(s.energy);
          const prod = productivity(s.energy);
          const current = a ? jobPreview(state, plan, s.id, a) : null;
          const blocked = current?.blocked && a !== 'break' ? current.blocked : null;
          const id = `job-${s.id}`;
          return (
            <li key={s.id} className="staff-row">
              <button type="button" className="staff-pick" onClick={() => onSelect(s.id)}>
                {s.name}
              </button>
              <label className="sr-only" htmlFor={id}>
                Job for {s.name}
              </label>
              <select id={id} value={a ?? ''} onChange={(e) => onChange({ ...plan, assignments: { ...plan.assignments, [s.id]: e.target.value as AssignmentId } })}>
                {ASSIGNMENTS.filter((opt) => assignmentLimit(opt, state) > 0).map((opt) => {
                  const full = (counts.get(opt) ?? 0) >= assignmentLimit(opt, state) && opt !== a;
                  return (
                    <option key={opt} value={opt} disabled={full}>
                      {ASSIGNMENT_LABEL[opt]}
                      {full ? ' (full)' : ''}
                    </option>
                  );
                })}
              </select>
              <span className="energy" aria-label={`Energy ${Math.round(s.energy)} out of 100, ${word}`}>
                <span className="energy-bar">
                  <span className={`energy-fill energy-${word.toLowerCase()}`} style={{ width: `${s.energy}%` }} />
                </span>
                {word}
                {prod < 1 ? ` · ${Math.round(prod * 100)}%` : ''}
              </span>
              {blocked && <p className="row-warn">✕ {blocked}</p>}
              <div className="row-extra">
                {s.traits && <TraitChips traits={s.traits} />}
                {s.newcomer && <span className="new-badge">New</span>}
                {state.ctx.mode === 'campaign' && !s.isTemp && (
                  <LetGo
                    name={s.name}
                    reason={describeAction(state, { kind: 'letGo', staffId: s.id }).reason}
                    onLetGo={() => onChange({ ...plan, actions: [...plan.actions, { kind: 'letGo', staffId: s.id }] })}
                  />
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {coming.map((s) => (
        <p key={s.id} className="tiny note-info">
          {s.name} arrives at {s.availableFromStep !== undefined ? clockLabel(Math.floor(s.availableFromStep / CONFIG.stepsPerHour), s.availableFromStep % CONFIG.stepsPerHour) : hourLabel(s.availableFrom)}.
        </p>
      ))}
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
