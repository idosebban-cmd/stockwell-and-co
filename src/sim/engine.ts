/**
 * The Saturday simulation. Pure functions over plain data: no DOM, no timers,
 * no randomness beyond what the scenario already fixed from its seed.
 *
 * Flow: startDay(seed, setup) -> state at 09:00
 *       runHour(state, plan)   -> { state, report } (repeat eight times)
 * After the eighth hour the state is closed (state.hour === 8).
 */
import { CONFIG, DEPTS, deptName, hourLabel, type ChilledLife, type DeptId, type PriceTier } from './config';
import { makeScenario } from './scenario';
import { burstArrivals, floorMood, makeFloor, spawnAndExpire } from './floor';
import { makeStaff, ROSTER, TEMP_ENTRY } from './roster';
import { staffFromPerson } from './people';
import * as S from './stock';
import type {
  ActionRequest,
  AssignmentId,
  Batch,
  DayContext,
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
/** In-game minutes per simulation step. */
export const STEP_MINUTES = 60 / STEPS;

/** "10:40" for a step within an hour. */
export function clockLabel(hour: number, step = 0): string {
  const mins = Math.round(step * STEP_MINUTES);
  return `${String(C.openingHour + hour + Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
}

/** Minutes since opening. */
export function dayMinute(state: SimState): number {
  return state.hour * 60 + Math.round((state.step ?? 0) * STEP_MINUTES);
}

/** The fully fitted shop on the standalone Saturday (Quick play and the lessons). */
export const QUICK_CONTEXT: DayContext = {
  mode: 'quick',
  weekday: 6,
  hours: C.hours,
  depts: [...DEPTS],
  tills: C.checkout.tills,
  shelfCap: { produce: C.departments.produce.shelfCapacity, chilled: C.departments.chilled.shelfCapacity, ambient: C.departments.ambient.shelfCapacity },
  range: { produce: 1, chilled: 1, ambient: 1 },
  backroomCap: { produce: C.departments.produce.backroomCapacity, chilled: C.departments.chilled.backroomCapacity, ambient: C.departments.ambient.backroomCapacity },
  dockSpoil: { produce: C.departments.produce.dockSpoilPerHour, chilled: C.departments.chilled.dockSpoilPerHour, ambient: C.departments.ambient.dockSpoilPerHour },
  middayHour: C.openingOrder.middayHour,
  reputationFootfall: 1,
  overheads: { 'Store overheads': C.overheadPerDay },
  actions: ['markdown', 'promotion', 'emergency', 'cashAndCarry', 'nextDelivery', 'temp', 'repair'],
  pricing: true,
};

/** Day names; every trading day opens at 09:00. */
export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

export function weekdayName(weekday: number, short = false): string {
  const n = WEEKDAYS[((weekday % 7) + 7) % 7];
  return short ? n.slice(0, 3) : n;
}

/** Explicit dates: stock "used by" a day N days from today expires at 17:00 that day (or when the shop closes, if earlier). */
export function useByExpiry(daysAhead: number): number {
  return daysAhead * C.calendar.hoursPerDay + C.calendar.useByHour;
}

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
    chilledLife: { ...C.openingOrder.recommendedChilledLife },
    pricing: { produce: 'regular', chilled: 'regular', ambient: 'regular' },
  };
}

/** Unit cost of a delivery; chilled depends on the shelf life chosen. */
export function deliveryUnitCost(dept: DeptId, life?: ChilledLife): number {
  if (dept === 'chilled') return C.chilledLife[life ?? 'long'].unitCost;
  return C.departments[dept].unitCost;
}

export interface MiddayRoom {
  /** Forecast stock left in the shop at 12:00, at the chosen prices. */
  expectedLeft: number;
  /** Shelf + stockroom space that leaves, assuming shelves are kept filled. */
  room: number;
  /** Items likely to wait on the dock until space frees up. */
  overflow: number;
  /** Hour (from opening) by which forecast sales should make room for the overflow; null if not today. */
  clearsBy: number | null;
}

/**
 * Estimates the space for the midday delivery, allowing for the sales the
 * forecast expects before it arrives. It ignores the hidden variation and
 * any shelf-filling shortfalls, so it is an estimate, not a promise.
 */
/** What a day's order is checked against: cash, stock already in the shop and the day's shop. */
export interface OrderBasis {
  cash: number;
  carried: Record<DeptId, number>;
  ctx: DayContext;
}

export function quickBasis(): OrderBasis {
  return { cash: C.startingCash, carried: { produce: carriedQty('produce'), chilled: carriedQty('chilled'), ambient: carriedQty('ambient') }, ctx: QUICK_CONTEXT };
}

export function middayRoomEstimate(setup: SetupPlan, forecast: readonly number[], dept: DeptId, basis: OrderBasis = quickBasis()): MiddayRoom {
  const cfg = C.departments[dept];
  const ctx = basis.ctx;
  const mid = ctx.middayHour ?? ctx.hours;
  let sales = 0;
  for (let h = 0; h < mid; h++) sales += forecast[h] * cfg.basket * ctx.range[dept] * tierDemand(dept, setup.pricing[dept]) * tripMultiplier(setup.pricing, dept);
  const opening = basis.carried[dept] + Math.max(0, Math.round(setup.orders[dept].morning));
  const expectedLeft = Math.max(0, opening - sales);
  const room = Math.max(0, ctx.shelfCap[dept] + ctx.backroomCap[dept] - expectedLeft);
  const overflow = Math.max(0, Math.round(setup.orders[dept].midday) - room);
  let clearsBy: number | null = overflow > 0 ? null : mid;
  let later = 0;
  for (let h = mid; h < ctx.hours && clearsBy === null; h++) {
    later += forecast[h] * cfg.basket * ctx.range[dept] * tierDemand(dept, setup.pricing[dept]) * tripMultiplier(setup.pricing, dept);
    if (later >= overflow) clearsBy = h + 1;
  }
  return { expectedLeft, room, overflow, clearsBy };
}

export function carriedQty(dept: DeptId): number {
  return C.carriedStock[dept].reduce((t, b) => t + b.qty, 0);
}

export interface SetupCheck {
  cost: number;
  cashAfter: number;
  perDept: Record<DeptId, { cost: number; morningFits: boolean; space: number; midday: MiddayRoom }>;
  errors: string[];
}

export function checkSetup(setup: SetupPlan, forecast: readonly number[] = C.demand.forecast, basis: OrderBasis = quickBasis()): SetupCheck {
  const errors: string[] = [];
  let cost = 0;
  const perDept = {} as SetupCheck['perDept'];
  const ctx = basis.ctx;
  for (const d of DEPTS) {
    const cfg = C.departments[d];
    const o = setup.orders[d];
    const m = Math.max(0, Math.round(o.morning));
    const md = Math.max(0, Math.round(o.midday));
    if (!ctx.depts.includes(d)) {
      if (m > 0 || md > 0) errors.push(`${cfg.name}: the shop doesn't have this department.`);
      perDept[d] = { cost: 0, morningFits: true, space: 0, midday: { expectedLeft: 0, room: 0, overflow: 0, clearsBy: null } };
      continue;
    }
    if (ctx.middayHour === null && md > 0) errors.push(`${cfg.name}: there is no midday delivery today.`);
    const c =
      d === 'chilled'
        ? m * deliveryUnitCost(d, setup.chilledLife.morning) + md * deliveryUnitCost(d, setup.chilledLife.midday)
        : (m + md) * cfg.unitCost;
    cost += c;
    const space = Math.max(0, ctx.shelfCap[d] + ctx.backroomCap[d] - basis.carried[d]);
    const morningFits = m <= space;
    if (!morningFits) errors.push(`${cfg.name}: the morning delivery doesn't fit (room for ${Math.floor(space)}).`);
    if (md > C.openingOrder.maxMidday) errors.push(`${cfg.name}: the midday lorry takes at most ${C.openingOrder.maxMidday}.`);
    if (!Number.isFinite(o.morning) || !Number.isFinite(o.midday)) errors.push(`${cfg.name}: enter a number.`);
    perDept[d] = { cost: c, morningFits, space, midday: middayRoomEstimate(setup, forecast, d, basis) };
  }
  const cashAfter = basis.cash - cost;
  if (cashAfter < 0 && cost > 0) errors.push(`That costs ${money(cost)}, but you only have ${money(Math.max(0, basis.cash))}.`);
  return { cost, cashAfter, perDept, errors };
}

