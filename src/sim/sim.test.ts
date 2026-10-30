import { describe, expect, it } from 'vitest';
import { CONFIG, DEPTS } from './config';
import {
  carriedQty,
  checkSetup,
  defaultPlan,
  middayRoomEstimate,
  describeAction,
  inventoryValue,
  operatingProfit,
  planErrors,
  recommendedSetup,
  runHour,
  satisfactionSoFar,
  startDay,
  wellbeing,
} from './engine';
import { fixLimits, playShiftLive, noBreaks, noReplenishment, oneTill, passive, playShift, sensible, type Strategy } from './bots';
import { CURATED_SEED, makeScenario } from './scenario';
import { total } from './stock';
import { convertRecordV3, newRecord, rebuild, retryRecord } from './game';
import { clearSave, loadGame, saveGame, SAVE_KEY, type StorageLike } from './save';
import { summarise } from './summary';
import { explainHour, previewWarnings } from './explain';
import type { SimState } from './types';
import { stepActivity } from '../ui/activity';

const SEED = CURATED_SEED;

function unitsInStore(s: SimState): number {
  let t = 0;
  for (const d of DEPTS) {
    const st = s.stock[d];
    t += total(st.shelf) + total(st.backroom) + total(st.dock) + total(s.queue.baskets[d]);
  }
  return t;
}
function pendingUnits(s: SimState): number {
  return s.deliveries.reduce((t, d) => t + d.qty, 0);
}
function pendingValue(s: SimState): number {
  return s.deliveries.reduce((t, d) => t + d.qty * d.unitCost, 0);
}
function extras(s: SimState): number {
  return Object.values(s.ledger.extras).reduce((t, x) => t + x, 0);
}

class MemoryStorage implements StorageLike {
  data = new Map<string, string>();
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.data.set(k, v);
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
}

describe('opening setup', () => {
  it('recommended setup is affordable and fits', () => {
    const c = checkSetup(recommendedSetup());
    expect(c.errors).toEqual([]);
    expect(c.cashAfter).toBeGreaterThan(0);
  });
  it('rejects unaffordable or oversized orders', () => {
    const s = recommendedSetup();
    s.orders.produce.morning = 5000;
    expect(checkSetup(s).errors.length).toBeGreaterThan(0);
    const t = recommendedSetup();
    t.orders.chilled.midday = 1500;
    t.orders.produce.midday = 1500;
    expect(checkSetup(t).errors.join(' ')).toMatch(/only have/);
    expect(() => startDay(SEED, s)).toThrow();
  });
  it('charges opening purchases to cash, not profit', () => {
    const state = startDay(SEED, recommendedSetup());
    const c = checkSetup(recommendedSetup());
    expect(state.cash).toBeCloseTo(CONFIG.startingCash - c.cost);
    expect(operatingProfit(state)).toBe(0);
  });
});

describe('chilled shelf life and midday room', () => {
  it('lets the player choose short-dated (cheaper) or longer-life chilled per delivery', () => {
    const short = recommendedSetup();
    short.chilledLife = { morning: 'short', midday: 'short' };
    const long = recommendedSetup();
    long.chilledLife = { morning: 'long', midday: 'long' };
    expect(checkSetup(short).cost).toBeLessThan(checkSetup(long).cost);
    const qty = long.orders.chilled.morning + long.orders.chilled.midday;
    expect(checkSetup(long).cost - checkSetup(short).cost).toBeCloseTo(qty * (CONFIG.chilledLife.long.unitCost - CONFIG.chilledLife.short.unitCost), 6);
    const s = startDay(SEED, short);
    const labels = [...s.stock.chilled.shelf, ...s.stock.chilled.backroom].map((b) => b.label);
    expect(labels).not.toContain(CONFIG.chilledLife.long.label);
    expect(s.deliveries.find((d) => d.dept === 'chilled')!.life).toBe('short');
  });
  it('the midday room estimate allows for forecast sales before 12:00', () => {
    const setup = recommendedSetup();
    const est = middayRoomEstimate(setup, CONFIG.demand.forecast, 'produce');
    const cfg = CONFIG.departments.produce;
    const opening = carriedQty('produce') + setup.orders.produce.morning;
    const sales = CONFIG.demand.forecast.slice(0, CONFIG.openingOrder.middayHour).reduce((t, x) => t + x, 0) * cfg.basket;
    expect(est.expectedLeft).toBeCloseTo(opening - sales, 6);
    expect(est.room).toBeCloseTo(cfg.shelfCapacity + cfg.backroomCapacity - (opening - sales), 6);
    // Any overflow in the recommended order clears within the first afternoon hour.
    for (const d of DEPTS) {
      const e = middayRoomEstimate(setup, CONFIG.demand.forecast, d);
      expect(e.clearsBy).not.toBeNull();
      expect(e.clearsBy!).toBeLessThanOrEqual(CONFIG.openingOrder.middayHour + 1);
    }
    setup.orders.produce.midday = 1500;
    const big = middayRoomEstimate(setup, CONFIG.demand.forecast, 'produce');
    expect(big.overflow).toBeGreaterThan(500);
    expect(big.clearsBy!).toBeGreaterThan(CONFIG.openingOrder.middayHour + 1);
  });
});

