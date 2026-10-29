/**
 * The seven-day campaign: Sunday to Saturday in one shop.
 *
 * Persistent state (`CampaignState`) is what carries from one day to the next:
 * cash, stock with its dates, staff and their fatigue, installed equipment,
 * reputation and the week's results. Each trading day is an ordinary
 * `SimState` built from it by `startCampaignDay` and run by the same engine as
 * Quick play. `finishDay` folds the closed day back into the campaign.
 *
 * Like a single game, the campaign is stored as decisions (each day's order,
 * hourly plans and purchases) and rebuilt by replaying them, so restarting a
 * day is exact and the same choices always give the same week.
 */
import { CONFIG, DEPTS, type CampaignDayConfig, type DeptId, type PriceTier } from './config';
import {
  checkSetup,
  clamp,
  datedBatches,
  deliveryUnitCost,
  inventoryValue,
  money,
  operatingProfit,
  perDept,
  pounds,
  runHour,
  satisfactionSoFar,
  startShift,
  tierDemand,
  tripMultiplier,
  useByExpiry,
  weekdayName,
  wellbeing,
} from './engine';
import { makeStaff, ROSTER, SPECIALITY_TEXT } from './roster';
import { mulberry32, signed } from './rng';
import * as S from './stock';
import type { Batch, DayContext, HourPlan, HourReport, Scenario, SetupPlan, SimState } from './types';

const C = CONFIG;
const K = C.campaign;
export const CAMPAIGN_DAYS = K.days.length;

export type UpgradeKey = Exclude<keyof typeof K.upgrades, 'hire'>;
export type UpgradeId = UpgradeKey | `hire:${string}`;

export interface CampaignStaff {
  id: string;
  /** Strain carried from earlier days (drives the week's wellbeing and lowers morning energy). */
  fatigue: number;
}

export interface DayResult {
  day: number;
  profit: number;
  revenue: number;
  waste: number;
  customers: number;
  served: number;
  walkouts: number;
  satisfaction: number;
  reputationBefore: number;
  reputationAfter: number;
  wellbeing: number;
  target: number;
  met: boolean;
  cashEnd: number;
  valueEnd: number;
}

export interface CampaignState {
  seed: number;
  /** The next day to trade (0 = Sunday). `CAMPAIGN_DAYS` = the week is over. */
  day: number;
  cash: number;
  /** Stock at closing; dates are hours from the next opening. */
  stock: Record<DeptId, { shelf: Batch[]; backroom: Batch[]; dock: Batch[] }>;
  staff: CampaignStaff[];
  owned: UpgradeId[];
  /** Equipment bought, at purchase cost. */
  equipment: number;
  /** One-off costs paid between days (hire inductions). */
  betweenDayCosts: number;
  reputation: number;
  /** Prices carried to the next day. */
  pricing: Record<DeptId, PriceTier>;
  startValue: number;
  results: DayResult[];
  /** Why the campaign cannot continue, if so. */
  failed: string | null;
}

// ---------------------------------------------------------------------------
// Starting position
// ---------------------------------------------------------------------------

export function newCampaign(seed: number): CampaignState {
  const stock = perDept((d) => {
    const shelf: Batch[] = [];
    const backroom: Batch[] = [];
    for (const x of K.startStock[d]) {
      const b: Batch =
        x.days === null
          ? { qty: x.qty, unitCost: C.departments[d].unitCost, expiresAt: null, label: C.shelfLabels[d] }
          : { qty: x.qty, unitCost: C.departments[d].unitCost, expiresAt: useByExpiry(x.days), label: `Use by ${weekdayName(x.days)}` };
      S.add(x.where === 'shelf' ? shelf : backroom, [b]);
    }
    return { shelf, backroom, dock: [] as Batch[] };
  });
  const camp: CampaignState = {
    seed,
    day: 0,
    cash: K.startCash,
    stock,
    staff: K.startStaff.map((id) => ({ id, fatigue: 0 })),
    owned: [],
    equipment: 0,
    betweenDayCosts: 0,
    reputation: K.reputation.start,
    pricing: { produce: 'regular', chilled: 'regular', ambient: 'regular' },
    startValue: 0,
    results: [],
    failed: null,
  };
  camp.startValue = businessValue(camp).total;
  return camp;
}

export function dayConfig(day: number): CampaignDayConfig {
  return K.days[Math.min(day, CAMPAIGN_DAYS - 1)];
}

