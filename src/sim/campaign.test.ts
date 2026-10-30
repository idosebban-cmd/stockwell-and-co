import { describe, expect, it } from 'vitest';
import { CONFIG, DEPTS } from './config';
import { checkSetup, defaultPlan, deptUnits, inventoryValue, planErrors, runHour, weekdayName } from './engine';
import {
  allOffers,
  buy,
  businessValue,
  carriedQty,
  spendable,
  dayContext,
  dayScenario,
  finishDay,
  morningEnergy,
  newCampaign,
  newCampaignRecord,
  orderFunds,
  nextDay,
  phaseOf,
  recommendOrder,
  replayToday,
  restartDay,
  teamWellbeing,
  WEEK_DAYS,
  startCampaignDay,
  topOffers,
  type CampaignRecord,
  type CampaignState,
} from './campaign';
import { noReplenishment, planInvest, playCampaign, playLiveDay, sensible, type Strategy } from './bots';
import * as S from './stock';
import type { SimState } from './types';

const K = CONFIG.campaign;

function playDay(camp: CampaignState, strategy: Strategy = sensible): { state: SimState; camp: CampaignState } {
  let state = startCampaignDay(camp, recommendOrder(camp));
  while (state.hour < state.ctx.hours) state = runHour(state, strategy(state)).state;
  return { state, camp: finishDay(camp, state).camp };
}

describe('campaign start', () => {
  it('begins on Sunday with two departments, three staff, two tills and the starting cash', () => {
    const c = newCampaign(1);
    const ctx = dayContext(c);
    expect(weekdayName(c.day)).toBe('Sunday');
    expect(ctx.depts).toEqual(['produce', 'ambient']);
    expect(c.staff.map((s) => s.id)).toEqual(K.startStaff);
    expect(ctx.tills).toBe(2);
    expect(ctx.hours).toBe(K.days[0].hours);
    expect(c.cash).toBe(K.startCash);
    expect(c.startValue).toBeCloseTo(businessValue(c).total, 6);
  });
  it('builds up from short days to the eight-hour Saturday', () => {
    const hours = K.days.map((d) => d.hours);
    expect(hours[0]).toBeLessThan(hours[6]);
    expect(hours[6]).toBe(CONFIG.hours);
    for (let i = 1; i < hours.length; i++) expect(hours[i]).toBeGreaterThanOrEqual(hours[i - 1]);
    const total = (i: number) => K.days[i].forecast.reduce((t, x) => t + x, 0);
    expect(total(6)).toBe(Math.max(...K.days.map((_, i) => total(i))));
  });
});

