/**
 * The Saturday simulation. Pure functions over plain data: no DOM, no timers,
 * no randomness beyond what the scenario already fixed from its seed.
 *
 * Flow: startDay(seed, setup) -> state at 09:00
 *       runHour(state, plan)   -> { state, report } (repeat eight times)
 * After the eighth hour the state is closed (state.hour === 8).
 */
import { CONFIG, DEPTS, deptName, hourLabel, type DeptId, type PriceTier } from './config';
import { makeScenario } from './scenario';
import { makeStaff, ROSTER, TEMP_ENTRY } from './roster';
import * as S from './stock';
import type {
  ActionRequest,
  AssignmentId,
  Batch,
  DeptHourReport,
  HourPlan,
  HourReport,
  Reason,
  SetupPlan,
  SimState,
  StaffHourReport,
  StaffMember,
  StepSnapshot,
  WasteLine,
} from './types';

const C = CONFIG;
const STEPS = C.stepsPerHour;

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

export function recommendedSetup(): SetupPlan {
  const o = C.openingOrder.recommended;
  return {
    orders: {
      produce: { ...o.produce },
      chilled: { ...o.chilled },
      ambient: { ...o.ambient },
    },
    pricing: { produce: 'standard', chilled: 'standard', ambient: 'standard' },
  };
}

export function carriedQty(dept: DeptId): number {
  return C.carriedStock[dept].reduce((t, b) => t + b.qty, 0);
}

export interface SetupCheck {
  cost: number;
  cashAfter: number;
  perDept: Record<DeptId, { cost: number; morningFits: boolean; space: number; middayOverflow: number }>;
  errors: string[];
}

export function checkSetup(setup: SetupPlan): SetupCheck {
  const errors: string[] = [];
  let cost = 0;
  const perDept = {} as SetupCheck['perDept'];
  for (const d of DEPTS) {
    const cfg = C.departments[d];
    const o = setup.orders[d];
    const m = Math.max(0, Math.round(o.morning));
    const md = Math.max(0, Math.round(o.midday));
    const c = (m + md) * cfg.unitCost;
    cost += c;
    const space = cfg.shelfCapacity + cfg.backroomCapacity - carriedQty(d);
    const morningFits = m <= space;
    if (!morningFits) errors.push(`${cfg.name}: the morning delivery doesn't fit (room for ${space}).`);
    if (md > C.openingOrder.maxMidday) errors.push(`${cfg.name}: the midday lorry takes at most ${C.openingOrder.maxMidday}.`);
    if (!Number.isFinite(o.morning) || !Number.isFinite(o.midday)) errors.push(`${cfg.name}: enter a number.`);
    perDept[d] = { cost: c, morningFits, space, middayOverflow: Math.max(0, md - cfg.backroomCapacity) };
  }
  const cashAfter = C.startingCash - cost;
  if (cashAfter < 0) errors.push(`That costs ${money(cost)}, but you only have ${money(C.startingCash)}.`);
  return { cost, cashAfter, perDept, errors };
}

function datedBatches(dept: DeptId, qty: number, unitCost: number): Batch[] {
  return C.deliveryDating[dept].map((s) => ({ qty: qty * s.share, unitCost, expiresAt: s.expiresAt, label: s.label }));
}

export function startDay(seed: number, setup: SetupPlan): SimState {
  const check = checkSetup(setup);
  if (check.errors.length) throw new Error(check.errors.join(' '));
  const scenario = makeScenario(seed);
  const stock = {} as SimState['stock'];
  let openingInventoryValue = 0;
  for (const d of DEPTS) {
    const cfg = C.departments[d];
    const shelf: Batch[] = [];
    const backroom: Batch[] = [];
    for (const cb of C.carriedStock[d]) {
      const b: Batch = { qty: cb.qty, unitCost: cfg.unitCost, expiresAt: cb.expiresAt, label: cb.label };
      openingInventoryValue += b.qty * b.unitCost;
      S.add(cb.where === 'shelf' ? shelf : backroom, [b]);
    }
    // Night crew puts the morning delivery away: shelves first, then stockroom.
    const morning = Math.round(setup.orders[d].morning);
    S.add(backroom, datedBatches(d, morning, cfg.unitCost));
    const space = Math.max(0, cfg.shelfCapacity - S.total(shelf));
    S.add(shelf, S.take(backroom, space));
    stock[d] = { shelf, backroom, dock: [] };
  }
  const staff = ROSTER.map((r) => makeStaff(r));
  const state: SimState = {
    seed,
    scenario,
    hour: 0,
    cash: C.startingCash - check.cost,
    openingInventoryValue,
    ledger: { revenue: 0, cogs: 0, waste: 0, wages: 0, extras: {}, stockPurchases: check.cost },
    stock,
    queue: { customers: 0, baskets: { produce: [], chilled: [], ambient: [] } },
    staff,
    pricing: { ...setup.pricing },
    deliveries: [],
    markdowns: [],
    promotions: [],
    used: { markdown: [], promotions: 0, emergency: 0, temp: false, repair: false },
    fridge: { status: 'ok', repairAtStep: null },
    satisfaction: { weightedSum: 0, customers: 0 },
    history: [],
    announcements: ['Doors open at 09:00. The kettle is on.'],
    idCounter: 0,
  };
  for (const d of DEPTS) {
    const qty = Math.round(setup.orders[d].midday);
    if (qty > 0) {
      state.deliveries.push({
        id: `midday-${d}`,
        dept: d,
        qty,
        unitCost: C.departments[d].unitCost,
        arrivesAt: C.openingOrder.middayHour,
        kind: 'midday',
        originalHour: C.openingOrder.middayHour,
      });
    }
  }
  prepareHour(state, []);
  return state;
}