export function owns(camp: CampaignState, id: UpgradeId): boolean {
  return camp.owned.includes(id);
}

// ---------------------------------------------------------------------------
// The shop on a given day
// ---------------------------------------------------------------------------

export function campaignDepts(camp: CampaignState): DeptId[] {
  return DEPTS.filter((d) => K.startDepts.includes(d) || (d === 'chilled' && owns(camp, 'chilled')));
}

export function shelfSpace(camp: CampaignState): Record<DeptId, number> {
  const U = K.upgrades;
  return {
    produce: K.shelf.produce + (owns(camp, 'shelfProduce') ? U.shelfProduce.extra : 0),
    chilled: owns(camp, 'chilled') ? K.shelf.chilled + (owns(camp, 'shelfChilled') ? U.shelfChilled.extra : 0) : 0,
    ambient: K.shelf.ambient + (owns(camp, 'shelfAmbient') ? U.shelfAmbient.extra : 0),
  };
}

export function dayContext(camp: CampaignState): DayContext {
  const cfg = dayConfig(camp.day);
  const depts = campaignDepts(camp);
  const shelf = shelfSpace(camp);
  const overheads: Record<string, number> = { 'Rent and rates': K.rentPerDay, 'Energy and other costs': K.costsPerHour * cfg.hours };
  const running = camp.owned.reduce((t, id) => t + (id.startsWith('hire:') ? 0 : K.upgrades[id as UpgradeKey].perDay), 0);
  if (running > 0) overheads.Refrigeration = running;
  return {
    mode: 'campaign',
    weekday: camp.day,
    hours: cfg.hours,
    depts,
    tills: K.startTills + (owns(camp, 'till3') ? 1 : 0),
    shelfCap: shelf,
    // Two chilled cabinets carry half the range, so shoppers want half as much chilled.
    range: { produce: 1, ambient: 1, chilled: !depts.includes('chilled') ? 0 : owns(camp, 'shelfChilled') ? 1 : K.smallChilledRange },
    backroomCap: perDept((d) => (depts.includes(d) ? K.backroom[d] : 0)),
    dockSpoil: perDept((d) => C.departments[d].dockSpoilPerHour * (d === 'chilled' && owns(camp, 'fridge') ? K.fridgeDockSpoilMult : 1)),
    middayHour: cfg.middayHour,
    reputationFootfall: 1,
    overheads,
    actions: cfg.actions.filter((a) => (a === 'repair' ? depts.includes('chilled') : true)),
    pricing: cfg.pricing,
  };
}

/** Footfall from reputation: bounded, so a poor day costs some customers but never most of them. */
export function reputationFootfall(reputation: number): number {
  const R = K.reputation;
  return clamp(1 + (reputation - R.pivot) * R.perPoint, R.min, R.max);
}

/** The day's customers (forecast includes reputation), hidden variation and announced events. */
export function dayScenario(camp: CampaignState): Scenario {
  const cfg = dayConfig(camp.day);
  const rng = mulberry32(camp.seed * 1009 + camp.day * 7919 + 17);
  const n = cfg.hours;
  const rep = reputationFootfall(camp.reputation);
  const noise = (amount: number) => Array.from({ length: n }, () => 1 + signed(rng) * amount);
  const customerNoise = noise(C.demand.customerNoise);
  const deptNoise = perDept(() => noise(C.demand.deptNoise));
  const hasChilled = owns(camp, 'chilled');
  const events = cfg.events
    .filter((e) => (e.kind === 'fridgeFault' ? hasChilled && !owns(camp, 'fridge') : true))
    .filter((e) => (e.kind === 'delayedDelivery' ? cfg.middayHour !== null : true))
    .map((e) => ({ id: `${e.kind}-${camp.day}`, kind: e.kind, hour: e.hour, warnAt: e.warnAt }));
  return {
    seed: camp.seed,
    name: weekdayName(camp.day),
    curated: false,
    forecast: cfg.forecast.map((f) => Math.round(f * rep)),
    customerNoise,
    deptNoise,
    events,
  };
}

/** Morning energy after overnight rest, less any fatigue carried from earlier days. */
export function morningEnergy(fatigue: number): number {
  const F = K.fatigue;
  return 100 - Math.min(F.maxEnergyLoss, fatigue * F.energyPerStrain);
}

