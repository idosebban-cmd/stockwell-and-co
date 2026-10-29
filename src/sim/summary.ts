/** Closing results: the day's accounts, targets, biggest factors and missed opportunities. */
import { CONFIG, DEPTS, deptName, hourLabel, type DeptId } from './config';
import { inventoryValue, money, operatingProfit, satisfactionSoFar, wellbeing } from './engine';
import { total, value } from './stock';
import type { HourReport, SimState } from './types';

export interface Factor {
  label: string;
  /** Effect on operating profit in pounds (approximate where noted). */
  amount: number;
  detail: string;
}

export interface Summary {
  revenue: number;
  cogs: number;
  grossProfit: number;
  wages: number;
  extras: { label: string; amount: number }[];
  extrasTotal: number;
  waste: number;
  operatingProfit: number;
  cash: number;
  startingCash: number;
  inventory: { dept: DeptId; units: number; value: number; note: string }[];
  inventoryValue: number;
  satisfaction: number;
  wellbeing: number;
  targets: { label: string; value: string; target: string; met: boolean }[];
  won: boolean;
  factors: Factor[];
  missed: string[];
  customers: { arrived: number; served: number; abandoned: number };
}

export function summarise(state: SimState): Summary {
  const l = state.ledger;
  const reports = state.history;
  const extras = Object.entries(l.extras)
    .map(([label, amount]) => ({ label, amount }))
    .sort((a, b) => b.amount - a.amount);
  const extrasTotal = extras.reduce((t, x) => t + x.amount, 0);
  const op = operatingProfit(state);
  const sat = satisfactionSoFar(state);
  const wb = wellbeing(state);
  const T = CONFIG.targets;
  const targets = [
    { label: 'Operating profit', value: money(op), target: `${money(T.operatingProfit)} or more`, met: op >= T.operatingProfit },
    { label: 'Customer satisfaction', value: `${Math.round(sat)}`, target: `${T.satisfaction} or more`, met: sat >= T.satisfaction },
    { label: 'Staff wellbeing', value: `${Math.round(wb)}`, target: `${T.wellbeing} or more`, met: wb >= T.wellbeing },
  ];
  const inventory = DEPTS.map((d) => {
    const st = state.stock[d];
    const all = [...st.shelf, ...st.backroom, ...st.dock];
    const note = d === 'ambient' ? 'Keeps for next week.' : d === 'chilled' ? 'Long-dated; sells on Monday.' : 'Fresh enough for Monday.';
    return { dept: d, units: total(all), value: value(all), note };
  });
  return {
    revenue: l.revenue,
    cogs: l.cogs,
    grossProfit: l.revenue - l.cogs,
    wages: l.wages,
    extras,
    extrasTotal,
    waste: l.waste,
    operatingProfit: op,
    cash: state.cash,
    startingCash: CONFIG.startingCash,
    inventory,
    inventoryValue: inventoryValue(state),
    satisfaction: sat,
    wellbeing: wb,
    targets,
    won: targets.every((t) => t.met),
    factors: factors(state, reports),
    missed: missedOpportunities(state, reports),
    customers: {
      arrived: reports.reduce((t, r) => t + r.customersArrived, 0),
      served: reports.reduce((t, r) => t + r.customersServed, 0),
      abandoned: reports.reduce((t, r) => t + r.customersAbandoned, 0),
    },
  };
}

function margin(r: HourReport, d: DeptId): number {
  return r.dept[d].price - CONFIG.departments[d].unitCost;
}

