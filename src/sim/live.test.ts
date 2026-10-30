import { describe, expect, it } from 'vitest';
import { CONFIG } from './config';
import { recommendedSetup, startDay } from './engine';
import { advance, choose, choicesFor, isClosed, moveStaff, replayLive, startLive, stepOf, type Choice } from './live';

const open = () => startLive(startDay(1, recommendedSetup()));

describe('live play', () => {
  it('runs minute by minute and closes at the end of the day', () => {
    let live = open();
    live = advance(live, 7).live;
    expect(stepOf(live.state)).toBe(7);
    live = advance(live, 10_000).live;
    expect(isClosed(live)).toBe(true);
  });
  it('a break ends by itself after half an hour, back to the job the person left, and counts as a break', () => {
    let live = open();
    const job = live.plan.assignments.kwame;
    live = choose(live, { at: 0, kind: 'jobs', assignments: { ...live.plan.assignments, kwame: 'break' } });
    live = advance(live, CONFIG.live.breakMinutes - 1).live;
    expect(live.plan.assignments.kwame).toBe('break');
    live = advance(live, 1).live;
    expect(live.plan.assignments.kwame).toBe(job);
    expect(live.state.staff.find((s) => s.id === 'kwame')!.breaks).toBe(1);
  });
  it('a break that crosses the hour still counts', () => {
    let live = advance(open(), 45).live;
    live = choose(live, { at: 45, kind: 'jobs', assignments: { ...live.plan.assignments, mags: 'break' } });
    live = advance(live, 40).live;
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
    let live = advance(open(), 30).live;
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
    live = advance(live, 12).live;
    make(choicesFor(live, { ...live.plan, assignments: { ...live.plan.assignments, bev: 'break' } }));
    live = advance(live, 70).live;
    make(choicesFor(live, { ...live.plan, pricing: { ...live.plan.pricing, ambient: 'low' }, actions: [{ kind: 'promotion', dept: 'chilled' }] }));
    live = advance(live, 33).live;
    const again = replayLive(startDay(1, recommendedSetup()), JSON.parse(JSON.stringify(choices)), stepOf(live.state));
    expect(stepOf(again.state)).toBe(stepOf(live.state));
    expect(again.state.cash).toBeCloseTo(live.state.cash, 9);
    expect(again.plan).toEqual(live.plan);
  });
});