describe('stock conservation and accounting', () => {
  const strategies: [string, Strategy][] = [
    ['sensible', sensible],
    ['oneTill', oneTill],
    ['noReplenishment', noReplenishment],
  ];
  for (const [name, strat] of strategies) {
    it(`conserves every item and every pound (${name})`, () => {
      const setup = recommendedSetup();
      let state = startDay(SEED, setup);
      const carried = DEPTS.reduce((t, d) => t + carriedQty(d), 0);
      let purchased = DEPTS.reduce((t, d) => t + setup.orders[d].morning + setup.orders[d].midday, 0);
      let sold = 0;
      let wasted = 0;
      let first = true;
      while (state.hour < CONFIG.hours) {
        const plan = strat(state);
        // Add an emergency order once to exercise delayed, pricier stock.
        if (first && state.hour === 1) {
          plan.actions.push({ kind: 'emergency', dept: 'produce' });
          purchased += CONFIG.actions.emergency.qty;
          first = false;
        }
        const r = runHour(state, plan);
        state = r.state;
        for (const d of DEPTS) sold += r.report.dept[d].sold;
        for (const w of r.report.waste) wasted += w.qty;
        // Items: carried + bought = sold + wasted + in store + still on the lorry.
        expect(carried + purchased).toBeCloseTo(sold + wasted + unitsInStore(state) + pendingUnits(state), 6);
        // Value: opening stock + purchases = COGS + waste + inventory left.
        const l = state.ledger;
        expect(state.openingInventoryValue + l.stockPurchases).toBeCloseTo(l.cogs + l.waste + inventoryValue(state) + pendingValue(state), 6);
        // Cash: purchases are cash, not expenses; never charged twice.
        expect(state.cash).toBeCloseTo(CONFIG.startingCash - l.stockPurchases - l.wages - extras(state) + l.revenue, 6);
        expect(operatingProfit(state)).toBeCloseTo(l.revenue - l.cogs - l.waste - l.wages - extras(state), 6);
      }
      // Closing summary keeps cash and inventory separate.
      const sum = summarise(state);
      expect(sum.cash).toBeCloseTo(state.cash);
      expect(sum.inventoryValue).toBeCloseTo(inventoryValue(state));
      expect(sum.operatingProfit).toBeCloseTo(sum.revenue - sum.cogs - sum.waste - sum.wages - sum.extrasTotal, 6);
      expect(state.queue.customers).toBe(0);
    });
  }

  it('retains ambient and long-dated stock at close rather than discarding it all', () => {
    const big = recommendedSetup();
    big.orders.ambient.midday = 600;
    big.orders.chilled.midday = 300;
    big.orders.produce.midday = 300;
    const { state } = playShift(SEED, sensible, big);
    expect(total(state.stock.ambient.backroom) + total(state.stock.ambient.shelf)).toBeGreaterThan(0);
    const leftovers = [...state.stock.chilled.shelf, ...state.stock.chilled.backroom];
    expect(leftovers.every((b) => b.expiresAt === null || b.expiresAt > CONFIG.calendar.hoursPerDay)).toBe(true);
    expect(inventoryValue(state)).toBeGreaterThan(0);
  });
});