/** A delivery's batches, dated from the day it arrives (`weekday`). */
export function datedBatches(dept: DeptId, qty: number, unitCost: number, life: ChilledLife | undefined, weekday: number): Batch[] {
  const days = dept === 'chilled' ? C.chilledLife[life ?? 'long'].days : C.shelfLife[dept];
  if (days === null) return [{ qty, unitCost, expiresAt: null, label: C.shelfLabels[dept] }];
  const label = days === 0 ? 'Use by today' : `Use by ${weekdayName(weekday + days)}`;
  return [{ qty, unitCost, expiresAt: useByExpiry(days), label }];
}

/** The standalone Saturday: the full shop, Friday's leftovers and the six regulars. */
export function startDay(seed: number, setup: SetupPlan): SimState {
  const carried = perDept((d) =>
    C.carriedStock[d].map((cb) => ({ where: cb.where, batch: { qty: cb.qty, unitCost: C.departments[d].unitCost, expiresAt: cb.expiresAt, label: cb.label } as Batch })),
  );
  return startShift({
    seed,
    scenario: makeScenario(seed),
    ctx: QUICK_CONTEXT,
    cash: C.startingCash,
    carried,
    staff: ROSTER.map((r) => makeStaff(r)),
    setup,
    announcements: ['Doors open at 09:00. The kettle is on.'],
  });
}

export interface ShiftInput {
  seed: number;
  scenario: ReturnType<typeof makeScenario>;
  ctx: DayContext;
  /** Cash before the day's order is paid for. */
  cash: number;
  /** How far an order may take cash below zero (campaign overdraft). */
  overdraft?: number;
  /** The wholesaler's account: what is owed and how much it may reach. Stock beyond cash and overdraft goes on it. */
  credit?: { owed: number; limit: number };
  /** Stock already in the shop, by where it sits. */
  carried: Record<DeptId, { where: 'shelf' | 'backroom' | 'dock'; batch: Batch }[]>;
  staff: StaffMember[];
  setup: SetupPlan;
  announcements: string[];
}

/** Opens the doors on any trading day: pays for the order, puts the morning delivery away, books the midday lorry. */
export function startShift(input: ShiftInput): SimState {
  const { seed, scenario, ctx, setup } = input;
  const carriedQtys = perDept((d) => input.carried[d].reduce((t, c) => t + c.batch.qty, 0));
  const funds = Math.max(0, input.cash + (input.overdraft ?? 0));
  const creditRoom = input.credit ? Math.max(0, input.credit.limit - input.credit.owed) : 0;
  const check = checkSetup(setup, scenario.forecast, { cash: funds + creditRoom, carried: carriedQtys, ctx });
  if (check.errors.length) throw new Error(check.errors.join(' '));
  const onAccount = Math.min(creditRoom, Math.max(0, check.cost - funds));
  const stock = {} as SimState['stock'];
  let openingInventoryValue = 0;
  for (const d of DEPTS) {
    const shelf: Batch[] = [];
    const backroom: Batch[] = [];
    const dock: Batch[] = [];
    for (const cb of input.carried[d]) {
      const b: Batch = { ...cb.batch };
      openingInventoryValue += b.qty * b.unitCost;
      S.add(cb.where === 'shelf' ? shelf : cb.where === 'dock' ? dock : backroom, [b]);
    }
    // Night crew puts the morning delivery away: shelves first, then stockroom.
    const morning = Math.round(setup.orders[d].morning);
    const life = d === 'chilled' ? setup.chilledLife.morning : undefined;
    if (morning > 0) S.add(backroom, datedBatches(d, morning, deliveryUnitCost(d, life), life, ctx.weekday));
    const space = Math.max(0, ctx.shelfCap[d] - S.total(shelf));
    S.add(shelf, S.take(backroom, space));
    stock[d] = { shelf, backroom, dock };
  }
  const state: SimState = {
    seed,
    ctx,
    scenario,
    hour: 0,
    step: 0,
    cash: input.cash - check.cost + onAccount,
    cashBeforeOrder: input.cash,
    credit: (input.credit?.owed ?? 0) + onAccount,
    openingInventoryValue,
    ledger: { revenue: 0, cogs: 0, waste: 0, wages: 0, extras: {}, stockPurchases: check.cost },
    stock,
    queue: { customers: 0, baskets: { produce: [], chilled: [], ambient: [] } },
    staff: input.staff,
    pricing: { ...setup.pricing },
    deliveries: [],
    markdowns: [],
    promotions: [],
    used: { markdown: [], promotions: 0, emergency: 0, temp: false, repair: false },
    fridge: { status: 'ok', repairAtStep: null },
    satisfaction: { weightedSum: 0, customers: 0 },
    history: [],
    announcements: [...input.announcements],
    idCounter: 0,
    floor: makeFloor(seed + Math.floor(scenario.customerNoise.reduce((t, x, i) => t + x * (i + 1), 0) * 100_000), ctx, scenario.forecast),
  };
  for (const d of DEPTS) {
    const qty = Math.round(setup.orders[d].midday);
    if (qty > 0 && ctx.middayHour !== null) {
      state.deliveries.push({
        id: `midday-${d}`,
        dept: d,
        qty,
        unitCost: deliveryUnitCost(d, setup.chilledLife.midday),
        life: d === 'chilled' ? setup.chilledLife.midday : undefined,
        arrivesAt: ctx.middayHour,
        kind: 'midday',
        originalHour: ctx.middayHour,
      });
    }
  }
  prepareHour(state, []);
  state.announcements = [...input.announcements, ...state.announcements];
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
        `Chiller fault: half the chilled shelf is out of use. Staff on Chilled rescue the stock; the engineer fixes it.`,
      );
    }
  }
  // Expiry at the start of the hour.
  for (const d of DEPTS) expire(state, d, h, waste, notes);
  // Deliveries reaching the dock.
  let arrived = 0;
  for (const del of state.deliveries.filter((x) => x.arrivesAt === h && x.arrivesAtStep === undefined)) {
    S.add(state.stock[del.dept].dock, datedBatches(del.dept, del.qty, del.unitCost, del.life, state.ctx.weekday));
    arrived += del.qty;
  }
  if (arrived > 0) notes.push(`Delivery on the dock: ${Math.round(arrived)} items to receive.`);
  state.deliveries = state.deliveries.filter((x) => x.arrivesAt !== h || x.arrivesAtStep !== undefined);
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
  const step = hour === state.hour ? hour * STEPS + (state.step ?? 0) : hour * STEPS;
  return state.staff.filter((s) => (s.availableFromStep !== undefined ? s.availableFromStep <= step : s.availableFrom <= hour));
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
  return b.expiresAt !== null && b.expiresAt <= C.calendar.hoursPerDay;
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

/** Items wanted at a price level, relative to the regular price, from the department's elasticity. */
export function tierDemand(d: DeptId, tier: PriceTier): number {
  return Math.pow(C.pricing[tier].priceMult, -C.departments[d].priceElasticity);
}

/** Whole-shop effect of the other departments' prices on this department's basket. */
export function tripMultiplier(pricing: Record<DeptId, PriceTier>, d: DeptId): number {
  return DEPTS.reduce((m, e) => (e === d ? m : m * C.pricing[pricing[e]].tripMult), 1);
}