export function campaignStaff(camp: CampaignState) {
  return camp.staff.map((cs) => {
    const entry = ROSTER.find((r) => r.id === cs.id)!;
    const s = makeStaff(entry);
    s.energy = morningEnergy(cs.fatigue);
    return s;
  });
}

function carriedFor(camp: CampaignState): Record<DeptId, { where: 'shelf' | 'backroom' | 'dock'; batch: Batch }[]> {
  return perDept((d) => {
    const st = camp.stock[d];
    // Whatever didn't fit in the stockroom overnight is still on the dock, waiting to be unloaded.
    return [
      ...st.shelf.map((b) => ({ where: 'shelf' as const, batch: { ...b } })),
      ...st.backroom.map((b) => ({ where: 'backroom' as const, batch: { ...b } })),
      ...st.dock.map((b) => ({ where: 'dock' as const, batch: { ...b } })),
    ];
  });
}

export function carriedQty(camp: CampaignState): Record<DeptId, number> {
  return perDept((d) => {
    const st = camp.stock[d];
    return S.total(st.shelf) + S.total(st.backroom) + S.total(st.dock);
  });
}

export function dayIntro(camp: CampaignState, scenario: Scenario): string[] {
  const cfg = dayConfig(camp.day);
  const out = [`${weekdayName(camp.day)}: open ${cfg.hours} hours, until ${String(9 + cfg.hours).padStart(2, '0')}:00. Today’s goal: ${pounds(cfg.profitTarget)} profit.`, cfg.intro];
  if (scenario.events.some((e) => e.kind === 'fridgeFault')) out.push('The chiller compressor is rattling. The engineer is on call if it gives up.');
  return out;
}

export function startCampaignDay(camp: CampaignState, setup: SetupPlan): SimState {
  const scenario = dayScenario(camp);
  return startShift({
    seed: camp.seed,
    scenario,
    ctx: dayContext(camp),
    cash: camp.cash,
    overdraft: K.overdraftLimit,
    carried: carriedFor(camp),
    staff: campaignStaff(camp),
    setup,
    announcements: dayIntro(camp, scenario),
  });
}

// ---------------------------------------------------------------------------
// Recommended order
// ---------------------------------------------------------------------------

/** What an order can draw on: cash plus the unused overdraft. */
export function orderFunds(camp: CampaignState): number {
  return camp.cash + K.overdraftLimit;
}

/** Estimated wages and day costs, for keeping cash back. */
export function dayCostEstimate(camp: CampaignState): number {
  const ctx = dayContext(camp);
  return camp.staff.length * C.wagePerHour * ctx.hours + Object.values(ctx.overheads).reduce((t, x) => t + x, 0);
}

/**
 * A recommended order for the coming day: enough for the forecast at today's
 * prices, less stock already in the shop, within the space the shop has and
 * the cash it can spare (some is kept back for wages and costs). Nothing is
 * bought until the player confirms it.
 */
export function recommendOrder(camp: CampaignState): SetupPlan {
  const ctx = dayContext(camp);
  const sc = dayScenario(camp);
  const pricing = ctx.pricing ? { ...camp.pricing } : { produce: 'regular' as PriceTier, chilled: 'regular' as PriceTier, ambient: 'regular' as PriceTier };
  const have = carriedQty(camp);
  const mid = ctx.middayHour;
  const orders = perDept(() => ({ morning: 0, midday: 0 }));
  const round10 = (x: number) => Math.max(0, Math.floor(x / 10) * 10);
  for (const d of ctx.depts) {
    const per = C.departments[d].basket * ctx.range[d] * tierDemand(d, pricing[d]) * tripMultiplier(pricing, d);
    const upTo = (h: number) => sc.forecast.slice(0, h).reduce((t, x) => t + x, 0) * per;
    const cover = d === 'ambient' ? 1.15 : 1.03;
    const total = upTo(ctx.hours) * cover;
    const space = Math.max(0, ctx.shelfCap[d] + ctx.backroomCap[d] - have[d]);
    const want = Math.max(0, total - have[d]);
    // With a midday lorry, the morning delivery covers the hours until just after it arrives; the rest comes at midday.
    const morningWant = mid === null ? want : Math.max(0, upTo(Math.min(ctx.hours, mid + 1)) * cover - have[d]);
    const morning = Math.min(space, want, morningWant);
    orders[d].morning = round10(morning);
    if (mid !== null) {
      const soldByMid = upTo(mid);
      const roomAtMid = Math.max(0, ctx.shelfCap[d] + ctx.backroomCap[d] - Math.max(0, have[d] + orders[d].morning - soldByMid));
      orders[d].midday = round10(Math.min(want - orders[d].morning, roomAtMid, C.openingOrder.maxMidday));
    }
  }
  const setup: SetupPlan = { orders, chilledLife: { morning: 'short', midday: 'long' }, pricing };
  // Keep cash back for the day; scale the order down if it would leave too little.
  const budget = Math.max(0, orderFunds(camp) - (dayCostEstimate(camp) / ctx.hours) * K.orderReserveHours);
  const cost = checkSetup(setup, sc.forecast, { cash: Infinity, carried: have, ctx }).cost;
  if (cost > budget) {
    const k = cost > 0 ? budget / cost : 0;
    for (const d of DEPTS) {
      orders[d].morning = Math.floor((orders[d].morning * k) / 10) * 10;
      orders[d].midday = Math.floor((orders[d].midday * k) / 10) * 10;
    }
  }
  return setup;
}