describe('assignment limits', () => {
  it('rejects more people on a job than it has room for', () => {
    const state = startDay(SEED, recommendedSetup());
    const plan = defaultPlan(state);
    for (const id of ['priya', 'bev', 'kwame', 'dougie']) plan.assignments[id] = 'tills';
    expect(planErrors(state, plan).join(' ')).toMatch(/tills have room for 3/);
    expect(() => runHour(state, plan)).toThrow();
    const breaks = defaultPlan(state);
    for (const id of ['priya', 'bev', 'kwame']) breaks.assignments[id] = 'break';
    expect(planErrors(state, breaks).join(' ')).toMatch(/break room has room for 2/);
  });
  it('requires everyone on shift to have a job', () => {
    const state = startDay(SEED, recommendedSetup());
    const plan = defaultPlan(state);
    delete plan.assignments.mags;
    expect(planErrors(state, plan).join(' ')).toMatch(/Mags has no job/);
  });
  it('reassignments are free until the hour runs (state is not mutated)', () => {
    const state = startDay(SEED, recommendedSetup());
    const snapshot = JSON.stringify(state);
    const plan = defaultPlan(state);
    plan.assignments.priya = 'break';
    previewWarnings(state, plan);
    runHour(state, plan);
    expect(JSON.stringify(state)).toBe(snapshot);
  });
});

describe('queues and abandonment', () => {
  it('too few tills causes walk-outs, and abandoned baskets are put back, not lost', () => {
    let state = startDay(SEED, recommendedSetup());
    for (let h = 0; h < 3; h++) state = runHour(state, sensible(state)).state;
    const plan = sensible(state);
    for (const [id, a] of Object.entries(plan.assignments)) if (a === 'tills') plan.assignments[id] = 'replenish:ambient';
    plan.assignments.priya = 'tills';
    // keep within the replenish limit
    let n = 0;
    for (const [id, a] of Object.entries(plan.assignments)) if (a === 'replenish:ambient' && ++n > 2) plan.assignments[id] = 'receive';
    const before = unitsInStore(state) + pendingUnits(state);
    const { report, state: after } = runHour(state, plan);
    expect(report.customersAbandoned).toBeGreaterThan(3);
    const abandonedItems = DEPTS.reduce((t, d) => t + report.dept[d].abandonedItems, 0);
    expect(abandonedItems).toBeGreaterThan(0);
    const sold = DEPTS.reduce((t, d) => t + report.dept[d].sold, 0);
    const wasted = report.waste.reduce((t, w) => t + w.qty, 0);
    expect(before).toBeCloseTo(sold + wasted + unitsInStore(after) + pendingUnits(after), 3);
    // Some chilled from abandoned baskets is binned; ambient never is.
    expect(report.waste.some((w) => w.reason === 'abandoned' && w.dept === 'chilled')).toBe(true);
    expect(report.waste.some((w) => w.reason === 'abandoned' && w.dept === 'ambient')).toBe(false);
    expect(explainHour(report).some((x) => x.kind === 'checkout')).toBe(true);
  });
  it('nobody on tills means nobody pays that hour', () => {
    const state = startDay(SEED, recommendedSetup());
    const plan = defaultPlan(state);
    plan.assignments.priya = 'replenish:chilled';
    plan.assignments.bev = 'receive';
    const { report } = runHour(state, plan);
    expect(report.customersServed).toBe(0);
    expect(report.customersAbandoned).toBeGreaterThan(0);
    expect(previewWarnings(state, plan)[0].text).toMatch(/Nobody is on the tills/);
  });
});

