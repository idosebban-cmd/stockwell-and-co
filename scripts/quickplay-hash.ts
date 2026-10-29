/** Fingerprints Quick play Saturdays by their numbers only (not labels), to check the campaign work leaves Quick play unchanged. */
import { createHash } from 'node:crypto';
import { playShift, sensible, oneTill, passive, noBreaks } from '../src/sim/bots';
const r6 = (x: number) => Math.round(x * 1e6) / 1e6;
const loc = (bs: { qty: number; unitCost: number }[]) => [r6(bs.reduce((t, b) => t + b.qty, 0)), r6(bs.reduce((t, b) => t + b.qty * b.unitCost, 0))];
for (const [n, s] of Object.entries({ sensible, oneTill, passive, noBreaks })) for (const seed of [1, 2, 42, 1234]) {
  const { state, reports } = playShift(seed, s);
  const stock = Object.fromEntries(Object.entries(state.stock).map(([d, st]) => [d, [loc(st.shelf), loc(st.backroom), loc(st.dock)]]));
  const staff = state.staff.map((x) => [x.id, r6(x.energy), r6(x.strain), x.breaks, x.hoursWorked]);
  const rep = reports.map((r) => [r6(r.customersServed), r6(r.customersAbandoned), r6(r.satisfaction.score), Object.values(r.dept).map((v) => [r6(v.sold), r6(v.revenue), r6(v.replenished), r6(v.received)]), r.waste.map((w) => [w.dept, w.reason, r6(w.qty), r6(w.cost)])]);
  const ledger = { ...state.ledger, extras: Object.fromEntries(Object.entries(state.ledger.extras).map(([k, v]) => [k, r6(v)])) };
  const h = createHash('sha1').update(JSON.stringify({ ledger, cash: r6(state.cash), staff, stock, rep })).digest('hex').slice(0, 12);
  console.log(n, seed, h);
}
