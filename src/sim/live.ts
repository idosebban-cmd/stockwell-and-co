/**
 * A trading day played live, minute by minute.
 *
 * The player's jobs and prices stand until they change them; actions happen
 * the moment they are chosen (also while paused). A break ends by itself
 * after `live.breakMinutes` and the person goes back to their job. Choices
 * are stamped with the minute they were made, so a day is stored as its
 * opening state plus its choices and rebuilt exactly by `replayLive`.
 *
 * Pure: no timers. The UI's clock calls `advance` once per in-game minute.
 */
import { CONFIG, DEPTS, type DeptId, type PriceTier } from './config';
import { assignmentLimit, defaultPlan, onShift, runSteps, takeAction } from './engine';
import type { ActionRequest, AssignmentId, HourPlan, HourReport, SimState } from './types';

const C = CONFIG;
const STEPS = C.stepsPerHour;
const BREAK_STEPS = Math.round((C.live.breakMinutes / 60) * STEPS);

export type Choice =
  | { at: number; kind: 'jobs'; assignments: Record<string, AssignmentId> }
  | { at: number; kind: 'prices'; pricing: Record<DeptId, PriceTier> }
  | { at: number; kind: 'action'; action: ActionRequest };

export interface Live {
  state: SimState;
  /** Standing jobs and prices. `actions` is always empty: actions are taken at once. */
  plan: HourPlan;
  /** Step each person on a break started it. */
  breakSince: Record<string, number>;
  /** The job each person on a break goes back to. */
  returnTo: Record<string, AssignmentId>;
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
  if (count(plan, want, who) < assignmentLimit(want, state)) return want;
  return FALLBACK.find((a) => a !== 'break' && count(plan, a, who) < assignmentLimit(a, state)) ?? 'break';
}

export function startLive(state: SimState): Live {
  const plan = defaultPlan(state);
  plan.actions = [];
  return settle({ state, plan, breakSince: {}, returnTo: {} });
}

/**
 * Keeps the standing plan valid at the current minute: people who have just
 * arrived get a job, and breaks that have run their time end.
 */
function settle(live: Live): Live {
  const { state } = live;
  const now = stepOf(state);
  let plan = live.plan;
  let breakSince = live.breakSince;
  let returnTo = live.returnTo;
  const copy = () => {
    if (plan === live.plan) plan = { ...plan, assignments: { ...plan.assignments } };
    if (breakSince === live.breakSince) breakSince = { ...breakSince };
    if (returnTo === live.returnTo) returnTo = { ...returnTo };
  };
  for (const s of onShift(state)) {
    const a = plan.assignments[s.id];
    if (!a) {
      copy();
      plan.assignments[s.id] = freePlace(state, plan, s.isTemp ? 'tills' : s.lastAssignment === 'break' ? 'tills' : s.lastAssignment, s.id);
    } else if (a === 'break') {
      if (breakSince[s.id] === undefined) {
        copy();
        breakSince[s.id] = now;
      } else if (now - breakSince[s.id] >= BREAK_STEPS) {
        copy();
        plan.assignments[s.id] = freePlace(state, plan, returnTo[s.id] ?? 'tills', s.id);
        delete breakSince[s.id];
        delete returnTo[s.id];
      }
    }
  }
  return plan === live.plan && breakSince === live.breakSince ? live : { ...live, plan, breakSince, returnTo };
}

/** Runs up to `minutes` minutes (stopping at closing). Returns the reports of the intervals run. */
export function advance(input: Live, minutes: number): { live: Live; reports: HourReport[] } {
  let live = settle(input);
  let left = Math.round(minutes);
  const reports: HourReport[] = [];
  while (left > 0 && !isClosed(live)) {
    const now = stepOf(live.state);
    const nextBreakEnd = Object.values(live.breakSince).reduce((m, t) => Math.min(m, t + BREAK_STEPS), Infinity);
    const n = Math.max(1, Math.min(left, STEPS - (live.state.step ?? 0), nextBreakEnd - now));
    const r = runSteps(live.state, live.plan, n);
    reports.push(r.report);
    live = settle({ ...live, state: r.state });
    left -= n;
  }
  return { live, reports };
}

/** Why a job change can't be made, or null. */
export function jobProblem(live: Live, staffId: string, job: AssignmentId): string | null {
  const s = onShift(live.state).find((x) => x.id === staffId);
  if (!s) return 'Not on shift yet.';
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
  const cur = live.plan.assignments[staffId];
  if (cur === job) return null;
  const next = { ...live.plan.assignments, [staffId]: job };
  if (count(live.plan, job, staffId) >= assignmentLimit(job, live.state)) {
    const other = Object.keys(live.plan.assignments).find((id) => id !== staffId && live.plan.assignments[id] === job);
    if (!other) return null;
    next[other] = cur;
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
      const breakSince = { ...live.breakSince };
      const returnTo = { ...live.returnTo };
      for (const s of onShift(live.state)) {
        const was = live.plan.assignments[s.id];
        const now = plan.assignments[s.id];
        if (now === 'break' && was !== 'break') {
          breakSince[s.id] = stepOf(live.state);
          returnTo[s.id] = was ?? 'tills';
        } else if (now !== 'break') {
          delete breakSince[s.id];
          delete returnTo[s.id];
        }
      }
      for (const a of new Set(Object.values(plan.assignments))) {
        if (count(plan, a) > assignmentLimit(a, live.state)) throw new Error('Too many people in one place.');
      }
      return settle({ ...live, plan, breakSince, returnTo });
    }
    case 'prices':
      if (!live.state.ctx.pricing && DEPTS.some((d) => c.pricing[d] !== live.plan.pricing[d])) throw new Error('Prices can’t be changed yet.');
      return { ...live, plan: { ...live.plan, pricing: { ...c.pricing } } };
    case 'action':
      return { ...live, state: takeAction(live.state, c.action) };
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

/** Rebuilds a day from its opening state, its choices and how far it had got. */
export function replayLive(start: SimState, choices: Choice[], upTo: number): Live {
  let live = startLive(start);
  const sorted = [...choices].sort((a, b) => a.at - b.at);
  let i = 0;
  while (true) {
    const now = stepOf(live.state);
    while (i < sorted.length && sorted[i].at <= now) {
      try {
        live = choose(live, sorted[i]);
      } catch {
        /* A choice that no longer applies is skipped. */
      }
      i += 1;
    }
    if (isClosed(live) || now >= upTo) break;
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
