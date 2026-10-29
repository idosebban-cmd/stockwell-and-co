/** Pricing report: does one price tier dominate? Run with `npx vite-node scripts/pricing.ts`. */
import { CONFIG, DEPTS, PRICE_TIERS, type DeptId, type PriceTier } from '../src/sim/config';
import { fixLimits, playShift, sensible } from '../src/sim/bots';
import { operatingProfit, recommendedSetup, satisfactionSoFar } from '../src/sim/engine';
import { CURATED_SEED } from '../src/sim/scenario';
import type { SetupPlan } from '../src/sim/types';

const seeds = [CURATED_SEED, 2, 3, 17, 42, 99, 1234, 5555];

function day(d: DeptId, tier: PriceTier, setup: SetupPlan) {
  let profit = 0, gross = 0, sold = 0, waste = 0, sat = 0, walk = 0;
  for (const seed of seeds) {
    const s: SetupPlan = { ...setup, pricing: { ...setup.pricing, [d]: tier } };
    const { state, reports } = playShift(seed, (st) => ({ ...sensible(st), pricing: { ...st.pricing, [d]: tier } }), s);
    profit += operatingProfit(state);
    gross += reports.reduce((t, r) => t + r.dept[d].revenue - r.dept[d].cogs, 0);
    sold += reports.reduce((t, r) => t + r.dept[d].sold, 0);
    waste += reports.flatMap((r) => r.waste).filter((w) => w.dept === d).reduce((t, w) => t + w.cost, 0);
    sat += satisfactionSoFar(state);
    walk += reports.reduce((t, r) => t + r.customersAbandoned, 0);
  }
  const n = seeds.length;
  return `${tier.padEnd(9)} profit ${(profit / n).toFixed(0).padStart(6)} gross(${d}) ${(gross / n).toFixed(0).padStart(5)} sold ${(sold / n).toFixed(0).padStart(5)} waste ${(waste / n).toFixed(0).padStart(4)} sat ${(sat / n).toFixed(1)} walkouts ${(walk / n).toFixed(1)}`;
}

const scale = (k: number): SetupPlan => {
  const s = recommendedSetup();
  for (const d of DEPTS) s.orders[d] = { morning: Math.round(s.orders[d].morning * k), midday: Math.round(s.orders[d].midday * k) };
  return s;
};
for (const [name, setup] of [['recommended order', recommendedSetup()], ['short order (x0.6)', scale(0.6)], ] as const) {
  console.log(`\n=== ${name}`);
  for (const d of DEPTS) {
    console.log(`-- ${d}`);
    for (const t of PRICE_TIERS) console.log('  ' + day(d, t, setup));
  }
}
void CONFIG;

// --- Situations: set up a mid-day state, then play the rest of the day at each price.
import { startDay, runHour, operatingProfit as op2, satisfactionSoFar as sat2 } from '../src/sim/engine';
import type { SimState, HourPlan } from '../src/sim/types';
import * as St from '../src/sim/stock';

function reach(seed: number, hour: number): SimState {
  let s = startDay(seed, recommendedSetup());
  while (s.hour < hour) s = runHour(s, sensible(s)).state;
  return s;
}
function situation(name: string, d: DeptId, hour: number, tweak: (s: SimState) => void, planTweak: (s: SimState, p: HourPlan) => HourPlan = (_s, p) => p, hours = 99) {
  console.log(`\n=== ${name} (${d}, from ${9 + hour}:00)`);
  for (const t of PRICE_TIERS) {
    let profit = 0, gross = 0, sold = 0, waste = 0, sat = 0, walk = 0, served = 0, all = 0, lost = 0;
    for (const seed of seeds) {
      let s = reach(seed, hour);
      tweak(s);
      const p0 = op2(s);
      let n = 0;
      while (s.hour < CONFIG.hours && n < hours) {
        const plan = planTweak(s, { ...sensible(s), pricing: { ...s.pricing, [d]: t } });
        const r = runHour(s, plan);
        s = r.state; n++;
        gross += r.report.dept[d].revenue - r.report.dept[d].cogs;
        sold += r.report.dept[d].sold;
        waste += r.report.waste.filter((w) => w.dept === d).reduce((x, w) => x + w.cost, 0);
        all += DEPTS.reduce((x, e) => x + r.report.dept[e].revenue - r.report.dept[e].cogs, 0);
        lost += DEPTS.filter((e) => e !== d).reduce((x, e) => x + r.report.dept[e].lostShelfGap + r.report.dept[e].lostNoStock, 0);
        walk += r.report.customersAbandoned; served += r.report.customersServed;
      }
      profit += op2(s) - p0; sat += sat2(s);
    }
    const k = seeds.length;
    console.log(`  ${t.padEnd(8)} profit ${(profit / k).toFixed(0).padStart(5)}  gross ${(gross / k).toFixed(0).padStart(5)}  sold ${(sold / k).toFixed(0).padStart(5)}  waste £${(waste / k).toFixed(0).padStart(3)}  served ${(served / k).toFixed(0)}  walk-outs ${(walk / k).toFixed(1)}  satisfaction ${(sat / k).toFixed(1)}  shop gross ${(all / k).toFixed(0)}  other depts not found ${(lost / k).toFixed(0)}`);
  }
}
const fill = (s: SimState, d: DeptId, shelf: number, back: number, expiresAt: number | null, unitCost = CONFIG.departments[d].unitCost) => {
  const st = s.stock[d];
  st.shelf.push({ qty: shelf, unitCost, expiresAt });
  st.backroom.push({ qty: back, unitCost, expiresAt });
};
situation('Plenty of cupboard stock, spare tills', 'ambient', 2, (s) => fill(s, 'ambient', 0, 400, null));
situation('Excess chilled stock expiring tonight', 'chilled', 5, (s) => fill(s, 'chilled', 0, 300, CONFIG.hours, CONFIG.chilledLife.short.unitCost));
situation('Excess produce, past its best at close', 'produce', 5, (s) => fill(s, 'produce', 0, 350, CONFIG.hours));
situation('Congested tills (one till in the rush)', 'ambient', 4, () => {}, (s, p) => {
  const tillers = Object.entries(p.assignments).filter(([, a]) => a === 'tills');
  for (const [id] of tillers.slice(1)) p.assignments[id] = 'replenish:ambient';
  return fixLimits(s, p, ['tills']);
}, 2);