describe('day transitions', () => {
  it('carries cash and dated stock forward; only stock past its date is binned', () => {
    const c0 = newCampaign(1);
    const { state, camp: c1 } = playDay(c0);
    expect(c1.day).toBe(1);
    expect(c1.cash).toBeCloseTo(state.cash, 6);
    // Inventory carried equals what was left at closing, and dates move one day closer.
    expect(businessValue(c1).inventory).toBeCloseTo(inventoryValue(state), 6);
    for (const d of DEPTS) {
      const before = [...state.stock[d].shelf, ...state.stock[d].backroom, ...state.stock[d].dock];
      const after = [...c1.stock[d].shelf, ...c1.stock[d].backroom, ...c1.stock[d].dock];
      expect(S.total(after)).toBeCloseTo(S.total(before), 6);
      for (const b of after) if (b.expiresAt !== null) expect(b.expiresAt).toBeGreaterThan(0);
      for (const b of before) if (b.expiresAt !== null) expect(b.expiresAt).toBeGreaterThan(CONFIG.calendar.hoursPerDay);
    }
    // Cupboard stock keeps.
    expect(S.total([...c1.stock.ambient.shelf, ...c1.stock.ambient.backroom]).valueOf()).toBeGreaterThan(0);
  });
  it('bins stock that reaches its use-by date overnight, and only that', () => {
    let c = newCampaign(1);
    // Starting fruit & veg is "use by Monday": an order of zero leaves some unsold by Monday's close.
    for (let i = 0; i < 2; i++) {
      const setup = recommendOrder(c);
      setup.orders.produce = { morning: 0, midday: 0 };
      let state = startCampaignDay(c, setup);
      while (state.hour < state.ctx.hours) state = runHour(state, sensible(state)).state;
      const expired = state.history.flatMap((r) => r.waste).filter((w) => w.dept === 'produce' && w.reason === 'expired');
      if (i === 0) expect(expired.length).toBe(0);
      c = finishDay(c, state).camp;
    }
    expect([...c.stock.produce.shelf, ...c.stock.produce.backroom].every((b) => b.expiresAt === null || b.expiresAt > 0)).toBe(true);
  });
  it('restores energy overnight, carries part of the strain, and lowers morning energy after overwork', () => {
    const c0 = newCampaign(1);
    const overwork: Strategy = (s) => {
      const p = sensible(s);
      for (const [id, a] of Object.entries(p.assignments)) if (a === 'break') p.assignments[id] = 'tills';
      return p;
    };
    let { state, camp: c1 } = playDay(c0, overwork);
    expect(state.staff.some((s) => s.energy < 100)).toBe(true);
    for (const cs of c1.staff) expect(cs.fatigue).toBeCloseTo(state.staff.find((s) => s.id === cs.id)!.strain, 6);
    const next = startCampaignDay(c1, recommendOrder(c1));
    for (const s of next.staff) expect(s.energy).toBeCloseTo(morningEnergy(c1.staff.find((x) => x.id === s.id)!.fatigue), 6);
    // Several overworked days in a row wear the team down.
    let c = c1;
    for (let i = 0; i < 3; i++) ({ state, camp: c } = playDay(c, overwork));
    expect(teamWellbeing(c.staff)).toBeLessThan(teamWellbeing(c1.staff));
    expect(morningEnergy(Math.max(...c.staff.map((s) => s.fatigue)))).toBeLessThan(100);
  });
  it('moves reputation part-way towards the day’s satisfaction', () => {
    const c0 = newCampaign(1);
    const { state, camp: c1 } = playDay(c0);
    const sat = state.satisfaction.weightedSum / state.satisfaction.customers;
    expect(c1.reputation).toBeCloseTo(c0.reputation + (sat - c0.reputation) * K.reputation.pull, 6);
  });
  it('charges wages for whoever is on shift, including hires, and running costs for equipment', () => {
    let c = newCampaign(1);
    ({ camp: c } = playDay(c));
    c = buy(c, 'hire:bev');
    const { state } = playDay(c);
    expect(state.ledger.wages).toBeCloseTo(4 * CONFIG.wagePerHour * state.ctx.hours, 6);
    let x = c;
    for (let i = 0; i < 2; i++) ({ camp: x } = playDay(x));
    x = { ...x, cash: 5000 };
    x = buy(x, 'chilled');
    const chilledDay = playDay(x).state;
    expect(chilledDay.ledger.extras.Refrigeration).toBeCloseTo(K.upgrades.chilled.perDay, 6);
  });
});

