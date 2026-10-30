/**
 * A trading day played live, minute by minute.
 *
 * The player's jobs and prices stand until they change them; actions happen
 * the moment they are chosen (also while paused). A break ends by itself
 * after `live.breakMinutes` and the person goes back to their job; so does
 * someone sent to a floor job once it is done. Questions from the floor
 * (`floor.events`) are raised when their minute comes and the day doesn't
 * move on until they are answered. Choices are stamped with the minute they
 * were made, so a day is stored as its opening state plus its choices and
 * rebuilt exactly by `replayLive`.
 *
 * Pure: no timers. The UI's clock calls `advance` once per in-game minute.
 */
import { CONFIG, DEPTS, deptName, type DeptId, type PriceTier } from './config';
import { assignmentLimit, defaultPlan, onShift, runSteps, takeAction, useByExpiry, weekdayName } from './engine';
import * as S from './stock';
import type { ActionRequest, AssignmentId, FloorEvent, HourPlan, HourReport, SimState } from './types';

const C = CONFIG;
const STEPS = C.stepsPerHour;
const BREAK_STEPS = Math.round((C.live.breakMinutes / 60) * STEPS);
const E = C.floor.events;

export type Choice =
  | { at: number; kind: 'jobs'; assignments: Record<string, AssignmentId> }
  | { at: number; kind: 'prices'; pricing: Record<DeptId, PriceTier> }
  | { at: number; kind: 'action'; action: ActionRequest }
  /** Send someone to a floor job. */
  | { at: number; kind: 'task'; staffId: string; taskId: string }
  /** Answer the question waiting on the floor. */
  | { at: number; kind: 'answer'; eventId: string; option: number };

export interface Live {
  state: SimState;
  /** Standing jobs and prices. `actions` is always empty: actions are taken at once. */
  plan: HourPlan;
  /** Step each person's break ends. */
  breakUntil: Record<string, number>;
  /** The job each person on a break or a floor job goes back to. */
  returnTo: Record<string, AssignmentId>;
  /** Called back from a break: no automatic break before this step. */
  hold?: Record<string, number>;
}

/** Steps since opening (one step is one minute). */
export function stepOf(state: SimState): number {
  return state.hour * STEPS + (state.step ?? 0);
}

export function isClosed(live: Live): boolean {
  return live.state.hour >= live.state.ctx.hours;
}

/** The order jobs are tried in when someone needs a free place. */
const FALLBACK: AssignmentId[] = ['tills', 'replenish:ambient', 'replenish:produce', 'replenish:chilled', 'receive', 'break'];

function count(plan: HourPlan, a: AssignmentId, except?: string): number {
  return Object.entries(plan.assignments).filter(([id, x]) => x === a && id !== except).length;
}

function freePlace(state: SimState, plan: HourPlan, want: AssignmentId, who: string): AssignmentId {
  if (want !== 'task' && count(plan, want, who) < assignmentLimit(want, state)) return want;
  return FALLBACK.find((a) => a !== 'break' && count(plan, a, who) < assignmentLimit(a, state)) ?? 'break';
}

export function startLive(state: SimState): Live {
  const plan = defaultPlan(state);
  plan.actions = [];
  return settle({ state, plan, breakUntil: {}, returnTo: {} });
}

/**
 * Keeps the standing plan valid at the current minute: people who have just
 * arrived get a job, breaks that have run their time end, and people whose
 * floor job is done go back to what they were doing.
 */