/** Minutes at the till for a customer with `items` items, relative to an ordinary basket. */
export function serviceFactor(items: number): number {
  const K = C.checkout;
  const ordinary = DEPTS.reduce((t, d) => t + C.departments[d].basket, 0);
  return (K.serviceFixedMinutes + K.servicePerItemMinutes * items) / (K.serviceFixedMinutes + K.servicePerItemMinutes * ordinary);
}

export function demandMultiplier(state: SimState, d: DeptId, hour = state.hour, tier: PriceTier = state.pricing[d]): number {
  let m: number = tierDemand(d, tier) * tripMultiplier({ ...state.pricing, [d]: tier }, d);
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
  return clamp(1 + (satisfactionSoFar(state) - f.pivot) * f.perPoint, f.min, f.max) * state.ctx.reputationFootfall;
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
  const cap = state.ctx.shelfCap[d];
  if (d === 'chilled' && state.fridge.status === 'fault') return cap * C.events.fridgeFault.capacityShare;
  return cap;
}

export function backroomCapacity(state: SimState, d: DeptId): number {
  return state.ctx.backroomCap[d];
}

/** Whether the shop has this department today. */
export function hasDept(state: SimState, d: DeptId): boolean {
  return state.ctx.depts.includes(d);
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
  if (a.kind === 'cashAndCarry') return `${a.kind}:${a.dept}:${a.staffId}`;
  if (a.kind === 'nextDelivery') return `${a.kind}:${a.dept}:${a.qty}`;
  return 'dept' in a ? `${a.kind}:${a.dept}` : a.kind;
}

export function actionCost(a: ActionRequest): number {
  switch (a.kind) {
    case 'markdown':
      return 0;
    case 'promotion':
      return C.actions.promotion.cost;
    case 'emergency':
      return orderQty(a) * C.departments[a.dept].unitCost * C.actions.emergency.costMult + C.actions.emergency.deliveryFee;
    case 'nextDelivery':
      return a.qty * deliveryUnitCost(a.dept, a.dept === 'chilled' ? 'long' : undefined);
    case 'temp':
      return C.actions.temp.bookingFee;
    case 'repair':
      return C.actions.repair.cost;
    case 'cashAndCarry':
      return orderQty(a) * C.departments[a.dept].unitCost * C.actions.cashAndCarry.costMult;
    case 'letRunOut':
    case 'letGo':
      return 0;
    case 'hire':
      return C.hiring.hireCost;
  }
}

/** Items in an order action (rush and cash-and-carry default to their usual amount). */
export function orderQty(a: ActionRequest): number {
  if (a.kind === 'emergency') return Math.round(a.qty ?? C.actions.emergency.qty);
  if (a.kind === 'cashAndCarry') return Math.round(a.qty ?? C.actions.cashAndCarry.qty);
  if (a.kind === 'nextDelivery') return Math.round(a.qty);
  return 0;
}

/** When an order placed now for the next scheduled delivery arrives: today's midday lorry (step), tomorrow morning, or not at all (Quick play after the lorry). */
export function nextDeliveryAt(state: SimState): number | 'tomorrow' | null {
  const mid = state.ctx.middayHour;
  if (mid !== null && state.hour < mid) {
    // The lorry may have been delayed; it comes when the midday delivery is due.
    const lorry = state.deliveries.find((x) => x.kind === 'midday');
    return (lorry ? lorry.arrivesAt : mid) * STEPS;
  }
  return state.ctx.mode === 'campaign' ? 'tomorrow' : null;
}

/** Describes an action for the confirmation panel and whether it can be taken now. */
export function describeAction(state: SimState, a: ActionRequest, alreadyPlanned: ActionRequest[] = []): ActionInfo {
  const h = state.hour;
  const left = state.ctx.hours - h;
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
      const now = h * STEPS + (state.step ?? 0);
      const at = now + Math.round(A.emergency.arrivalMinutes / STEP_MINUTES);
      const q = orderQty(a);
      title = `Rush delivery: ${deptName(a.dept).toLowerCase()}`;
      timing = `On the dock in about ${A.emergency.arrivalMinutes} minutes (${clockLabel(Math.floor(at / STEPS), at % STEPS)}). Someone must unload it.`;
      effect = `${q} items at ${money(cfg.unitCost * A.emergency.costMult)} each (normally ${money(cfg.unitCost)}) plus a ${money(A.emergency.deliveryFee)} delivery fee.${a.dept === 'chilled' ? ' Longer-life dates.' : ''}`;
      if (q <= 0 || q > A.emergency.maxQty) reason = `Between 1 and ${A.emergency.maxQty} items.`;
      else if (state.used.emergency >= A.emergency.maxPerDay) reason = `The wholesaler only does ${A.emergency.maxPerDay} rush deliveries a day.`;
      else if (state.deliveries.some((x) => x.kind === 'emergency' && x.dept === a.dept)) reason = 'A rush delivery for this department is already on its way.';
      else if (at >= state.ctx.hours * STEPS - 5) reason = 'It would arrive after closing.';
      break;
    }
    case 'cashAndCarry': {
      const cc = A.cashAndCarry;
      const who = state.staff.find((s) => s.id === a.staffId);
      const now = h * STEPS + (state.step ?? 0);
      title = `Send ${who?.name ?? 'someone'} to the cash-and-carry`;
      timing = `${who?.name ?? 'They'} will be away about ${cc.minutes} minutes, then back to their job.`;
      const q = orderQty(a);
      effect = `${q} ${deptName(a.dept).toLowerCase()} items at ${money(C.departments[a.dept].unitCost * cc.costMult)} each, straight into the stockroom (no unloading).`;
      if (q <= 0 || q > cc.maxQty) reason = `Up to ${cc.maxQty} items fit in the car.`;
      else if (!who || who.availableFrom > h) reason = 'Not on shift.';
      else if (state.floor?.tasks.some((t) => t.kind === 'errand' && t.assigned === who.id)) reason = `${who.name} is already out.`;
      else if ((state.used.cashAndCarry ?? 0) >= cc.maxPerDay) reason = `Only ${cc.maxPerDay} runs a day: the car needs to go home too.`;
      else if (state.floor?.tasks.some((t) => t.kind === 'errand')) reason = 'Someone is already out at the cash-and-carry.';
      else if (now + Math.round(cc.minutes / STEP_MINUTES) >= state.ctx.hours * STEPS - 5) reason = 'They would be back after closing.';
      break;
    }
    case 'nextDelivery': {
      const at = nextDeliveryAt(state);
      title = `Add to the next delivery: ${deptName(a.dept).toLowerCase()}`;
      timing =
        at === 'tomorrow'
          ? 'On the dock when the shop opens tomorrow. Someone must unload it.'
          : at === null
            ? 'No more deliveries today.'
            : `With the midday lorry at ${hourLabel(Math.floor(at / STEPS))}. Someone must unload it.`;
      effect = `${a.qty} items at the normal price, ${money(deliveryUnitCost(a.dept, a.dept === 'chilled' ? 'long' : undefined))} each.${a.dept === 'chilled' ? ' Longer-life dates.' : ''}`;
      if (a.qty <= 0 || a.qty > A.nextDelivery.maxQty) reason = `Between 1 and ${A.nextDelivery.maxQty} items.`;
      else if (at === null) reason = 'There are no more deliveries today.';
      break;
    }
    case 'hire': {
      const p = a.person;
      const t = h * STEPS + (state.step ?? 0);
      const today = h < C.hiring.sameDayBefore && t + C.hiring.startDelayMinutes < state.ctx.hours * STEPS - 60;
      const at = t + C.hiring.startDelayMinutes;
      title = `Hire ${p.name}`;
      timing = today ? `Walks in at about ${clockLabel(Math.floor(at / STEPS), at % STEPS)} and starts straight away.` : 'Starts tomorrow morning.';
      effect = `${money(C.hiring.hireCost)} to hire now, then ${money(p.wage)} an hour on shift, paid at closing.`;
      const team = teamSize(state);
      if (state.ctx.mode !== 'campaign') reason = 'Hiring is part of running your own shop.';
      else if (state.staff.some((s) => s.id === p.id) || state.hires?.some((x) => x.person.id === p.id)) reason = `${p.name} is already on the team.`;
      else if (team >= (state.ctx.teamLimit ?? 99)) reason = `The break room only takes a team of ${state.ctx.teamLimit}. A bigger break room makes space.`;
      break;
    }
    case 'letGo': {
      const s = state.staff.find((x) => x.id === a.staffId);
      title = `Let ${s?.name ?? 'them'} go`;
      timing = 'They leave now; today’s wages so far are still paid.';
      effect = `The team is unsettled (a little strain for everyone) and word gets round (reputation −${Math.abs(C.hiring.letGo.reputation)}).`;
      if (!s || s.isTemp || state.leavers?.includes(s.id)) reason = 'Not on the team.';
      else if (state.ctx.mode !== 'campaign') reason = 'Only in your own shop.';
      else if (teamSize(state) <= 1) reason = 'The shop needs at least one person.';
      break;
    }
    case 'letRunOut': {
      title = `Let ${deptName(a.dept).toLowerCase()} run out`;
      timing = 'For the rest of today.';
      effect = 'No more warnings about it. Shoppers who can’t find it will be a little less happy.';
      if (state.floor?.letRunOut?.includes(a.dept)) reason = 'Already accepted.';
      break;
    }
    case 'temp': {
      const from = h + A.temp.delayHours;
      const hours = state.ctx.hours - from;
      title = 'Book an agency temp';
      timing = `Arrives at ${hourLabel(from)} and stays until close (${hours} hour${hours === 1 ? '' : 's'}).`;
      effect = `Booking fee ${money(A.temp.bookingFee)} now, then ${money(A.temp.hourlyFee)}/hour (${money(A.temp.bookingFee + A.temp.hourlyFee * Math.max(0, hours))} in total). Works ${pct(1 - A.temp.productivity)} slower than regulars.`;
      if (state.used.temp) reason = 'The agency has no one else free today.';
      else if (hours < A.temp.minHoursOnShift) reason = `Too late: they would work under ${A.temp.minHoursOnShift} hours.`;
      break;
    }
    case 'repair': {
      const mins = A.repair.arrivalMinutes;
      title = 'Call the refrigeration engineer';
      timing = `Arrives in about ${mins} minutes and fixes the cabinet.`;
      effect = `Restores the full chilled shelf. Callout fee ${money(A.repair.cost)}.`;
      if (state.fridge.status !== 'fault') reason = 'The chillers are working.';
      else if (state.fridge.repairAtStep !== null) reason = 'The engineer is already booked.';
      break;
    }
  }
  if (!reason && 'dept' in a && !hasDept(state, a.dept)) reason = 'The shop doesn’t have this department.';
  if (!reason && !state.ctx.actions.includes(a.kind)) reason = 'Not available yet.';
  if (!reason && h >= state.ctx.hours) reason = 'The shop is closed.';
  if (!reason && dup) reason = 'Already in this hour’s plan.';
  if (!reason && cost + plannedCost > state.cash + 1e-6) reason = `Not enough cash (${money(state.cash - plannedCost)} available).`;
  return { title, cost, available: reason === null, reason, timing, effect };
}