describe('locks and installed equipment', () => {
  it('chilled cannot be stocked or staffed until bought; a third till needs installing', () => {
    const c = newCampaign(1);
    const state = startCampaignDay(c, recommendOrder(c));
    const plan = defaultPlan(state);
    const someone = Object.keys(plan.assignments)[0];
    expect(planErrors(state, { ...plan, assignments: { ...plan.assignments, [someone]: 'replenish:chilled' } }).join(' ')).toMatch(/doesn’t have/);
    const all = Object.fromEntries(Object.keys(plan.assignments).map((id) => [id, 'tills' as const]));
    expect(planErrors(state, { ...plan, assignments: all }).join(' ')).toMatch(/room for 2/);
    const order = recommendOrder(c);
    order.orders.chilled.morning = 50;
    expect(checkSetup(order, state.scenario.forecast, { cash: c.cash, carried: carriedQty(c), ctx: dayContext(c) }).errors.join(' ')).toMatch(/doesn't have/);
    expect(state.stock.chilled.shelf.length + state.stock.chilled.backroom.length).toBe(0);
  });
  it('prices are fixed on the first two days and open from Tuesday', () => {
    const c = newCampaign(1);
    const state = startCampaignDay(c, recommendOrder(c));
    const plan = defaultPlan(state);
    expect(planErrors(state, { ...plan, pricing: { ...plan.pricing, produce: 'high' } }).join(' ')).toMatch(/Prices/);
    expect(K.unlocks.pricing).toBe(2);
    const tue = startCampaignDay({ ...c, day: 2 }, recommendOrder({ ...c, day: 2 }));
    expect(planErrors(tue, { ...defaultPlan(tue), pricing: { ...plan.pricing, produce: 'high' } })).toEqual([]);
  });
  it('purchases persist and show in the shop the next day', () => {
    let c = newCampaign(1);
    ({ camp: c } = playDay(c));
    c = buy(c, 'till3');
    c = buy(c, 'shelfProduce');
    const ctx = dayContext(c);
    expect(ctx.tills).toBe(3);
    expect(ctx.shelfCap.produce).toBe(K.shelf.produce + K.upgrades.shelfProduce.extra);
    ({ camp: c } = playDay(c));
    expect(dayContext(c).tills).toBe(3);
    expect(businessValue(c).equipment).toBe(K.upgrades.till3.cost + K.upgrades.shelfProduce.cost);
  });
});

describe('purchases', () => {
  it('cannot be duplicated, bought without the cash, before they are offered, or without what they need', () => {
    let c = newCampaign(1);
    ({ camp: c } = playDay(c));
    c = buy(c, 'till3');
    expect(() => buy(c, 'till3')).toThrow(/Already installed/);
    c = buy(c, 'hire:bev');
    expect(() => buy(c, 'hire:bev')).toThrow();
    expect(() => buy(c, 'chilled')).toThrow(/Available from/);
    expect(() => buy(c, 'fridge')).toThrow(/Needs the chilled/);
    expect(() => buy({ ...c, cash: 100 }, 'shelfAmbient')).toThrow(/Needs £/);
  });
  it('equipment moves cash into business value; a hire’s induction fee is a cost', () => {
    let c = newCampaign(1);
    ({ camp: c } = playDay(c));
    const v0 = businessValue(c).total;
    expect(businessValue(buy(c, 'till3')).total).toBeCloseTo(v0, 6);
    expect(businessValue(buy(c, 'hire:bev')).total).toBeCloseTo(v0 - K.upgrades.hire.cost, 6);
  });
  it('offers show cost, running cost, effect and cash after; at most three are suggested', () => {
    let c = newCampaign(1);
    const { state, camp } = playDay(c);
    c = camp;
    for (const o of allOffers(c, state)) {
      expect(o.cost).toBeGreaterThan(0);
      expect(o.effect.length).toBeGreaterThan(10);
      expect(o.cashAfter).toBeCloseTo(c.cash - o.cost, 6);
    }
    expect(allOffers(c, state).find((o) => o.id.startsWith('hire:'))!.recurring).toMatch(/hour/);
    expect(topOffers(c, state).length).toBeLessThanOrEqual(3);
    expect(topOffers(c, state).every((o) => o.available)).toBe(true);
  });
});

describe('recommended orders', () => {
  it('cover the forecast plus a margin for bursts (at least 20% over), unless space or cash runs out first', () => {
    const c = newCampaign(1);
    const o = recommendOrder(c);
    const ctx = dayContext(c);
    const have = carriedQty(c);
    const forecast = dayScenario(c).forecast.reduce((t, x) => t + x, 0);
    for (const d of ctx.depts) {
      const stock = have[d] + o.orders[d].morning + o.orders[d].midday;
      const space = ctx.shelfCap[d] + ctx.backroomCap[d];
      expect(Math.min(stock + 10, space)).toBeGreaterThanOrEqual(Math.min(space, forecast * CONFIG.departments[d].basket * ctx.range[d] * 1.2));
    }
  });
  it('accepting them never runs a department out of stock, from the first Sunday through the week (bursts included)', () => {
    for (const seed of [1, 2, 3]) {
      let c = newCampaign(seed);
      for (let d = 0; d < WEEK_DAYS; d++) {
        const ranOut: string[] = [];
        const state = playLiveDay(startCampaignDay(c, recommendOrder(c)), sensible, (l) => {
          for (const dp of l.state.ctx.depts) {
            const u = deptUnits(l.state, dp);
            if (u.shelf + u.backroom + u.dock + u.pending < 1) ranOut.push(`${weekdayName(d)} ${dp} at ${l.state.hour}:${l.state.step}`);
          }
        });
        expect(ranOut).toEqual([]);
        c = finishDay(c, state).camp;
      }
    }
  });
  it('stay within the funds and the space, and adapt to stock already in the shop', () => {
    let c = newCampaign(1);
    for (let i = 0; i < WEEK_DAYS; i++) {
      const o = recommendOrder(c);
      const ctx = dayContext(c);
      const have = carriedQty(c);
      const check = checkSetup(o, startCampaignDay(c, o).scenario.forecast, { cash: orderFunds(c), carried: have, ctx });
      expect(check.errors).toEqual([]);
      for (const d of ctx.depts) expect(o.orders[d].morning).toBeLessThanOrEqual(Math.max(0, ctx.shelfCap[d] + ctx.backroomCap[d] - have[d]) + 1e-9);
      if (ctx.middayHour === null) for (const d of DEPTS) expect(o.orders[d].midday).toBe(0);
      ({ camp: c } = playDay(c));
    }
    const poor = { ...newCampaign(1), cash: -400 };
    const o = recommendOrder(poor);
    expect(checkSetup(o, [], { cash: orderFunds(poor), carried: carriedQty(poor), ctx: dayContext(poor) }).cost).toBeLessThanOrEqual(orderFunds(poor));
    // More stock on hand means a smaller order.
    const stocked = newCampaign(1);
    stocked.stock.produce.backroom.push({ qty: 200, unitCost: 0.52, expiresAt: 80, label: 'Use by Wednesday' });
    expect(recommendOrder(stocked).orders.produce.morning).toBeLessThan(recommendOrder(newCampaign(1)).orders.produce.morning);
  });
});

describe('saving, reloading and restarting', () => {
  it('rebuilds today from the morning snapshot and the minute-stamped choices', async () => {
    const { advanceAnswering, choose, startLive } = await import('./live');
    let rec: CampaignRecord = newCampaignRecord(3);
    expect(phaseOf(rec, replayToday(rec))).toBe('morning');
    // Sunday: open, move Kwame to the tills at 09:20, play to closing.
    rec = { ...rec, today: { setup: recommendOrder(rec.camp), choices: [], minute: 0 } };
    let live = startLive(startCampaignDay(rec.camp, rec.today!.setup));
    const made: import('./live').Choice[] = [];
    live = advanceAnswering(live, 20, made);
    const c = { at: 20, kind: 'jobs' as const, assignments: { ...live.plan.assignments, kwame: 'tills' as const } };
    live = choose(live, c);
    made.push(c);
    live = advanceAnswering(live, 400, made);
    rec.today!.choices.push(...made);
    rec.today!.minute = 420;
    const back = replayToday(JSON.parse(JSON.stringify(rec)))!;
    expect(phaseOf(rec, back)).toBe('closed');
    expect(back.state.cash).toBeCloseTo(live.state.cash, 9);
    // Buy, move on, play into Monday; restarting returns to Monday morning with the purchase kept.
    rec = nextDay({ ...rec, purchases: ['hire:bev'] }, back.state);
    expect(rec.camp.day).toBe(1);
    expect(rec.camp.staff.map((s) => s.id)).toContain('bev');
    rec = { ...rec, today: { setup: recommendOrder(rec.camp), choices: [], minute: 15 } };
    const mid = replayToday(rec)!;
    expect(phaseOf(rec, mid)).toBe('trading');
    expect(mid.state.hour).toBe(0);
    expect(mid.state.step).toBe(15);
    const again = restartDay(rec);
    expect(phaseOf(again, replayToday(again))).toBe('morning');
    expect(again.camp.staff.map((s) => s.id)).toContain('bev');
  });
});

describe('day after day', () => {
  const staffPath = planInvest({ 0: ['hire:bev'], 2: ['hire:tomasz'], 3: ['till3'] });
  const chilledPath = planInvest({ 2: ['chilled'], 3: ['hire:dougie'], 4: ['fridge'] });
  const shelvesPath = planInvest({ 0: ['shelfProduce'], 1: ['shelfAmbient'], 2: ['hire:bev'] });
  for (const [name, path] of Object.entries({ staffPath, chilledPath, shelvesPath })) {
    it(`${name}: a sensible player grows the business in the first week and keeps the team well`, () => {
      for (const seed of [1, 3]) {
        const w = playCampaign(seed, sensible, path);
        expect(w.camp.day).toBe(WEEK_DAYS);
        expect(businessValue(w.camp).total).toBeGreaterThan(w.camp.startValue + 1000);
        expect(w.camp.reputation).toBeGreaterThan(60);
        expect(teamWellbeing(w.camp.staff)).toBeGreaterThan(60);
      }
    });
  }
  it('keeps going after Saturday: the next week has everything unlocked and a little more custom', () => {
    const w = playCampaign(1, sensible, staffPath, recommendOrder, WEEK_DAYS + 2);
    expect(w.camp.day).toBe(WEEK_DAYS + 2);
    const nextSunday = dayContext({ ...w.camp, day: WEEK_DAYS });
    expect(nextSunday.weekday).toBe(0);
    expect(nextSunday.pricing).toBe(true);
    expect(nextSunday.actions).toContain('emergency');
    const sum = (day: number) => dayScenario({ ...w.camp, day, reputation: 70 }).forecast.reduce((t, x) => t + x, 0);
    expect(sum(WEEK_DAYS)).toBeGreaterThan(sum(0));
  });
  it('the first days are generous: shoppers wait longer before giving up', () => {
    const c = newCampaign(1);
    expect(dayContext(c).patienceBonus).toBe(K.generous.patienceBonusMinutes);
    expect(dayContext({ ...c, day: K.generous.days }).patienceBonus).toBe(0);
  });
  it('a poor first two days can be recovered from', () => {
    const weak: Strategy = (s) => (s.ctx.weekday <= 1 ? noReplenishment(s) : sensible(s));
    const w = playCampaign(1, weak, planInvest({ 2: ['hire:bev'], 3: ['shelfProduce'] }));
    const strong = playCampaign(1, sensible, planInvest({ 2: ['hire:bev'], 3: ['shelfProduce'] }));
    expect(w.days[1].result.profit).toBeLessThan(strong.days[1].result.profit);
    expect(businessValue(w.camp).total).toBeGreaterThan(w.camp.startValue);
  });
  it('investing makes later days better (shorter queues or better availability), not cancelled out', () => {
    const base = playCampaign(1, sensible, () => []);
    const invested = playCampaign(1, sensible, planInvest({ 0: ['hire:bev'], 2: ['hire:tomasz'], 3: ['till3'] }));
    const sat = (w: typeof base) => w.days[6].result.satisfaction;
    expect(sat(invested)).toBeGreaterThan(sat(base));
    expect(invested.days[6].result.walkouts).toBeLessThanOrEqual(base.days[6].result.walkouts);
  });
});

describe('till float', () => {
  it('the morning order never spends the float', () => {
    for (const cash of [2000, 600, K.tillFloat + 40, K.tillFloat, 60, -200]) {
      const c: CampaignState = { ...newCampaign(1), cash };
      expect(orderFunds(c)).toBeCloseTo(Math.max(0, cash - K.tillFloat), 9);
      const order = recommendOrder(c);
      const state = startCampaignDay(c, order);
      expect(state.credit ?? 0).toBe(0);
      if (cash >= K.tillFloat) expect(state.cash).toBeGreaterThanOrEqual(K.tillFloat - 1e-6);
      else expect(state.cash).toBeCloseTo(cash, 9);
    }
    // An order that would dip into the float is refused.
    const c: CampaignState = { ...newCampaign(1), cash: K.tillFloat + 10 };
    const big = recommendOrder({ ...c, cash: 5000 });
    expect(() => startCampaignDay(c, big)).toThrow();
  });
  it('upgrades can’t spend the float', () => {
    const base = newCampaign(1);
    const cost = allOffers({ ...base, day: 1 }).find((o) => o.id === 'till3')!.cost;
    const c: CampaignState = { ...base, day: 1, cash: cost + K.tillFloat - 1 };
    const o = allOffers(c).find((x) => x.id === 'till3')!;
    expect(o.available).toBe(false);
    expect(o.reason).toMatch(/stays in the till/);
    expect(spendable(c)).toBeLessThan(cost);
    expect(allOffers({ ...c, cash: cost + K.tillFloat }).find((x) => x.id === 'till3')!.available).toBe(true);
  });
  it('a save that still owes the wholesaler pays it off from takings, and it counts against business value', () => {
    const owing: CampaignState = { ...newCampaign(1), credit: 120 };
    let state = startCampaignDay(owing, recommendOrder(owing));
    expect(state.credit).toBeCloseTo(120, 9);
    while (state.hour < state.ctx.hours) state = runHour(state, sensible(state)).state;
    expect(state.credit!).toBeCloseTo(Math.max(0, 120 - state.ledger.revenue * K.supplierCredit.repayShare), 6);
    const after = finishDay(owing, state).camp;
    expect(businessValue(after).debt).toBeCloseTo(Math.max(0, -after.cash) + after.credit, 9);
  });
});

describe('default plans', () => {
  it('are valid every hour of every day, with hires and only the tills that are installed', () => {
    let c = newCampaign(1);
    const hires: Record<number, string[]> = { 0: ['hire:bev', 'hire:tomasz'], 2: ['chilled', 'breakRoom', 'hire:dougie'] };
    while (c.day < WEEK_DAYS) {
      let state = startCampaignDay(c, recommendOrder(c));
      while (state.hour < state.ctx.hours) {
        const p = defaultPlan(state);
        expect(planErrors(state, p)).toEqual([]);
        state = runHour(state, p).state;
      }
      c = finishDay(c, state).camp;
      for (const id of hires[c.day - 1] ?? []) c = buy({ ...c, cash: Math.max(c.cash, 2000) }, id as never);
    }
  });
});

describe('saves', () => {
  const memory = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
  };
  it('a saved day loads back exactly, mid-shift', async () => {
    const { saveCampaign, loadCampaign } = await import('./save');
    const st = memory();
    let rec = newCampaignRecord(2);
    rec = { ...rec, today: { setup: recommendOrder(rec.camp), choices: [{ at: 0, kind: 'jobs', assignments: { priya: 'tills', kwame: 'replenish:produce', mags: 'break' } }], minute: 75 } };
    saveCampaign(st, { record: rec });
    const back = loadCampaign(st);
    expect(back.problem).toBeNull();
    expect(replayToday(back.file!.record)!.state.cash).toBeCloseTo(replayToday(rec)!.state.cash, 9);
  });
  it('an incompatible save is reset with an explanation, not silently', async () => {
    const { loadCampaign, CAMPAIGN_KEY } = await import('./save');
    const st = memory();
    st.setItem(CAMPAIGN_KEY, JSON.stringify({ record: { version: 0, seed: 1, days: [] } }));
    const r = loadCampaign(st);
    expect(r.file).toBeNull();
    expect(r.problem).toMatch(/earlier version/);
  });
  it('a week saved hour by hour (version 1) is carried over: finished days kept, today continued', async () => {
    const { loadCampaign, CAMPAIGN_KEY } = await import('./save');
    const st = memory();
    // Sunday finished with Bev hired; Monday two hours in.
    let c = newCampaign(4);
    const sunday = recommendOrder(c);
    let state = startCampaignDay(c, sunday);
    const plans = [];
    while (state.hour < state.ctx.hours) {
      const p = sensible(state);
      plans.push(p);
      state = runHour(state, p).state;
    }
    c = finishDay(c, state).camp;
    const monday = recommendOrder(buy(c, 'hire:bev'));
    let m = startCampaignDay(buy(c, 'hire:bev'), monday);
    const mplans = [];
    for (let h = 0; h < 2; h++) {
      const p = sensible(m);
      mplans.push(p);
      m = runHour(m, p).state;
    }
    const v1 = { version: 1, seed: 4, days: [{ setup: sunday, plans, purchases: ['hire:bev'], done: true }, { setup: monday, plans: mplans, purchases: [], done: false }] };
    st.setItem(CAMPAIGN_KEY, JSON.stringify({ record: v1, draft: null }));
    const r = loadCampaign(st);
    expect(r.problem).toMatch(/carried over/);
    const rec = r.file!.record;
    expect(rec.camp.day).toBe(1);
    expect(rec.camp.staff.map((s) => s.id)).toContain('bev');
    const today = replayToday(rec)!;
    expect(today.state.hour).toBe(2);
    // Same decisions, played minute by minute with automatic break returns: close to the hourly result.
    expect(Math.abs(today.state.cash - m.cash)).toBeLessThan(60);
  });
  it('Quick play saves from the hourly version are converted', async () => {
    const { loadGame, SAVE_KEY } = await import('./save');
    const { RECORD_VERSION, rebuild } = await import('./game');
    const { recommendedSetup, startDay } = await import('./engine');
    expect(RECORD_VERSION).toBe(4);
    const st = memory();
    const s0 = startDay(1, recommendedSetup());
    st.setItem(SAVE_KEY, JSON.stringify({ record: { version: 3, seed: 1, setup: recommendedSetup(), plans: [sensible(s0)] }, draft: null, savedAt: '' }));
    const g = loadGame(st)!;
    expect(g.record.seed).toBe(1);
    expect(g.record.minute).toBe(CONFIG.stepsPerHour);
    expect(rebuild(g.record)!.state.hour).toBe(1);
  });
});