function settle(live: Live): Live {
  const { state } = live;
  const now = stepOf(state);
  let plan = live.plan;
  let breakUntil = live.breakUntil;
  let returnTo = live.returnTo;
  const copy = () => {
    if (plan === live.plan) plan = { ...plan, assignments: { ...plan.assignments } };
    if (breakUntil === live.breakUntil) breakUntil = { ...breakUntil };
    if (returnTo === live.returnTo) returnTo = { ...returnTo };
  };
  const goBack = (id: string) => {
    copy();
    plan.assignments[id] = freePlace(state, plan, returnTo[id] ?? 'tills', id);
    delete breakUntil[id];
    delete returnTo[id];
  };
  for (const s of onShift(state)) {
    const a = plan.assignments[s.id];
    if (!a) {
      copy();
      plan.assignments[s.id] = freePlace(state, plan, s.isTemp ? 'tills' : s.lastAssignment === 'break' || s.lastAssignment === 'task' ? 'tills' : s.lastAssignment, s.id);
    } else if (a === 'break') {
      if (breakUntil[s.id] === undefined) {
        copy();
        breakUntil[s.id] = now + BREAK_STEPS;
      } else if (now >= breakUntil[s.id]) goBack(s.id);
    } else if (a === 'task' && !state.floor?.tasks.some((t) => t.assigned === s.id)) goBack(s.id);
  }
  const out = plan === live.plan && breakUntil === live.breakUntil ? live : { ...live, plan, breakUntil, returnTo };
  return routine(out);
}

const AUTO = C.live.auto;

/** How much a shelf needs filling (share of it empty), or 0 when there is nothing in the stockroom to fill it with. */
export function shelfNeed(state: SimState, d: DeptId): number {
  if (!state.ctx.depts.includes(d) || S.total(state.stock[d].backroom) < 1) return 0;
  const cap = Math.max(1, state.ctx.shelfCap[d]);
  return Math.max(0, 1 - S.total(state.stock[d].shelf) / cap);
}

/** The shop is busy: a long queue for the tills that are open, or a burst of shoppers coming in. */
function isBusy(state: SimState, plan: HourPlan): boolean {
  const now = stepOf(state);
  const tills = Math.max(1, count(plan, 'tills'));
  if (state.queue.customers > AUTO.busyQueuePerTill * tills) return true;
  return !!state.floor?.bursts.some((b) => now >= b.warnAt && now < b.at + b.minutes);
}

/**
 * Routine jobs, every few minutes: people with nothing left to fill (or on an empty dock) move to the shelf
 * that needs it most, and the most tired person takes a break when nobody else is on one and the shop is calm.
 * Deterministic in the state, so a replayed day makes the same moves.
 */
function routine(live: Live): Live {
  const { state } = live;
  const now = stepOf(state);
  if (now % AUTO.everyMinutes !== 0 || isClosed(live) || state.floor?.pending) return live;
  const plan = { ...live.plan, assignments: { ...live.plan.assignments } };
  let changed = false;
  const staff = onShift(state).filter((s) => !s.isTemp && !isAway(state, s.id));
  const need = Object.fromEntries(DEPTS.map((d) => [d, shelfNeed(state, d)])) as Record<DeptId, number>;
  for (const s of staff) {
    const a = plan.assignments[s.id];
    const filling = a?.startsWith('replenish:') ? (a.split(':')[1] as DeptId) : null;
    if (!(a === 'receive' || (filling && need[filling] < AUTO.doneBelow))) continue;
    const best = DEPTS.filter((d) => need[d] >= AUTO.moveAbove && d !== filling && count(plan, `replenish:${d}` as AssignmentId, s.id) < assignmentLimit(`replenish:${d}` as AssignmentId, state)).sort(
      (x, y) => need[y] - need[x],
    )[0];
    if (best) {
      plan.assignments[s.id] = `replenish:${best}` as AssignmentId;
      changed = true;
    } else if (a === 'receive') {
      // Nothing needs filling: lend a hand at the tills.
      if (count(plan, 'tills', s.id) < assignmentLimit('tills', state)) {
        plan.assignments[s.id] = 'tills';
        changed = true;
      }
    }
  }
  let breakUntil = live.breakUntil;
  let returnTo = live.returnTo;
  if (count(plan, 'break') === 0 && !isBusy(state, plan)) {
    const tired = staff
      .filter((s) => s.energy < AUTO.breakBelow && plan.assignments[s.id] !== 'task' && plan.assignments[s.id] !== 'break' && (live.hold?.[s.id] ?? -1) <= now)
      .sort((x, y) => x.energy - y.energy || x.id.localeCompare(y.id))[0];
    if (tired && assignmentLimit('break', state) > 0) {
      const was = plan.assignments[tired.id];
      // The last person on the tills hands over to the liveliest filler first.
      if (was === 'tills' && count(plan, 'tills', tired.id) === 0) {
        const cover = staff
          .filter((s) => s.id !== tired.id && plan.assignments[s.id]?.startsWith('replenish:'))
          .sort((x, y) => y.energy - x.energy || x.id.localeCompare(y.id))[0];
        if (cover) plan.assignments[cover.id] = 'tills';
      }
      plan.assignments[tired.id] = 'break';
      breakUntil = { ...breakUntil, [tired.id]: now + BREAK_STEPS };
      returnTo = { ...returnTo, [tired.id]: was };
      changed = true;
    }
  }
  return changed ? { ...live, plan, breakUntil, returnTo } : live;
}

