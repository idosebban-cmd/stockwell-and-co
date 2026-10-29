/**
 * Scripted players used by the tests and the balance report. They only use
 * information the real player can see (forecast, stock, energy, events).
 */
import { CONFIG, DEPTS, type DeptId } from './config';
import { defaultPlan, deptUnits, describeAction, expectedCustomers, onShift, recommendedSetup, runHour, startDay } from './engine';
import type { ActionRequest, AssignmentId, HourPlan, HourReport, SetupPlan, SimState } from './types';
import { total } from './stock';

export type Strategy = (state: SimState) => HourPlan;

export interface ShiftResult {
  state: SimState;
  reports: HourReport[];
  plans: HourPlan[];
}

export function playShift(seed: number, strategy: Strategy, setup: SetupPlan = recommendedSetup()): ShiftResult {
  let state = startDay(seed, setup);
  const reports: HourReport[] = [];
  const plans: HourPlan[] = [];
  while (state.hour < CONFIG.hours) {
    const plan = strategy(state);
    plans.push(plan);
    const r = runHour(state, plan);
    state = r.state;
    reports.push(r.report);
  }
  return { state, reports, plans };
}

/** A sensible manager: tills to match the forecast, breaks spread out, shelves by need. */
export const sensible: Strategy = (state) => {
  const h = state.hour;
  const staff = onShift(state);
  const expected = expectedCustomers(state, h);
  const assignments: Record<string, AssignmentId> = {};
  const free = new Set(staff.map((s) => s.id));
  const byId = new Map(staff.map((s) => [s.id, s]));
  const assign = (id: string, a: AssignmentId) => {
    assignments[id] = a;
    free.delete(id);
  };

  // Breaks: whoever has worked longest, one at a time (two in quiet hours).
  const owed = staff.filter((s) => !s.isTemp && s.breaks === 0).length;
  const hoursLeft = Math.max(1, 7 - h);
  const breakSlots = h >= 1 && h <= 6 ? Math.min(CONFIG.staff.limits.break, Math.ceil(owed / hoursLeft) + (expected < 55 && owed > 0 ? 1 : 0) - (expected > 72 && owed < hoursLeft ? 1 : 0)) : 0;
  const needBreak = staff
    .filter((s) => !s.isTemp && s.breaks === 0 && s.consecutive >= 1)
    .sort((a, b) => b.consecutive - a.consecutive || a.energy - b.energy);
  for (const s of needBreak.slice(0, breakSlots)) assign(s.id, 'break');

  // Tills to match expected customers.
  const tillsNeeded = Math.min(CONFIG.checkout.tills, Math.max(1, Math.ceil((expected * 1.08) / CONFIG.checkout.customersPerHour)));
  const tillOrder = [...free].map((id) => byId.get(id)!).sort((a, b) => score(b) - score(a));
  function score(s: (typeof staff)[number]) {
    return (s.speciality === 'checkout' ? 2 : 0) + (s.speciality === 'calm' ? 1.5 : 0) + s.energy / 100;
  }
  for (const s of tillOrder.slice(0, tillsNeeded)) assign(s.id, 'tills');

  // Shelves first (where the gap is biggest), then receiving, then extra hands.
  const need: Record<DeptId, number> = { produce: 0, chilled: 0, ambient: 0 };
  for (const d of DEPTS) {
    const u = deptUnits(state, d);
    const demand = expected * CONFIG.departments[d].basket * 1.1;
    need[d] = Math.max(0, Math.min(u.backroom + Math.min(u.dock, CONFIG.staff.receiveRate * 0.5), demand + CONFIG.departments[d].shelfCapacity * 0.6 - u.shelf));
  }
  const count: Record<DeptId, number> = { produce: 0, chilled: 0, ambient: 0 };
  const remainingNeed = (d: DeptId) => need[d] - count[d] * CONFIG.departments[d].replenishRate;
  const pickFor = (d: DeptId) => {
    const pool = [...free].map((id) => byId.get(id)!);
    const pref = pool.find((s) => (d === 'produce' && s.speciality === 'produce') || (d === 'chilled' && s.speciality === 'chilled'));
    return pref ?? pool.sort((a, b) => b.energy - a.energy)[0];
  };
  const dock = DEPTS.reduce((t, d) => t + deptUnits(state, d).dock, 0);
  const room = DEPTS.some((d) => deptUnits(state, d).dock > 0 && deptUnits(state, d).backroom < CONFIG.departments[d].backroomCapacity * 0.75);
  if (dock > 0 && room && free.size > 0) {
    const recv = [...free].map((id) => byId.get(id)!).sort((a, b) => Number(b.speciality === 'receiving') - Number(a.speciality === 'receiving'));
    assign(recv[0].id, 'receive');
    if (dock > 600 && recv[1]) assign(recv[1].id, 'receive');
  }
  for (const d of [...DEPTS].sort((a, b) => remainingNeed(b) - remainingNeed(a))) {
    if (free.size === 0) break;
    if (remainingNeed(d) > 20) {
      const s = pickFor(d);
      assign(s.id, `replenish:${d}` as AssignmentId);
      count[d] += 1;
    }
  }
  for (const id of [...free]) {
    const options = DEPTS.filter((d) => count[d] < CONFIG.staff.limits.replenish && remainingNeed(d) > 0);
    const best = options.sort((a, b) => remainingNeed(b) - remainingNeed(a))[0];
    if (best) {
      assign(id, `replenish:${best}` as AssignmentId);
      count[best] += 1;
    } else if (Object.values(assignments).filter((a) => a === 'tills').length < CONFIG.checkout.tills) assign(id, 'tills');
    else assign(id, 'replenish:ambient');
  }

  // Commercial actions.
  const actions: ActionRequest[] = [];
  const tryAdd = (a: ActionRequest) => {
    if (describeAction(state, a, actions).available) actions.push(a);
  };
  if (state.fridge.status === 'fault' && state.fridge.repairAtStep === null) tryAdd({ kind: 'repair' });
  const rushSoon = state.scenario.events.some((e) => e.kind === 'rush' && e.warnAt <= h && e.hour === h + 1);
  if (rushSoon) tryAdd({ kind: 'temp' });
  if (h === CONFIG.hours - 2) {
    const shortDated = state.stock.chilled.shelf
      .concat(state.stock.chilled.backroom)
      .filter((b) => b.expiresAt !== null && b.expiresAt <= CONFIG.hours);
    const remainingDemand = (expectedCustomers(state, h) + expectedCustomers(state, h + 1)) * CONFIG.departments.chilled.basket;
    if (total(shortDated) > remainingDemand * 0.9) tryAdd({ kind: 'markdown', dept: 'chilled' });
  }
  return fixLimits(state, { assignments, pricing: { ...state.pricing }, actions });
};

