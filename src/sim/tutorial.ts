/**
 * The guided shift: short lessons on the real engine with controlled starting
 * conditions (steady footfall, no hidden variation, no events, no purchasing).
 * Each lesson builds its own state, so a lesson can always be retried from
 * the same start and progress never depends on a half-played interval.
 */
import { CONFIG, DEPTS, deptName, type DeptId, type PriceTier } from './config';
import { emptyFloor } from './floor';
import { deptUnits, recommendedSetup, runSteps, startDay } from './engine';
import { ASSIGNMENT_LABEL } from './roster';
import { TUTORIAL_SEED } from './scenario';
import * as S from './stock';
import type { AssignmentId, Batch, HourPlan, HourReport, SimState } from './types';
import type { Zone } from './insight';

export interface LessonFocus {
  /** Staff to highlight. */
  staff: string[];
  /** Places to highlight in the shop. */
  zones: Zone[];
  /** The department whose price comparison to open (pricing lessons). */
  priceDept?: DeptId;
}

export interface LessonResult {
  passed: boolean;
  /** One sentence from the recorded result. */
  sentence: string;
  /** Key for comparing attempts (the choice made). */
  choice: string;
  /** Compact recorded figures for comparing attempts. */
  figures: { label: string; value: string }[];
}

export interface Lesson {
  id: string;
  title: string;
  /** One short objective. */
  objective: string;
  /** Minutes (simulation steps) the interval runs for. */
  steps: number;
  optional?: boolean;
  build(): SimState;
  focus(state: SimState, plan: HourPlan): LessonFocus;
  /** Checklist shown as the player works: each item ticks when done in the plan. */
  checklist(state: SimState, plan: HourPlan): { label: string; done: boolean }[];
  result(before: SimState, after: SimState, report: HourReport, plan: HourPlan): LessonResult;
}

// ---------------------------------------------------------------------------
// Building controlled states
// ---------------------------------------------------------------------------

function batch(d: DeptId, qty: number, expiresAt: number | null = null): Batch[] {
  if (qty <= 0) return [];
  const label = d === 'chilled' ? (expiresAt === null ? CONFIG.chilledLife.long.label : CONFIG.chilledLife.short.label) : d === 'produce' ? 'Fresh produce' : 'Tins & packets';
  const unitCost = d === 'chilled' ? (expiresAt === null ? CONFIG.chilledLife.long.unitCost : CONFIG.chilledLife.short.unitCost) : CONFIG.departments[d].unitCost;
  return [{ qty, unitCost, expiresAt, label }];
}

interface Setup {
  hour: number;
  staff: Partial<Record<string, AssignmentId>>;
  energy?: Partial<Record<string, number>>;
  stock?: Partial<Record<DeptId, { shelf?: number; backroom?: number; dock?: number; shortDated?: boolean }>>;
  queue?: number;
  pricing?: Partial<Record<DeptId, PriceTier>>;
}

function build(setup: Setup): SimState {
  const s = startDay(TUTORIAL_SEED, recommendedSetup());
  s.hour = setup.hour;
  s.step = 0;
  s.deliveries = [];
  s.announcements = [];
  // Lessons stay quiet: no bursts, floor jobs or questions.
  s.floor = emptyFloor();
  const defaults: Record<DeptId, { shelf: number; backroom: number; dock: number }> = {
    produce: { shelf: 280, backroom: 300, dock: 0 },
    chilled: { shelf: 240, backroom: 250, dock: 0 },
    ambient: { shelf: 580, backroom: 600, dock: 0 },
  };
  let opening = 0;
  for (const d of DEPTS) {
    const o = { ...defaults[d], ...(setup.stock?.[d] ?? {}) };
    const exp = setup.stock?.[d]?.shortDated ? CONFIG.hours : null;
    s.stock[d] = { shelf: batch(d, o.shelf, exp), backroom: batch(d, o.backroom, exp), dock: batch(d, o.dock) };
    opening += S.value([...s.stock[d].shelf, ...s.stock[d].backroom, ...s.stock[d].dock]);
  }
  // A clean ledger: the lesson starts with its own stock at cost.
  s.openingInventoryValue = opening;
  s.ledger = { revenue: 0, cogs: 0, waste: 0, wages: 0, extras: {}, stockPurchases: 0 };
  s.cash = CONFIG.startingCash;
  for (const m of s.staff) {
    const job = setup.staff[m.id];
    m.availableFrom = job ? 0 : 99;
    if (job) m.lastAssignment = job;
    m.energy = setup.energy?.[m.id] ?? 95;
  }
  if (setup.pricing) s.pricing = { ...s.pricing, ...setup.pricing };
  if (setup.queue) {
    // Queuing shoppers carry real baskets taken from the shelves.
    s.queue.customers = setup.queue;
    for (const d of DEPTS) S.add(s.queue.baskets[d], S.take(s.stock[d].shelf, setup.queue * CONFIG.departments[d].basket));
  }
  return s;
}

