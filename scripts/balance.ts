/** Balance report: plays complete Saturdays with scripted strategies across seeds. Run with `npm run balance`. */
import { playShift, sensible, noBreaks, oneTill, noReplenishment, passive } from '../src/sim/bots';
import { operatingProfit, satisfactionSoFar, wellbeing, inventoryValue } from '../src/sim/engine';
import { CURATED_SEED } from '../src/sim/scenario';

const strategies = { sensible, noBreaks, oneTill, noReplenishment, passive };
const seeds = [CURATED_SEED, 2, 3, 17, 42, 99, 1234, 5555];
for (const [name, strat] of Object.entries(strategies)) {
  const rows: string[] = [];
  for (const seed of seeds) {
    const { state, reports } = playShift(seed, strat);
    const l = state.ledger;
    const ab = reports.reduce((t, r) => t + r.customersAbandoned, 0);
    const gap = reports.reduce((t, r) => t + r.dept.produce.lostShelfGap + r.dept.chilled.lostShelfGap + r.dept.ambient.lostShelfGap, 0);
    const nos = reports.reduce((t, r) => t + r.dept.produce.lostNoStock + r.dept.chilled.lostNoStock + r.dept.ambient.lostNoStock, 0);
    rows.push(`seed ${String(seed).padEnd(5)} profit ${operatingProfit(state).toFixed(0).padStart(6)} sat ${satisfactionSoFar(state).toFixed(1)} wb ${wellbeing(state).toFixed(1)} rev ${l.revenue.toFixed(0)} waste ${l.waste.toFixed(0)} inv ${inventoryValue(state).toFixed(0)} cash ${state.cash.toFixed(0)} aband ${ab.toFixed(0)} gap ${gap.toFixed(0)} nostock ${nos.toFixed(0)}`);
  }
  console.log(`\n== ${name}\n` + rows.join('\n'));
}

