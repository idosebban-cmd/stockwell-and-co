import { describe, expect, it } from 'vitest';
import { CONFIG } from './config';
import { recommendedSetup, startDay } from './engine';
import * as S from './stock';
import { total } from './stock';
import { advanceAnswering, choose, choicesFor, isClosed, moveStaff, replayLive, startLive, stepOf, type Choice } from './live';

const open = () => startLive(startDay(1, recommendedSetup()));

describe('live play', () => {
  it('runs minute by minute and closes at the end of the day', () => {
    let live = open();
    live = advanceAnswering(live, 7);
    expect(stepOf(live.state)).toBe(7);
    live = advanceAnswering(live, 10_000);
    expect(isClosed(live)).toBe(true);
  });
  it('a break ends by itself after half an hour, back to the job the person left, and counts as a break', () => {
    let live = open();
    const job = live.plan.assignments.kwame;
    live = choose(live, { at: 0, kind: 'jobs', assignments: { ...live.plan.assignments, kwame: 'break' } });
    live = advanceAnswering(live, CONFIG.live.breakMinutes - 1);
    expect(live.plan.assignments.kwame).toBe('break');
    live = advanceAnswering(live, 1);
    expect(live.plan.assignments.kwame).toBe(job);
    expect(live.state.staff.find((s) => s.id === 'kwame')!.breaks).toBe(1);
  });
  it('a break that crosses the hour still counts', () => {
    let live = advanceAnswering(open(), 45);
    live = choose(live, { at: 45, kind: 'jobs', assignments: { ...live.plan.assignments, mags: 'break' } });
    live = advanceAnswering(live, 40);
    const mags = live.state.staff.find((s) => s.id === 'mags')!;
    expect(mags.breaks).toBe(1);
    expect(mags.consecutive).toBe(0);
  });
  it('moving someone to a full place swaps them with the person there', () => {
    const live = open();
    const there = Object.keys(live.plan.assignments).filter((id) => live.plan.assignments[id] === 'replenish:ambient');
    expect(there.length).toBe(CONFIG.staff.limits.replenish);
    const next = moveStaff(live, 'kwame', 'replenish:ambient')!;
    expect(next.kwame).toBe('replenish:ambient');
    expect(Object.values(next).filter((a) => a === 'replenish:ambient').length).toBe(CONFIG.staff.limits.replenish);
    expect(next[there[0]]).toBe(live.plan.assignments.kwame);
  });
  it('actions happen at once, even while paused, and only once', () => {
    let live = advanceAnswering(open(), 30);
    const cash = live.state.cash;
    live = choose(live, { at: 30, kind: 'action', action: { kind: 'promotion', dept: 'produce' } });
    expect(live.state.cash).toBeCloseTo(cash - CONFIG.actions.promotion.cost, 9);
    expect(live.plan.actions).toEqual([]);
    expect(() => choose(live, { at: 30, kind: 'action', action: { kind: 'promotion', dept: 'ambient' } })).toThrow();
  });
  it('replaying the choices rebuilds the same day', () => {
    let live = open();
    const choices: Choice[] = [];
    const make = (c: Choice[]) => {
      for (const x of c) {
        live = choose(live, x);
        choices.push(x);
      }
    };
    live = advanceAnswering(live, 12, choices);
    make(choicesFor(live, { ...live.plan, assignments: { ...live.plan.assignments, bev: 'break' } }));
    live = advanceAnswering(live, 70, choices);
    make(choicesFor(live, { ...live.plan, pricing: { ...live.plan.pricing, ambient: 'low' }, actions: [{ kind: 'promotion', dept: 'chilled' }] }));
    live = advanceAnswering(live, 33, choices);
    const again = replayLive(startDay(1, recommendedSetup()), JSON.parse(JSON.stringify(choices)), stepOf(live.state));
    expect(stepOf(again.state)).toBe(stepOf(live.state));
    expect(again.state.cash).toBeCloseTo(live.state.cash, 9);
    expect(again.plan).toEqual(live.plan);
  });
});

describe('routine jobs run themselves', () => {
  const A = CONFIG.live.auto;
  it('deliveries on the dock unload themselves into the stockroom', () => {
    let live = open();
    const before = total(live.state.stock.ambient.backroom);
    live.state.stock.ambient.backroom = [];
    S.add(live.state.stock.ambient.dock, [{ qty: 50, unitCost: 0.5, expiresAt: null, label: 'Keeps' }]);
    live = advanceAnswering(live, 1);
    expect(total(live.state.stock.ambient.dock)).toBe(0);
    expect(total(live.state.stock.ambient.backroom)).toBeGreaterThan(0);
    expect(before).toBeGreaterThanOrEqual(0);
  });
  it('someone with a full shelf moves to the shelf that needs it most', () => {
    let live = open();
    const fillers = () => Object.values(live.plan.assignments).filter((a) => a === 'replenish:produce').length;
    expect(fillers()).toBe(1);
    // Empty the fruit & veg shelf; fill the cupboard shelves to the top.
    live.state.stock.produce.shelf = [];
    const amb = live.state.stock.ambient;
    S.add(amb.shelf, [{ qty: live.state.ctx.shelfCap.ambient - total(amb.shelf), unitCost: 0.5, expiresAt: null, label: 'Keeps' }]);
    live = advanceAnswering(live, A.everyMinutes);
    // People on full shelves move over, up to the shelf's limit.
    expect(fillers()).toBe(CONFIG.staff.limits.replenish);
  });
  it('tired people take a break one at a time when the shop is calm, then go back to their job', () => {
    let live = open();
    for (const s of live.state.staff) s.energy = 30;
    live.state.queue.customers = 0;
    if (live.state.floor) live.state.floor.bursts = [];
    const jobs = { ...live.plan.assignments };
    live = advanceAnswering(live, A.everyMinutes);
    const resting = Object.keys(live.plan.assignments).filter((id) => live.plan.assignments[id] === 'break');
    expect(resting).toHaveLength(1);
    const who = resting[0];
    live = advanceAnswering(live, CONFIG.live.breakMinutes + 1);
    expect(live.plan.assignments[who]).not.toBe('break');
    if (jobs[who] !== 'tills') expect(live.plan.assignments[who]).toBe(jobs[who]);
  });
  it('no automatic breaks while the queue is long', () => {
    let live = open();
    for (const s of live.state.staff) s.energy = 30;
    live.state.queue.customers = 40;
    live = advanceAnswering(live, 1);
    live = advanceAnswering(live, A.everyMinutes - 1);
    expect(Object.values(live.plan.assignments)).not.toContain('break');
  });
  it('someone called back from a break is not sent again straight away', () => {
    let live = open();
    for (const s of live.state.staff) s.energy = 30;
    live.state.queue.customers = 0;
    if (live.state.floor) live.state.floor.bursts = [];
    live = advanceAnswering(live, A.everyMinutes);
    const who = Object.keys(live.plan.assignments).find((id) => live.plan.assignments[id] === 'break')!;
    live = choose(live, { at: stepOf(live.state), kind: 'jobs', assignments: { ...live.plan.assignments, [who]: 'tills' } });
    live = advanceAnswering(live, A.everyMinutes * 2);
    expect(live.plan.assignments[who]).not.toBe('break');
  });
  it('a day with routine moves replays exactly from its choices', () => {
    const start = startDay(3, recommendedSetup());
    const made: Choice[] = [];
    const played = advanceAnswering(startLive(start), 200, made);
    const again = replayLive(start, made, 200);
    expect(again.plan.assignments).toEqual(played.plan.assignments);
    expect(again.state.cash).toBeCloseTo(played.state.cash, 6);
  });
});