/** Raises the next question if its minute has come. */
function raiseDue(live: Live): Live {
  const f = live.state.floor;
  const now = stepOf(live.state);
  if (!f || f.pending || !f.events.length || f.events[0].at > now || isClosed(live)) return live;
  const state = structuredClone(live.state);
  const floor = state.floor!;
  // A surprise waits for a calm moment: not during a burst, nor while jobs are waiting on the floor.
  const burst = floor.bursts.some((b) => now >= b.warnAt && now < b.at + b.minutes);
  if (burst || floor.tasks.filter((t) => !t.assigned && t.kind !== 'errand').length >= 2) {
    floor.events[0].at = now + E.waitMinutes;
    return { ...live, state };
  }
  const ev = floor.events.shift()!;
  const filled = fillEvent(state, live.plan, ev);
  if (filled) floor.pending = filled;
  return { ...live, state };
}

/** Works out who or what a question is about; null when it doesn't apply now. */
function fillEvent(state: SimState, plan: HourPlan, ev: FloorEvent): FloorEvent | null {
  switch (ev.kind) {
    case 'breakRequest': {
      const tired = onShift(state)
        .filter((s) => !s.isTemp && plan.assignments[s.id] !== 'break')
        .sort((a, b) => a.energy - b.energy)[0];
      return tired ? { ...ev, staffId: tired.id } : null;
    }
    case 'nearDate': {
      const d = (['produce', 'chilled'] as DeptId[]).find((x) => state.ctx.depts.includes(x));
      return d ? { ...ev, dept: d } : null;
    }
    case 'complaint': {
      const empty = DEPTS.find((d) => state.ctx.depts.includes(d) && S.total(state.stock[d].shelf) < state.ctx.shelfCap[d] * 0.1);
      const reason = state.queue.customers > 5 ? 'how long the queue is' : empty ? `the empty ${deptName(empty).toLowerCase()} shelves` : 'a squashed loaf from yesterday';
      return { ...ev, reason };
    }
    default:
      return ev;
  }
}

export type EventPicture = 'loaf' | 'grumpy' | 'raffle' | 'sleepy' | 'apples';
export type AnswerIcon = 'yes' | 'no' | 'cake' | 'sorry' | 'gift';

/** A surprise as a picture card: a few words and two picture answers (cash shown where an answer costs some). */
export interface EventCard {
  title: string;
  picture: EventPicture;
  options: { label: string; icon: AnswerIcon; cost?: number }[];
}