// ---------------------------------------------------------------------------
// Between hours: announcements, expiry, deliveries arriving at the dock
// ---------------------------------------------------------------------------

function prepareHour(state: SimState, waste: WasteLine[]): void {
  const h = state.hour;
  const notes: string[] = [];
  for (const ev of state.scenario.events) {
    if (ev.warnAt === h) {
      if (ev.kind === 'rush') {
        notes.push(
          ev.warnAt < ev.hour
            ? `Heads up: the school fête lets out at ${hourLabel(ev.hour)}. Expect a rush from ${hourLabel(ev.hour)} to ${hourLabel(ev.hour + 1)}.`
            : `A coach party has just pulled up. Brace yourselves.`,
        );
      } else if (ev.kind === 'delayedDelivery') {
        const due = state.deliveries.filter((x) => x.kind === 'midday' && x.arrivesAt === ev.hour);
        for (const x of due) x.arrivesAt += C.events.delayedDelivery.delayHours;
        notes.push(
          due.length
            ? `The wholesaler rang: the midday lorry is stuck behind a tractor. It will now arrive at ${hourLabel(ev.hour + C.events.delayedDelivery.delayHours)}, not ${hourLabel(ev.hour)}.`
            : `The wholesaler's lorry is running late today. Luckily, you didn't order a midday delivery.`,
        );
      }
    }
    if (ev.kind === 'fridgeFault' && ev.hour === h && state.fridge.status === 'ok') {
      state.fridge.status = 'fault';
      notes.push(
        `Chiller cabinet 2 has stopped humming, which is worse than when it hummed. Half the chilled shelf is out of use: move stock to the cold room (staff on Chilled do this first) or call an engineer.`,
      );
    }
  }
  // Expiry at the start of the hour.
  for (const d of DEPTS) expire(state, d, h, waste, notes);
  // Deliveries reaching the dock.
  for (const del of state.deliveries.filter((x) => x.arrivesAt === h)) {
    S.add(state.stock[del.dept].dock, datedBatches(del.dept, del.qty, del.unitCost));
    notes.push(
      `${del.kind === 'emergency' ? 'Emergency' : 'Midday'} delivery: ${Math.round(del.qty)} ${deptName(del.dept).toLowerCase()} items are on the dock waiting to be received.`,
    );
  }
  state.deliveries = state.deliveries.filter((x) => x.arrivesAt !== h);
  for (const s of state.staff) {
    if (s.isTemp && s.availableFrom === h) notes.push(`The agency temp has arrived and is asking where the toilets are.`);
  }
  state.announcements = notes;
}

function expire(state: SimState, d: DeptId, t: number, waste: WasteLine[], notes: string[]): void {
  const st = state.stock[d];
  const gone = [
    ...S.takeExpired(st.shelf, t),
    ...S.takeExpired(st.backroom, t),
    ...S.takeExpired(st.dock, t),
    ...S.takeExpired(state.queue.baskets[d], t),
  ];
  const qty = S.total(gone);
  const cost = S.value(gone);
  writeOff(state, waste, d, qty, cost, 'expired');
  if (qty >= 0.5) {
    const label = gone[0]?.label ?? 'stock';
    notes.push(`${Math.round(qty)} ${deptName(d).toLowerCase()} items (${label.toLowerCase()}) went past their date and were binned (${money(cost)}).`);
  }
}

function writeOff(state: SimState, waste: WasteLine[], dept: DeptId, qty: number, cost: number, reason: WasteLine['reason']): void {
  if (qty <= 0) return;
  state.ledger.waste += cost;
  const existing = waste.find((w) => w.dept === dept && w.reason === reason);
  if (existing) {
    existing.qty += qty;
    existing.cost += cost;
  } else waste.push({ dept, qty, cost, reason });
}

function addExtra(state: SimState, line: string, amount: number): void {
  state.ledger.extras[line] = (state.ledger.extras[line] ?? 0) + amount;
  state.cash -= amount;
}

// ---------------------------------------------------------------------------
// Queries used by the engine and the UI
// ---------------------------------------------------------------------------

export function onShift(state: SimState, hour = state.hour): StaffMember[] {
  return state.staff.filter((s) => s.availableFrom <= hour);
}

export function productivity(energy: number): number {
  const t = C.staff.tiredBelow;
  if (energy >= t) return 1;
  const e = Math.max(0, energy);
  return C.staff.minProductivity + (1 - C.staff.minProductivity) * (e / t);
}

export function priceFor(state: SimState, d: DeptId, hour = state.hour, tier: PriceTier = state.pricing[d]): number {
  void hour;
  return round2(C.departments[d].standardPrice * C.pricing[tier].priceMult);
}

/** Yellow-sticker price for short-dated items while a markdown runs. */
export function markdownPrice(d: DeptId): number {
  return round2(C.departments[d].standardPrice * C.actions.markdown.priceMult);
}

/** Expires before the shop next opens (or sooner). */
export function isShortDated(b: Batch): boolean {
  return b.expiresAt !== null && b.expiresAt <= C.hours;
}

export function shortDatedUnits(state: SimState, d: DeptId): number {
  const st = state.stock[d];
  return S.total([...st.shelf, ...st.backroom, ...st.dock].filter(isShortDated));
}

export function markdownActive(state: SimState, d: DeptId, hour = state.hour): boolean {
  return state.markdowns.some((m) => m.dept === d && m.from <= hour && hour < m.to);
}

export function promotionActive(state: SimState, d: DeptId, hour = state.hour): boolean {
  return state.promotions.some((m) => m.dept === d && m.from <= hour && hour < m.to);
}