// ---------------------------------------------------------------------------
// Closing: fold the day into the campaign
// ---------------------------------------------------------------------------

export function teamWellbeing(staff: CampaignStaff[]): number {
  const avg = staff.reduce((t, s) => t + s.fatigue, 0) / Math.max(1, staff.length);
  return clamp(100 - avg * C.wellbeing.strainScale, 0, 100);
}

/** After closing: cash, dated stock, fatigue and reputation carry to tomorrow. */
export function finishDay(camp: CampaignState, state: SimState): { camp: CampaignState; result: DayResult } {
  const H = C.calendar.hoursPerDay;
  const shift = (bs: Batch[]) => bs.filter((b) => b.qty > 1e-9).map((b) => ({ ...b, expiresAt: b.expiresAt === null ? null : b.expiresAt - H }));
  const stock = perDept((d) => ({ shelf: shift(state.stock[d].shelf), backroom: shift(state.stock[d].backroom), dock: shift(state.stock[d].dock) }));
  const staff = camp.staff.map((cs) => {
    const s = state.staff.find((x) => x.id === cs.id);
    return { id: cs.id, fatigue: cs.fatigue * K.fatigue.carry + (s?.strain ?? 0) };
  });
  const sat = satisfactionSoFar(state);
  const reputation = camp.reputation + (sat - camp.reputation) * K.reputation.pull;
  const reports = state.history;
  const profit = operatingProfit(state);
  const cfg = dayConfig(camp.day);
  const next: CampaignState = {
    ...camp,
    day: camp.day + 1,
    cash: state.cash,
    stock,
    staff,
    reputation,
    pricing: { ...state.pricing },
  };
  if (next.cash < -K.overdraftLimit) next.failed = `Cash is ${money(next.cash)}, beyond the bank’s ${money(K.overdraftLimit)} overdraft.`;
  const result: DayResult = {
    day: camp.day,
    profit,
    revenue: state.ledger.revenue,
    waste: state.ledger.waste,
    customers: reports.reduce((t, r) => t + r.customersArrived, 0),
    served: reports.reduce((t, r) => t + r.customersServed, 0),
    walkouts: reports.reduce((t, r) => t + r.customersAbandoned, 0),
    satisfaction: sat,
    reputationBefore: camp.reputation,
    reputationAfter: reputation,
    wellbeing: wellbeing(state),
    target: cfg.profitTarget,
    met: profit >= cfg.profitTarget,
    cashEnd: state.cash,
    valueEnd: 0,
  };
  next.results = [...camp.results, result];
  result.valueEnd = businessValue(next).total;
  return { camp: next, result };
}

// ---------------------------------------------------------------------------
// Business value
// ---------------------------------------------------------------------------

export interface ValueBreakdown {
  cash: number;
  /** Usable stock at what it cost. */
  inventory: number;
  /** Equipment bought, at purchase cost. */
  equipment: number;
  /** Overdraft (cash below zero). */
  debt: number;
  total: number;
}

export function businessValue(camp: CampaignState): ValueBreakdown {
  let inventory = 0;
  for (const d of DEPTS) {
    const st = camp.stock[d];
    inventory += S.value(st.shelf) + S.value(st.backroom) + S.value(st.dock);
  }
  const debt = Math.max(0, -camp.cash);
  const cash = Math.max(0, camp.cash);
  return { cash, inventory, equipment: camp.equipment, debt, total: cash + inventory + camp.equipment - debt };
}

