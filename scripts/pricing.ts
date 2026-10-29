import { playShift, sensible } from '../src/sim/bots';
import { operatingProfit, satisfactionSoFar, wellbeing, recommendedSetup } from '../src/sim/engine';
import type { PriceTier } from '../src/sim/config';
for (const tier of ['value', 'standard', 'premium'] as PriceTier[]) {
  const setup = recommendedSetup();
  setup.pricing = { produce: tier, chilled: tier, ambient: tier };
  for (const seed of [1, 3, 42]) {
    const { state } = playShift(seed, sensible, setup);
    console.log(tier, seed, operatingProfit(state).toFixed(0), satisfactionSoFar(state).toFixed(1), wellbeing(state).toFixed(0), state.ledger.waste.toFixed(0));
  }
}
// mistakes: one till during hours 3 and 5, no breaks for two people
const mistakes = (s: any) => {
  const p = sensible(s);
  if (s.hour === 3 || s.hour === 5) {
    const t = Object.entries(p.assignments).filter(([, a]) => a === 'tills');
    for (const [id] of t.slice(1)) p.assignments[id] = 'replenish:produce';
    let n = 0; for (const [id, a] of Object.entries(p.assignments)) if (a === 'replenish:produce' && ++n > 2) p.assignments[id] = 'break';
  }
  return p;
};
try { const { state } = playShift(1, mistakes); console.log('mistakes', operatingProfit(state).toFixed(0), satisfactionSoFar(state).toFixed(1), wellbeing(state).toFixed(0)); } catch (e) { console.log(String(e)); }