// ---------------------------------------------------------------------------
// Plan validation
// ---------------------------------------------------------------------------

export function assignmentLimit(a: AssignmentId, state?: SimState): number {
  if (a === 'task') return 99;
  if (a === 'tills') return state ? state.ctx.tills : C.staff.limits.tills;
  if (state && a.startsWith('replenish:') && !hasDept(state, a.split(':')[1] as DeptId)) return 0;
  if (a === 'receive') return C.staff.limits.receive;
  if (a === 'break') return state?.ctx.breakCap ?? C.staff.limits.break;
  return C.staff.limits.replenish;
}

export function planErrors(state: SimState, plan: HourPlan): string[] {
  const errors: string[] = [];
  if (state.hour >= state.ctx.hours) return ['The shop is closed.'];
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
    const lim = assignmentLimit(a, state);
    if (a.startsWith('replenish:') && lim === 0) errors.push(`The shop doesn’t have ${labelFor(a).toLowerCase()} yet.`);
    else if (n > lim) errors.push(`${labelFor(a)} ${a === 'tills' ? 'have' : 'has'} room for ${lim}, not ${n}.`);
  }
  if (!state.ctx.pricing && DEPTS.some((d) => plan.pricing[d] !== state.pricing[d])) errors.push('Prices can’t be changed yet.');
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
  if (a === 'task') return 'Floor jobs';
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
        const q = orderQty(a);
        const stockCost = q * unit;
        state.cash -= stockCost;
        state.ledger.stockPurchases += stockCost;
        addExtra(state, 'Emergency delivery fees', A.emergency.deliveryFee);
        state.used.emergency += 1;
        const at = h * STEPS + (state.step ?? 0) + Math.round(A.emergency.arrivalMinutes / STEP_MINUTES);
        state.deliveries.push({
          id: `emergency-${a.dept}-${state.idCounter++}`,
          dept: a.dept,
          qty: q,
          unitCost: unit,
          arrivesAt: Math.floor(at / STEPS),
          arrivesAtStep: at,
          kind: 'emergency',
          life: a.dept === 'chilled' ? 'long' : undefined,
          originalHour: Math.floor(at / STEPS),
        });
        break;
      }
      case 'cashAndCarry': {
        // Paid now; the stock comes back with them. The live layer sends the person.
        const cc = A.cashAndCarry;
        const unit = C.departments[a.dept].unitCost * cc.costMult;
        const q = orderQty(a);
        state.cash -= q * unit;
        state.ledger.stockPurchases += q * unit;
        state.used.cashAndCarry = (state.used.cashAndCarry ?? 0) + 1;
        const now = h * STEPS + (state.step ?? 0);
        state.floor?.tasks.push({ id: `errand-${state.idCounter++}`, kind: 'errand', place: 'entrance', spot: 0, at: now, work: cc.minutes, progress: 0, assigned: a.staffId, expiresAt: null, brings: { dept: a.dept, qty: q, unitCost: unit } });
        break;
      }
      case 'nextDelivery': {
        const life = a.dept === 'chilled' ? ('long' as const) : undefined;
        const unit = deliveryUnitCost(a.dept, life);
        state.cash -= a.qty * unit;
        state.ledger.stockPurchases += a.qty * unit;
        const at = nextDeliveryAt(state);
        if (at === 'tomorrow') state.tomorrow = [...(state.tomorrow ?? []), { dept: a.dept, qty: a.qty, unitCost: unit, life }];
        else if (at !== null) {
          const hour = Math.floor(at / STEPS);
          state.deliveries.push({ id: `order-${a.dept}-${state.idCounter++}`, dept: a.dept, qty: a.qty, unitCost: unit, life, arrivesAt: hour, kind: 'midday', originalHour: hour });
        }
        break;
      }
      case 'letRunOut':
        if (state.floor) state.floor.letRunOut = [...(state.floor.letRunOut ?? []), a.dept];
        break;
      case 'hire': {
        addExtra(state, 'Hiring', C.hiring.hireCost);
        const t = h * STEPS + (state.step ?? 0);
        const today = h < C.hiring.sameDayBefore && t + C.hiring.startDelayMinutes < state.ctx.hours * STEPS - 60;
        state.hires = [...(state.hires ?? []), { person: a.person, today }];
        if (today) {
          const at = t + C.hiring.startDelayMinutes;
          const s = staffFromPerson(a.person, { availableFrom: Math.floor(at / STEPS), newcomer: true });
          s.availableFromStep = at;
          state.staff.push(s);
          state.announcements = [...state.announcements, `${a.person.name} is on the way in.`];
        }
        break;
      }
      case 'letGo': {
        const s = state.staff.find((x) => x.id === a.staffId)!;
        // Off shift from now (kept in the list for today's accounts).
        s.availableFromStep = 1e9;
        s.availableFrom = 1e9;
        state.leavers = [...(state.leavers ?? []), s.id];
        for (const o of state.staff) if (o !== s && !o.isTemp) o.strain += C.hiring.letGo.teamStrain;
        state.floor?.mood.push({ delta: C.hiring.letGo.mood, until: t0(state) + C.hiring.letGo.moodMinutes, label: `${s.name} was let go` });
        for (const task of state.floor?.tasks ?? []) if (task.assigned === s.id) task.assigned = null;
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
        state.fridge.repairAtStep = h * STEPS + (state.step ?? 0) + Math.round(A.repair.arrivalMinutes / STEP_MINUTES);
        break;
    }
  }
}

