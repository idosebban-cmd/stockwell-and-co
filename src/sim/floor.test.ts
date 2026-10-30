import { describe, expect, it } from 'vitest';
import { CONFIG } from './config';
import { recommendedSetup, startDay } from './engine';
import { burstArrivals, emptyFloor, floorMood } from './floor';
import { advance, advanceAnswering, choose, replayLive, startLive, stepOf, type Choice, type Live } from './live';
import { dayContext, newCampaign, recommendOrder, startCampaignDay } from './campaign';
import { playShiftLive, sensible } from './bots';

const open = () => startLive(startDay(1, recommendedSetup()));
const F = CONFIG.floor;

/** Runs until a floor job is on the floor (answering any question). */
function untilTask(live: Live, made: Choice[] = []): Live {
  let l = live;
  while (!l.state.floor!.tasks.length) l = advanceAnswering(l, 1, made);
  return l;
}

describe('the shop floor', () => {
  it('schedules bursts, jobs and questions from the seed, the same every time', () => {
    const a = startDay(5, recommendedSetup()).floor!;
    const b = startDay(5, recommendedSetup()).floor!;
    expect(a).toEqual(b);
    expect(a.bursts.length).toBeGreaterThan(0);
    expect(a.schedule.length).toBeGreaterThan(2);
    expect(a.events.length).toBeGreaterThan(0);
    expect(a.schedule[0].at).toBeLessThanOrEqual(F.tasks.firstWithinMinutes);
    expect(startDay(6, recommendedSetup()).floor).not.toEqual(a);
  });
  it('different campaign days get different floors, even on the same weekday', () => {
    const c = newCampaign(1);
    const sun1 = startCampaignDay(c, recommendOrder(c)).floor!;
    const c2 = { ...c, day: 7 };
    const sun2 = startCampaignDay(c2, recommendOrder(c2)).floor!;
    expect(sun2.schedule.map((t) => t.at)).not.toEqual(sun1.schedule.map((t) => t.at));
  });
  it('bursts bring extra shoppers, announced a few minutes ahead', () => {
    const s = startDay(5, recommendedSetup());
    const b = s.floor!.bursts[0];
    expect(b.at - b.warnAt).toBe(F.bursts.warnMinutes);
    let extra = 0;
    for (let m = b.at; m < b.at + b.minutes; m++) extra += burstArrivals(s.floor, m);
    expect(extra).toBeCloseTo(b.shoppers, 6);
    expect(burstArrivals(s.floor, b.warnAt)).toBe(0);
  });
  it('a job nobody is on lowers satisfaction; sending someone sorts it in its minutes and they go back', () => {
    let live = untilTask(open());
    const t = live.state.floor!.tasks[0];
    expect(floorMood(live.state.floor, stepOf(live.state), 1)).toBeLessThan(0);
    const who = 'mags';
    const before = live.plan.assignments[who];
    live = choose(live, { at: stepOf(live.state), kind: 'task', staffId: who, taskId: t.id });
    expect(live.plan.assignments[who]).toBe('task');
    expect(floorMood(live.state.floor, stepOf(live.state), 1)).toBeGreaterThanOrEqual(0);
    const resolved = live.state.floor!.counts.resolved;
    live = advanceAnswering(live, Math.ceil(t.work) + 1);
    expect(live.state.floor!.counts.resolved).toBe(resolved + 1);
    expect(live.state.floor!.tasks.find((x) => x.id === t.id)).toBeUndefined();
    expect(live.plan.assignments[who]).toBe(before);
  });
  it('a question pauses the day until it is answered, and the answer has a visible effect', () => {
    let live = open();
    const ev = live.state.floor!.events[0];
    live = advanceAnswering(live, ev.at - 1);
    // Run on to the question, without answering it.
    let l = live;
    for (let i = 0; i < 5 && !l.state.floor!.pending; i++) l = advance(l, 1).live;
    expect(l.state.floor!.pending?.id).toBe(ev.id);
    const at = stepOf(l.state);
    const stuck = advance(l, 30).live;
    expect(stepOf(stuck.state)).toBe(at);
    const cash = l.state.cash;
    const answered = choose(l, { at, kind: 'answer', eventId: ev.id, option: 0 });
    expect(answered.state.floor!.pending).toBeNull();
    expect(answered.state.floor!.lastAnswer).toBeTruthy();
    const changed = answered.state.cash !== cash || answered.state.floor!.mood.length > 0 || JSON.stringify(answered.plan) !== JSON.stringify(l.plan) || answered.state.staff.some((s, i) => s.strain !== l.state.staff[i].strain) || answered.state.ledger.stockPurchases !== l.state.ledger.stockPurchases;
    expect(changed || ev.kind === 'nearDate').toBe(true);
  });
  it('a day with jobs, a burst and questions replays exactly from its choices', () => {
    const made: Choice[] = [];
    let live = untilTask(open(), made);
    const t = live.state.floor!.tasks[0];
    const c: Choice = { at: stepOf(live.state), kind: 'task', staffId: 'kwame', taskId: t.id };
    live = choose(live, c);
    made.push(c);
    live = advanceAnswering(live, 200, made);
    const again = replayLive(startDay(1, recommendedSetup()), JSON.parse(JSON.stringify(made)), stepOf(live.state));
    expect(stepOf(again.state)).toBe(stepOf(live.state));
    expect(again.state.cash).toBeCloseTo(live.state.cash, 9);
    expect(again.state.satisfaction.weightedSum).toBeCloseTo(live.state.satisfaction.weightedSum, 9);
    expect(again.plan).toEqual(live.plan);
  });
  it('the first days forgive: unattended jobs and brush-offs cost half the satisfaction', () => {
    const c = newCampaign(1);
    expect(dayContext(c).penaltyScale).toBe(CONFIG.campaign.generous.penaltyScale);
    expect(dayContext({ ...c, day: CONFIG.campaign.generous.days }).penaltyScale).toBe(1);
    const floor = emptyFloor();
    floor.tasks.push({ id: 'x', kind: 'spill', place: 'produce', spot: 0, at: 0, work: 3, progress: 0, assigned: null, expiresAt: null });
    expect(floorMood(floor, 1, 0.5)).toBeCloseTo(floorMood(floor, 1, 1) / 2, 9);
  });
  it('an attentive manager sorts the floor jobs and answers the questions', () => {
    const s = playShiftLive(1, sensible);
    expect(s.floor!.counts.resolved).toBeGreaterThan(3);
    expect(s.floor!.counts.answered).toBeGreaterThan(0);
  });
});