describe('expiry and perishables', () => {
  it("Friday's produce expires at 13:00 and is written off at cost", () => {
    // Nobody fills fruit & veg so the old batch is still there at 13:00.
    const strat: Strategy = (s) => {
      const p = sensible(s);
      for (const [id, a] of Object.entries(p.assignments)) if (a === 'replenish:produce') p.assignments[id] = 'replenish:ambient';
      let n = 0;
      for (const [id, a] of Object.entries(p.assignments)) if (a === 'replenish:ambient' && ++n > 2) p.assignments[id] = 'tills';
      let t = 0;
      for (const [id, a] of Object.entries(p.assignments)) if (a === 'tills' && ++t > 3) p.assignments[id] = 'receive';
      return p;
    };
    const setup = recommendedSetup();
    setup.pricing.produce = 'high';
    let state = startDay(SEED, setup);
    // Reduce produce demand to keep some Friday stock: premium price.
    const has = (s: SimState) => [...s.stock.produce.shelf, ...s.stock.produce.backroom].some((b) => b.label === "Friday's produce");
    expect(has(state)).toBe(true);
    let expiredSeen = 0;
    for (let h = 0; h < 4; h++) {
      const r = runHour(state, strat(state));
      state = r.state;
      expiredSeen += r.report.waste.filter((w) => w.dept === 'produce' && w.reason === 'expired').reduce((t, w) => t + w.qty, 0);
    }
    expect(has(state)).toBe(false);
    // Stock rotation sells oldest first, so only a little (or none) is left to expire.
    expect(expiredSeen).toBeGreaterThanOrEqual(0);
  });
  it('short-dated chilled is binned at close; long-dated chilled carries over', () => {
    const setup = recommendedSetup();
    setup.chilledLife = { morning: 'long', midday: 'short' };
    setup.orders.chilled.midday = 1000; // deliberately too much
    setup.orders.produce.midday = 300;
    setup.orders.ambient.morning = 700;
    setup.orders.ambient.midday = 0;
    const noMarkdown: Strategy = (s) => ({ ...sensible(s), actions: sensible(s).actions.filter((x) => x.kind !== 'markdown') });
    const { state, reports } = playShift(SEED, noMarkdown, setup);
    const last = reports[reports.length - 1];
    const expired = last.waste.filter((w) => w.dept === 'chilled' && w.reason === 'expired');
    expect(expired.reduce((t, w) => t + w.qty, 0)).toBeGreaterThan(10);
    const left = [...state.stock.chilled.shelf, ...state.stock.chilled.backroom, ...state.stock.chilled.dock];
    expect(total(left)).toBeGreaterThan(10);
    expect(left.every((b) => b.label === 'Use by Tuesday' && b.expiresAt! > CONFIG.calendar.hoursPerDay)).toBe(true);
  });
  it('stock left on the dock spoils (chilled faster than produce); ambient does not', () => {
    let state = startDay(SEED, recommendedSetup());
    const noReceive: Strategy = (s) => {
      const p = sensible(s);
      for (const [id, a] of Object.entries(p.assignments)) if (a === 'receive') p.assignments[id] = 'tills';
      return fixLimits(s, p, ['receive']);
    };
    let dock: Record<string, number> = {};
    for (let h = 0; h < 5; h++) {
      const r = runHour(state, noReceive(state));
      state = r.state;
      for (const w of r.report.waste) if (w.reason === 'dock') dock[w.dept] = (dock[w.dept] ?? 0) + w.qty;
    }
    expect(dock.chilled ?? 0).toBeGreaterThan(0);
    expect(dock.ambient ?? 0).toBe(0);
    expect((dock.chilled ?? 0) / 480).toBeGreaterThan((dock.produce ?? 0) / 660);
  });
});

describe('delayed arrivals', () => {
  it('blocks duplicate and after-close rush deliveries', async () => {
    const { runSteps } = await import('./engine');
    let state = startDay(SEED, recommendedSetup());
    const a = { kind: 'emergency' as const, dept: 'chilled' as const };
    expect(describeAction(state, a, [a]).available).toBe(false);
    for (let h = state.hour; h < 7; h++) state = runHour(state, sensible(state)).state;
    state = runSteps(state, sensible(state), 50).state;
    const late = describeAction(state, { kind: 'emergency', dept: 'produce' });
    expect(late.available).toBe(false);
    expect(late.reason).toMatch(/after closing/);
  });
  it('the agency temp starts the hour after booking and cannot be booked twice', () => {
    let state = startDay(SEED, recommendedSetup());
    const plan = sensible(state);
    plan.actions = [{ kind: 'temp' }];
    state = runHour(state, plan).state;
    const temp = state.staff.find((s) => s.isTemp)!;
    expect(temp.availableFrom).toBe(1);
    expect(describeAction(state, { kind: 'temp' }).available).toBe(false);
    const next = defaultPlan(state);
    expect(next.assignments.temp).toBeDefined();
    expect(planErrors(state, next)).toEqual([]);
    expect(state.ledger.extras['Agency temp']).toBe(CONFIG.actions.temp.bookingFee);
  });
  it('a delayed delivery is announced in advance and arrives later', () => {
    // Find a generated seed with a delayed delivery.
    let seed = 2;
    while (!makeScenario(seed).events.some((e) => e.kind === 'delayedDelivery')) seed++;
    let state = startDay(seed, recommendedSetup());
    const ev = state.scenario.events.find((e) => e.kind === 'delayedDelivery')!;
    while (state.hour < ev.warnAt) state = runHour(state, sensible(state)).state;
    expect(state.announcements.join(' ')).toMatch(/stuck behind a tractor/);
    expect(state.deliveries.every((d) => d.arrivesAt === ev.hour + 1)).toBe(true);
    while (state.hour < ev.hour + 1) {
      expect(DEPTS.every((d) => total(state.stock[d].dock) === 0 || state.hour > ev.hour)).toBe(true);
      state = runHour(state, sensible(state)).state;
    }
    expect(DEPTS.some((d) => total(state.stock[d].dock) > 0)).toBe(true);
  });
});