export function describeEvent(state: SimState, ev: FloorEvent): EventCard {
  const name = state.staff.find((s) => s.id === ev.staffId)?.name ?? 'Someone';
  switch (ev.kind) {
    case 'breakRequest':
      return { title: `${name} needs a rest!`, picture: 'sleepy', options: [{ label: 'Go on then', icon: 'yes' }, { label: 'Not now', icon: 'no' }] };
    case 'favour':
      return { title: 'Keep Mrs Patel a loaf?', picture: 'loaf', options: [{ label: 'Of course!', icon: 'yes', cost: E.favour.cost }, { label: 'Sorry, no', icon: 'no' }] };
    case 'nearDate': {
      const d = ev.dept ?? 'produce';
      return { title: 'Cheap stock going!', picture: 'apples', options: [{ label: 'Take it', icon: 'yes', cost: E.nearDate.qty * C.departments[d].unitCost * E.nearDate.costShare }, { label: 'No thanks', icon: 'no' }] };
    }
    case 'complaint':
      return { title: 'Grumpy customer!', picture: 'grumpy', options: [{ label: 'Free cake', icon: 'cake', cost: E.complaint.voucher }, { label: 'Say sorry', icon: 'sorry' }] };
    case 'donation':
      return { title: 'School raffle prize?', picture: 'raffle', options: [{ label: 'Give a hamper', icon: 'gift', cost: E.donation.cost }, { label: 'Not this time', icon: 'no' }] };
  }
}

/** Applies an answer to the waiting question. Returns the new day and a line saying what happened. */
function answer(live: Live, option: number): { live: Live; result: string } {
  const ev = live.state.floor?.pending;
  if (!ev) throw new Error('No question is waiting.');
  const card = describeEvent(live.state, ev);
  if (option < 0 || option >= card.options.length) throw new Error('No such answer.');
  const state = structuredClone(live.state);
  const floor = state.floor!;
  const now = stepOf(state);
  const mood = (delta: number, minutes: number, label: string) => floor.mood.push({ delta, until: now + minutes, label });
  const spend = (amount: number) => {
    state.ledger.extras.Goodwill = (state.ledger.extras.Goodwill ?? 0) + amount;
    state.cash -= amount;
  };
  let next: Live = { ...live, state };
  let result = '';
  const staff = state.staff.find((s) => s.id === ev.staffId);
  switch (ev.kind) {
    case 'breakRequest':
      if (staff && option === 0) {
        staff.strain = Math.max(0, staff.strain - E.breakRequest.grantedStrainRelief);
        const was = live.plan.assignments[staff.id];
        const roomFull = count(live.plan, 'break', staff.id) >= assignmentLimit('break', live.state);
        if (was !== 'break' && !roomFull) {
          const plan = { ...live.plan, assignments: { ...live.plan.assignments, [staff.id]: 'break' as AssignmentId } };
          const t = floor.tasks.find((x) => x.assigned === staff.id);
          if (t) t.assigned = null;
          next = {
            ...next,
            plan,
            breakUntil: { ...live.breakUntil, [staff.id]: now + E.breakRequest.minutes },
            returnTo: { ...live.returnTo, [staff.id]: was === 'task' ? (live.returnTo[staff.id] ?? 'tills') : (was ?? 'tills') },
          };
        }
        result = 'Off for a cuppa!';
      } else if (staff) {
        staff.strain += E.breakRequest.refusedStrain;
        result = 'Back to work…';
      }
      break;
    case 'favour':
      if (option === 0) {
        spend(E.favour.cost);
        mood(E.favour.mood, E.favour.moodMinutes, 'Kept a loaf for Mrs Patel');
        result = 'Mrs Patel is delighted!';
      } else {
        mood(E.favour.refusedMood, E.favour.moodMinutes, 'Said no to a regular');
        result = 'Mrs Patel tuts.';
      }
      break;
    case 'nearDate':
      if (option === 0 && ev.dept) {
        const unit = C.departments[ev.dept].unitCost * E.nearDate.costShare;
        const cost = E.nearDate.qty * unit;
        state.cash -= cost;
        state.ledger.stockPurchases += cost;
        S.add(state.stock[ev.dept].dock, [{ qty: E.nearDate.qty, unitCost: unit, expiresAt: useByExpiry(E.nearDate.days), label: `Use by ${weekdayName(state.ctx.weekday + E.nearDate.days)}` }]);
        result = 'Bargain!';
      } else result = 'Maybe next time!';
      break;
    case 'complaint':
      if (option === 0) {
        spend(E.complaint.voucher);
        mood(E.complaint.voucherMood, E.complaint.moodMinutes, 'Made up for a complaint');
        result = 'All smiles again!';
      } else {
        mood(E.complaint.apologyMood, E.complaint.moodMinutes, 'Apologised to a customer');
        result = 'Fair enough, they say.';
      }
      break;
    case 'donation':
      if (option === 0) {
        spend(E.donation.cost);
        mood(E.donation.mood, E.donation.moodMinutes, 'Donated to the school fête');
        result = 'Thanks from the school!';
      } else result = 'Maybe next year!';
      break;
  }
  floor.pending = null;
  floor.lastAnswer = result;
  floor.counts.answered += 1;
  return { live: next, result };
}