/** People on the team today (not temps, not let go), including anyone hired today. */
export function teamSize(state: SimState): number {
  const staff = state.staff.filter((s) => !s.isTemp && !state.leavers?.includes(s.id)).length;
  return staff + (state.hires ?? []).filter((x) => !x.today).length;
}

function t0(state: SimState): number {
  return state.hour * STEPS + (state.step ?? 0);
}

/** Takes an action now, between minutes (live play): the same effect as the start of an interval. */
export function takeAction(input: SimState, a: ActionRequest): SimState {
  const info = describeAction(input, a);
  if (!info.available) throw new Error(`${info.title}: ${info.reason}`);
  const state = structuredClone(input);
  applyActions(state, [a]);
  const last = state.history.at(-1);
  if (last && last.hour === state.hour && last.toStep === (state.step ?? 0)) last.actionsTaken.push({ ...a });
  return state;
}

/** Output multiplier for a person in a job: speciality, temp, and tiredness. */
export function jobRate(s: StaffMember, a: AssignmentId, hour = 0): number {
  return skill(s, a, hour);
}

/** Work per hour at full speed for a job, in its own unit (customers or items). */
export function baseJobRate(a: AssignmentId): number {
  if (a === 'tills') return C.checkout.customersPerHour;
  if (a === 'receive') return C.staff.receiveRate;
  if (a.startsWith('replenish:')) return C.departments[a.split(':')[1] as DeptId].replenishRate;
  return 0;
}

function skill(s: StaffMember, a: AssignmentId, hour = 0): number {
  const b = 1 + C.staff.specialityBonus;
  let m = s.isTemp ? C.actions.temp.productivity : 1;
  if (a === 'tills' && s.speciality === 'checkout') m *= b;
  if (a === 'replenish:produce' && s.speciality === 'produce') m *= b;
  if (a === 'replenish:chilled' && s.speciality === 'chilled') m *= b;
  if (a === 'receive' && s.speciality === 'receiving') m *= b;
  return m * traitSpeed(s, a, hour) * (s.newcomer ? C.hiring.newcomer.productivity : 1) * productivity(s.energy);
}