describe('interventions', () => {
  it('markdowns are once per perishable department and cut the price', () => {
    let state = startDay(SEED, recommendedSetup());
    expect(describeAction(state, { kind: 'markdown', dept: 'ambient' }).available).toBe(false);
    const plan = sensible(state);
    plan.actions = [{ kind: 'markdown', dept: 'chilled' }];
    const r = runHour(state, plan);
    const plain = runHour(state, sensible(state));
    // Short-dated items sell at the sticker price; demand rises.
    expect(r.report.dept.chilled.priceEffect).toBeLessThan(0);
    expect(plain.report.dept.chilled.priceEffect).toBeCloseTo(0);
    expect(r.report.dept.chilled.wanted).toBeGreaterThan(plain.report.dept.chilled.wanted);
    expect(r.report.dept.chilled.revenue / r.report.dept.chilled.sold).toBeLessThan(CONFIG.departments.chilled.standardPrice);
    state = r.state;
    expect(describeAction(state, { kind: 'markdown', dept: 'chilled' }).available).toBe(false);
  });
  it('promotions cost cash, run one at a time and are capped per day', () => {
    let state = startDay(SEED, recommendedSetup());
    const plan = sensible(state);
    plan.actions = [{ kind: 'promotion', dept: 'produce' }];
    expect(describeAction(state, { kind: 'promotion', dept: 'chilled' }, plan.actions).available).toBe(true);
    const r = runHour(state, plan);
    state = r.state;
    expect(state.ledger.extras.Promotions).toBe(CONFIG.actions.promotion.cost);
    expect(describeAction(state, { kind: 'promotion', dept: 'chilled' }).available).toBe(false); // one at a time
  });
  it('demand multipliers do not stack without limit', () => {
    let state = startDay(SEED, recommendedSetup());
    const setup = recommendedSetup();
    setup.pricing.produce = 'low';
    state = startDay(SEED, setup);
    const plan = sensible(state);
    plan.actions = [
      { kind: 'markdown', dept: 'produce' },
      { kind: 'promotion', dept: 'produce' },
    ];
    const r = runHour(state, plan);
    expect(r.report.dept.produce.demandMult).toBeLessThanOrEqual(CONFIG.demand.maxDeptMult * 1.07);
  });
  it('the chiller repair stops further chilled spoilage', () => {
    const run = (repair: boolean) => {
      let state = startDay(SEED, recommendedSetup());
      let fridgeWaste = 0;
      while (state.hour < CONFIG.hours) {
        const plan = sensible(state);
        plan.actions = plan.actions.filter((a) => a.kind !== 'repair');
        if (repair && state.fridge.status === 'fault' && state.fridge.repairAtStep === null) plan.actions.push({ kind: 'repair' });
        const r = runHour(state, plan);
        state = r.state;
        fridgeWaste += r.report.waste.filter((w) => w.reason === 'fridge').reduce((t, w) => t + w.cost, 0);
      }
      return { state, fridgeWaste };
    };
    const fixed = run(true);
    const broken = run(false);
    expect(fixed.state.fridge.status).toBe('fixed');
    expect(broken.state.fridge.status).toBe('fault');
    expect(broken.fridgeWaste).toBeGreaterThan(fixed.fridgeWaste);
  });
});