const job = (plan: HourPlan, id: string) => plan.assignments[id];
const count = (plan: HourPlan, a: AssignmentId) => Object.values(plan.assignments).filter((x) => x === a).length;
const r0 = (x: number) => Math.round(x);

// ---------------------------------------------------------------------------
// Lessons
// ---------------------------------------------------------------------------

export const LESSONS: Lesson[] = [
  {
    id: 'serve',
    title: 'Serve customers',
    objective: 'The queue is growing. Put Bev on Serve customers.',
    steps: 30,
    build: () =>
      build({ hour: 3, staff: { priya: 'tills', bev: 'replenish:ambient', kwame: 'replenish:produce' }, queue: 6 }),
    focus: (_s, plan) => (job(plan, 'bev') === 'tills' ? { staff: [], zones: [] } : { staff: ['bev'], zones: ['tills'] }),
    checklist: (_s, plan) => [{ label: 'Two people serving customers', done: count(plan, 'tills') >= 2 }],
    result: (before, after, r, plan) => {
      const q0 = r0(before.queue.customers);
      const q1 = r0(after.queue.customers);
      const tills = count(plan, 'tills');
      const passed = tills >= 2 && q1 <= q0;
      const lost = r0(r.customersAbandoned);
      return {
        passed,
        choice: `${tills} till${tills === 1 ? '' : 's'}`,
        sentence: passed
          ? `With ${tills} tills open, ${r0(r.customersServed)} customers paid and the queue went from ${q0} to ${q1}.`
          : `With ${tills} till${tills === 1 ? '' : 's'} open, ${r0(r.customersServed)} paid, ${lost} gave up, and the queue is ${q1}. Try a second cashier.`,
        figures: [
          { label: 'Served', value: String(r0(r.customersServed)) },
          { label: 'Gave up', value: String(lost) },
          { label: 'Queue', value: `${q0} → ${q1}` },
        ],
      };
    },
  },
  {
    id: 'fill',
    title: 'Fill shelves',
    objective: 'Fruit & veg is almost empty, but the stockroom is full. Put Kwame on Fill produce shelves.',
    steps: 30,
    build: () =>
      build({ hour: 3, staff: { priya: 'tills', bev: 'tills', kwame: 'replenish:ambient' }, stock: { produce: { shelf: 25, backroom: 300 } } }),
    focus: (_s, plan) => (count(plan, 'replenish:produce') > 0 ? { staff: [], zones: [] } : { staff: ['kwame'], zones: ['produce'] }),
    checklist: (_s, plan) => [{ label: 'Someone filling produce shelves', done: count(plan, 'replenish:produce') > 0 }],
    result: (before, after, r) => {
      const x = r.dept.produce;
      const passed = x.replenished > 1 && x.shelfEnd > x.shelfStart;
      const missed = r0(x.lostShelfGap + x.lostNoStock);
      return {
        passed,
        choice: passed ? 'filled' : 'not filled',
        sentence: passed
          ? `${r0(x.replenished)} items went from the stockroom to the shelves: fruit & veg ${r0(x.shelfStart)} → ${r0(x.shelfEnd)}.`
          : `Fruit & veg ran out: ${missed} items wanted weren’t on the shelf, while ${r0(deptUnits(after, 'produce').backroom)} sat in the stockroom.`,
        figures: [
          { label: 'Shelf', value: `${r0(x.shelfStart)} → ${r0(x.shelfEnd)}` },
          { label: 'Not found', value: String(missed) },
          { label: 'Stockroom', value: `${r0(deptUnits(before, 'produce').backroom)} → ${r0(deptUnits(after, 'produce').backroom)}` },
        ],
      };
    },
  },
  {
    id: 'unload',
    title: 'Unload deliveries',
    objective: 'A delivery is stuck on the dock. Put Tomasz on Unload delivery and keep Kwame filling produce.',
    steps: 30,
    build: () =>
      build({
        hour: 3,
        staff: { priya: 'tills', bev: 'tills', kwame: 'replenish:produce', tomasz: 'replenish:ambient' },
        stock: { produce: { shelf: 60, backroom: 0, dock: 500 } },
      }),
    focus: (_s, plan) => {
      const staff: string[] = [];
      const zones: Zone[] = [];
      if (count(plan, 'receive') === 0) {
        staff.push('tomasz');
        zones.push('dock');
      }
      if (count(plan, 'replenish:produce') === 0) {
        staff.push('kwame');
        zones.push('produce');
      }
      return { staff, zones };
    },
    checklist: (_s, plan) => [
      { label: 'Someone unloading the delivery', done: count(plan, 'receive') > 0 },
      { label: 'Someone filling produce shelves', done: count(plan, 'replenish:produce') > 0 },
    ],
    result: (before, after, r) => {
      const x = r.dept.produce;
      const unloaded = r0(x.received);
      const passed = unloaded > 0 && x.replenished > 1;
      const b0 = r0(deptUnits(before, 'produce').dock);
      const b1 = r0(deptUnits(after, 'produce').dock);
      return {
        passed,
        choice: passed ? 'both' : 'one',
        sentence: passed
          ? `Dock → stockroom → shelves: ${unloaded} unloaded, ${r0(x.replenished)} put out; shelf ${r0(x.shelfStart)} → ${r0(x.shelfEnd)}.`
          : unloaded === 0
            ? `Nothing reached the stockroom, so ${b1} items are still on the dock and the shelf fell to ${r0(x.shelfEnd)}.`
            : `${unloaded} items reached the stockroom, but nobody put them on the shelves (shelf ${r0(x.shelfEnd)}).`,
        figures: [
          { label: 'Dock', value: `${b0} → ${b1}` },
          { label: 'Stockroom', value: `${r0(deptUnits(before, 'produce').backroom)} → ${r0(deptUnits(after, 'produce').backroom)}` },
          { label: 'Shelf', value: `${r0(x.shelfStart)} → ${r0(x.shelfEnd)}` },
        ],
      };
    },
  },
  {
    id: 'rest',
    title: 'Rest staff',
    objective: 'Dougie is exhausted and working slowly. Send Dougie on a break and move Mags to Fill chilled shelves.',
    steps: 30,
    build: () =>
      build({
        hour: 4,
        staff: { priya: 'tills', bev: 'tills', dougie: 'replenish:chilled', mags: 'replenish:ambient' },
        energy: { dougie: 15 },
        stock: { chilled: { shelf: 40, backroom: 300 } },
      }),
    focus: (_s, plan) => {
      const staff: string[] = [];
      const zones: Zone[] = [];
      if (job(plan, 'dougie') !== 'break') {
        staff.push('dougie');
        zones.push('break');
      }
      if (!Object.entries(plan.assignments).some(([id, a]) => id !== 'dougie' && a === 'replenish:chilled')) {
        staff.push('mags');
        zones.push('chilled');
      }
      return { staff, zones };
    },
    checklist: (_s, plan) => [
      { label: 'Dougie on a break', done: job(plan, 'dougie') === 'break' },
      { label: 'Someone else filling chilled shelves', done: Object.entries(plan.assignments).some(([id, a]) => id !== 'dougie' && a === 'replenish:chilled') },
    ],
    result: (_before, _after, r, plan) => {
      const d = r.staff.find((x) => x.id === 'dougie')!;
      const x = r.dept.chilled;
      const covered = Object.entries(plan.assignments).some(([id, a]) => id !== 'dougie' && a === 'replenish:chilled');
      const passed = d.assignment === 'break' && covered;
      return {
        passed,
        choice: passed ? 'rested' : 'not rested',
        sentence: passed
          ? `Dougie’s energy ${r0(d.energyBefore)} → ${r0(d.energyAfter)} on a break, while chilled shelves went ${r0(x.shelfStart)} → ${r0(x.shelfEnd)}.`
          : d.assignment === 'break'
            ? `Dougie rested (energy ${r0(d.energyBefore)} → ${r0(d.energyAfter)}), but nobody filled chilled: shelf ${r0(x.shelfStart)} → ${r0(x.shelfEnd)}.`
            : `Dougie kept working at ${Math.round(d.productivity * 100)}% speed and energy fell to ${r0(d.energyAfter)}.`,
        figures: [
          { label: 'Dougie energy', value: `${r0(d.energyBefore)} → ${r0(d.energyAfter)}` },
          { label: 'Chilled shelf', value: `${r0(x.shelfStart)} → ${r0(x.shelfEnd)}` },
        ],
      };
    },
  },
  {
    id: 'tradeoff',
    title: 'Choose a trade-off',
    objective: 'The queue is building and grocery shelves are running low. Where should Tomasz work?',
    steps: 30,
    build: () =>
      build({
        hour: 3,
        staff: { priya: 'tills', kwame: 'replenish:produce', tomasz: 'break' },
        energy: { tomasz: 100 },
        stock: { ambient: { shelf: 45, backroom: 500 } },
        queue: 5,
      }),
    focus: (_s, plan) => (job(plan, 'tomasz') === 'break' ? { staff: ['tomasz'], zones: ['tills', 'ambient'] } : { staff: [], zones: [] }),
    checklist: (_s, plan) => [{ label: 'Tomasz given a job', done: job(plan, 'tomasz') !== 'break' }],
    result: (before, after, r, plan) => {
      const a = job(plan, 'tomasz');
      const x = r.dept.ambient;
      const missed = r0(x.lostShelfGap + x.lostNoStock);
      return {
        passed: a !== 'break',
        choice: ASSIGNMENT_LABEL[a],
        sentence: `Queue ${r0(before.queue.customers)} → ${r0(after.queue.customers)} (${r0(r.customersAbandoned)} gave up); grocery shelf ${r0(x.shelfStart)} → ${r0(x.shelfEnd)} (${missed} not found).`,
        figures: [
          { label: 'Served', value: String(r0(r.customersServed)) },
          { label: 'Gave up', value: String(r0(r.customersAbandoned)) },
          { label: 'Groceries not found', value: String(missed) },
          { label: 'Takings', value: `£${r0(r.money.revenue)}` },
        ],
      };
    },
  },
  {
    id: 'price-surplus',
    title: 'Pricing: too much stock',
    objective: 'Last hour: more short-dated chilled than shoppers will want. Unsold items are binned at 17:00. Compare prices and choose one.',
    steps: 60,
    optional: true,
    build: () =>
      build({
        hour: 7,
        staff: { priya: 'tills', bev: 'tills', dougie: 'replenish:chilled' },
        stock: { chilled: { shelf: 110, backroom: 40, shortDated: true } },
      }),
    focus: () => ({ staff: [], zones: ['chilled'], priceDept: 'chilled' }),
    checklist: (_s, plan) => [{ label: `Chilled: ${CONFIG.pricing[plan.pricing.chilled].label}`, done: true }],
    result: (_b, after, r, plan) => pricingResult('chilled', after, r, plan),
  },
  {
    id: 'price-scarce',
    title: 'Pricing: not enough stock',
    objective: 'Fruit & veg won’t last the hour and nothing more is coming. Compare prices and choose one.',
    steps: 60,
    optional: true,
    build: () =>
      build({
        hour: 5,
        staff: { priya: 'tills', bev: 'tills', kwame: 'replenish:produce' },
        stock: { produce: { shelf: 90, backroom: 0 } },
      }),
    focus: () => ({ staff: [], zones: ['produce'], priceDept: 'produce' }),
    checklist: (_s, plan) => [{ label: `Fruit & veg: ${CONFIG.pricing[plan.pricing.produce].label}`, done: true }],
    result: (_b, after, r, plan) => pricingResult('produce', after, r, plan),
  },
];

