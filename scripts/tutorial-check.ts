/** Plays each lesson with and without its guided action and prints the outcome sentences. */
import { LESSONS, runLesson } from '../src/sim/tutorial';
import { lessonPlan as defaultPlan } from '../src/sim/tutorial';
import type { AssignmentId } from '../src/sim/types';
const guided: Record<string, Record<string, AssignmentId>> = {
  serve: { bev: 'tills' },
  fill: { kwame: 'replenish:produce' },
  unload: { tomasz: 'receive' },
  rest: { dougie: 'break', mags: 'replenish:chilled' },
  tradeoff: { tomasz: 'tills' },
};
for (const l of LESSONS) {
  const s = l.build();
  const p0 = defaultPlan(s);
  const a = runLesson(l, s, p0);
  console.log(`\n[${l.id}] default: ${a.result.passed ? 'PASS' : 'fail'} — ${a.result.sentence}`);
  const p1 = { ...p0, assignments: { ...p0.assignments, ...(guided[l.id] ?? {}) } };
  if (l.id === 'tradeoff') { const p2 = { ...p0, assignments: { ...p0.assignments, tomasz: 'replenish:ambient' as AssignmentId } }; const c = runLesson(l, s, p2); console.log(`   other: ${c.result.sentence} | ${c.result.figures.map(f=>f.label+' '+f.value).join(', ')}`); }
  if (l.optional) { for (const t of ['value','standard','premium'] as const) { const pp = { ...p0, pricing: { ...p0.pricing, [l.id === 'price-surplus' ? 'chilled' : 'produce']: t } }; console.log('   ', runLesson(l, s, pp).result.sentence); } continue; }
  const b = runLesson(l, s, p1);
  console.log(`   guided: ${b.result.passed ? 'PASS' : 'fail'} — ${b.result.sentence} | ${b.result.figures.map(f=>f.label+' '+f.value).join(', ')}`);
}
