/** Playtest aid: the same 12:00 hour with one staffing change, preview and outcome side by side. Run with `npm run consequence`. */
import { sensible } from '../src/sim/bots';
import { recommendedSetup, runHour, startDay } from '../src/sim/engine';
import { explainHour, previewWarnings } from '../src/sim/explain';
let s = startDay(1, recommendedSetup());
for (let h = 0; h < 3; h++) s = runHour(s, sensible(s)).state;
const base = sensible(s);
console.log('12:00 plan:', base.assignments);
const show = (label: string, plan: typeof base) => {
  console.log(`\n== ${label}\nPREVIEW:`, previewWarnings(s, plan).map(n => n.text));
  console.log('RESULT:', explainHour(runHour(s, plan).report).map(n => `[${n.kind}] ${n.text}`));
};
show('as planned', base);
const moved = { ...base, assignments: { ...base.assignments } };
const receiver = Object.entries(moved.assignments).find(([, a]) => a === 'receive')?.[0];
if (receiver) moved.assignments[receiver] = 'replenish:produce';
moved.assignments.tomasz = 'receive';
const tillCount = Object.values(moved.assignments).filter(a => a === 'tills').length;
show(`${receiver} to fruit & veg, Tomasz from tills to receiving (tills=${tillCount})`, moved);