export function demandMultiplier(state: SimState, d: DeptId, hour = state.hour, tier: PriceTier = state.pricing[d]): number {
  let m: number = C.pricing[tier].demandMult;
  if (markdownActive(state, d, hour) && shortDatedUnits(state, d) > 0) m *= C.actions.markdown.demandMult;
  if (promotionActive(state, d, hour)) m *= C.actions.promotion.demandMult;
  return Math.min(C.demand.maxDeptMult, m);
}

export function satisfactionSoFar(state: SimState): number {
  if (state.satisfaction.customers <= 0) return C.satisfaction.initial;
  return state.satisfaction.weightedSum / state.satisfaction.customers;
}

export function wellbeing(state: SimState): number {
  const staff = state.staff.filter((s) => !s.isTemp);
  const avg = staff.reduce((t, s) => t + s.strain, 0) / Math.max(1, staff.length);
  return clamp(100 - avg * C.wellbeing.strainScale, 0, 100);
}

export function footfallMultiplier(state: SimState): number {
  const f = C.demand.satisfactionFootfall;
  return clamp(1 + (satisfactionSoFar(state) - f.pivot) * f.perPoint, f.min, f.max);
}

export function expectedCustomers(state: SimState, hour = state.hour): number {
  const rush = state.scenario.events.some((e) => e.kind === 'rush' && e.hour === hour && e.warnAt <= state.hour);
  return state.scenario.forecast[hour] * (rush ? C.events.rush.customerMult : 1);
}

export function operatingProfit(state: SimState): number {
  const l = state.ledger;
  const extras = Object.values(l.extras).reduce((t, x) => t + x, 0);
  return l.revenue - l.cogs - l.waste - l.wages - extras;
}

export function inventoryValue(state: SimState): number {
  let v = 0;
  for (const d of DEPTS) {
    const st = state.stock[d];
    v += S.value(st.shelf) + S.value(st.backroom) + S.value(st.dock) + S.value(state.queue.baskets[d]);
  }
  return v;
}

export function deptUnits(state: SimState, d: DeptId): { shelf: number; backroom: number; dock: number; pending: number } {
  const st = state.stock[d];
  return {
    shelf: S.total(st.shelf),
    backroom: S.total(st.backroom),
    dock: S.total(st.dock),
    pending: state.deliveries.filter((x) => x.dept === d).reduce((t, x) => t + x.qty, 0),
  };
}

