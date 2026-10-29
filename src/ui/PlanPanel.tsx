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
} from '../sim/engine';
import { previewWarnings, type Note } from '../sim/explain';
import { ASSIGNMENT_LABEL, ROSTER, SPECIALITY_TEXT, TEMP_ENTRY } from '../sim/roster';
import { ASSIGNMENTS, type ActionRequest, type AssignmentId, type HourPlan, type SimState, type StaffMember } from '../sim/types';

interface Props {
  state: SimState;
  plan: HourPlan;
  onChange: (p: HourPlan) => void;
  selected: string | null;
  onSelect: (id: string | null) => void;
  onRun: () => void;
}

const TIPS: Record<number, string> = {
  0: 'The default jobs are a reasonable start. Select someone (their initials) and click a zone in the shop to move them, or use the lists below.',
  1: 'The break room fits two. Quieter morning hours are the cheapest time for breaks; tired staff slow down later.',
  2: 'The midday lorry reaches the dock at 12:00. Shelves can only be filled from the stockroom, so someone needs to receive it.',
  3: 'Watch the queue by the tills. Once the wait passes about six minutes, shoppers start to give up and leave their baskets.',
  5: 'Check the short-dated chilled stock in the last couple of hours. A markdown turns some of tonight’s waste into small sales.',
};

export function energyWord(e: number): string {
  if (e < CONFIG.staff.exhaustedBelow) return 'Exhausted';
  if (e < CONFIG.staff.tiredBelow) return 'Tired';
  if (e < 75) return 'Fine';
  return 'Fresh';
}

export function PlanPanel({ state, plan, onChange, selected, onSelect, onRun }: Props) {
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
      </section>

      {state.scenario.curated && TIPS[state.hour] && (
        <p className="tip">
          <strong>Tip:</strong> {TIPS[state.hour]}
        </p>
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

function StaffList({ state, plan, onChange, selected, onSelect }: Omit<Props, 'onRun'>) {
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
      <p className="tiny muted">
        Pick a job from each list, or select someone and click a zone in the shop. Changes are free until you run the hour.
      </p>
      <JobSummary counts={counts} state={state} />
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

function JobSummary({ counts, state }: { counts: Map<AssignmentId, number>; state: SimState }) {
  return (
    <div className="job-summary" aria-label="People per job">
      {ASSIGNMENTS.map((a) => {
        let hint = '';
        if (a.startsWith('replenish:')) {
          const d = a.split(':')[1] as DeptId;
          const u = deptUnits(state, d);
          const f = u.shelf / shelfCapacity(state, d);
          hint = `${Math.round(f * 100)}% full · ${Math.round(u.backroom)} in stock`;
        } else if (a === 'receive') {
          const dock = DEPTS.reduce((t, d) => t + deptUnits(state, d).dock, 0);
          hint = dock > 0 ? `${Math.round(dock)} waiting` : 'dock empty';
        } else if (a === 'tills') hint = `queue ${Math.round(state.queue.customers)}`;
        else hint = 'room for 2';
        return (
          <div key={a} className="job-chip">
            <strong>
              {ASSIGNMENT_LABEL[a]} {counts.get(a) ?? 0}/{assignmentLimit(a)}
            </strong>
            <span>{hint}</span>
          </div>
        );
      })}
    </div>
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
        <span className={`chip-token ${s.isTemp ? 'chip-temp' : ''}`} aria-hidden="true">
          {s.isTemp ? 'T' : s.name.slice(0, 2)}
        </span>
        <span className="staff-name">
          {s.name}
          <span className="sr-only">{selected ? ' (selected)' : ''}</span>
        </span>
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
              {ASSIGNMENT_LABEL[opt]}
              {full ? ' (full)' : ''}
            </option>
          );
        })}
      </select>
    </li>
  );
}

function Commercial({ state, plan, onChange }: { state: SimState; plan: HourPlan; onChange: (p: HourPlan) => void }) {
  const [pending, setPending] = useState<ActionRequest | null>(null);
  const setTier = (d: DeptId, t: PriceTier) => onChange({ ...plan, pricing: { ...plan.pricing, [d]: t } });
  const add = (a: ActionRequest) => {
    onChange({ ...plan, actions: [...plan.actions, a] });
    setPending(null);
  };
  const remove = (a: ActionRequest) => onChange({ ...plan, actions: plan.actions.filter((x) => actionKey(x) !== actionKey(a)) });

  const groups: { title: string; items: ActionRequest[]; blurb: string }[] = [
    { title: 'Markdown', blurb: 'Yellow stickers on short-dated stock.', items: [{ kind: 'markdown', dept: 'produce' }, { kind: 'markdown', dept: 'chilled' }] },
    { title: 'Promotion', blurb: 'More demand for two hours, at a cost.', items: DEPTS.map((d) => ({ kind: 'promotion', dept: d }) as ActionRequest) },
    { title: 'Emergency order', blurb: 'Pricier stock from the cash-and-carry.', items: DEPTS.map((d) => ({ kind: 'emergency', dept: d }) as ActionRequest) },
    { title: 'Extra help', blurb: 'An agency temp for the rest of the day.', items: [{ kind: 'temp' }] },
  ];
  if (state.fridge.status === 'fault') groups.unshift({ title: 'Chiller fault', blurb: 'Half the chilled shelf is out of use.', items: [{ kind: 'repair' }] });

  const label = (a: ActionRequest) => ('dept' in a ? deptName(a.dept) : a.kind === 'temp' ? 'Book temp' : 'Call engineer');

  return (
    <section className="commercial" aria-label="Prices and actions">
      <h3>Prices</h3>
      <p className="tiny muted">Lower prices bring more demand and goodwill but less margin per item. Higher prices do the opposite.</p>
      <div className="price-table">
        {DEPTS.map((d) => (
          <fieldset key={d} className="price-row">
            <legend>{deptName(d)}</legend>
            {PRICE_TIERS.map((t) => (
              <label key={t} className={`seg ${plan.pricing[d] === t ? 'seg-on' : ''}`}>
                <input type="radio" name={`price-${d}`} value={t} checked={plan.pricing[d] === t} onChange={() => setTier(d, t)} />
                {CONFIG.pricing[t].label} <span className="tiny">{money(priceFor(state, d, state.hour, t))}</span>
              </label>
            ))}
          </fieldset>
        ))}
      </div>

      <h3>Actions</h3>
      {plan.actions.length > 0 && (
        <ul className="planned">
          {plan.actions.map((a) => {
            const info = describeAction({ ...state }, a);
            return (
              <li key={actionKey(a)}>
                <span>
                  <strong>{info.title}</strong> — {info.cost > 0 ? money(info.cost) : 'no upfront cost'}
                </span>
                <button type="button" className="btn-small" onClick={() => remove(a)}>
                  Undo
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {groups.map((g) => (
        <div key={g.title} className="action-group">
          <div className="action-group-head">
            <strong>{g.title}</strong> <span className="tiny muted">{g.blurb}</span>
          </div>
          <div className="action-buttons">
            {g.items.map((a) => {
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
                  {planned ? ' ✓' : ''}
                  {!planned && !info.available && <span className="sr-only"> (unavailable: {info.reason})</span>}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      <p className="tiny muted">
        Limits: markdown once per fresh department, {CONFIG.actions.promotion.maxPerDay} promotions (one at a time), {CONFIG.actions.emergency.maxPerDay} emergency orders, one temp.
      </p>
      {pending && <ConfirmAction state={state} a={pending} planned={plan.actions} onConfirm={() => add(pending)} onCancel={() => setPending(null)} />}
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