/** Runs up to `minutes` minutes, stopping at closing and at a question waiting for an answer. */
export function advance(input: Live, minutes: number): { live: Live; reports: HourReport[] } {
  let live = raiseDue(settle(input));
  let left = Math.round(minutes);
  const reports: HourReport[] = [];
  while (left > 0 && !isClosed(live) && !live.state.floor?.pending) {
    const now = stepOf(live.state);
    const nextBreakEnd = Object.values(live.breakUntil).reduce((m, t) => Math.min(m, t), Infinity);
    const nextEvent = live.state.floor?.events[0]?.at ?? Infinity;
    // Someone hired this morning walks in at their minute.
    const nextArrival = live.state.staff.reduce((m, s) => (s.availableFromStep !== undefined && s.availableFromStep > now ? Math.min(m, s.availableFromStep) : m), Infinity);
    // While someone is on a floor job, go a minute at a time so they head back the minute it's done.
    const working = live.state.floor?.tasks.some((t) => t.assigned !== null) ? 1 : Infinity;
    const nextCheck = AUTO.everyMinutes - (now % AUTO.everyMinutes);
    const n = Math.max(1, Math.min(left, STEPS - (live.state.step ?? 0), nextBreakEnd - now, nextEvent - now, nextArrival - now, working, nextCheck));
    const r = runSteps(live.state, live.plan, n);
    reports.push(r.report);
    live = raiseDue(settle({ ...live, state: r.state }));
    left -= n;
  }
  return { live, reports };
}

/** Out at the cash-and-carry. */
export function isAway(state: SimState, staffId: string): boolean {
  return !!state.floor?.tasks.some((t) => t.kind === 'errand' && t.assigned === staffId);
}

/** Why a job change can't be made, or null. */
export function jobProblem(live: Live, staffId: string, job: AssignmentId): string | null {
  const s = onShift(live.state).find((x) => x.id === staffId);
  if (!s) return 'Not on shift yet.';
  if (isAway(live.state, staffId)) return `${s.name} is out at the cash-and-carry.`;
  if (isClosed(live)) return 'The shop is closed.';
  const lim = assignmentLimit(job, live.state);
  if (lim === 0) return 'The shop doesn’t have that yet.';
  return null;
}

/**
 * Moves one person. If the place is full, the person there longest swaps
 * into the mover's old job, so a move never leaves anyone without one.
 */
export function moveStaff(live: Live, staffId: string, job: AssignmentId): Record<string, AssignmentId> | null {
  if (jobProblem(live, staffId, job)) return null;
  if (isAway(live.state, staffId)) return null;
  const cur = live.plan.assignments[staffId];
  if (cur === job) return null;
  // Someone leaving a floor job (or a break) swaps into where they were going back to.
  const from = cur === 'task' || cur === 'break' ? (live.returnTo[staffId] ?? 'tills') : cur;
  const next = { ...live.plan.assignments, [staffId]: job };
  if (count(live.plan, job, staffId) >= assignmentLimit(job, live.state)) {
    const other = Object.keys(live.plan.assignments).find((id) => id !== staffId && live.plan.assignments[id] === job);
    if (!other) return null;
    next[other] = from;
  }
  return next;
}