/** Speed from character traits for a job at an hour (1 = no effect). */
export function traitSpeed(s: StaffMember, a: AssignmentId, hour: number): number {
  const T = C.traits;
  let m = 1;
  const morning = hour < C.hiring.sameDayBefore;
  for (const t of s.traits ?? []) {
    if (t === 'morningPerson') m *= morning ? T.morningPerson.before : T.morningPerson.after;
    if (t === 'nightOwl') m *= morning ? T.nightOwl.before : T.nightOwl.after;
    if (t === 'chatty' && a === 'tills') m *= T.chatty.tillSpeed;
    if (t === 'dislikesStockroom' && a === 'receive') m *= T.dislikesStockroom.receiveSpeed;
    if (t === 'tidy' && a === 'task') m *= T.tidy.floorSpeed;
  }
  return m;
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
    rescued: 0,
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

/** Runs the rest of the current hour (normally all six ten-minute steps). */
export function runHour(input: SimState, plan: HourPlan, opts: RunOptions = {}): { state: SimState; report: HourReport } {
  return runSteps(input, plan, STEPS - (input.step ?? 0), opts);
}

/**
 * Runs `n` one-minute steps of the current hour (never past the hour's end).
 * Everything that changes during the day (energy, footfall, wages, overheads,
 * satisfaction) is updated every step, so running an hour in one call or
 * minute by minute gives the same result. Breaks, hours worked and strain
 * are settled when the hour completes. History keeps one report per hour:
 * shorter intervals are merged into it.
 */
export function runSteps(input: SimState, plan: HourPlan, n: number, opts: RunOptions = {}): { state: SimState; report: HourReport } {
  const errors = planErrors(input, plan);
  if (errors.length) throw new Error(errors.join(' '));
  const state: SimState = structuredClone(input);
  const h = state.hour;
  const from = state.step ?? 0;
  const count = Math.max(1, Math.min(Math.round(n), STEPS - from));
  const to = from + count;
  const sc = state.scenario;
  const waste: WasteLine[] = [];
  const messages: string[] = [];
  const ledgerBefore = { ...state.ledger, extrasTotal: sumExtras(state) };

  state.pricing = { ...plan.pricing };
  applyActions(state, plan.actions);

  const working = onShift(state, h);
  const assigned = working.map((s) => ({ s, a: plan.assignments[s.id] as AssignmentId, energyBefore: s.energy, prod: skill(s, plan.assignments[s.id] as AssignmentId, h) }));
  const calm = assigned.some(({ s, a }) => a === 'tills' && s.speciality === 'calm');
  const patience = C.checkout.patienceMinutes + (calm ? C.staff.calmPatienceMinutes : 0) + (state.ctx.patienceBonus ?? 0);

  // Demand for the hour (footfall is applied per step).
  const rush = sc.events.find((e) => e.kind === 'rush' && e.hour === h);
  const noiseC = opts.forecastOnly ? 1 : sc.customerNoise[h];
  const hourCustomers = sc.forecast[h] * noiseC * (rush ? C.events.rush.customerMult : 1);
  const mult: Record<DeptId, number> = { produce: 1, chilled: 1, ambient: 1 };
  const price: Record<DeptId, number> = { produce: 0, chilled: 0, ambient: 0 };
  const dept: Record<DeptId, DeptHourReport> = { produce: emptyDeptReport(), chilled: emptyDeptReport(), ambient: emptyDeptReport() };
  const mdOn = perDept((d) => markdownActive(state, d, h));
  const plainMult = perDept((d) => {
    let m: number = tierDemand(d, state.pricing[d]) * tripMultiplier(state.pricing, d);
    if (promotionActive(state, d, h)) m *= C.actions.promotion.demandMult;
    return Math.min(C.demand.maxDeptMult, m) * (opts.forecastOnly ? 1 : sc.deptNoise[d][h]);
  });
  const mdMult = perDept((d) => {
    let m: number = tierDemand(d, state.pricing[d]) * tripMultiplier(state.pricing, d) * C.actions.markdown.demandMult;
    if (promotionActive(state, d, h)) m *= C.actions.promotion.demandMult;
    return Math.min(C.demand.maxDeptMult, m) * (opts.forecastOnly ? 1 : sc.deptNoise[d][h]);
  });
  for (const d of DEPTS) {
    mult[d] = mdOn[d] && shortDatedUnits(state, d) > 0 ? mdMult[d] : plainMult[d];
    price[d] = priceFor(state, d, h);
    dept[d].price = price[d];
    dept[d].demandMult = mult[d];
    dept[d].shelfStart = S.total(state.stock[d].shelf);
  }

  const used = { till: 0, receive: 0, repl: { produce: 0, chilled: 0, ambient: 0 } as Record<DeptId, number> };
  const capTotal = { till: 0, receive: 0, repl: { produce: 0, chilled: 0, ambient: 0 } as Record<DeptId, number> };
  let served = 0;
  let abandoned = 0;
  let arrivedTotal = 0;
  let waitWeighted = 0;
  let maxQueue = state.queue.customers;
  let effTillCap = 0;
  let satWeighted = 0;
  const steps: StepSnapshot[] = [];
  const stepShare = 1 / STEPS;
  // Share of the queue leaving per step for each minute over patience, from the per-10-minute rates.
  const K = C.checkout;
  const leaveShare = (over: number) => 1 - Math.pow(1 - Math.min(K.maxAbandonPer10Minutes, over * K.abandonPer10Minutes), STEP_MINUTES / 10);

  for (let k = from; k < to; k++) {
    const stepWork = { received: 0, moved: { produce: 0, chilled: 0, ambient: 0 } as Record<DeptId, number> };
    const abs = h * STEPS + k;
    if (state.fridge.status === 'fault' && state.fridge.repairAtStep !== null && abs >= state.fridge.repairAtStep) {
      state.fridge.status = 'fixed';
      messages.push(`The engineer fixed chiller cabinet 2 at ${clockLabel(h, k)}. He took a biscuit.`);
    }

    // Floor jobs appear (and unattended ones that have run their time go away).
    if (state.floor) spawnAndExpire(state.floor, abs, messages);
    // Rush deliveries reach the dock at their minute.
    for (const del of state.deliveries.filter((x) => x.arrivesAtStep !== undefined && x.arrivesAtStep <= abs)) {
      S.add(state.stock[del.dept].dock, datedBatches(del.dept, del.qty, del.unitCost, del.life, state.ctx.weekday));
      messages.push(`Rush delivery on the dock: ${Math.round(del.qty)} ${deptName(del.dept).toLowerCase()} items to unload.`);
    }
    state.deliveries = state.deliveries.filter((x) => x.arrivesAtStep === undefined || x.arrivesAtStep > abs);

    // Capacities this minute, from each person's energy now.
    let tillCap = 0;
    let receiveCap = 0;
    const replCap: Record<DeptId, number> = { produce: 0, chilled: 0, ambient: 0 };
    for (const { s, a } of assigned) {
      const r = skill(s, a, h);
      if (a === 'tills') tillCap += C.checkout.customersPerHour * r;
      else if (a === 'receive') receiveCap += C.staff.receiveRate * r;
      else if (a.startsWith('replenish:')) {
        const d = a.split(':')[1] as DeptId;
        replCap[d] += C.departments[d].replenishRate * r;
      }
    }
    capTotal.receive += receiveCap * stepShare;
    for (const d of DEPTS) {
      capTotal.repl[d] += replCap[d] * stepShare;
      dept[d].replenishCapacity += replCap[d] * stepShare;
    }

    // 1. Receive deliveries into the stockroom (chilled first: cold chain).
    let rcap = receiveCap * stepShare;
    for (const d of ['chilled', 'produce', 'ambient'] as DeptId[]) {
      const st = state.stock[d];
      const space = Math.max(0, backroomCapacity(state, d) - S.total(st.backroom));
      const n = Math.min(rcap, S.total(st.dock), space);
      if (n > 0) {
        S.add(st.backroom, S.take(st.dock, n));
        rcap -= n;
        used.receive += n;
        stepWork.received += n;
        dept[d].received += n;
      }
    }

    // 2. Stock left on the dock deteriorates.
    for (const d of DEPTS) {
      const rate = state.ctx.dockSpoil[d] * stepShare;
      if (rate > 0) {
        const lost = S.takeShare(state.stock[d].dock, rate);
        writeOff(state, waste, d, S.total(lost), S.value(lost), 'dock');
      }
    }

    // 3. Replenish shelves (rescuing stock from a broken chiller comes first).
    for (const d of DEPTS) {
      const st = state.stock[d];
      let cap = replCap[d] * stepShare;
      const shelfCap = shelfCapacity(state, d);
      const excess = S.total(st.shelf) - shelfCap;
      if (excess > 1e-9) {
        const space = Math.max(0, backroomCapacity(state, d) - S.total(st.backroom));
        const rescue = Math.min(cap, excess, space);
        if (rescue > 0) {
          S.add(st.backroom, S.takeNewest(st.shelf, rescue));
          cap -= rescue;
          used.repl[d] += rescue;
          stepWork.moved[d] += rescue;
          dept[d].rescued += rescue;
        }
        const stranded = S.total(st.shelf) - shelfCap;
        if (stranded > 1e-9 && d === 'chilled') {
          const share = (stranded / S.total(st.shelf)) * (C.events.fridgeFault.spoilPerHour * stepShare);
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
        stepWork.moved[d] += n;
        dept[d].replenished += n;
      }
    }

    // 4. Customers arrive and pick what is on the shelves.
    const arrivals = (hourCustomers * stepShare + (opts.forecastOnly ? 0 : burstArrivals(state.floor, abs))) * footfallMultiplier(state);
    arrivedTotal += arrivals;
    const empty: DeptId[] = [];
    const stepDept = perDept(() => ({ wanted: 0, picked: 0 }));
    const stepMults = perDept((d) => (mdOn[d] && shortDatedUnits(state, d) > 0 ? mdMult[d] : plainMult[d]));
    for (const d of DEPTS) {
      const st = state.stock[d];
      // The markdown boost lasts only while yellow-stickered stock remains.
      const wanted = hasDept(state, d) ? arrivals * C.departments[d].basket * state.ctx.range[d] * stepMults[d] : 0;
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
      stepDept[d].wanted = wanted;
      stepDept[d].picked = picked;
      if (S.total(st.shelf) < 1 && wanted > 0) {
        dept[d].shelfEmptySteps += 1;
        empty.push(d);
      }
    }

    // 5. Checkout. Expected wait comes from the backlog plus half this step's arrivals.
    // Fuller baskets take longer to scan.
    const backlog = state.queue.customers;
    state.queue.customers += arrivals;
    const q = state.queue.customers;
    maxQueue = Math.max(maxQueue, q);
    const items = q > 1e-6 ? DEPTS.reduce((t, d) => t + S.total(state.queue.baskets[d]), 0) / q : 0;
    const effCap = tillCap / serviceFactor(items);
    effTillCap += effCap;
    capTotal.till += tillCap * stepShare;
    const perMinute = effCap / 60;
    const wait = perMinute > 0 ? C.checkout.baseServiceMinutes + (backlog + arrivals / 2) / perMinute : 45;
    const capStep = effCap * stepShare;
    const s = Math.min(q, capStep);
    let takings = 0;
    if (s > 0 && q > 0) {
      const share = s / q;
      const before = state.ledger.revenue;
      for (const d of DEPTS) {
        recordSale(state, dept[d], d, S.takeShare(state.queue.baskets[d], share), price[d], mdOn[d]);
      }
      takings = state.ledger.revenue - before;
      state.queue.customers -= s;
      served += s;
      used.till += s;
      waitWeighted += s * Math.min(wait, 45);
    }

    // 6. Abandonment when the wait exceeds patience. Baskets are put back.
    let left = 0;
    const remaining = state.queue.customers;
    if (remaining > 1e-9 && wait > patience) {
      const frac = leaveShare(wait - patience);
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
      const rate = C.departments[d].shelfShrinkPerHour * stepShare;
      if (rate > 0) {
        const lost = S.takeShare(state.stock[d].shelf, rate);
        writeOff(state, waste, d, S.total(lost), S.value(lost), 'shrink');
      }
    }

    // 8. Staff energy, wages and day costs for the minute.
    for (const { s: m, a } of assigned) {
      if (a === 'break') {
        m.energy = Math.min(100, m.energy + C.staff.energy.break * stepShare);
        m.stepsRested = (m.stepsRested ?? 0) + 1;
        // Half an hour of rest in a row counts as a break, even across an hour boundary.
        m.restRun = (m.restRun ?? 0) + 1;
        if (m.restRun === Math.round(STEPS / 2)) {
          m.breaks += 1;
          m.consecutive = 0;
          m.breakThisHour = true;
        }
      } else {
        m.restRun = 0;
        const key = a === 'tills' ? 'tills' : a === 'receive' ? 'receive' : 'replenish';
        const drain = C.staff.energy[key] * (m.speciality === 'stamina' ? C.staff.staminaDrain : 1) * (m.traits?.includes('steady') ? C.traits.steady.energyDrain : 1);
        m.energy = Math.max(0, m.energy + drain * stepShare);
        m.stepsWorked = (m.stepsWorked ?? 0) + 1;
        // A floor job gets a minute of work.
        if (a === 'task' && state.floor) {
          const t = state.floor.tasks.find((x) => x.assigned === m.id);
          if (t) {
            // A cash-and-carry run takes its minutes whoever goes; floor jobs go at the person's pace.
            t.progress += t.kind === 'errand' ? 1 : skill(m, 'task', h);
            if (t.progress >= t.work - 1e-9) {
              state.floor.tasks = state.floor.tasks.filter((x) => x !== t);
              if (t.brings) {
                const b = t.brings;
                const days = b.dept === 'chilled' ? C.chilledLife.long.days : C.shelfLife[b.dept];
                S.add(state.stock[b.dept].backroom, [{ qty: b.qty, unitCost: b.unitCost, expiresAt: days === null ? null : useByExpiry(days), label: days === null ? C.shelfLabels[b.dept] : `Use by ${weekdayName(state.ctx.weekday + days)}` }]);
                messages.push(`${m.name} is back from the cash-and-carry with ${b.qty} ${deptName(b.dept).toLowerCase()} items.`);
              } else {
                state.floor.counts.resolved += 1;
                messages.push(`${m.name} sorted it: ${C.floor.tasks.kinds[t.kind].short.toLowerCase()} done.`);
              }
            }
          }
        }
      }
      if (m.isTemp) addExtra(state, 'Agency temp', C.actions.temp.hourlyFee * stepShare);
      else {
        const pay = (m.wage ?? C.wagePerHour) * stepShare;
        state.ledger.wages += pay;
        // In your shop wages are paid at closing; Quick play pays as it goes.
        if (state.ctx.mode === 'campaign') state.wagesDue = (state.wagesDue ?? 0) + pay;
        else state.cash -= pay;
      }
    }
    for (const [line, perDay] of Object.entries(state.ctx.overheads)) addExtra(state, line, (perDay / state.ctx.hours) * stepShare);

    // 9. This minute's customers' satisfaction.
    if (arrivals > 0) {
      const stepWait = s + left > 0 ? Math.min(wait, 45) : 0;
      const sat = satisfactionScore(state, h, stepDept, stepMults, stepWait, left, arrivals);
      // Floor jobs and answers can't be foreseen, so previews leave them out.
      if (!opts.forecastOnly) sat.score = clamp(sat.score + floorMood(state.floor, abs, state.ctx.penaltyScale ?? 1), 0, 100);
      // Regulars enjoy a chat at the till.
      const chatty = assigned.filter(({ s: m, a }) => a === 'tills' && m.traits?.includes('chatty')).length;
      if (chatty) sat.score = clamp(sat.score + chatty * C.traits.chatty.satisfaction, 0, 100);
      state.satisfaction.weightedSum += sat.score * arrivals;
      state.satisfaction.customers += arrivals;
      satWeighted += sat.score * arrivals;
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
      fridgeFault: state.fridge.status === 'fault',
      moved: stepWork.moved,
      received: stepWork.received,
      tillCapacity: capStep,
      takings,
    });
  }

  for (const d of DEPTS) {
    dept[d].shelfEnd = S.total(state.stock[d].shelf);
    dept[d].backroomEnd = S.total(state.stock[d].backroom);
    dept[d].dockEnd = S.total(state.stock[d].dock);
  }

  // Staff: utilisation, and at the end of the hour breaks and strain.
  const staffReports: StaffHourReport[] = [];
  for (const { s, a, energyBefore, prod } of assigned) {
    let util: number | null = null;
    if (a === 'tills') util = capTotal.till > 0 ? used.till / capTotal.till : 0;
    else if (a === 'receive') util = capTotal.receive > 0 ? used.receive / capTotal.receive : 0;
    else if (a.startsWith('replenish:')) {
      const d = a.split(':')[1] as DeptId;
      util = capTotal.repl[d] > 0 ? used.repl[d] / capTotal.repl[d] : 0;
    }
    let strainAdded = 0;
    if (to === STEPS) {
      // The hour is complete. An hour in which a break was taken doesn't count towards hours in a row.
      if (!s.breakThisHour && (s.stepsWorked ?? 0) > 0) {
        s.consecutive += 1;
        s.hoursWorked += 1;
        const W = C.wellbeing;
        if (s.energy < W.lowEnergyBelow) strainAdded += (W.lowEnergyBelow - s.energy) * W.lowEnergyStrainPerPoint;
        if (s.consecutive > W.hoursBeforeBreakNeeded) strainAdded += (s.consecutive - W.hoursBeforeBreakNeeded) * W.consecutiveStrainStep;
      }
      s.stepsWorked = 0;
      s.stepsRested = 0;
      s.breakThisHour = false;
    }
    s.strain += strainAdded;
    s.lastAssignment = a;
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

  // Satisfaction for the interval: the score is the minutes' average; the reasons come from the interval as a whole.
  const avgWait = served + abandoned > 0 ? waitWeighted / (served + abandoned) : 0;
  const { reasons } = satisfactionScore(state, h, dept, mult, avgWait, abandoned, arrivedTotal);
  const score = arrivedTotal > 0 ? satWeighted / arrivedTotal : satisfactionSoFar(state);

  const report: HourReport = {
    hour: h,
    fromStep: from,
    toStep: to,
    customersArrived: arrivedTotal,
    customersServed: served,
    customersAbandoned: abandoned,
    avgWait,
    maxQueue,
    // Average customers per hour the tills could serve, given the baskets they actually scanned.
    tillCapacity: effTillCap / count,
    dept,
    staff: staffReports,
    waste,
    money: {
      revenue: 0,
      cogs: 0,
      waste: 0,
      wages: state.ledger.wages - ledgerBefore.wages,
      extras: sumExtras(state) - ledgerBefore.extrasTotal,
      cashEnd: state.cash,
      profitSoFar: 0,
    },
    satisfaction: { score, reasons, daySoFar: satisfactionSoFar(state) },
    wellbeing: wellbeing(state),
    messages,
    steps,
    actionsTaken: plan.actions.map((a) => ({ ...a })),
  };

  // Advance the clock.
  const nextWaste: WasteLine[] = [];
  if (to < STEPS) state.step = to;
  else {
    state.step = 0;
    state.hour = h + 1;
    if (state.hour >= state.ctx.hours) closeDay(state, report, nextWaste);
    else prepareHour(state, nextWaste);
  }
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
  addToHistory(state, report);
  return { state, report };
}

/** History keeps one report per hour; an interval within an hour already started is merged into it (without per-minute snapshots). */
function addToHistory(state: SimState, r: HourReport): void {
  const last = state.history.at(-1);
  const stored: HourReport = { ...r, steps: [] };
  if (!last || last.hour !== r.hour || last.toStep !== r.fromStep) {
    state.history.push(structuredClone(stored));
    return;
  }
  const a = last.toStep - last.fromStep;
  const b = r.toStep - r.fromStep;
  const arrived = last.customersArrived + r.customersArrived;
  const waited = last.customersServed + last.customersAbandoned;
  const waitedR = r.customersServed + r.customersAbandoned;
  last.avgWait = waited + waitedR > 0 ? (last.avgWait * waited + r.avgWait * waitedR) / (waited + waitedR) : 0;
  last.satisfaction = {
    score: arrived > 0 ? (last.satisfaction.score * last.customersArrived + r.satisfaction.score * r.customersArrived) / arrived : r.satisfaction.score,
    reasons: mergeReasons(last.satisfaction.reasons, last.customersArrived, r.satisfaction.reasons, r.customersArrived),
    daySoFar: r.satisfaction.daySoFar,
  };
  last.tillCapacity = (last.tillCapacity * a + r.tillCapacity * b) / (a + b);
  last.toStep = r.toStep;
  last.customersArrived = arrived;
  last.customersServed += r.customersServed;
  last.customersAbandoned += r.customersAbandoned;
  last.maxQueue = Math.max(last.maxQueue, r.maxQueue);
  for (const d of DEPTS) {
    const x = last.dept[d];
    const y = r.dept[d];
    for (const k of ['wanted', 'picked', 'sold', 'revenue', 'cogs', 'lostShelfGap', 'lostNoStock', 'abandonedItems', 'replenished', 'rescued', 'replenishCapacity', 'received', 'shelfEmptySteps', 'priceEffect'] as const) x[k] += y[k];
    x.shelfEnd = y.shelfEnd;
    x.backroomEnd = y.backroomEnd;
    x.dockEnd = y.dockEnd;
    x.price = y.price;
    x.demandMult = y.demandMult;
  }
  for (const s of r.staff) {
    const x = last.staff.find((p) => p.id === s.id);
    if (!x) {
      last.staff.push({ ...s });
      continue;
    }
    x.utilisation = x.utilisation === null || s.utilisation === null ? s.utilisation : (x.utilisation * a + s.utilisation * b) / (a + b);
    x.assignment = s.assignment;
    x.energyAfter = s.energyAfter;
    x.productivity = s.productivity;
    x.strainAdded += s.strainAdded;
  }
  for (const w of r.waste) {
    const ex = last.waste.find((x) => x.dept === w.dept && x.reason === w.reason);
    if (ex) {
      ex.qty += w.qty;
      ex.cost += w.cost;
    } else last.waste.push({ ...w });
  }
  for (const k of ['revenue', 'cogs', 'waste', 'wages', 'extras'] as const) last.money[k] += r.money[k];
  last.money.cashEnd = r.money.cashEnd;
  last.money.profitSoFar = r.money.profitSoFar;
  last.wellbeing = r.wellbeing;
  last.messages.push(...r.messages);
  last.actionsTaken.push(...r.actionsTaken.map((x) => ({ ...x })));
}

function mergeReasons(a: Reason[], wa: number, b: Reason[], wb: number): Reason[] {
  const w = wa + wb;
  if (w <= 0) return b;
  const out = new Map<string, number>();
  for (const r of a) out.set(r.label, (out.get(r.label) ?? 0) + (r.delta * wa) / w);
  for (const r of b) out.set(r.label, (out.get(r.label) ?? 0) + (r.delta * wb) / w);
  return [...out].map(([label, delta]) => ({ label, delta })).filter((r) => Math.abs(r.delta) >= 0.5).sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta));
}