/** Business value during a day (live state), for the status bar. */
export function liveValue(camp: CampaignState, state: SimState): number {
  return state.cash + inventoryValue(state) + camp.equipment;
}

export interface CampaignGoal {
  value: number;
  target: number;
  reputation: number;
  wellbeing: number;
  met: { value: boolean; reputation: boolean; wellbeing: boolean };
}

export function campaignGoal(camp: CampaignState): CampaignGoal {
  const value = businessValue(camp).total;
  const target = camp.startValue + K.objective.growth;
  const wb = teamWellbeing(camp.staff);
  return {
    value,
    target,
    reputation: camp.reputation,
    wellbeing: wb,
    met: { value: value >= target, reputation: camp.reputation >= K.objective.reputation, wellbeing: wb >= K.objective.wellbeing },
  };
}

// ---------------------------------------------------------------------------
// Investments
// ---------------------------------------------------------------------------

export interface Offer {
  id: UpgradeId;
  name: string;
  cost: number;
  /** Running cost, in words ("£12.60 an hour on shift"), or null. */
  recurring: string | null;
  effect: string;
  /** A few words for the compact offer card. */
  brief: string;
  available: boolean;
  reason: string | null;
  cashAfter: number;
  /** Why it is suggested now, from the day's results; empty when not especially relevant. */
  why: string;
  score: number;
}

export function allOffers(camp: CampaignState, lastDay: SimState | null = null): Offer[] {
  const U = K.upgrades;
  const out: Offer[] = [];
  const signals = daySignals(lastDay);
  const add = (id: UpgradeId, o: Omit<Offer, 'id' | 'available' | 'reason' | 'cashAfter'>, unavailable: string | null) => {
    const owned = owns(camp, id);
    const reason = owned ? 'Already installed.' : unavailable ?? (camp.cash < o.cost ? `Needs ${money(o.cost)}; you have ${money(Math.max(0, camp.cash))}.` : null);
    out.push({ id, ...o, available: reason === null, reason, cashAfter: camp.cash - o.cost });
  };
  const tooEarly = (from: number) => (camp.day < from + 1 ? `Available from ${weekdayName(from + 1)}.` : null);
  const ended = camp.day >= CAMPAIGN_DAYS ? 'The week is over.' : null;

  for (const id of K.hireable) {
    const r = ROSTER.find((x) => x.id === id)!;
    const hired = camp.staff.some((s) => s.id === id);
    if (hired) continue;
    out.push({
      id: `hire:${id}`,
      name: `Hire ${r.name}`,
      cost: U.hire.cost,
      recurring: `${money(C.wagePerHour)} an hour on shift`,
      effect: `One more pair of hands every day. ${SPECIALITY_TEXT[r.speciality]}.`,
      brief: `Another pair of hands. ${SPECIALITY_TEXT[r.speciality].split(' (')[0]}.`,
      available: !ended && camp.cash >= U.hire.cost,
      reason: ended ?? (camp.cash < U.hire.cost ? `Needs ${money(U.hire.cost)}.` : null),
      cashAfter: camp.cash - U.hire.cost,
      why: signals.stretched ? signals.stretched : '',
      score: (signals.stretchedScore ?? 0) + 1,
    });
  }
  add(
    'till3',
    {
      name: U.till3.name,
      cost: U.till3.cost,
      recurring: null,
      effect: `A third checkout lane: serves up to ${C.checkout.customersPerHour} more customers an hour, when someone is on it.`,
      brief: `Up to ${C.checkout.customersPerHour} more customers an hour, with someone on it.`,
      why: signals.queue,
      score: signals.queueScore + (camp.staff.length >= 4 ? 1 : 0),
    },
    ended,
  );
  add(
    'shelfProduce',
    { name: U.shelfProduce.name, cost: U.shelfProduce.cost, recurring: null, effect: `Fruit & veg shelf holds ${U.shelfProduce.extra} more (${K.shelf.produce} → ${K.shelf.produce + U.shelfProduce.extra}).`, brief: `Shelf holds ${U.shelfProduce.extra} more fruit & veg.`, why: signals.empty.produce, score: signals.emptyScore.produce },
    ended,
  );
  add(
    'shelfAmbient',
    { name: U.shelfAmbient.name, cost: U.shelfAmbient.cost, recurring: null, effect: `Cupboard shelves hold ${U.shelfAmbient.extra} more (${K.shelf.ambient} → ${K.shelf.ambient + U.shelfAmbient.extra}).`, brief: `Shelves hold ${U.shelfAmbient.extra} more cupboard items.`, why: signals.empty.ambient, score: signals.emptyScore.ambient },
    ended,
  );
  add(
    'chilled',
    {
      name: U.chilled.name,
      cost: U.chilled.cost,
      recurring: `${money(U.chilled.perDay)} a day to run the cabinets`,
      effect: `Two chilled cabinets and a cold room: a new range (about ${C.departments.chilled.basket * K.smallChilledRange} items per shopper at ${money(C.departments.chilled.standardPrice)}). Chilled spoils on the dock and needs filling like any shelf.`,
      brief: `A new range: about ${C.departments.chilled.basket * K.smallChilledRange} more items per shopper.`,
      why: camp.day >= 3 ? 'Shoppers keep asking for milk and sandwiches.' : '',
      score: camp.day >= 3 ? 2 : 0.5,
    },
    ended ?? tooEarly(U.chilled.from),
  );
  add(
    'shelfChilled',
    { name: U.shelfChilled.name, cost: U.shelfChilled.cost, recurring: `${money(U.shelfChilled.perDay)} a day to run`, effect: `Chilled shelf holds ${U.shelfChilled.extra} more (${K.shelf.chilled} → ${K.shelf.chilled + U.shelfChilled.extra}), and the full range doubles what shoppers want from it.`, brief: `Full chilled range: twice the space and the sales.`, why: signals.empty.chilled, score: signals.emptyScore.chilled },
    ended ?? (owns(camp, 'chilled') ? null : 'Needs the chilled department.'),
  );
  add(
    'fridge',
    {
      name: U.fridge.name,
      cost: U.fridge.cost,
      recurring: null,
      effect: `No more cabinet faults, and chilled stock waiting on the dock spoils half as fast.`,
      brief: 'No cabinet faults; less spoilage on the dock.',
      why: owns(camp, 'chilled') && camp.day <= 5 ? 'The chiller compressor has started rattling.' : '',
      score: owns(camp, 'chilled') && camp.day <= 5 ? 2.5 : 0.3,
    },
    ended ?? (owns(camp, 'chilled') ? null : 'Needs the chilled department.'),
  );
  return out;
}

