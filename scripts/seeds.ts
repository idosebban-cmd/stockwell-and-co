import { playShift, sensible } from '../src/sim/bots';
import { operatingProfit, satisfactionSoFar, wellbeing } from '../src/sim/engine';
import { summarise } from '../src/sim/summary';
for (let i = 0; i < 20; i++) {
  const seed = 100 + i * 37;
  const { state } = playShift(seed, sensible);
  const s = summarise(state);
  console.log(seed, operatingProfit(state).toFixed(0), satisfactionSoFar(state).toFixed(1), wellbeing(state).toFixed(0), state.scenario.events.map(e=>e.kind+'@'+e.hour).join(','), state.scenario.forecast.join(' '), '|', s.factors.map(f=>f.label+' '+f.amount.toFixed(0)).join('; '));
}