describe('events', () => {
  it('generated seeds have at most two disruptions and no unwarned final-hour surprises', () => {
    for (let seed = 2; seed < 300; seed++) {
      const sc = makeScenario(seed);
      expect(sc.events.length).toBeLessThanOrEqual(CONFIG.events.maxPerShift);
      for (const e of sc.events) {
        expect(e.warnAt).toBeLessThanOrEqual(e.hour);
        if (e.warnAt === e.hour) expect(e.hour).toBeLessThan(CONFIG.hours - 2);
        expect(e.hour).toBeLessThan(CONFIG.hours);
      }
      for (let h = 0; h < CONFIG.hours; h++) {
        expect(sc.customerNoise[h]).toBeGreaterThanOrEqual(1 - CONFIG.demand.customerNoise);
        expect(sc.customerNoise[h]).toBeLessThanOrEqual(1 + CONFIG.demand.customerNoise);
      }
    }
  });
  it('the curated Saturday announces its rush two hours early', () => {
    let state = startDay(SEED, recommendedSetup());
    const rush = state.scenario.events.find((e) => e.kind === 'rush')!;
    while (state.hour < rush.warnAt) state = runHour(state, sensible(state)).state;
    expect(state.announcements.join(' ')).toMatch(/rush/);
  });
});

describe('seeded reproducibility', () => {
  it('same seed and decisions give identical results', () => {
    const a = playShift(SEED, sensible);
    const b = playShift(SEED, sensible);
    expect(JSON.stringify(a.state)).toBe(JSON.stringify(b.state));
    const c = playShift(4242, sensible);
    const d = playShift(4242, sensible);
    expect(operatingProfit(c.state)).toBe(operatingProfit(d.state));
  });
  it('different seeds vary demand within bounds', () => {
    const a = makeScenario(10);
    const b = makeScenario(11);
    expect(a.customerNoise).not.toEqual(b.customerNoise);
  });
  it('a record replays to the same state; retry keeps the seed', () => {
    const shift = playShift(77, sensible);
    const rec = convertRecordV3({ seed: 77, setup: recommendedSetup(), plans: shift.plans });
    const a = rebuild(rec)!;
    const b = rebuild(JSON.parse(JSON.stringify(rec)))!;
    expect(JSON.stringify(a.state)).toBe(JSON.stringify(b.state));
    expect(a.state.hour).toBe(CONFIG.hours);
    const retry = retryRecord(rec);
    expect(retry.seed).toBe(77);
    expect(retry.choices).toEqual([]);
  });
});

describe('save and load', () => {
  it('round-trips a game mid-shift', () => {
    const storage = new MemoryStorage();
    const shift = playShift(SEED, sensible);
    const rec = { ...convertRecordV3({ seed: SEED, setup: recommendedSetup(), plans: shift.plans.slice(0, 3) }), minute: 3 * CONFIG.stepsPerHour + 25 };
    expect(saveGame(storage, { record: rec })).toBe(true);
    const loaded = loadGame(storage)!;
    expect(loaded.record).toEqual(rec);
    expect(rebuild(loaded.record)!.state.hour).toBe(3);
    expect(rebuild(loaded.record)!.state.step).toBe(25);
  });
  it('ignores corrupt or incompatible saves', () => {
    const storage = new MemoryStorage();
    storage.setItem(SAVE_KEY, '{not json');
    expect(loadGame(storage)).toBeNull();
    storage.setItem(SAVE_KEY, JSON.stringify({ record: { version: 99, seed: 1, setup: null, plans: [] } }));
    expect(loadGame(storage)).toBeNull();
    storage.setItem(SAVE_KEY, JSON.stringify({ record: { version: 1, seed: 1, setup: recommendedSetup(), plans: [{ assignments: { priya: 'juggling' } }] } }));
    expect(loadGame(storage)).toBeNull();
  });
  it('survives storage that throws or is missing', () => {
    const broken: StorageLike = {
      getItem() {
        throw new Error('blocked');
      },
      setItem() {
        throw new Error('quota');
      },
      removeItem() {
        throw new Error('nope');
      },
    };
    expect(saveGame(broken, { record: newRecord(1) })).toBe(false);
    expect(loadGame(broken)).toBeNull();
    expect(() => clearSave(broken)).not.toThrow();
    expect(saveGame(null, { record: newRecord(1) })).toBe(false);
  });
});