function factors(state: SimState, reports: HourReport[]): Factor[] {
  const out: Factor[] = [];
  let walkout = 0;
  let walkoutPeople = 0;
  let gap = 0;
  let gapItems = 0;
  let noStock = 0;
  let noStockItems = 0;
  let pricing = 0;
  let idleWages = 0;
  for (const r of reports) {
    walkoutPeople += r.customersAbandoned;
    for (const d of DEPTS) {
      const x = r.dept[d];
      walkout += x.abandonedItems * margin(r, d);
      gap += x.lostShelfGap * margin(r, d);
      gapItems += x.lostShelfGap;
      noStock += x.lostNoStock * margin(r, d);
      noStockItems += x.lostNoStock;
      pricing += x.priceEffect;
    }
    for (const s of r.staff) {
      if (s.utilisation !== null && s.assignment !== 'tills' && !s.id.startsWith('temp')) idleWages += (1 - s.utilisation) * CONFIG.wagePerHour;
    }
  }
  if (walkout > 1)
    out.push({ label: 'Checkout walk-outs', amount: -walkout, detail: `About ${Math.round(walkoutPeople)} shoppers gave up queueing; that is roughly the margin their baskets would have made.` });
  if (gap > 1)
    out.push({ label: 'Empty shelves with stock out back', amount: -gap, detail: `About ${Math.round(gapItems)} items wanted while stock sat in the stockroom or on the dock.` });
  if (noStock > 1)
    out.push({ label: 'Running out of stock', amount: -noStock, detail: `About ${Math.round(noStockItems)} items wanted that the shop simply didn't have.` });
  if (state.ledger.waste > 1) out.push({ label: 'Waste', amount: -state.ledger.waste, detail: wasteDetail(reports) });
  if (Math.abs(pricing) > 5)
    out.push({
      label: pricing > 0 ? 'Premium pricing' : 'Value pricing and markdowns',
      amount: pricing,
      detail: pricing > 0 ? 'Extra takings from charging above standard prices (before any lost demand).' : 'Takings given up by charging below standard prices (in exchange for demand and goodwill).',
    });
  const actionCosts = ['Promotions', 'Emergency delivery fees', 'Agency temp', 'Chiller repair']
    .map((k) => state.ledger.extras[k] ?? 0)
    .reduce((t, x) => t + x, 0);
  if (actionCosts > 1) out.push({ label: 'Interventions', amount: -actionCosts, detail: 'Promotions, emergency delivery fees, agency temp and repairs.' });
  if (idleWages > 15) out.push({ label: 'Staff with little to do', amount: -idleWages, detail: 'Wages for hours spent on full shelves, an empty dock or quiet tills.' });
  const gp = state.ledger.revenue - state.ledger.cogs;
  out.push({ label: 'Gross profit on sales', amount: gp, detail: `${money(state.ledger.revenue)} of takings less ${money(state.ledger.cogs)} for the goods sold.` });
  // Rank the effects you could change; gross profit only shows if little else mattered.
  const ranked = out.filter((f) => f.label !== 'Gross profit on sales').sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
  const top = ranked.slice(0, 3);
  if (top.length < 3) top.push(out[out.length - 1]);
  return top;
}

function wasteDetail(reports: HourReport[]): string {
  const by: Record<string, number> = {};
  for (const r of reports) for (const w of r.waste) by[w.reason] = (by[w.reason] ?? 0) + w.cost;
  const names: Record<string, string> = { expired: 'out of date', shrink: 'bruised produce', dock: 'spoiled on the dock', abandoned: 'abandoned baskets', fridge: 'broken chiller' };
  return Object.entries(by)
    .sort((a, b) => b[1] - a[1])
    .filter(([, v]) => v >= 1)
    .map(([k, v]) => `${names[k]} ${money(v)}`)
    .join(', ');
}

