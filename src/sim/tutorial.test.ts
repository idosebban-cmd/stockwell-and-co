import { describe, expect, it } from 'vitest';
import { CONFIG, DEPTS } from './config';
import { defaultPlan, deptUnits, recommendedSetup, runHour, startDay } from './engine';
import { fridgeFacts, intervalOutcomes, jobPreview, outlook, outlookChanges, priceOptions, priceTradeOff, problems } from './insight';
import { LESSONS, lessonPlan, runLesson } from './tutorial';
import { sensible } from './bots';
import { total } from './stock';
import type { AssignmentId, HourPlan } from './types';

const GUIDED: Record<string, Record<string, AssignmentId>> = {
  serve: { bev: 'tills' },
  fill: { kwame: 'replenish:produce' },
  unload: { tomasz: 'receive' },
  rest: { dougie: 'break', mags: 'replenish:chilled' },
  tradeoff: { tomasz: 'tills' },
};
const lesson = (id: string) => LESSONS.find((l) => l.id === id)!;
const withJobs = (p: HourPlan, jobs: Record<string, AssignmentId>): HourPlan => ({ ...p, assignments: { ...p.assignments, ...jobs } });

describe('guided shift', () => {
  for (const id of Object.keys(GUIDED)) {
    it(`${id}: the starting plan does not pass; the guided action does`, () => {
      const l = lesson(id);
      const s = l.build();
      expect(runLesson(l, s, lessonPlan(s)).result.passed).toBe(false);
      const guided = withJobs(lessonPlan(s), GUIDED[id]);
      expect(l.checklist(s, guided).every((c) => c.done)).toBe(true);
      expect(l.focus(s, guided).staff).toEqual([]);
      expect(runLesson(l, s, guided).result.passed).toBe(true);
    });
  }
  it('lessons are deterministic and rebuild identically (retry and reload start from the same state)', () => {
    for (const l of LESSONS) {
      const a = l.build();
      const b = l.build();
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
      expect(a.deliveries).toEqual([]);
      expect(a.scenario.events).toEqual([]);
      const p = lessonPlan(a);
      expect(runLesson(l, a, p).result.sentence).toBe(runLesson(l, b, p).result.sentence);
    }
  });
  it('lessons are short intervals, not full hours', () => {
    for (const l of LESSONS.filter((x) => !x.optional)) expect(l.steps).toBeLessThan(CONFIG.stepsPerHour);
  });
  it('unloading shows the full chain: dock down, stockroom up, shelves up', () => {
    const l = lesson('unload');
    const s = l.build();
    const { after, report } = runLesson(l, s, withJobs(lessonPlan(s), GUIDED.unload));
    expect(deptUnits(after, 'produce').dock).toBeLessThan(deptUnits(s, 'produce').dock);
    expect(report.dept.produce.received).toBeGreaterThan(0);
    expect(report.dept.produce.replenished).toBeGreaterThan(0);
    expect(report.dept.produce.shelfEnd).toBeGreaterThan(report.dept.produce.shelfStart);
    // Each replay step records the same flow.
    expect(report.steps.some((st) => st.received > 0 && st.moved.produce > 0)).toBe(true);
  });
  it('the trade-off accepts either choice and the two results genuinely differ', () => {
    const l = lesson('tradeoff');
    const s = l.build();
    const tills = runLesson(l, s, withJobs(lessonPlan(s), { tomasz: 'tills' })).result;
    const shelves = runLesson(l, s, withJobs(lessonPlan(s), { tomasz: 'replenish:ambient' })).result;
    expect(tills.passed && shelves.passed).toBe(true);
    expect(tills.figures).not.toEqual(shelves.figures);
  });
  it('pricing lessons: lower prices sell more, and gross profit is reported separately from takings', () => {
    for (const id of ['price-surplus', 'price-scarce']) {
      const l = lesson(id);
      const s = l.build();
      const d = l.focus(s, lessonPlan(s)).priceDept!;
      const opts = priceOptions(s, lessonPlan(s), d, l.steps);
      const by = Object.fromEntries(opts.map((o) => [o.tier, o]));
      expect(by.value.sold).toBeGreaterThanOrEqual(by.premium.sold);
      expect(by.value.wanted).toBeGreaterThan(by.premium.wanted);
      for (const o of opts) expect(o.grossProfit).toBeLessThan(o.revenue);
      const lessonRun = runLesson(l, s, { ...lessonPlan(s), pricing: { ...s.pricing, [d]: 'premium' } });
      expect(lessonRun.result.figures.find((f) => f.label === 'Sold')!.value).toBe(String(Math.round(by.premium.sold)));
    }
  });
});