/** Applies a choice made now. Throws if it isn't possible. */
export function choose(input: Live, c: Choice): Live {
  const live = input;
  if (isClosed(live)) throw new Error('The shop is closed.');
  switch (c.kind) {
    case 'jobs': {
      const plan = { ...live.plan, assignments: { ...c.assignments } };
      // Someone out at the cash-and-carry stays out.
      for (const t of live.state.floor?.tasks ?? []) if (t.kind === 'errand' && t.assigned) plan.assignments[t.assigned] = 'task';
      const breakUntil = { ...live.breakUntil };
      const returnTo = { ...live.returnTo };
      const hold = { ...live.hold };
      let state = live.state;
      for (const s of onShift(live.state)) {
        const was = live.plan.assignments[s.id];
        const now = plan.assignments[s.id];
        if (now === 'break' && was !== 'break') {
          breakUntil[s.id] = stepOf(live.state) + BREAK_STEPS;
          returnTo[s.id] = was === 'task' ? (live.returnTo[s.id] ?? 'tills') : (was ?? 'tills');
        } else if (now !== 'break' && now !== 'task') {
          delete breakUntil[s.id];
          delete returnTo[s.id];
          if (was === 'break') hold[s.id] = stepOf(live.state) + AUTO.holdMinutes;
        }
        // Leaving a floor job leaves it for someone else.
        if (was === 'task' && now !== 'task' && state.floor?.tasks.some((t) => t.assigned === s.id)) {
          if (state === live.state) state = structuredClone(live.state);
          for (const t of state.floor!.tasks) if (t.assigned === s.id) t.assigned = null;
        }
      }
      for (const a of new Set(Object.values(plan.assignments))) {
        if (count(plan, a) > assignmentLimit(a, live.state)) throw new Error('Too many people in one place.');
      }
      return settle({ ...live, state, plan, breakUntil, returnTo, hold });
    }
    case 'prices':
      if (!live.state.ctx.pricing && DEPTS.some((d) => c.pricing[d] !== live.plan.pricing[d])) throw new Error('Prices can’t be changed yet.');
      return { ...live, plan: { ...live.plan, pricing: { ...c.pricing } } };
    case 'action': {
      const state = takeAction(live.state, c.action);
      if (c.action.kind === 'letGo') {
        // They leave now: off the plan, and whoever they were covering for carries on.
        const id = c.action.staffId;
        const assignments = { ...live.plan.assignments };
        delete assignments[id];
        const breakUntil = { ...live.breakUntil };
        delete breakUntil[id];
        const returnTo = { ...live.returnTo };
        delete returnTo[id];
        return settle({ ...live, state, plan: { ...live.plan, assignments }, breakUntil, returnTo });
      }
      if (c.action.kind !== 'cashAndCarry') return { ...live, state };
      // Off to the cash-and-carry: back to their job when the run is done.
      const id = c.action.staffId;
      const was = live.plan.assignments[id];
      for (const t of state.floor?.tasks ?? []) if (t.assigned === id && t.kind !== 'errand') t.assigned = null;
      const breakUntil = { ...live.breakUntil };
      delete breakUntil[id];
      return settle({
        ...live,
        state,
        plan: { ...live.plan, assignments: { ...live.plan.assignments, [id]: 'task' } },
        returnTo: { ...live.returnTo, [id]: was === 'task' || was === 'break' ? (live.returnTo[id] ?? 'tills') : was },
        breakUntil,
      });
    }
    case 'task': {
      const task = live.state.floor?.tasks.find((t) => t.id === c.taskId);
      if (!task) throw new Error('That job has already gone.');
      if (!onShift(live.state).some((s) => s.id === c.staffId)) throw new Error('Not on shift.');
      if (task.kind === 'errand' || isAway(live.state, c.staffId)) throw new Error('Out at the cash-and-carry.');
      if (task.assigned === c.staffId) return live;
      const state = structuredClone(live.state);
      for (const t of state.floor!.tasks) {
        if (t.assigned === c.staffId) t.assigned = null;
        if (t.id === c.taskId) t.assigned = c.staffId;
      }
      const was = live.plan.assignments[c.staffId];
      const assignments = { ...live.plan.assignments, [c.staffId]: 'task' as AssignmentId };
      // Whoever was on this job goes back to theirs.
      if (task.assigned && task.assigned !== c.staffId) assignments[task.assigned] = live.returnTo[task.assigned] ?? 'tills';
      const returnTo = { ...live.returnTo, [c.staffId]: was === 'task' || was === 'break' ? (live.returnTo[c.staffId] ?? 'tills') : was };
      const breakUntil = { ...live.breakUntil };
      delete breakUntil[c.staffId];
      return settle({ ...live, state, plan: { ...live.plan, assignments }, returnTo, breakUntil });
    }
    case 'answer': {
      if (live.state.floor?.pending?.id !== c.eventId) throw new Error('That question isn’t waiting.');
      return settle(answer(live, c.option).live);
    }
  }
}