/** Closing time: doors locked, the last queue is served, stock past its date is binned. */
function closeDay(state: SimState, report: HourReport, waste: WasteLine[]): void {
  const notes: string[] = [];
  const q = state.queue.customers;
  const close = state.ctx.hours;
  if (q > 1e-6) {
    for (const d of DEPTS) {
      recordSale(state, report.dept[d], d, S.takeShare(state.queue.baskets[d], 1), report.dept[d].price, markdownActive(state, d, close - 1));
    }
    report.customersServed += q;
    notes.push(`Doors locked at ${hourLabel(close)}. The last ${Math.round(q)} customers in the queue were served.`);
    state.queue.customers = 0;
  }
  for (const d of DEPTS) expire(state, d, close, waste, notes);
  if (state.ctx.mode === 'campaign') closeForTheNight(state, waste, notes);
  if (state.wagesDue) {
    state.cash -= state.wagesDue;
    notes.push(`Wages paid: ${money(state.wagesDue)}.`);
    state.wagesDue = 0;
  }
  for (const s of state.staff) {
    if (!s.isTemp && s.breaks === 0 && s.hoursWorked >= C.wellbeing.hoursBeforeBreakNeeded) s.strain += C.wellbeing.noBreakAllDayStrain;
  }
  state.announcements = notes;
  report.messages.push(...notes);
}