describe('insight', () => {
  it('job previews say when a job cannot achieve anything', () => {
    const s = lesson('unload').build();
    const p = lessonPlan(s);
    expect(jobPreview(s, p, 'tomasz', 'receive').blocked).toBeNull();
    expect(jobPreview(s, p, 'kwame', 'replenish:produce').blocked).toMatch(/unload the dock first/);
    const t = lesson('serve').build();
    expect(jobPreview(t, lessonPlan(t), 'bev', 'receive').blocked).toMatch(/Nothing on the dock/);
  });
  it('the outlook follows the plan and reports what a move changes', () => {
    const s = lesson('serve').build();
    const p0 = lessonPlan(s);
    const p1 = withJobs(p0, { bev: 'tills' });
    const a = outlook(s, p0, 3)!;
    const b = outlook(s, p1, 3)!;
    const tills = (o: typeof a) => o.rows.find((r) => r.zone === 'tills')!;
    expect(tills(b).can).toBeGreaterThan(tills(a).can);
    expect(tills(a).status).toBe('short');
    expect(outlookChanges(a, b).tills).toBeGreaterThan(0);
  });
  it('problems flag the stuck dock and point to the place to act', () => {
    const s = lesson('unload').build();
    const ps = problems(s, lessonPlan(s));
    expect(ps.find((x) => x.zone === 'dock')!.level).toBe('urgent');
    expect(ps.some((x) => x.zone === 'produce')).toBe(true);
  });
  it('chiller facts match the engine: booking the engineer and staff moving stock', () => {
    let s = startDay(1, recommendedSetup());
    while (s.fridge.status !== 'fault') s = runHour(s, sensible(s)).state;
    const p = defaultPlan(s);
    const f = fridgeFacts(s, p);
    expect(f.capacity).toBe(CONFIG.departments.chilled.shelfCapacity * CONFIG.events.fridgeFault.capacityShare);
    expect(f.atRisk).toBeCloseTo(Math.max(0, total(s.stock.chilled.shelf) - f.capacity), 6);
    expect(f.booked).toBe(false);
    const booked = { ...p, actions: [{ kind: 'repair' as const }] };
    expect(fridgeFacts(s, booked).booked).toBe(true);
    // The engineer arrives at the stated time.
    const after = runHour(s, booked);
    expect(after.state.fridge.status).toBe('fixed');
    expect(after.report.messages.join(' ')).toContain(fridgeFacts(s, booked).engineerAt);
  });
  it('outcomes come from recorded results, at most the important few first', () => {
    const l = lesson('unload');
    const s = l.build();
    const { report } = runLesson(l, s, withJobs(lessonPlan(s), GUIDED.unload));
    const out = intervalOutcomes(report);
    const dock = out.find((o) => o.zone === 'dock')!;
    expect(dock.tag).toBe(`Unloaded ${Math.round(report.dept.produce.received)}`);
    expect(out.find((o) => o.zone === 'tills')!.text).toContain(`Served ${Math.round(report.customersServed)}`);
    for (let i = 1; i < out.length; i++) expect(out[i - 1].weight).toBeGreaterThanOrEqual(out[i].weight);
  });
  it('the price trade-off text never names a best option', () => {
    const l = lesson('price-surplus');
    const s = l.build();
    const opts = priceOptions(s, lessonPlan(s), 'chilled', l.steps);
    for (const t of ['value', 'standard', 'premium'] as const) expect(priceTradeOff(s, opts, t, 'chilled')).not.toMatch(/best|should|recommend/i);
  });
  it('the full Saturday still works with every department', () => {
    let s = startDay(1, recommendedSetup());
    s = runHour(s, defaultPlan(s)).state;
    for (const d of DEPTS) expect(priceOptions(s, defaultPlan(s), d)).toHaveLength(3);
  });
});