/** Up to three offers worth a look today: affordable, available and relevant to what happened. */
export function topOffers(camp: CampaignState, lastDay: SimState | null): Offer[] {
  return allOffers(camp, lastDay)
    .filter((o) => o.available)
    .sort((a, b) => b.score - a.score || a.cost - b.cost)
    .slice(0, 3);
}

interface Signals {
  queue: string;
  queueScore: number;
  empty: Record<DeptId, string>;
  emptyScore: Record<DeptId, number>;
  stretched: string;
  stretchedScore: number;
}

/** What the closed day says about the shop, from its recorded results. */
function daySignals(state: SimState | null): Signals {
  const out: Signals = { queue: '', queueScore: 0, empty: perDept(() => ''), emptyScore: perDept(() => 0), stretched: '', stretchedScore: 0 };
  if (!state) return out;
  const reps: HourReport[] = state.history;
  const walkouts = reps.reduce((t, r) => t + r.customersAbandoned, 0);
  const longWait = reps.filter((r) => r.avgWait > C.checkout.patienceMinutes).length;
  if (walkouts >= 1 || longWait > 0) {
    out.queue = walkouts >= 1 ? `Today ${Math.round(walkouts)} shoppers gave up queueing.` : `Waits passed ${C.checkout.patienceMinutes} minutes in ${longWait} hour${longWait === 1 ? '' : 's'}.`;
    out.queueScore = 1 + Math.min(3, walkouts / 5);
  }
  for (const d of DEPTS) {
    const gap = reps.reduce((t, r) => t + r.dept[d].lostShelfGap, 0);
    const emptySteps = reps.reduce((t, r) => t + r.dept[d].shelfEmptySteps, 0);
    if (gap > 20 && emptySteps > 0) {
      out.empty[d] = `${C.departments[d].name} shelves ran empty today while stock waited in the stockroom (${Math.round(gap)} items not found).`;
      out.emptyScore[d] = 1 + Math.min(2.5, gap / 80);
    }
  }
  const tired = state.staff.filter((s) => !s.isTemp && s.energy < C.staff.tiredBelow).length;
  const gaps = reps.reduce((t, r) => t + DEPTS.reduce((u, d) => u + r.dept[d].lostShelfGap, 0), 0);
  if (tired > 0 || gaps > 60 || walkouts >= 3) {
    out.stretched = tired > 0 ? `${tired} of the team finished the day tired.` : `The team couldn’t keep up today (${Math.round(gaps)} items not on the shelf, ${Math.round(walkouts)} gave up queueing).`;
    out.stretchedScore = 1.5 + Math.min(2, gaps / 150 + walkouts / 6);
  }
  return out;
}

