import { describe, expect, it } from 'vitest';
import { CONFIG, DEPTS } from './config';
import { checkSetup, defaultPlan, inventoryValue, planErrors, runHour, weekdayName } from './engine';
import {
  allOffers,
  buy,
  businessValue,
  CAMPAIGN_DAYS,
  campaignGoal,
  carriedQty,
  dayContext,
  finishDay,
  morningEnergy,
  newCampaign,
  newCampaignRecord,
  orderFunds,
  rebuildCampaign,
  recommendOrder,
  restartDay,
  startCampaignDay,
  topOffers,
  type CampaignRecord,
  type CampaignState,
} from './campaign';
import { noReplenishment, planInvest, playCampaign, sensible, type Strategy } from './bots';
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
    expect(campaignGoal(c).wellbeing).toBeLessThan(campaignGoal(c1).wellbeing);
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
    expect(K.days[2].pricing).toBe(true);
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
  it('stay within the funds and the space, and adapt to stock already in the shop', () => {
    let c = newCampaign(1);
    for (let i = 0; i < CAMPAIGN_DAYS; i++) {
      const o = recommendOrder(c);
      const ctx = dayContext(c);
      const have = carriedQty(c);
      const check = checkSetup(o, startCampaignDay(c, o).scenario.forecast, { cash: orderFunds(c), carried: have, ctx });
      expect(check.errors).toEqual([]);
      for (const d of ctx.depts) expect(o.orders[d].morning).toBeLessThanOrEqual(ctx.shelfCap[d] + ctx.backroomCap[d] - have[d] + 1e-9);
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
  it('rebuilds the same campaign from its record between days and mid-shift', () => {
    const rec: CampaignRecord = newCampaignRecord(3);
    let rb = rebuildCampaign(rec);
    expect(rb.phase).toBe('morning');
    // Play Sunday through, buy, continue; then two hours of Monday.
    const setup = recommendOrder(rb.camp);
    rec.days.push({ setup, plans: [], purchases: [], done: false });
    rb = rebuildCampaign(rec);
    while (rb.phase === 'trading') {
      rec.days[0].plans.push(sensible(rb.state!));
      rb = rebuildCampaign(JSON.parse(JSON.stringify(rec)));
    }
    expect(rb.phase).toBe('closed');
    rec.days[0].purchases.push('hire:bev');
    rec.days[0].done = true;
    rb = rebuildCampaign(JSON.parse(JSON.stringify(rec)));
    expect(rb.phase).toBe('morning');
    expect(rb.camp.day).toBe(1);
    expect(rb.camp.staff.map((s) => s.id)).toContain('bev');
    rec.days.push({ setup: recommendOrder(rb.camp), plans: [], purchases: [], done: false });
    rb = rebuildCampaign(rec);
    rec.days[1].plans.push(sensible(rb.state!));
    rb = rebuildCampaign(rec);
    rec.days[1].plans.push(sensible(rb.state!));
    const mid = rebuildCampaign(JSON.parse(JSON.stringify(rec)));
    expect(mid.phase).toBe('trading');
    expect(mid.state!.hour).toBe(2);
    expect(mid.state!.cash).toBeCloseTo(rebuildCampaign(rec).state!.cash, 9);
    // Restart the day: back to Monday morning, with Sunday's purchase kept.
    const again = rebuildCampaign(restartDay(rec));
    expect(again.phase).toBe('morning');
    expect(again.camp.cash).toBeCloseTo(mid.dayStart.cash, 9);
    expect(again.camp.staff.map((s) => s.id)).toContain('bev');
  });
});

describe('the week', () => {
  const staffPath = planInvest({ 0: ['hire:bev'], 2: ['hire:tomasz'], 3: ['till3'] });
  const chilledPath = planInvest({ 2: ['chilled'], 3: ['hire:dougie'], 4: ['fridge'] });
  const shelvesPath = planInvest({ 0: ['shelfProduce'], 1: ['shelfAmbient'], 2: ['hire:bev'] });
  for (const [name, path] of Object.entries({ staffPath, chilledPath, shelvesPath })) {
    it(`${name}: a sensible player completes the campaign objective`, () => {
      for (const seed of [1, 3]) {
        const w = playCampaign(seed, sensible, path);
        const g = campaignGoal(w.camp);
        expect(w.camp.day).toBe(CAMPAIGN_DAYS);
        expect(w.camp.failed).toBeNull();
        expect(g.met).toEqual({ value: true, reputation: true, wellbeing: true });
      }
    });
  }
  it('does not need the chilled department to win', () => {
    const w = playCampaign(2, sensible, staffPath);
    expect(w.camp.owned).not.toContain('chilled');
    expect(Object.values(campaignGoal(w.camp).met).every(Boolean)).toBe(true);
  });
  it('a poor first two days can be recovered from', () => {
    const weak: Strategy = (s) => (s.ctx.weekday <= 1 ? noReplenishment(s) : sensible(s));
    const w = playCampaign(1, weak, planInvest({ 2: ['hire:bev'], 3: ['shelfProduce'] }));
    const strong = playCampaign(1, sensible, planInvest({ 2: ['hire:bev'], 3: ['shelfProduce'] }));
    expect(w.days[1].result.profit).toBeLessThan(strong.days[1].result.profit);
    expect(w.camp.failed).toBeNull();
    expect(campaignGoal(w.camp).met.value).toBe(true);
  });
  it('investing makes later days better (shorter queues or better availability), not cancelled out', () => {
    const base = playCampaign(1, sensible, () => []);
    const invested = playCampaign(1, sensible, planInvest({ 0: ['hire:bev'], 2: ['hire:tomasz'], 3: ['till3'] }));
    const sat = (w: typeof base) => w.days[6].result.satisfaction;
    expect(sat(invested)).toBeGreaterThan(sat(base));
    expect(invested.days[6].result.walkouts).toBeLessThanOrEqual(base.days[6].result.walkouts);
  });
});