function pricingResult(d: DeptId, _after: SimState, r: HourReport, plan: HourPlan): LessonResult {
  const x = r.dept[d];
  const gp = x.revenue - x.cogs;
  const binned = r.waste.filter((w) => w.dept === d);
  const binnedQty = r0(binned.reduce((t, w) => t + w.qty, 0));
  const binnedCost = binned.reduce((t, w) => t + w.cost, 0);
  const unmet = r0(x.lostShelfGap + x.lostNoStock);
  const tier = plan.pricing[d];
  const name = CONFIG.pricing[tier].label;
  return {
    passed: true,
    choice: CONFIG.pricing[tier].short,
    sentence:
      d === 'chilled'
        ? `${name}: ${r0(x.sold)} sold, ${binnedQty} binned at 17:00. Gross profit £${r0(gp)}, after waste £${r0(gp - binnedCost)}.`
        : `${name}: all ${r0(x.sold)} sold, ${unmet} more wanted. Gross profit £${r0(gp)}.`,
    figures: [
      { label: 'Sold', value: String(r0(x.sold)) },
      { label: 'Takings', value: `£${r0(x.revenue)}` },
      { label: 'Gross profit', value: `£${r0(gp)}` },
      d === 'chilled' ? { label: 'Binned at close', value: `${binnedQty} · £${r0(binnedCost)}` } : { label: 'Wanted, not found', value: String(unmet) },
      d === 'chilled' ? { label: 'After waste', value: `£${r0(gp - binnedCost)}` } : { label: 'Per item', value: `£${(x.sold > 0 ? gp / x.sold : 0).toFixed(2)}` },
    ],
  };
}

export const CORE_LESSONS = LESSONS.filter((l) => !l.optional).length;

/** The lesson's starting jobs, exactly as set up (breaks are not ended automatically). */
export function lessonPlan(state: SimState): HourPlan {
  const assignments: Record<string, AssignmentId> = {};
  for (const m of state.staff) if (m.availableFrom <= state.hour) assignments[m.id] = m.lastAssignment;
  return { assignments, pricing: { ...state.pricing }, actions: [] };
}

/** Runs a lesson's interval on the engine. */
export function runLesson(lesson: Lesson, state: SimState, plan: HourPlan): { after: SimState; report: HourReport; result: LessonResult } {
  const { state: after, report } = runSteps(state, plan, lesson.steps);
  return { after, report, result: lesson.result(state, after, report, plan) };
}

export function lessonDeptName(d: DeptId): string {
  return deptName(d);
}