export function shelfCapacity(state: SimState, d: DeptId): number {
  const cap = C.departments[d].shelfCapacity;
  if (d === 'chilled' && state.fridge.status === 'fault') return cap * C.events.fridgeFault.capacityShare;
  return cap;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export interface ActionInfo {
  title: string;
  cost: number;
  available: boolean;
  reason: string | null;
  timing: string;
  effect: string;
}

export function actionKey(a: ActionRequest): string {
  return 'dept' in a ? `${a.kind}:${a.dept}` : a.kind;
}

export function actionCost(a: ActionRequest): number {
  switch (a.kind) {
    case 'markdown':
      return 0;
    case 'promotion':
      return C.actions.promotion.cost;
    case 'emergency':
      return C.actions.emergency.qty * C.departments[a.dept].unitCost * C.actions.emergency.costMult + C.actions.emergency.deliveryFee;
    case 'temp':
      return C.actions.temp.bookingFee;
    case 'repair':
      return C.actions.repair.cost;
  }
}

/** Describes an action for the confirmation panel and whether it can be taken now. */
export function describeAction(state: SimState, a: ActionRequest, alreadyPlanned: ActionRequest[] = []): ActionInfo {
  const h = state.hour;
  const left = C.hours - h;
  const cost = actionCost(a);
  const dup = alreadyPlanned.some((x) => actionKey(x) === actionKey(a));
  const plannedCost = alreadyPlanned.filter((x) => actionKey(x) !== actionKey(a)).reduce((t, x) => t + actionCost(x), 0);
  let reason: string | null = null;
  let title = '';
  let timing = '';
  let effect = '';
  const A = C.actions;
  switch (a.kind) {
    case 'markdown': {
      const dur = Math.min(A.markdown.durationHours, left);
      const p = markdownPrice(a.dept);
      const short = shortDatedUnits(state, a.dept);
      title = `Mark down ${deptName(a.dept).toLowerCase()}`;
      timing = `Starts now, runs ${dur} hour${dur === 1 ? '' : 's'} (until ${hourLabel(h + dur)}).`;
      effect = `Yellow stickers on the ~${Math.round(short)} short-dated items: ${money(p)} each instead of ${money(priceFor(state, a.dept))} (cost ${money(C.departments[a.dept].unitCost)}). About ${pct(A.markdown.demandMult - 1)} more items wanted while they last. Fresher stock stays full price.`;
      if (!C.departments[a.dept].perishable) reason = 'Only perishable departments can be marked down.';
      else if (state.used.markdown.includes(a.dept)) reason = 'Already marked down today.';
      else if (short < 1) reason = 'Nothing short-dated to sticker.';
      break;
    }
    case 'promotion': {
      const dur = Math.min(A.promotion.durationHours, left);
      title = `Promote ${deptName(a.dept).toLowerCase()}`;
      timing = `Starts now, runs ${dur} hour${dur === 1 ? '' : 's'} (until ${hourLabel(h + dur)}).`;
      effect = `Tasting stand and shelf talkers: about ${pct(A.promotion.demandMult - 1)} more ${deptName(a.dept).toLowerCase()} items wanted. More stock and checkout work needed.`;
      if (state.used.promotions >= A.promotion.maxPerDay) reason = `Only ${A.promotion.maxPerDay} promotions per day (the leaflet budget is a biscuit tin).`;
      else if (DEPTS.some((d) => promotionActive(state, d, h))) reason = 'A promotion is already running. One at a time.';
      break;
    }
    case 'emergency': {
      const cfg = C.departments[a.dept];
      title = `Emergency order: ${deptName(a.dept).toLowerCase()}`;
      timing = `Arrives on the dock at ${hourLabel(h + A.emergency.delayHours)}. Someone must receive it.`;
      effect = `${A.emergency.qty} items at ${money(cfg.unitCost * A.emergency.costMult)} each (normally ${money(cfg.unitCost)}) plus a ${money(A.emergency.deliveryFee)} delivery fee.`;
      if (state.used.emergency >= A.emergency.maxPerDay) reason = `The cash-and-carry van only does ${A.emergency.maxPerDay} runs a day.`;
      else if (state.deliveries.some((x) => x.kind === 'emergency' && x.dept === a.dept)) reason = 'An emergency order for this department is already on its way.';
      else if (h + A.emergency.delayHours >= C.hours) reason = 'It would arrive after closing.';
      break;
    }
    case 'temp': {
      const from = h + A.temp.delayHours;
      const hours = C.hours - from;
      title = 'Book an agency temp';
      timing = `Arrives at ${hourLabel(from)} and stays until close (${hours} hour${hours === 1 ? '' : 's'}).`;
      effect = `Booking fee ${money(A.temp.bookingFee)} now, then ${money(A.temp.hourlyFee)}/hour (${money(A.temp.bookingFee + A.temp.hourlyFee * Math.max(0, hours))} in total). Works ${pct(1 - A.temp.productivity)} slower than regulars.`;
      if (state.used.temp) reason = 'The agency has no one else free today.';
      else if (hours < A.temp.minHoursOnShift) reason = `Too late: they would work under ${A.temp.minHoursOnShift} hours.`;
      break;
    }
    case 'repair': {
      const mins = A.repair.arrivalSteps * 10;
      title = 'Call the refrigeration engineer';
      timing = `Arrives about ${mins} minutes into this hour and fixes the cabinet.`;
      effect = `Restores the full chilled shelf. Callout fee ${money(A.repair.cost)}.`;
      if (state.fridge.status !== 'fault') reason = 'The chillers are working.';
      else if (state.fridge.repairAtStep !== null) reason = 'The engineer is already booked.';
      break;
    }
  }
  if (!reason && h >= C.hours) reason = 'The shop is closed.';
  if (!reason && dup) reason = 'Already in this hour’s plan.';
  if (!reason && cost + plannedCost > state.cash + 1e-6) reason = `Not enough cash (${money(state.cash - plannedCost)} available).`;
  return { title, cost, available: reason === null, reason, timing, effect };
}

// ---------------------------------------------------------------------------
// Plan validation
// ---------------------------------------------------------------------------

export function assignmentLimit(a: AssignmentId): number {
  if (a === 'tills') return C.staff.limits.tills;
  if (a === 'receive') return C.staff.limits.receive;
  if (a === 'break') return C.staff.limits.break;
  return C.staff.limits.replenish;
}

export function planErrors(state: SimState, plan: HourPlan): string[] {
  const errors: string[] = [];
  if (state.hour >= C.hours) return ['The shop is closed.'];
  const counts = new Map<AssignmentId, number>();
  for (const s of onShift(state)) {
    const a = plan.assignments[s.id];
    if (!a) {
      errors.push(`${s.name} has no job.`);
      continue;
    }
    counts.set(a, (counts.get(a) ?? 0) + 1);
  }
  for (const [a, n] of counts) {
    const lim = assignmentLimit(a);
    if (n > lim) errors.push(`${labelFor(a)} has room for ${lim}, not ${n}.`);
  }
  const planned: ActionRequest[] = [];
  for (const a of plan.actions) {
    const info = describeAction(state, a, planned);
    if (!info.available) errors.push(`${info.title}: ${info.reason}`);
    planned.push(a);
  }
  return errors;
}

function labelFor(a: AssignmentId): string {
  if (a === 'tills') return 'The tills';
  if (a === 'receive') return 'The delivery dock';
  if (a === 'break') return 'The break room';
  return `${deptName(a.split(':')[1] as DeptId)}`;
}

// ---------------------------------------------------------------------------
// Running an hour
// ---------------------------------------------------------------------------

export interface RunOptions {
  /** Use the visible forecast instead of the hidden variation (for previews). */
  forecastOnly?: boolean;
}

function applyActions(state: SimState, actions: ActionRequest[]): void {
  const h = state.hour;
  const A = C.actions;
  for (const a of actions) {
    switch (a.kind) {
      case 'markdown':
        state.markdowns.push({ dept: a.dept, from: h, to: h + A.markdown.durationHours });
        state.used.markdown.push(a.dept);
        break;
      case 'promotion':
        state.promotions.push({ dept: a.dept, from: h, to: h + A.promotion.durationHours });
        state.used.promotions += 1;
        addExtra(state, 'Promotions', A.promotion.cost);
        break;
      case 'emergency': {
        const unit = C.departments[a.dept].unitCost * A.emergency.costMult;
        const stockCost = A.emergency.qty * unit;
        state.cash -= stockCost;
        state.ledger.stockPurchases += stockCost;
        addExtra(state, 'Emergency delivery fees', A.emergency.deliveryFee);
        state.used.emergency += 1;
        state.deliveries.push({
          id: `emergency-${a.dept}-${state.idCounter++}`,
          dept: a.dept,
          qty: A.emergency.qty,
          unitCost: unit,
          arrivesAt: h + A.emergency.delayHours,
          kind: 'emergency',
          originalHour: h + A.emergency.delayHours,
        });
        break;
      }
      case 'temp': {
        addExtra(state, 'Agency temp', A.temp.bookingFee);
        state.used.temp = true;
        const t = makeStaff(TEMP_ENTRY, h + A.temp.delayHours, true);
        t.lastAssignment = 'tills';
        state.staff.push(t);
        break;
      }
      case 'repair':
        addExtra(state, 'Chiller repair', A.repair.cost);
        state.used.repair = true;
        state.fridge.repairAtStep = h * STEPS + A.repair.arrivalSteps;
        break;
    }
  }
}

function skill(s: StaffMember, a: AssignmentId): number {
  const b = 1 + C.staff.specialityBonus;
  let m = s.isTemp ? C.actions.temp.productivity : 1;
  if (a === 'tills' && s.speciality === 'checkout') m *= b;
  if (a === 'replenish:produce' && s.speciality === 'produce') m *= b;
  if (a === 'replenish:chilled' && s.speciality === 'chilled') m *= b;
  if (a === 'receive' && s.speciality === 'receiving') m *= b;
  return m * productivity(s.energy);
}

function emptyDeptReport(): DeptHourReport {
  return {
    wanted: 0,
    picked: 0,
    sold: 0,
    revenue: 0,
    cogs: 0,
    lostShelfGap: 0,
    lostNoStock: 0,
    abandonedItems: 0,
    replenished: 0,
    replenishCapacity: 0,
    received: 0,
    shelfEmptySteps: 0,
    shelfStart: 0,
    shelfEnd: 0,
    backroomEnd: 0,
    dockEnd: 0,
    price: 0,
    demandMult: 1,
    priceEffect: 0,
  };
}

export function runHour(input: SimState, plan: HourPlan, opts: RunOptions = {}): { state: SimState; report: HourReport } {
  const errors = planErrors(input, plan);
  if (errors.length) throw new Error(errors.join(' '));
  const state: SimState = structuredClone(input);
  const h = state.hour;
  const sc = state.scenario;
  const waste: WasteLine[] = [];
  const messages: string[] = [];
  const ledgerBefore = { ...state.ledger, extrasTotal: sumExtras(state) };

  state.pricing = { ...plan.pricing };
  applyActions(state, plan.actions);

  // Staff capacities for the hour (energy at the start of the hour).
  const working = onShift(state, h);
  const assigned = working.map((s) => ({ s, a: plan.assignments[s.id] as AssignmentId, energyBefore: s.energy }));
  let tillCap = 0;
  let receiveCap = 0;
  const replCap: Record<DeptId, number> = { produce: 0, chilled: 0, ambient: 0 };
  let calm = false;
  for (const { s, a } of assigned) {
    const k = skill(s, a);
    if (a === 'tills') {
      tillCap += C.checkout.customersPerHour * k;
      if (s.speciality === 'calm') calm = true;
    } else if (a === 'receive') receiveCap += C.staff.receiveRate * k;
    else if (a.startsWith('replenish:')) {
      const d = a.split(':')[1] as DeptId;
      replCap[d] += C.departments[d].replenishRate * k;
    }
  }
  const patience = C.checkout.patienceMinutes + (calm ? C.staff.calmPatienceMinutes : 0);

  // Demand for the hour.
  const rush = sc.events.find((e) => e.kind === 'rush' && e.hour === h);
  const noiseC = opts.forecastOnly ? 1 : sc.customerNoise[h];
  const customers = sc.forecast[h] * noiseC * (rush ? C.events.rush.customerMult : 1) * footfallMultiplier(state);
  const mult: Record<DeptId, number> = { produce: 1, chilled: 1, ambient: 1 };
  const price: Record<DeptId, number> = { produce: 0, chilled: 0, ambient: 0 };
  const dept: Record<DeptId, DeptHourReport> = { produce: emptyDeptReport(), chilled: emptyDeptReport(), ambient: emptyDeptReport() };
  const mdOn = perDept((d) => markdownActive(state, d, h));
  const plainMult = perDept((d) => {
    let m: number = C.pricing[state.pricing[d]].demandMult;
    if (promotionActive(state, d, h)) m *= C.actions.promotion.demandMult;
    return Math.min(C.demand.maxDeptMult, m) * (opts.forecastOnly ? 1 : sc.deptNoise[d][h]);
  });
  const mdMult = perDept((d) => {
    let m: number = C.pricing[state.pricing[d]].demandMult * C.actions.markdown.demandMult;
    if (promotionActive(state, d, h)) m *= C.actions.promotion.demandMult;
    return Math.min(C.demand.maxDeptMult, m) * (opts.forecastOnly ? 1 : sc.deptNoise[d][h]);
  });
  for (const d of DEPTS) {
    mult[d] = mdOn[d] && shortDatedUnits(state, d) > 0 ? mdMult[d] : plainMult[d];
    price[d] = priceFor(state, d, h);
    dept[d].price = price[d];
    dept[d].demandMult = mult[d];
    dept[d].shelfStart = S.total(state.stock[d].shelf);
    dept[d].replenishCapacity = replCap[d];
  }

  const used = { till: 0, receive: 0, repl: { produce: 0, chilled: 0, ambient: 0 } as Record<DeptId, number> };
  let served = 0;
  let abandoned = 0;
  let waitWeighted = 0;
  let maxQueue = state.queue.customers;
  const steps: StepSnapshot[] = [];

  for (let k = 0; k < STEPS; k++) {
    const abs = h * STEPS + k;
    if (state.fridge.status === 'fault' && state.fridge.repairAtStep !== null && abs >= state.fridge.repairAtStep) {
      state.fridge.status = 'fixed';
      messages.push(`The engineer fixed chiller cabinet 2 at about ${hourLabel(h).slice(0, 2)}:${String(k * 10).padStart(2, '0')}. He took a biscuit.`);
    }

    // 1. Receive deliveries into the stockroom (chilled first: cold chain).
    let rcap = receiveCap / STEPS;
    for (const d of ['chilled', 'produce', 'ambient'] as DeptId[]) {
      const st = state.stock[d];
      const space = Math.max(0, C.departments[d].backroomCapacity - S.total(st.backroom));
      const n = Math.min(rcap, S.total(st.dock), space);
      if (n > 0) {
        S.add(st.backroom, S.take(st.dock, n));
        rcap -= n;
        used.receive += n;
        dept[d].received += n;
      }
    }

    // 2. Stock left on the dock deteriorates.
    for (const d of DEPTS) {
      const rate = C.departments[d].dockSpoilPerHour / STEPS;
      if (rate > 0) {
        const lost = S.takeShare(state.stock[d].dock, rate);
        writeOff(state, waste, d, S.total(lost), S.value(lost), 'dock');
      }
    }

    // 3. Replenish shelves (rescuing stock from a broken chiller comes first).
    for (const d of DEPTS) {
      const st = state.stock[d];
      let cap = replCap[d] / STEPS;
      const shelfCap = shelfCapacity(state, d);
      const excess = S.total(st.shelf) - shelfCap;
      if (excess > 1e-9) {
        const space = Math.max(0, C.departments[d].backroomCapacity - S.total(st.backroom));
        const rescue = Math.min(cap, excess, space);
        if (rescue > 0) {
          S.add(st.backroom, S.takeNewest(st.shelf, rescue));
          cap -= rescue;
          used.repl[d] += rescue;
        }
        const stranded = S.total(st.shelf) - shelfCap;
        if (stranded > 1e-9 && d === 'chilled') {
          const share = (stranded / S.total(st.shelf)) * (C.events.fridgeFault.spoilPerHour / STEPS);
          const lost = S.takeShare(st.shelf, share);
          writeOff(state, waste, d, S.total(lost), S.value(lost), 'fridge');
        }
      }
      const space = Math.max(0, shelfCap - S.total(st.shelf));
      const n = Math.min(cap, space, S.total(st.backroom));
      if (n > 0) {
        // Rotation is good but not perfect: some fresher stock goes out early.
        S.add(st.shelf, S.take(st.backroom, n * C.demand.rotation));
        S.add(st.shelf, S.takeNewest(st.backroom, n * (1 - C.demand.rotation)));
        used.repl[d] += n;
        dept[d].replenished += n;
      }
    }

    // 4. Customers arrive and pick what is on the shelves.
    const arrivals = customers / STEPS;
    const empty: DeptId[] = [];
    for (const d of DEPTS) {
      const st = state.stock[d];
      // The markdown boost lasts only while yellow-stickered stock remains.
      const stepMult = mdOn[d] && shortDatedUnits(state, d) > 0 ? mdMult[d] : plainMult[d];
      const wanted = arrivals * C.departments[d].basket * stepMult;
      const picked = Math.min(wanted, S.total(st.shelf));
      // Most shoppers take from the front; some reach for the freshest at the back.
      S.add(state.queue.baskets[d], S.take(st.shelf, picked * C.demand.rotation));
      S.add(state.queue.baskets[d], S.takeNewest(st.shelf, picked * (1 - C.demand.rotation)));
      const unmet = wanted - picked;
      const elsewhere = S.total(st.backroom) + S.total(st.dock);
      const gap = Math.min(unmet, elsewhere);
      dept[d].wanted += wanted;
      dept[d].picked += picked;
      dept[d].lostShelfGap += gap;
      dept[d].lostNoStock += unmet - gap;
      if (S.total(st.shelf) < 1 && wanted > 0) {
        dept[d].shelfEmptySteps += 1;
        empty.push(d);
      }
    }

    // 5. Checkout. Expected wait comes from the backlog plus half this step's arrivals.
    const backlog = state.queue.customers;
    state.queue.customers += arrivals;
    const q = state.queue.customers;
    maxQueue = Math.max(maxQueue, q);
    const perMinute = tillCap / 60;
    const wait = perMinute > 0 ? C.checkout.baseServiceMinutes + (backlog + arrivals / 2) / perMinute : 45;
    const capStep = tillCap / STEPS;
    const s = Math.min(q, capStep);
    if (s > 0 && q > 0) {
      const share = s / q;
      for (const d of DEPTS) {
        recordSale(state, dept[d], d, S.takeShare(state.queue.baskets[d], share), price[d], mdOn[d]);
      }
      state.queue.customers -= s;
      served += s;
      used.till += s;
      waitWeighted += s * Math.min(wait, 45);
    }

    // 6. Abandonment when the wait exceeds patience. Baskets are put back.
    let left = 0;
    const remaining = state.queue.customers;
    if (remaining > 1e-9 && wait > patience) {
      const frac = Math.min(C.checkout.maxAbandonPerStep, (wait - patience) * C.checkout.abandonPerMinute);
      left = remaining * frac;
      for (const d of DEPTS) {
        const dropped = S.takeShare(state.queue.baskets[d], frac);
        const qty = S.total(dropped);
        dept[d].abandonedItems += qty;
        const bin = S.takeShare(dropped, C.departments[d].abandonedBinShare);
        writeOff(state, waste, d, S.total(bin), S.value(bin), 'abandoned');
        const st = state.stock[d];
        const space = Math.max(0, shelfCapacity(state, d) - S.total(st.shelf));
        S.add(st.shelf, S.take(dropped, space));
        S.add(st.backroom, dropped);
      }
      state.queue.customers -= left;
      abandoned += left;
      waitWeighted += left * Math.min(wait, 45);
    }

    // 7. Fresh produce on display gets handled and bruised.
    for (const d of DEPTS) {
      const rate = C.departments[d].shelfShrinkPerHour / STEPS;
      if (rate > 0) {
        const lost = S.takeShare(state.stock[d].shelf, rate);
        writeOff(state, waste, d, S.total(lost), S.value(lost), 'shrink');
      }
    }

    steps.push({
      step: k,
      shelf: perDept((d) => S.total(state.stock[d].shelf)),
      backroom: perDept((d) => S.total(state.stock[d].backroom)),
      dock: DEPTS.reduce((t, d) => t + S.total(state.stock[d].dock), 0),
      arrivals,
      queue: state.queue.customers,
      served: s,
      abandoned: left,
      emptyDepts: empty,
    });
  }

  for (const d of DEPTS) {
    dept[d].shelfEnd = S.total(state.stock[d].shelf);
    dept[d].backroomEnd = S.total(state.stock[d].backroom);
    dept[d].dockEnd = S.total(state.stock[d].dock);
  }

  // Staff: energy, strain, utilisation, wages.
  const staffReports: StaffHourReport[] = [];
  const roleCount = new Map<AssignmentId, number>();
  for (const { a } of assigned) roleCount.set(a, (roleCount.get(a) ?? 0) + 1);
  for (const { s, a, energyBefore } of assigned) {
    const prod = skill(s, a);
    let util: number | null = null;
    if (a === 'tills') util = tillCap > 0 ? used.till / tillCap : 0;
    else if (a === 'receive') util = receiveCap > 0 ? used.receive / receiveCap : 0;
    else if (a.startsWith('replenish:')) {
      const d = a.split(':')[1] as DeptId;
      util = replCap[d] > 0 ? used.repl[d] / replCap[d] : 0;
    }
    let strainAdded = 0;
    if (a === 'break') {
      s.energy = Math.min(100, s.energy + C.staff.energy.break);
      s.consecutive = 0;
      s.breaks += 1;
    } else {
      const key = a === 'tills' ? 'tills' : a === 'receive' ? 'receive' : 'replenish';
      const drain = C.staff.energy[key] * (s.speciality === 'stamina' ? C.staff.staminaDrain : 1);
      s.energy = Math.max(0, s.energy + drain);
      s.consecutive += 1;
      s.hoursWorked += 1;
      const W = C.wellbeing;
      if (s.energy < W.lowEnergyBelow) strainAdded += (W.lowEnergyBelow - s.energy) * W.lowEnergyStrainPerPoint;
      if (s.consecutive > W.hoursBeforeBreakNeeded) strainAdded += (s.consecutive - W.hoursBeforeBreakNeeded) * W.consecutiveStrainStep;
    }
    s.strain += strainAdded;
    s.lastAssignment = a;
    if (s.isTemp) addExtra(state, 'Agency temp', C.actions.temp.hourlyFee);
    else {
      state.ledger.wages += C.wagePerHour;
      state.cash -= C.wagePerHour;
    }
    staffReports.push({
      id: s.id,
      name: s.name,
      assignment: a,
      energyBefore,
      energyAfter: s.energy,
      productivity: prod,
      utilisation: util === null ? null : clamp(util, 0, 1),
      strainAdded,
    });
  }
  addExtra(state, 'Store overheads', C.overheadPerDay / C.hours);

  // Satisfaction for the hour, with reasons.
  const avgWait = served + abandoned > 0 ? waitWeighted / (served + abandoned) : 0;
  const { score, reasons } = hourSatisfaction(state, h, dept, mult, avgWait, abandoned, customers);
  state.satisfaction.weightedSum += score * customers;
  state.satisfaction.customers += customers;

  const report: HourReport = {
    hour: h,
    customersArrived: customers,
    customersServed: served,
    customersAbandoned: abandoned,
    avgWait,
    maxQueue,
    tillCapacity: tillCap,
    dept,
    staff: staffReports,
    waste,
    money: {
      revenue: state.ledger.revenue - ledgerBefore.revenue,
      cogs: state.ledger.cogs - ledgerBefore.cogs,
      waste: state.ledger.waste - ledgerBefore.waste,
      wages: state.ledger.wages - ledgerBefore.wages,
      extras: sumExtras(state) - ledgerBefore.extrasTotal,
      cashEnd: state.cash,
      profitSoFar: operatingProfit(state),
    },
    satisfaction: { score, reasons, daySoFar: satisfactionSoFar(state) },
    wellbeing: wellbeing(state),
    messages,
    steps,
    actionsTaken: plan.actions.map((a) => ({ ...a })),
  };

  // Advance the clock.
  state.hour = h + 1;
  const nextWaste: WasteLine[] = [];
  if (state.hour >= C.hours) closeDay(state, report, nextWaste);
  else prepareHour(state, nextWaste);
  // Expiry at the hour boundary belongs to the hour just finished.
  for (const w of nextWaste) {
    const ex = report.waste.find((x) => x.dept === w.dept && x.reason === w.reason);
    if (ex) {
      ex.qty += w.qty;
      ex.cost += w.cost;
    } else report.waste.push(w);
  }
  report.money.waste = state.ledger.waste - ledgerBefore.waste;
  report.money.revenue = state.ledger.revenue - ledgerBefore.revenue;
  report.money.cogs = state.ledger.cogs - ledgerBefore.cogs;
  report.money.cashEnd = state.cash;
  report.money.profitSoFar = operatingProfit(state);
  report.wellbeing = wellbeing(state);
  state.history.push(report);
  return { state, report };
}

/** 17:00: doors locked, the last queue is served, short-dated chilled is binned. */
function closeDay(state: SimState, report: HourReport, waste: WasteLine[]): void {
  const notes: string[] = [];
  const q = state.queue.customers;
  if (q > 1e-6) {
    for (const d of DEPTS) {
      recordSale(state, report.dept[d], d, S.takeShare(state.queue.baskets[d], 1), report.dept[d].price, markdownActive(state, d, C.hours - 1));
    }
    report.customersServed += q;
    notes.push(`Doors locked at 17:00. The last ${Math.round(q)} customers in the queue were served.`);
    state.queue.customers = 0;
  }
  for (const d of DEPTS) expire(state, d, C.hours, waste, notes);
  for (const s of state.staff) {
    if (!s.isTemp && s.breaks === 0) s.strain += C.wellbeing.noBreakAllDayStrain;
  }
  state.announcements = notes;
  report.messages.push(...notes);
}

/** Takings and cost of goods for items paid for. Short-dated items sell at the sticker price during a markdown. */
function recordSale(state: SimState, r: DeptHourReport, d: DeptId, sold: Batch[], price: number, markdown: boolean): void {
  const std = C.departments[d].standardPrice;
  for (const b of sold) {
    const p = markdown && isShortDated(b) ? markdownPrice(d) : price;
    const takings = b.qty * p;
    r.sold += b.qty;
    r.revenue += takings;
    r.cogs += b.qty * b.unitCost;
    r.priceEffect += b.qty * (p - std);
    state.ledger.revenue += takings;
    state.ledger.cogs += b.qty * b.unitCost;
    state.cash += takings;
  }
}

function hourSatisfaction(
  state: SimState,
  h: number,
  dept: Record<DeptId, DeptHourReport>,
  mult: Record<DeptId, number>,
  avgWait: number,
  abandoned: number,
  customers: number,
): { score: number; reasons: Reason[] } {
  const SC = C.satisfaction;
  const reasons: Reason[] = [];
  const weights = perDept((d) => C.departments[d].basket * mult[d]);
  const wsum = DEPTS.reduce((t, d) => t + weights[d], 0);
  let score: number = SC.base;
  for (const d of DEPTS) {
    const r = dept[d];
    const share = weights[d] / wsum;
    if (r.wanted > 0) {
      const missing = 1 - r.picked / r.wanted;
      const p = missing * share * SC.availabilityPenalty;
      if (p >= 0.5) reasons.push({ label: `${deptName(d)}: ${pct(missing)} of wanted items not on the shelf`, delta: -p });
      score -= p;
    }
    const tier = state.pricing[d];
    if (markdownActive(state, d, h)) {
      const b = SC.markdownBonus * share * 3;
      reasons.push({ label: `${deptName(d)} markdown stickers`, delta: b });
      score += b;
    } else if (tier !== 'standard') {
      const b = C.pricing[tier].satisfaction * share * 3;
      reasons.push({ label: `${C.pricing[tier].label} prices on ${deptName(d).toLowerCase()}`, delta: b });
      score += b;
    }
    if (promotionActive(state, d, h)) {
      reasons.push({ label: `${deptName(d)} promotion`, delta: SC.promotionBonus });
      score += SC.promotionBonus;
    }
  }
  const waitP = Math.min(25, Math.max(0, avgWait - SC.waitFreeMinutes) * SC.waitPenaltyPerMinute);
  if (waitP >= 0.5) reasons.push({ label: `Average wait at the tills about ${Math.round(avgWait)} min`, delta: -waitP });
  score -= waitP;
  const abRate = customers > 0 ? abandoned / customers : 0;
  const abP = abRate * SC.abandonPenalty;
  if (abP >= 0.5) reasons.push({ label: `${Math.round(abandoned)} shoppers gave up queueing`, delta: -abP });
  score -= abP;
  reasons.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  return { score: clamp(score, 0, 100), reasons };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sumExtras(state: SimState): number {
  return Object.values(state.ledger.extras).reduce((t, x) => t + x, 0);
}

export function perDept<T>(f: (d: DeptId) => T): Record<DeptId, T> {
  return { produce: f('produce'), chilled: f('chilled'), ambient: f('ambient') };
}

export function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

export function money(x: number): string {
  const neg = x < 0;
  const v = Math.abs(x);
  const s = v >= 100 ? `£${Math.round(v).toLocaleString('en-GB')}` : `£${v.toFixed(2)}`;
  return neg ? `−${s}` : s;
}

export function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}

/** Default plan for the coming hour: everyone keeps their last job; breaks end. */
export function defaultPlan(state: SimState): HourPlan {
  const assignments: Record<string, AssignmentId> = {};
  const counts = new Map<AssignmentId, number>();
  for (const s of onShift(state)) {
    let a: AssignmentId = s.lastAssignment === 'break' ? 'tills' : s.lastAssignment;
    if (s.isTemp && s.availableFrom === state.hour) a = 'tills';
    if ((counts.get(a) ?? 0) >= assignmentLimit(a)) {
      const alt = (['replenish:ambient', 'replenish:produce', 'replenish:chilled', 'receive', 'tills'] as AssignmentId[]).find(
        (x) => (counts.get(x) ?? 0) < assignmentLimit(x),
      );
      a = alt ?? 'break';
    }
    counts.set(a, (counts.get(a) ?? 0) + 1);
    assignments[s.id] = a;
  }
  return { assignments, pricing: { ...state.pricing }, actions: [] };
}