/** The choices that turn one plan into another (an edited plan from the panels). */
export function choicesFor(live: Live, next: HourPlan): Choice[] {
  const at = stepOf(live.state);
  const out: Choice[] = [];
  if (Object.keys(next.assignments).some((id) => next.assignments[id] !== live.plan.assignments[id])) out.push({ at, kind: 'jobs', assignments: { ...next.assignments } });
  if (DEPTS.some((d) => next.pricing[d] !== live.plan.pricing[d])) out.push({ at, kind: 'prices', pricing: { ...next.pricing } });
  for (const a of next.actions) out.push({ at, kind: 'action', action: { ...a } });
  return out;
}

/**
 * Runs `minutes` minutes, answering each question with its first answer.
 * For tests, scripted play and converting old saves; `made` collects the answers as choices.
 */
export function advanceAnswering(input: Live, minutes: number, made: Choice[] = []): Live {
  let live = input;
  const end = stepOf(live.state) + minutes;
  while (!isClosed(live) && stepOf(live.state) < end) {
    const p = live.state.floor?.pending;
    if (p) {
      const c: Choice = { at: stepOf(live.state), kind: 'answer', eventId: p.id, option: 0 };
      live = choose(live, c);
      made.push(c);
      continue;
    }
    live = advance(live, end - stepOf(live.state)).live;
  }
  const p = live.state.floor?.pending;
  if (p && !isClosed(live)) {
    const c: Choice = { at: stepOf(live.state), kind: 'answer', eventId: p.id, option: 0 };
    live = choose(live, c);
    made.push(c);
  }
  return live;
}

/** Rebuilds a day from its opening state, its choices and how far it had got. */
export function replayLive(start: SimState, choices: Choice[], upTo: number, autoAnswer?: Choice[]): Live {
  let live = raiseDue(startLive(start));
  const sorted = [...choices].sort((a, b) => a.at - b.at);
  let i = 0;
  while (true) {
    const now = stepOf(live.state);
    while (i < sorted.length && sorted[i].at <= now) {
      try {
        live = raiseDue(choose(live, sorted[i]));
      } catch {
        /* A choice that no longer applies is skipped. */
      }
      i += 1;
    }
    // Old saves have no answers: give the first one (and keep it, so the save replays the same way).
    const p = live.state.floor?.pending;
    if (p && autoAnswer && now < upTo) {
      const c: Choice = { at: now, kind: 'answer', eventId: p.id, option: 0 };
      live = choose(live, c);
      autoAnswer.push(c);
      continue;
    }
    // Stop at the minute reached, at closing, or at a question still waiting for its answer.
    if (isClosed(live) || now >= upTo || p) break;
    const nextAt = i < sorted.length ? sorted[i].at : Infinity;
    live = advance(live, Math.min(upTo, nextAt) - now).live;
  }
  return live;
}

/** Old saves stored one plan per hour: the same decisions as choices at each hour's start. */
export function choicesFromHourlyPlans(plans: HourPlan[]): Choice[] {
  const out: Choice[] = [];
  plans.forEach((p, h) => {
    const at = h * STEPS;
    out.push({ at, kind: 'jobs', assignments: { ...p.assignments } });
    out.push({ at, kind: 'prices', pricing: { ...p.pricing } });
    for (const a of p.actions) out.push({ at, kind: 'action', action: { ...a } });
  });
  return out;
}