/**
 * Campaign closing, before the next day: the night crew puts dock stock away
 * where there is room (chilled that can't go in the cold room is binned; the
 * rest waits on the dock), stock past its date before the next opening is
 * binned, and fruit & veg ages a little overnight. Everything else keeps.
 */
function closeForTheNight(state: SimState, waste: WasteLine[], notes: string[]): void {
  for (const d of DEPTS) {
    const st = state.stock[d];
    const space = Math.max(0, backroomCapacity(state, d) - S.total(st.backroom));
    S.add(st.backroom, S.take(st.dock, space));
    if (d === 'chilled' && S.total(st.dock) > 1e-9) {
      const warm = S.takeShare(st.dock, 1);
      writeOff(state, waste, d, S.total(warm), S.value(warm), 'dock');
      notes.push(`${Math.round(S.total(warm))} chilled items had no room in the cold room overnight and were binned.`);
    }
  }
  for (const d of DEPTS) expire(state, d, C.calendar.hoursPerDay, waste, notes);
  const shrink = C.campaign.overnight.produceShrink;
  for (const d of DEPTS) {
    if (!C.departments[d].perishable || d === 'chilled') continue;
    const st = state.stock[d];
    const lost = [...S.takeShare(st.shelf, shrink), ...S.takeShare(st.backroom, shrink)];
    writeOff(state, waste, d, S.total(lost), S.value(lost), 'shrink');
  }
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
    // Part of the takings pays off stock bought on account.
    if (state.credit && state.credit > 1e-9) {
      const repay = Math.min(state.credit, takings * C.campaign.supplierCredit.repayShare);
      state.credit -= repay;
      state.cash -= repay;
    }
  }
}

function satisfactionScore(
  state: SimState,
  h: number,
  dept: Record<DeptId, { wanted: number; picked: number }>,
  mult: Record<DeptId, number>,
  avgWait: number,
  abandoned: number,
  customers: number,
): { score: number; reasons: Reason[] } {
  const SC = C.satisfaction;
  const reasons: Reason[] = [];
  const weights = perDept((d) => C.departments[d].basket * state.ctx.range[d] * mult[d]);
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
    } else if (tier !== 'regular' && share > 0) {
      const b = C.pricing[tier].satisfaction * share * 3;
      reasons.push({ label: `${C.pricing[tier].label} on ${deptName(d).toLowerCase()}`, delta: b });
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

/** Whole pounds, for targets and goals: "£60", "£1,500". */
export function pounds(x: number): string {
  const v = `£${Math.round(Math.abs(x)).toLocaleString('en-GB')}`;
  return x < -0.5 ? `−${v}` : v;
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
    if ((counts.get(a) ?? 0) >= assignmentLimit(a, state)) {
      const alt = (['replenish:ambient', 'replenish:produce', 'replenish:chilled', 'receive', 'tills'] as AssignmentId[]).find(
        (x) => (counts.get(x) ?? 0) < assignmentLimit(x, state),
      );
      a = alt ?? 'break';
    }
    counts.set(a, (counts.get(a) ?? 0) + 1);
    assignments[s.id] = a;
  }
  return { assignments, pricing: { ...state.pricing }, actions: [] };
}