/** Keeps the opening allocation all day and never takes a break. */
export const noBreaks: Strategy = (state) => {
  const plan = sensible(state);
  const staff = onShift(state);
  for (const s of staff) {
    if (plan.assignments[s.id] === 'break') plan.assignments[s.id] = 'replenish:ambient';
  }
  // Respect the replenish limit by moving extras to tills/receiving.
  return fixLimits(state, plan);
};

/** Only one person ever on the tills. */
export const oneTill: Strategy = (state) => {
  const plan = sensible(state);
  const tillers = Object.entries(plan.assignments).filter(([, a]) => a === 'tills');
  for (const [id] of tillers.slice(1)) plan.assignments[id] = 'replenish:ambient';
  return fixLimits(state, plan, ['tills']);
};

/** Everyone on tills and deliveries: nobody refills a shelf. */
export const noReplenishment: Strategy = (state) => {
  const plan = sensible(state);
  for (const [id, a] of Object.entries(plan.assignments)) {
    if (a.startsWith('replenish:')) plan.assignments[id] = 'receive';
  }
  return fixLimits(state, plan, ['replenish:produce', 'replenish:chilled', 'replenish:ambient']);
};

/** The do-nothing player: default plan every hour. */
export const passive: Strategy = (state) => defaultPlan(state);

export function fixLimits(state: SimState, plan: HourPlan, avoid: AssignmentId[] = []): HourPlan {
  const order: AssignmentId[] = ['tills', 'replenish:ambient', 'replenish:produce', 'replenish:chilled', 'receive', 'break'];
  const lim: Record<AssignmentId, number> = {
    tills: CONFIG.staff.limits.tills,
    'replenish:produce': CONFIG.staff.limits.replenish,
    'replenish:chilled': CONFIG.staff.limits.replenish,
    'replenish:ambient': CONFIG.staff.limits.replenish,
    receive: CONFIG.staff.limits.receive,
    break: CONFIG.staff.limits.break,
  };
  const counts = new Map<AssignmentId, number>();
  for (const s of onShift(state)) {
    let a = plan.assignments[s.id];
    if ((counts.get(a) ?? 0) >= lim[a]) {
      a = order.find((x) => !avoid.includes(x) && (counts.get(x) ?? 0) < lim[x]) ?? 'break';
    }
    counts.set(a, (counts.get(a) ?? 0) + 1);
    plan.assignments[s.id] = a;
  }
  return plan;
}