function missedOpportunities(state: SimState, reports: HourReport[]): string[] {
  const out: { score: number; text: string }[] = [];

  // Worst checkout hour.
  const worstQ = [...reports].sort((a, b) => b.customersAbandoned - a.customersAbandoned)[0];
  if (worstQ && worstQ.customersAbandoned >= 2) {
    const tills = worstQ.staff.filter((s) => s.assignment === 'tills').length;
    const value = DEPTS.reduce((t, d) => t + worstQ.dept[d].abandonedItems * worstQ.dept[d].price, 0);
    const onBreak = worstQ.staff.filter((s) => s.assignment === 'break').map((s) => s.name);
    const extra =
      tills < CONFIG.checkout.tills
        ? ` Only ${tills} of ${CONFIG.checkout.tills} tills were open${onBreak.length ? ` while ${onBreak.join(' and ')} ${onBreak.length > 1 ? 'were' : 'was'} on break` : ''}.`
        : ' All three tills were open; an agency temp or fewer walk-ins (premium prices) were the remaining levers.';
    out.push({
      score: value,
      text: `${hourLabel(worstQ.hour)}: about ${Math.round(worstQ.customersAbandoned)} shoppers walked out of the queue, leaving ${money(value)} of shopping behind.${extra}`,
    });
  }

  // Worst shelf gap with stock out back.
  let best: { r: HourReport; d: DeptId } | null = null;
  for (const r of reports) for (const d of DEPTS) if (!best || r.dept[d].lostShelfGap > best.r.dept[best.d].lostShelfGap) best = { r, d };
  if (best && best.r.dept[best.d].lostShelfGap >= 15) {
    const x = best.r.dept[best.d];
    const fillers = best.r.staff.filter((s) => s.assignment === `replenish:${best!.d}`).map((s) => s.name);
    const idle = best.r.staff.filter((s) => s.utilisation !== null && s.utilisation < 0.35 && s.assignment !== `replenish:${best!.d}`).map((s) => s.name);
    const onDock = x.backroomEnd < 1 && x.dockEnd > 0;
    let hint = fillers.length === 0 ? ' Nobody was assigned to fill them.' : ` Only ${fillers.join(' and ')} ${fillers.length > 1 ? 'were' : 'was'} filling them.`;
    if (onDock) hint += ' The stock was stuck on the dock: receiving it sooner would have helped.';
    if (idle.length) hint += ` Meanwhile ${idle.join(' and ')} had little to do.`;
    out.push({
      score: x.lostShelfGap * x.price,
      text: `${hourLabel(best.r.hour)}: ${deptName(best.d).toLowerCase()} shelves were empty for about ${x.shelfEmptySteps * 10} minutes, missing around ${Math.round(x.lostShelfGap)} sales (${money(x.lostShelfGap * x.price)}).${hint}`,
    });
  }

  // Running out entirely.
  for (const d of DEPTS) {
    const lost = reports.reduce((t, r) => t + r.dept[d].lostNoStock, 0);
    if (lost >= 15) {
      const first = reports.find((r) => r.dept[d].lostNoStock > 1);
      const emergencyUsed = state.used.emergency;
      out.push({
        score: lost * CONFIG.departments[d].standardPrice,
        text: `${deptName(d)} ran out from about ${hourLabel(first?.hour ?? 0)}, with roughly ${Math.round(lost)} items wanted.${emergencyUsed < CONFIG.actions.emergency.maxPerDay ? ` An emergency order (arrives an hour later) was still available.` : ''}`,
      });
    }
  }

  // Out-of-date chilled at close.
  const expired = reports.flatMap((r) => r.waste).filter((w) => w.dept === 'chilled' && w.reason === 'expired');
  const expiredCost = expired.reduce((t, w) => t + w.cost, 0);
  if (expiredCost >= 15) {
    const qty = expired.reduce((t, w) => t + w.qty, 0);
    out.push({
      score: expiredCost,
      text: `${Math.round(qty)} chilled items (${money(expiredCost)}) went out of date.${state.used.markdown.includes('chilled') ? ' The markdown helped, but the order was still on the generous side.' : ' A chilled markdown in the last couple of hours was never used.'}`,
    });
  }
  const producePast = reports.flatMap((r) => r.waste).filter((w) => w.dept === 'produce' && w.reason === 'expired');
  const producePastCost = producePast.reduce((t, w) => t + w.cost, 0);
  if (producePastCost >= 8)
    out.push({
      score: producePastCost,
      text: `Friday's produce went past its best at 13:00 (${money(producePastCost)} binned).${state.used.markdown.includes('produce') ? '' : ' A morning markdown on fruit & veg could have cleared it.'}`,
    });

  // Dock spoilage.
  const dockCost = reports.flatMap((r) => r.waste).filter((w) => w.reason === 'dock').reduce((t, w) => t + w.cost, 0);
  if (dockCost >= 10) {
    const hrs = reports.filter((r) => DEPTS.some((d) => r.dept[d].dockEnd > 1)).map((r) => hourLabel(r.hour));
    out.push({ score: dockCost, text: `Deliveries sat on the dock (${hrs.slice(0, 3).join(', ')}${hrs.length > 3 ? '…' : ''}) and ${money(dockCost)} spoiled. More hands on receiving would have saved most of it.` });
  }

  // Fridge.
  const fridgeCost = reports.flatMap((r) => r.waste).filter((w) => w.reason === 'fridge').reduce((t, w) => t + w.cost, 0);
  if (fridgeCost >= 10)
    out.push({
      score: fridgeCost,
      text: `${money(fridgeCost)} of chilled stock warmed up in the broken cabinet.${state.used.repair ? '' : ` The engineer (${money(CONFIG.actions.repair.cost)}) was never called.`}`,
    });

  // Breaks.
  const noBreak = state.staff.filter((s) => !s.isTemp && s.breaks === 0).map((s) => s.name);
  if (noBreak.length)
    out.push({ score: noBreak.length * 40, text: `${noBreak.join(', ')} never had a break. Tired staff work slower, and it shows in wellbeing.` });
  const overworked = state.staff.filter((s) => !s.isTemp && s.strain >= 8).map((s) => s.name);
  if (overworked.length && !noBreak.length)
    out.push({ score: overworked.length * 25, text: `${overworked.join(', ')} ${overworked.length > 1 ? 'were' : 'was'} worked hard for long stretches; breaks earlier in the day would have spread the load.` });

  // Idle labour while there were problems elsewhere.
  for (const r of reports) {
    const idle = r.staff.filter((s) => s.utilisation !== null && s.utilisation < 0.25);
    const trouble = r.customersAbandoned >= 2 || DEPTS.some((d) => r.dept[d].lostShelfGap >= 15);
    if (idle.length && trouble) {
      out.push({ score: 30, text: `${hourLabel(r.hour)}: ${idle.map((s) => s.name).join(' and ')} had little to do while there were queues or empty shelves elsewhere.` });
      break;
    }
  }

  return out
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((x) => x.text);
}