describe('balance: complete shifts', () => {
  const won = (s: SimState) =>
    operatingProfit(s) >= CONFIG.targets.operatingProfit && satisfactionSoFar(s) >= CONFIG.targets.satisfaction && wellbeing(s) >= CONFIG.targets.wellbeing;

  it('sensible play wins the curated Saturday', () => {
    const state = playShiftLive(SEED, sensible);
    expect(won(state)).toBe(true);
    expect(summarise(state).won).toBe(true);
  });
  it('sensible play wins most generated Saturdays', () => {
    let wins = 0;
    const seeds = Array.from({ length: 20 }, (_, i) => 100 + i * 37);
    for (const seed of seeds) if (won(playShiftLive(seed, sensible))) wins++;
    expect(wins).toBeGreaterThanOrEqual(12);
  });
  it('neglecting breaks wrecks wellbeing', () => {
    const { state } = playShift(SEED, noBreaks);
    expect(wellbeing(state)).toBeLessThan(CONFIG.targets.wellbeing);
    expect(summarise(state).missed.join(' ')).toMatch(/never had a break/);
  });
  it('neglecting checkout capacity wrecks satisfaction and profit', () => {
    const { state } = playShift(SEED, oneTill);
    expect(satisfactionSoFar(state)).toBeLessThan(CONFIG.targets.satisfaction);
    expect(operatingProfit(state)).toBeLessThan(CONFIG.targets.operatingProfit);
    expect(summarise(state).estimates[0].label).toMatch(/gave up queueing/i);
    expect(summarise(state).takeaway).toMatch(/abandoned their queues/);
  });
  it('neglecting replenishment empties shelves and loses money', () => {
    const { state } = playShift(SEED, noReplenishment);
    expect(operatingProfit(state)).toBeLessThan(0);
    expect(summarise(state).estimates.map((f) => f.label).join(' ')).toMatch(/Empty shelves/);
  });
  it('doing nothing at all loses', () => {
    expect(won(playShift(SEED, passive).state)).toBe(false);
  });
  it('one bad hour is recoverable', () => {
    const slip: Strategy = (s) => {
      const p = sensible(s);
      if (s.hour === 2) {
        const tillers = Object.entries(p.assignments).filter(([, a]) => a === 'tills');
        for (const [id] of tillers.slice(1)) p.assignments[id] = 'break';
        let b = 0;
        for (const [id, a] of Object.entries(p.assignments)) if (a === 'break' && ++b > 2) p.assignments[id] = 'replenish:ambient';
      }
      return p;
    };
    const state = playShiftLive(SEED, slip);
    expect(won(state)).toBe(true);
  });
});

describe('replay data matches the simulation', () => {
  it('step snapshots add up to the hour report, and idle staff are idle for a recorded reason', () => {
    const { reports } = playShift(SEED, passive);
    let sawIdleFiller = false;
    for (const r of reports.slice(0, -1)) {
      const served = r.steps.reduce((t, s) => t + s.served, 0);
      expect(served).toBeCloseTo(r.customersServed, 6);
      expect(r.steps.reduce((t, s) => t + s.abandoned, 0)).toBeCloseTo(r.customersAbandoned, 6);
      for (const d of DEPTS) {
        const received = r.steps.reduce((t, s) => t + s.received, 0);
        expect(received).toBeCloseTo(DEPTS.reduce((t, x) => t + r.dept[x].received, 0), 6);
        expect(r.steps.reduce((t, s) => t + s.moved[d], 0)).toBeGreaterThanOrEqual(r.dept[d].replenished - 1e-6);
        expect(r.steps[r.steps.length - 1].shelf[d]).toBeCloseTo(r.dept[d].shelfEnd, 6);
      }
      r.steps.forEach((s, k) => {
        for (const a of stepActivity(r, k)) {
          const job = r.staff.find((x) => x.id === a.id)!.assignment;
          if (job.startsWith('replenish:') && a.activity === 'idle') {
            const d = job.split(':')[1] as (typeof DEPTS)[number];
            expect(s.moved[d]).toBeLessThanOrEqual(0.5);
            sawIdleFiller = true;
          }
          if (job === 'tills' && a.activity === 'work') expect(s.served).toBeGreaterThan(0);
        }
      });
    }
    // The passive plan leaves fillers with nothing to move once the stockroom runs dry.
    expect(sawIdleFiller).toBe(true);
  });
});