/** Buys an improvement between days. Throws if it can't be bought. */
export function buy(camp: CampaignState, id: UpgradeId): CampaignState {
  const offer = allOffers(camp).find((o) => o.id === id);
  if (!offer) throw new Error(`Unknown or already bought: ${id}`);
  if (!offer.available) throw new Error(`${offer.name}: ${offer.reason}`);
  const next: CampaignState = { ...camp, cash: camp.cash - offer.cost, owned: [...camp.owned, id] };
  if (id.startsWith('hire:')) {
    next.staff = [...camp.staff, { id: id.slice(5), fatigue: 0 }];
    next.betweenDayCosts = camp.betweenDayCosts + offer.cost;
  } else next.equipment = camp.equipment + offer.cost;
  next.startValue = camp.startValue;
  return next;
}

// ---------------------------------------------------------------------------
// The record of decisions, and rebuilding from it
// ---------------------------------------------------------------------------

export const CAMPAIGN_VERSION = 1;

export interface CampaignDayRecord {
  setup: SetupPlan | null;
  plans: HourPlan[];
  /** Bought after this day closed. */
  purchases: UpgradeId[];
  /** The player has moved on to the next day. */
  done: boolean;
}

export interface CampaignRecord {
  version: number;
  seed: number;
  days: CampaignDayRecord[];
}

export type CampaignPhase = 'morning' | 'trading' | 'closed' | 'finished' | 'failed';

export interface RebuiltCampaign {
  phase: CampaignPhase;
  /** Campaign state at the start of the current day (or after it, once closed). */
  camp: CampaignState;
  /** Campaign state when the current day began (for restarting it). */
  dayStart: CampaignState;
  /** The current day's shift, if it has started. */
  state: SimState | null;
  reports: HourReport[];
  /** Result of the day just closed (phase 'closed'), or the last day. */
  result: DayResult | null;
  /** The shift before the last committed hour (for the replay's status bar). */
  previousState: SimState | null;
}

export function newCampaignRecord(seed: number): CampaignRecord {
  return { version: CAMPAIGN_VERSION, seed, days: [] };
}

export function rebuildCampaign(record: CampaignRecord): RebuiltCampaign {
  let camp = newCampaign(record.seed);
  for (let i = 0; i < CAMPAIGN_DAYS; i++) {
    const rec = record.days[i];
    const dayStart = camp;
    if (!rec || !rec.setup) return { phase: 'morning', camp, dayStart, state: null, reports: [], result: camp.results.at(-1) ?? null, previousState: null };
    let state = startCampaignDay(camp, rec.setup);
    let previousState: SimState | null = null;
    const reports: HourReport[] = [];
    for (const plan of rec.plans.slice(0, state.ctx.hours)) {
      previousState = state;
      const r = runHour(state, plan);
      state = r.state;
      reports.push(r.report);
    }
    if (state.hour < state.ctx.hours) return { phase: 'trading', camp, dayStart, state, reports, result: null, previousState };
    const done = finishDay(camp, state);
    let after = done.camp;
    for (const p of rec.purchases) {
      // A purchase that no longer applies (e.g. its prerequisite was undone) is skipped.
      try {
        after = buy(after, p);
      } catch {
        /* skipped */
      }
    }
    if (after.failed) return { phase: 'failed', camp: after, dayStart, state, reports, result: done.result, previousState };
    if (!rec.done) return { phase: 'closed', camp: after, dayStart, state, reports, result: done.result, previousState };
    camp = after;
  }
  return { phase: 'finished', camp, dayStart: camp, state: null, reports: [], result: camp.results.at(-1) ?? null, previousState: null };
}

/** The record with the current day cleared, so it can be played again from its morning. */
export function restartDay(record: CampaignRecord): CampaignRecord {
  const idx = record.days.findIndex((d) => !d.done);
  if (idx < 0) return record;
  return { ...record, days: record.days.slice(0, idx) };
}

export { deliveryUnitCost, datedBatches };
