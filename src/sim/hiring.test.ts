import { describe, expect, it } from 'vitest';
import { CONFIG } from './config';
import { candidatePool, poolSize } from './people';
import { advanceAnswering, choose, startLive, stepOf, type Live } from './live';
import { afterClose, buy, campaignPool, dayContext, finishDay, newCampaign, newCampaignRecord, nextDay, recommendOrder, replayToday, startCampaignDay, teamLimit, type CampaignRecord } from './campaign';
import { onShift, operatingProfit } from './engine';

const H = CONFIG.hiring;
const day0 = (): Live => {
  const c = newCampaign(1);
  return startLive(startCampaignDay(c, recommendOrder(c)));
};
const act = (live: Live, action: Parameters<typeof choose>[1] extends infer C ? (C extends { kind: 'action'; action: infer A } ? A : never) : never) =>
  choose(live, { at: stepOf(live.state), kind: 'action', action });

describe('hiring from the office', () => {
  it('a pool of candidates each morning, fixed for the day, bigger as reputation rises', () => {
    const a = candidatePool(1, 3, 70, ['priya', 'kwame', 'mags']);
    expect(a).toEqual(candidatePool(1, 3, 70, ['priya', 'kwame', 'mags']));
    expect(a.length).toBe(H.poolSize);
    expect(candidatePool(1, 4, 70, []).map((p) => p.id)).not.toEqual(a.map((p) => p.id));
    expect(poolSize(95)).toBe(H.poolMax);
    for (const p of a) {
      expect(p.traits.length).toBeGreaterThanOrEqual(1);
      expect(p.wage).toBeGreaterThanOrEqual(H.wage.min);
      expect(Object.values(p.skills).every((x) => x >= 1 && x <= 5)).toBe(true);
    }
    // Bev, Tomasz and Dougie turn up in pools over a week, never anyone already on the team.
    const ids = new Set(Array.from({ length: 7 }, (_, d) => candidatePool(1, d, 70, ['bev']).map((p) => p.id)).flat());
    expect(ids.has('bev')).toBe(false);
    expect(ids.has('tomasz') || ids.has('dougie')).toBe(true);
  });
  it('hired before 12:00: walks in about 30 minutes later, a little slower at first, and stays on the team', () => {
    let live = advanceAnswering(day0(), 20);
    const c = newCampaign(1);
    const pool = campaignPool(c);
    const person = pool.find((p) => !['bev', 'tomasz', 'dougie'].includes(p.id)) ?? pool[0];
    const cash = live.state.cash;
    live = act(live, { kind: 'hire', person });
    expect(live.state.cash).toBeCloseTo(cash - H.hireCost, 6);
    expect(onShift(live.state).some((s) => s.id === person.id)).toBe(false);
    live = advanceAnswering(live, H.startDelayMinutes - 1);
    expect(onShift(live.state).some((s) => s.id === person.id)).toBe(false);
    live = advanceAnswering(live, 1);
    const s = onShift(live.state).find((x) => x.id === person.id)!;
    expect(s).toBeDefined();
    expect(s.newcomer).toBe(true);
    expect(live.plan.assignments[person.id]).toBeDefined();
    live = advanceAnswering(live, 10_000);
    const next = finishDay(c, live.state).camp;
    const cs = next.staff.find((x) => x.id === person.id)!;
    expect(cs.person?.name).toBe(person.name);
    expect(cs.joinedDay).toBe(0);
  });
  it('hired after 12:00 starts the next morning', () => {
    const c = { ...newCampaign(1), day: 7 };
    let live = startLive(startCampaignDay(c, recommendOrder(c)));
    live = advanceAnswering(live, H.sameDayBefore * 60 + 5);
    const person = campaignPool(c)[0];
    live = act(live, { kind: 'hire', person });
    expect(live.state.staff.some((s) => s.id === person.id)).toBe(false);
    const next = finishDay(c, advanceAnswering(live, 10_000).state).camp;
    expect(next.staff.some((s) => s.id === person.id && s.joinedDay === 8)).toBe(true);
  });
  it('wages are paid at closing, at each person’s rate', () => {
    let live = day0();
    const cash0 = live.state.cash;
    live = advanceAnswering(live, 60);
    // During the day takings come in but wages wait.
    expect(live.state.wagesDue).toBeGreaterThan(0);
    const before = live.state.cash;
    live = advanceAnswering(live, 10_000);
    expect(live.state.wagesDue).toBe(0);
    expect(live.state.history.at(-1)!.messages.join(' ')).toMatch(/Wages paid/);
    expect(live.state.cash).toBeLessThan(before + live.state.ledger.revenue);
    expect(operatingProfit(live.state)).toBeCloseTo(live.state.ledger.revenue - live.state.ledger.cogs - live.state.ledger.waste - live.state.ledger.wages - Object.values(live.state.ledger.extras).reduce((t, x) => t + x, 0), 6);
    expect(cash0).toBeGreaterThan(0);
  });
  it('the team can’t outgrow the break room until it is made bigger', () => {
    let c = { ...newCampaign(1), cash: 5000, day: 3 };
    expect(teamLimit(c)).toBe(H.teamLimit);
    for (const p of campaignPool(c).concat(campaignPool({ ...c, day: 4 }))) {
      if (c.staff.length >= H.teamLimit) break;
      c = buy(c, `hire:${p.id}` as never);
    }
    expect(c.staff.length).toBe(H.teamLimit);
    let live = startLive(startCampaignDay(c, recommendOrder(c)));
    const extra = campaignPool({ ...c, day: 9 }).find((p) => !c.staff.some((s) => s.id === p.id))!;
    expect(() => act(live, { kind: 'hire', person: extra })).toThrow(/break room/);
    c = buy(c, 'breakRoom');
    expect(teamLimit(c)).toBe(H.teamLimit + CONFIG.campaign.upgrades.breakRoom.extraTeam);
    expect(dayContext(c).breakCap).toBe(CONFIG.staff.limits.break + 1);
    live = startLive(startCampaignDay(c, recommendOrder(c)));
    live = act(live, { kind: 'hire', person: extra });
    expect(live.state.hires?.length).toBe(1);
  });
  it('letting someone go: they leave now, the team is unsettled and reputation dips; never the last person', () => {
    let live = advanceAnswering(day0(), 30);
    const strain = live.state.staff.find((s) => s.id === 'priya')!.strain;
    live = act(live, { kind: 'letGo', staffId: 'kwame' });
    expect(onShift(live.state).some((s) => s.id === 'kwame')).toBe(false);
    expect(live.plan.assignments.kwame).toBeUndefined();
    expect(live.state.staff.find((s) => s.id === 'priya')!.strain).toBeCloseTo(strain + H.letGo.teamStrain, 6);
    live = act(live, { kind: 'letGo', staffId: 'mags' });
    expect(() => act(live, { kind: 'letGo', staffId: 'priya' })).toThrow(/at least one/);
    const c = newCampaign(1);
    const closed = advanceAnswering(live, 10_000).state;
    const plain = finishDay(c, advanceAnswering(day0(), 10_000).state).camp;
    const next = finishDay(c, closed).camp;
    expect(next.staff.map((s) => s.id)).toEqual(['priya']);
    expect(next.reputation).toBeLessThan(plain.reputation);
  });
  it('a day with a hire replays exactly from the save', () => {
    let rec: CampaignRecord = newCampaignRecord(2);
    rec = { ...rec, today: { setup: recommendOrder(rec.camp), choices: [], minute: 0 } };
    let live = replayToday(rec)!;
    const made: Parameters<typeof choose>[1][] = [];
    live = advanceAnswering(live, 15, made as never);
    const c = { at: stepOf(live.state), kind: 'action' as const, action: { kind: 'hire' as const, person: campaignPool(rec.camp)[0] } };
    live = choose(live, c);
    made.push(c);
    live = advanceAnswering(live, 120, made as never);
    rec.today!.choices.push(...(made as never[]));
    rec.today!.minute = stepOf(live.state);
    const again = replayToday(JSON.parse(JSON.stringify(rec)))!;
    expect(again.state.cash).toBeCloseTo(live.state.cash, 9);
    expect(onShift(again.state).map((s) => s.id)).toEqual(onShift(live.state).map((s) => s.id));
    // Closing keeps the new person.
    const closed = advanceAnswering(again, 10_000);
    const r2 = { ...rec, today: { ...rec.today!, minute: stepOf(closed.state) } };
    expect(nextDay(r2, closed.state).camp.staff.length).toBe(4);
    expect(afterClose(r2, closed.state).camp.staff.length).toBe(4);
  });
});