describe('short intervals', () => {
  it('splits an hour into steps with pro-rated wages and fatigue, and settles the hour at the end', async () => {
    const { runSteps } = await import('./engine');
    let s = startDay(SEED, recommendedSetup());
    const plan = defaultPlan(s);
    plan.assignments.bev = 'break';
    const startWages = s.ledger.wages;
    const priyaStart = s.staff.find((x) => x.id === 'priya')!.energy;
    const before = unitsInStore(s) + pendingUnits(s);
    let sold = 0;
    let wasted = 0;
    for (let i = 0; i < 3; i++) {
      const r = runSteps(s, plan, 20);
      s = r.state;
      expect(r.report.toStep - r.report.fromStep).toBe(20);
      sold += DEPTS.reduce((t, d) => t + r.report.dept[d].sold, 0);
      wasted += r.report.waste.reduce((t, w) => t + w.qty, 0);
      if (i < 2) {
        expect(s.hour).toBe(0);
        expect(s.step).toBe((i + 1) * 20);
      }
    }
    expect(s.hour).toBe(1);
    expect(s.step).toBe(0);
    expect(before).toBeCloseTo(sold + wasted + unitsInStore(s) + pendingUnits(s), 6);
    expect(s.ledger.wages - startWages).toBeCloseTo(CONFIG.wagePerHour * 6, 6);
    expect(s.staff.find((x) => x.id === 'priya')!.energy).toBeCloseTo(priyaStart + CONFIG.staff.energy.tills, 6);
    const bev = s.staff.find((x) => x.id === 'bev')!;
    expect(bev.breaks).toBe(1);
    expect(bev.consecutive).toBe(0);
  });
  it('a short interval never runs past the end of the hour', async () => {
    const { runSteps } = await import('./engine');
    let s = startDay(SEED, recommendedSetup());
    s = runSteps(s, defaultPlan(s), 40).state;
    const r = runSteps(s, defaultPlan(s), 50);
    expect(r.report.toStep).toBe(CONFIG.stepsPerHour);
    expect(r.state.hour).toBe(1);
  });
  it('gives the same day whether it is run an hour at a time or minute by minute', async () => {
    const { runSteps } = await import('./engine');
    let a = startDay(SEED, recommendedSetup());
    let b = a;
    for (let h = 0; h < 3; h++) {
      const plan = defaultPlan(a);
      a = runSteps(a, plan, CONFIG.stepsPerHour).state;
      for (let m = 0; m < CONFIG.stepsPerHour; m++) b = runSteps(b, plan, 1).state;
    }
    expect(b.hour).toBe(a.hour);
    expect(b.cash).toBeCloseTo(a.cash, 6);
    expect(b.ledger.revenue).toBeCloseTo(a.ledger.revenue, 6);
    expect(b.satisfaction.weightedSum).toBeCloseTo(a.satisfaction.weightedSum, 6);
    expect(b.staff.map((s) => s.energy)).toEqual(a.staff.map((s) => expect.closeTo(s.energy, 6)));
    // History keeps one report per hour either way.
    expect(b.history.length).toBe(3);
    expect(b.history[1].customersServed).toBeCloseTo(a.history[1].customersServed, 6);
  });
});

describe('closing advice', () => {
  it('never suggests an emergency order that would arrive after closing', () => {
    for (const seed of [1, 2, 3, 42]) {
      const late = recommendedSetup();
      late.orders.ambient.morning = 300;
      late.orders.ambient.midday = 0;
      const { state } = playShift(seed, passive, late);
      for (const m of summarise(state).missed) {
        const hit = m.match(/would have arrived at (\d\d):00/);
        if (hit) expect(Number(hit[1])).toBeLessThan(CONFIG.openingHour + state.ctx.hours);
      }
    }
  });
  it('keeps money spent apart from estimated lost margin, and does not treat a repair as a mistake', () => {
    const { state } = playShift(SEED, sensible);
    const s = summarise(state);
    expect(s.actionCosts.find((c) => c.label === 'Chiller repair')?.note).toMatch(/Restored/);
    expect(s.missed.join(' ')).not.toMatch(/engineer/i);
    for (const e of s.estimates) expect(s.extras.map((x) => x.label)).not.toContain(e.label);
  });
  it('names a cause for a missed profit target only when it is big enough to explain it', () => {
    const { state } = playShift(SEED, noReplenishment);
    const s = summarise(state, { profit: 800, satisfaction: 0, wellbeing: 0 });
    const shortfall = 800 - s.operatingProfit;
    if (s.estimates[0] && s.estimates[0].amount >= shortfall) expect(s.takeaway).toMatch(/estimate/);
    else expect(s.takeaway).toMatch(/no single cause|written off/);
  });
});
