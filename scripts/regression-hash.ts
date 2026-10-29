/** Fingerprints full Saturdays for several strategies, to check engine refactors do not change results. */
import { createHash } from 'node:crypto';
import { playShift, sensible, oneTill, passive } from '../src/sim/bots';
for (const [n, s] of Object.entries({ sensible, oneTill, passive })) for (const seed of [1, 42, 1234]) {
  const { state } = playShift(seed, s);
  const { history, ...rest } = state as any;
  const h = createHash('sha1').update(JSON.stringify({ ledger: rest.ledger, cash: rest.cash, staff: rest.staff.map(({ stepsWorked, stepsRested, ...x }: any) => x), stock: rest.stock, sat: rest.satisfaction, rep: history.map((r: any) => [r.customersServed, r.customersAbandoned, Object.fromEntries(Object.entries(r.dept).map(([k, v]: any) => { const { rescued, ...x } = v; return [k, x]; })), r.waste]) })).digest('hex').slice(0, 12);
  console.log(n, seed, h);
}
