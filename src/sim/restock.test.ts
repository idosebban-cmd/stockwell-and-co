import { describe, expect, it } from 'vitest';
import { CONFIG } from './config';
import { deliveryUnitCost, deptUnits, recommendedSetup, startDay } from './engine';
import { advanceAnswering, choose, startLive, stepOf, type Live } from './live';
import { finishDay, newCampaign, recommendOrder, startCampaignDay } from './campaign';
import { incomingFor, quote, stockOutlook, suggestedQty } from './restock';
import { playLiveDay, sensible } from './bots';
import { operatingProfit } from './engine';
import { problems, runOutWarnings } from './insight';
import * as S from './stock';

const A = CONFIG.actions;
const order = (live: Live, a: Parameters<typeof quote>[2], qty: number, staffId?: string) => {
  const q = quote(live.state, 'produce', a, qty, staffId);
  return choose(live, { at: stepOf(live.state), kind: 'action', action: q.action });
};

/** A Sunday with almost no fruit & veg: it will run out within the hour. */
function shortSunday(): Live {
  const c = newCampaign(1);
  const setup = recommendOrder(c);
  setup.orders.produce.morning = 0;
  const s = startCampaignDay(c, setup);
  s.stock.produce.backroom = [];
  S.take(s.stock.produce.shelf, S.total(s.stock.produce.shelf) - 60);
  return startLive(s);
}

describe('ordering during the day', () => {
  it('says how long stock lasts at the forecast, and warns while there is still time to act', () => {
    const live = shortSunday();
    const o = stockOutlook(live.state, 'produce');
    expect(o.runsOutAt).not.toBeNull();
    expect(o.runsOutAt!).toBeLessThan(60);
    expect(o.shortfall).toBeGreaterThan(200);
    expect(runOutWarnings(live.state).map((w) => w.dept)).toContain('produce');
    // The warning points to the stockroom.
    expect(problems(live.state, live.plan).some((p) => p.stockroom && p.zone === 'produce')).toBe(true);
    // Plenty of cupboard stock: enough until closing, no warning.
    expect(stockOutlook(live.state, 'ambient').runsOutAt).toBeNull();
  });
  it('a rush delivery is paid now, reaches the dock after its minutes and needs unloading', () => {
    let live = shortSunday();
    const cash = live.state.cash;
    const q = quote(live.state, 'produce', 'emergency', 100);
    expect(q.info.available).toBe(true);
    expect(q.cost).toBeCloseTo(100 * CONFIG.departments.produce.unitCost * A.emergency.costMult + A.emergency.deliveryFee, 6);
    live = order(live, 'emergency', 100);
    expect(live.state.cash).toBeCloseTo(cash - q.cost, 6);
    expect(incomingFor(live.state, 'produce')[0].label).toMatch(/\+100 arriving 09:20/);
    live = advanceAnswering(live, A.emergency.arrivalMinutes);
    expect(deptUnits(live.state, 'produce').dock).toBe(0);
    live = advanceAnswering(live, 1);
    expect(deptUnits(live.state, 'produce').dock).toBeGreaterThan(90);
    // Ordering it ended the warning only once the stock covers the rest of the day.
    expect(stockOutlook(live.state, 'produce').shortfall).toBeLessThan(stockOutlook(shortSunday().state, 'produce').shortfall);
  });
  it('a cash-and-carry run takes the person away for its minutes and brings at most a car-load into the stockroom', () => {
    let live = shortSunday();
    expect(quote(live.state, 'produce', 'cashAndCarry', A.cashAndCarry.maxQty + 10, 'kwame').info.available).toBe(false);
    live = order(live, 'cashAndCarry', 60, 'kwame');
    expect(live.plan.assignments.kwame).toBe('task');
    live = advanceAnswering(live, A.cashAndCarry.minutes - 1);
    expect(live.plan.assignments.kwame).toBe('task');
    const before = deptUnits(live.state, 'produce').backroom;
    live = advanceAnswering(live, 2);
    expect(live.plan.assignments.kwame).not.toBe('task');
    expect(deptUnits(live.state, 'produce').backroom + deptUnits(live.state, 'produce').shelf).toBeGreaterThan(before + 30);
  });
  it('the next delivery is at the normal price: with the midday lorry if it is still to come, else tomorrow morning on the dock', () => {
    // Monday has a lorry at 11:00.
    let c = newCampaign(1);
    const sunday = playLiveDay(startCampaignDay(c, recommendOrder(c)), sensible);
    c = finishDay(c, sunday).camp;
    let live = startLive(startCampaignDay(c, recommendOrder(c)));
    const q = quote(live.state, 'produce', 'nextDelivery', 80);
    expect(q.unitPrice).toBeCloseTo(deliveryUnitCost('produce'), 6);
    expect(q.arrives).toMatch(/lorry at 11:00/);
    live = order(live, 'nextDelivery', 80);
    expect(live.state.deliveries.some((x) => x.kind === 'midday' && x.dept === 'produce' && x.qty === 80)).toBe(true);
    // On Sunday (no lorry) it comes tomorrow, on the dock at opening.
    let sun = startLive(startCampaignDay(newCampaign(2), recommendOrder(newCampaign(2))));
    expect(quote(sun.state, 'produce', 'nextDelivery', 60).arrives).toMatch(/tomorrow/);
    sun = order(sun, 'nextDelivery', 60);
    const closed = advanceAnswering(sun, 10_000).state;
    const next = finishDay(newCampaign(2), closed).camp;
    expect(S.total(next.stock.produce.dock)).toBeGreaterThanOrEqual(60);
    // Quick play has no tomorrow: after the lorry, there's no next delivery.
    let q2 = startLive(startDay(1, recommendedSetup()));
    q2 = advanceAnswering(q2, 4 * 60);
    expect(quote(q2.state, 'produce', 'nextDelivery', 60).info.available).toBe(false);
  });
  it('ordering works while paused (between minutes), and the suggestion tops up until closing', () => {
    let live = shortSunday();
    const at = stepOf(live.state);
    const qty = suggestedQty(live.state, 'produce', 'emergency');
    expect(qty).toBeGreaterThan(0);
    const before = stockOutlook(live.state, 'produce').shortfall;
    live = order(live, 'emergency', qty);
    expect(stepOf(live.state)).toBe(at);
    // It covers the day, or is the most one rush delivery can bring.
    const after = stockOutlook(live.state, 'produce').shortfall;
    if (qty < A.emergency.maxQty) expect(after).toBe(0);
    else expect(after).toBeCloseTo(Math.max(0, before - qty), 6);
    // A day that's already covered suggests nothing.
    expect(suggestedQty(live.state, 'ambient', 'emergency')).toBe(0);
  });
  it('rush prices make a good morning order clearly the cheaper way to stock the day', () => {
    // Same Sunday, played the same way: the recommended morning order, against no morning fruit & veg and rush top-ups instead.
    const c = newCampaign(1);
    const good = playLiveDay(startCampaignDay(c, recommendOrder(c)), sensible);
    const setup = recommendOrder(c);
    const morning = setup.orders.produce.morning;
    setup.orders.produce.morning = 0;
    let live = startLive(startCampaignDay(c, setup));
    live = order(live, 'emergency', Math.min(A.emergency.maxQty, morning));
    const rushed = playLiveDay(live.state, sensible);
    expect(operatingProfit(good) - operatingProfit(rushed)).toBeGreaterThan(30);
    const perItemMorning = deliveryUnitCost('produce');
    const perItemRush = quote(live.state, 'produce', 'emergency', 120).cost / 120;
    expect(perItemRush).toBeGreaterThan(perItemMorning * 1.8);
  });
});
