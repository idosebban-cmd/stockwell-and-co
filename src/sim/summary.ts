/**
 * Closing results: scores against targets, one takeaway, and the report
 * (accounts, operations, team). Everything here is read from the recorded
 * hours. Actual costs and estimated missed profit are kept apart, and causes
 * are only named when the recorded figures show them.
 */
import { CONFIG, DEPTS, deptName, hourLabel, type DeptId } from './config';
import { STEP_MINUTES, inventoryValue, money, operatingProfit, satisfactionSoFar, wellbeing } from './engine';
import { total, value } from './stock';
import type { HourReport, SimState } from './types';

export interface ScoreTargets {
  profit: number;
  satisfaction: number;
  wellbeing: number;
}

export const QUICK_TARGETS: ScoreTargets = {
  profit: CONFIG.targets.operatingProfit,
  satisfaction: CONFIG.targets.satisfaction,
  wellbeing: CONFIG.targets.wellbeing,
};

export interface Score {
  key: 'profit' | 'customers' | 'staff';
  label: string;
  value: number;
  display: string;
  target: number;
  targetDisplay: string;
  met: boolean;
}

/** Money actually spent or written off. */
export interface Cost {
  label: string;
  amount: number;
  note: string;
}

/** Margin the shop would roughly have made; an estimate, not money spent. */
export interface Estimate {
  label: string;
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
  cashBeforeOrder: number;
  inventory: { dept: DeptId; units: number; value: number }[];
  inventoryValue: number;
  satisfaction: number;
  wellbeing: number;
  scores: Score[];
  metCount: number;
  won: boolean;
  takeaway: string;
  wasteBy: { label: string; qty: number; cost: number }[];
  actionCosts: Cost[];
  estimates: Estimate[];
  missed: string[];
  customers: { arrived: number; served: number; abandoned: number };
  availability: { dept: DeptId; wanted: number; sold: number; shelfGap: number; noStock: number }[];
  team: { id: string; name: string; hours: number; breaks: number; energy: number; strain: number; state: string; quietHours: number }[];
}

export function summarise(state: SimState, targets: ScoreTargets = QUICK_TARGETS): Summary {
  const l = state.ledger;
  const reports = state.history;
  const extras = Object.entries(l.extras)
    .map(([label, amount]) => ({ label, amount }))
    .sort((a, b) => b.amount - a.amount);
  const extrasTotal = extras.reduce((t, x) => t + x.amount, 0);
  const op = operatingProfit(state);
  const sat = satisfactionSoFar(state);
  const wb = wellbeing(state);
  const scores: Score[] = [
    { key: 'profit', label: 'Profit', value: op, display: pounds(op), target: targets.profit, targetDisplay: pounds(targets.profit), met: op >= targets.profit },
    { key: 'customers', label: 'Customers', value: sat, display: `${Math.round(sat)}`, target: targets.satisfaction, targetDisplay: `${targets.satisfaction}`, met: Math.round(sat) >= targets.satisfaction },
    { key: 'staff', label: 'Staff', value: wb, display: `${Math.round(wb)}`, target: targets.wellbeing, targetDisplay: `${targets.wellbeing}`, met: Math.round(wb) >= targets.wellbeing },
  ];
  const inventory = DEPTS.filter((d) => state.ctx.depts.includes(d)).map((d) => {
    const st = state.stock[d];
    const all = [...st.shelf, ...st.backroom, ...st.dock];
    return { dept: d, units: total(all), value: value(all) };
  });
  const estimates = estimatedMissed(reports);
  const summary: Summary = {
    revenue: l.revenue,
    cogs: l.cogs,
    grossProfit: l.revenue - l.cogs,
    wages: l.wages,
    extras,
    extrasTotal,
    waste: l.waste,
    operatingProfit: op,
    cash: state.cash,
    cashBeforeOrder: state.cashBeforeOrder,
    inventory,
    inventoryValue: inventoryValue(state),
    satisfaction: sat,
    wellbeing: wb,
    scores,
    metCount: scores.filter((s) => s.met).length,
    won: scores.every((s) => s.met),
    takeaway: '',
    wasteBy: wasteBy(reports),
    actionCosts: actionCosts(state),
    estimates,
    missed: missedOpportunities(state, reports),
    customers: {
      arrived: reports.reduce((t, r) => t + r.customersArrived, 0),
      served: reports.reduce((t, r) => t + r.customersServed, 0),
      abandoned: reports.reduce((t, r) => t + r.customersAbandoned, 0),
    },
    availability: DEPTS.filter((d) => state.ctx.depts.includes(d)).map((d) => ({
      dept: d,
      wanted: reports.reduce((t, r) => t + r.dept[d].wanted, 0),
      sold: reports.reduce((t, r) => t + r.dept[d].sold, 0),
      shelfGap: reports.reduce((t, r) => t + r.dept[d].lostShelfGap, 0),
      noStock: reports.reduce((t, r) => t + r.dept[d].lostNoStock, 0),
    })),
    team: state.staff
      .filter((x) => !x.isTemp)
      .map((x) => ({
        id: x.id,
        name: x.name,
        hours: x.hoursWorked,
        breaks: x.breaks,
        energy: x.energy,
        strain: x.strain,
        state: x.strain >= 8 ? 'Worn out' : x.strain > 0 ? 'Stretched' : 'Fine',
        quietHours: reports.reduce((t, r) => {
          const s = r.staff.find((y) => y.id === x.id);
          return t + (s && s.utilisation !== null && s.utilisation < 0.3 ? (r.toStep - r.fromStep) / CONFIG.stepsPerHour : 0);
        }, 0),
      })),
  };
  summary.takeaway = takeaway(state, summary);
  return summary;
}

/** Whole pounds for scores: "£1,011", "−£40". */
function pounds(x: number): string {
  const v = `£${Math.round(Math.abs(x)).toLocaleString('en-GB')}`;
  return x < -0.5 ? `−${v}` : v;
}

function margin(r: HourReport, d: DeptId): number {
  return r.dept[d].price - CONFIG.departments[d].unitCost;
}

function estimatedMissed(reports: HourReport[]): Estimate[] {
  let walkout = 0;
  let walkoutPeople = 0;
  let gap = 0;
  let gapItems = 0;
  let noStock = 0;
  let noStockItems = 0;
  for (const r of reports) {
    walkoutPeople += r.customersAbandoned;
    for (const d of DEPTS) {
      const x = r.dept[d];
      walkout += x.abandonedItems * margin(r, d);
      gap += x.lostShelfGap * margin(r, d);
      gapItems += x.lostShelfGap;
      noStock += x.lostNoStock * margin(r, d);
      noStockItems += x.lostNoStock;
    }
  }
  const out: Estimate[] = [];
  if (walkout >= 1) out.push({ label: 'Shoppers who gave up queueing', amount: walkout, detail: `About ${Math.round(walkoutPeople)} shoppers left their baskets.` });
  if (gap >= 1) out.push({ label: 'Empty shelves, stock out back', amount: gap, detail: `About ${Math.round(gapItems)} items wanted while stock sat in the stockroom or on the dock.` });
  if (noStock >= 1) out.push({ label: 'Not in the shop at all', amount: noStock, detail: `About ${Math.round(noStockItems)} items wanted that the shop didn’t have.` });
  return out.sort((a, b) => b.amount - a.amount);
}

const WASTE_NAMES: Record<string, string> = {
  expired: 'Past its date',
  shrink: 'Bruised or aged produce',
  dock: 'Spoiled on the dock',
  abandoned: 'Abandoned baskets',
  fridge: 'Warmed in the broken chiller',
};

function wasteBy(reports: HourReport[]): Summary['wasteBy'] {
  const by: Record<string, { qty: number; cost: number }> = {};
  for (const r of reports)
    for (const w of r.waste) {
      const x = (by[w.reason] ??= { qty: 0, cost: 0 });
      x.qty += w.qty;
      x.cost += w.cost;
    }
  return Object.entries(by)
    .filter(([, v]) => v.cost >= 0.5)
    .sort((a, b) => b[1].cost - a[1].cost)
    .map(([k, v]) => ({ label: WASTE_NAMES[k] ?? k, ...v }));
}

/** What the day's actions cost, described neutrally: a repair is not a mistake. */
function actionCosts(state: SimState): Cost[] {
  const notes: Record<string, string> = {
    Promotions: 'Tasting stands and shelf talkers.',
    'Emergency delivery fees': 'Fees for cash-and-carry runs (the stock itself is inventory).',
    'Agency temp': 'Booking fee and hours.',
    'Chiller repair': 'Restored the full chilled shelf.',
  };
  return Object.keys(notes)
    .map((k) => ({ label: k, amount: state.ledger.extras[k] ?? 0, note: notes[k] }))
    .filter((c) => c.amount >= 0.5);
}

// ---------------------------------------------------------------------------
// The one takeaway
// ---------------------------------------------------------------------------

type Category = 'queue' | 'availability' | 'prices';

/** The day's satisfaction losses by cause, weighted by the customers each hour. */
function satisfactionLosses(reports: HourReport[]): Record<Category, number> {
  const out: Record<Category, number> = { queue: 0, availability: 0, prices: 0 };
  for (const r of reports)
    for (const x of r.satisfaction.reasons) {
      if (x.delta >= 0) continue;
      const cat: Category | null = /wait|gave up/.test(x.label) ? 'queue' : /not on the shelf/.test(x.label) ? 'availability' : /price/i.test(x.label) ? 'prices' : null;
      if (cat) out[cat] += -x.delta * r.customersArrived;
    }
  return out;
}

function names(list: string[]): string {
  return list.length <= 1 ? (list[0] ?? '') : `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
}

function takeaway(state: SimState, s: Summary): string {
  const reports = state.history;
  const missed = new Set(s.scores.filter((x) => !x.met).map((x) => x.key));
  if (missed.has('customers')) {
    const losses = satisfactionLosses(reports);
    const top = (Object.entries(losses) as [Category, number][]).sort((a, b) => b[1] - a[1])[0];
    if (top && top[1] > 0) {
      if (top[0] === 'queue') {
        const worst = [...reports].sort((a, b) => b.customersAbandoned - a.customersAbandoned || b.avgWait - a.avgWait)[0];
        const tills = worst.staff.filter((x) => x.assignment === 'tills').length;
        const resting = worst.staff.filter((x) => x.assignment === 'break').map((x) => x.name);
        const lead =
          s.customers.abandoned >= 1
            ? `${Math.round(s.customers.abandoned)} customers abandoned their queues, most at ${hourLabel(worst.hour)}.`
            : `Queues were long, worst at ${hourLabel(worst.hour)} (about ${Math.round(worst.avgWait)} minutes).`;
        if (resting.length && tills < state.ctx.tills) return `${lead} ${names(resting)} ${resting.length > 1 ? 'were' : 'was'} on a break then, with ${tills} of ${state.ctx.tills} tills open. Try staggering breaks around the busy hours.`;
        if (tills < state.ctx.tills) return `${lead} Only ${tills} of ${state.ctx.tills} tills were open then.`;
        return `${lead} All ${state.ctx.tills} tills were open: the tills were at capacity.`;
      }
      if (top[0] === 'availability') {
        const worst = [...s.availability].sort((a, b) => b.shelfGap + b.noStock - (a.shelfGap + a.noStock))[0];
        if (worst.shelfGap >= worst.noStock)
          return `${Math.round(worst.shelfGap)} ${deptName(worst.dept).toLowerCase()} items weren’t on the shelf while stock waited out the back. More time filling those shelves before the busy hours would help.`;
        return `${Math.round(worst.noStock)} ${deptName(worst.dept).toLowerCase()} items were wanted that the shop didn’t have. A larger order would have covered them.`;
      }
      return 'High prices lowered how customers felt about the visit.';
    }
  }
  if (missed.has('staff')) {
    const noBreak = state.staff.filter((x) => !x.isTemp && x.breaks === 0 && x.hoursWorked >= CONFIG.wellbeing.hoursBeforeBreakNeeded).map((x) => x.name);
    if (noBreak.length) return `${names(noBreak)} never had a break. Rest people in the quieter hours.`;
    const tired = state.staff.filter((x) => !x.isTemp && x.strain >= 8).map((x) => x.name);
    if (tired.length) return `${names(tired)} worked long stretches on low energy. Earlier breaks spread the load.`;
  }
  if (missed.has('profit')) {
    const shortfall = s.scores[0].target - s.operatingProfit;
    const big = s.estimates[0];
    if (big && big.amount >= shortfall) return `Profit was ${money(shortfall)} short. ${big.label} cost about ${money(big.amount)} of margin (an estimate): ${big.detail.charAt(0).toLowerCase()}${big.detail.slice(1)}`;
    const wasteTop = s.wasteBy[0];
    if (wasteTop && wasteTop.cost >= shortfall) return `Profit was ${money(shortfall)} short; ${money(wasteTop.cost)} of stock was written off (${wasteTop.label.toLowerCase()}).`;
    return `Profit was ${money(shortfall)} short of the target, with no single cause large enough to explain it. The report has the breakdown.`;
  }
  if (s.missed.length) return s.missed[0];
  return '';
}

// ---------------------------------------------------------------------------
// Missed opportunities: only what was possible at the time
// ---------------------------------------------------------------------------

function missedOpportunities(state: SimState, reports: HourReport[]): string[] {
  const out: { score: number; text: string }[] = [];
  const H = state.ctx.hours;
  const allowed = (k: (typeof state.ctx.actions)[number]) => state.ctx.actions.includes(k);

  // Worst checkout hour.
  const worstQ = [...reports].sort((a, b) => b.customersAbandoned - a.customersAbandoned)[0];
  if (worstQ && worstQ.customersAbandoned >= 2) {
    const tills = worstQ.staff.filter((s) => s.assignment === 'tills').length;
    const value = DEPTS.reduce((t, d) => t + worstQ.dept[d].abandonedItems * worstQ.dept[d].price, 0);
    const onBreak = worstQ.staff.filter((s) => s.assignment === 'break').map((s) => s.name);
    const extra =
      tills < state.ctx.tills
        ? ` Only ${tills} of ${state.ctx.tills} tills were open${onBreak.length ? ` while ${names(onBreak)} ${onBreak.length > 1 ? 'were' : 'was'} on break` : ''}.`
        : ` All ${state.ctx.tills} tills were open.${allowed('temp') && !state.used.temp && worstQ.hour - CONFIG.actions.temp.delayHours >= 0 ? ` An agency temp booked at ${hourLabel(worstQ.hour - CONFIG.actions.temp.delayHours)} would have arrived in time.` : ''}`;
    out.push({ score: value, text: `${hourLabel(worstQ.hour)}: about ${Math.round(worstQ.customersAbandoned)} shoppers walked out of the queue, leaving ${money(value)} of shopping behind.${extra}` });
  }

  // Worst shelf gap with stock out back.
  let best: { r: HourReport; d: DeptId } | null = null;
  for (const r of reports) for (const d of DEPTS) if (!best || r.dept[d].lostShelfGap > best.r.dept[best.d].lostShelfGap) best = { r, d };
  if (best && best.r.dept[best.d].lostShelfGap >= 15) {
    const x = best.r.dept[best.d];
    const fillers = best.r.staff.filter((s) => s.assignment === `replenish:${best!.d}`).map((s) => s.name);
    const idle = best.r.staff.filter((s) => s.utilisation !== null && s.utilisation < 0.35 && s.assignment !== `replenish:${best!.d}`).map((s) => s.name);
    const onDock = x.backroomEnd < 1 && x.dockEnd > 0;
    let hint = fillers.length === 0 ? ' Nobody was filling them.' : ` Only ${names(fillers)} ${fillers.length > 1 ? 'were' : 'was'} filling them.`;
    if (onDock) hint += ' The stock was still on the dock.';
    if (idle.length) hint += ` Meanwhile ${names(idle)} had little to do.`;
    out.push({
      score: x.lostShelfGap * x.price,
      text: `${hourLabel(best.r.hour)}: ${deptName(best.d).toLowerCase()} shelves were empty for about ${Math.round(x.shelfEmptySteps * STEP_MINUTES)} minutes, missing around ${Math.round(x.lostShelfGap)} sales.${hint}`,
    });
  }

  // Running out entirely: a rush delivery is only suggested if one ordered in the hour before could have arrived before closing.
  for (const d of DEPTS) {
    const lost = reports.reduce((t, r) => t + r.dept[d].lostNoStock, 0);
    if (lost < 15) continue;
    const first = reports.find((r) => r.dept[d].lostNoStock > 1);
    const orderAt = (first?.hour ?? 0) - 1;
    const couldHave = allowed('emergency') && state.used.emergency < CONFIG.actions.emergency.maxPerDay && orderAt >= 0 && orderAt + 1 < H;
    out.push({
      score: lost * CONFIG.departments[d].standardPrice,
      text: `${deptName(d)} ran out from about ${hourLabel(first?.hour ?? 0)}, with roughly ${Math.round(lost)} items wanted.${couldHave ? ` A rush delivery during the ${hourLabel(orderAt)} hour (on the dock in ${CONFIG.actions.emergency.arrivalMinutes} minutes) would have covered it.` : ''}`,
    });
  }

  // Stock past its date.
  for (const d of ['chilled', 'produce'] as DeptId[]) {
    const lines = reports.flatMap((r) => r.waste).filter((w) => w.dept === d && w.reason === 'expired');
    const cost = lines.reduce((t, w) => t + w.cost, 0);
    if (cost < 10) continue;
    const qty = lines.reduce((t, w) => t + w.qty, 0);
    const markdown = allowed('markdown') && !state.used.markdown.includes(d) ? ' A markdown before it expired was never used.' : '';
    out.push({ score: cost, text: `${Math.round(qty)} ${deptName(d).toLowerCase()} items (${money(cost)}) went past their date.${markdown}` });
  }

  // Dock spoilage: name a cause only if the dock had stock and nobody was unloading.
  const dockCost = reports.flatMap((r) => r.waste).filter((w) => w.reason === 'dock').reduce((t, w) => t + w.cost, 0);
  if (dockCost >= 10) {
    const unattended = reports.filter((r) => DEPTS.some((d) => r.dept[d].dockEnd > 1) && !r.staff.some((s) => s.assignment === 'receive')).map((r) => hourLabel(r.hour));
    out.push({ score: dockCost, text: `${money(dockCost)} of stock spoiled waiting on the dock.${unattended.length ? ` Nobody was unloading at ${names(unattended.slice(0, 3))}.` : ''}` });
  }

  // Broken chiller.
  const fridgeCost = reports.flatMap((r) => r.waste).filter((w) => w.reason === 'fridge').reduce((t, w) => t + w.cost, 0);
  if (fridgeCost >= 10 && !state.used.repair && allowed('repair'))
    out.push({ score: fridgeCost, text: `${money(fridgeCost)} of chilled stock warmed up in the broken cabinet. The engineer (${money(CONFIG.actions.repair.cost)}) restores the full shelf.` });

  // Breaks.
  const noBreak = state.staff.filter((s) => !s.isTemp && s.breaks === 0 && s.hoursWorked >= CONFIG.wellbeing.hoursBeforeBreakNeeded).map((s) => s.name);
  if (noBreak.length) out.push({ score: noBreak.length * 40, text: `${names(noBreak)} never had a break. Tired staff work slower, and it shows in wellbeing.` });

  // Idle labour while there were problems elsewhere.
  for (const r of reports) {
    const idle = r.staff.filter((s) => s.utilisation !== null && s.utilisation < 0.25);
    const trouble = r.customersAbandoned >= 2 || DEPTS.some((d) => r.dept[d].lostShelfGap >= 15);
    if (idle.length && trouble) {
      out.push({ score: 30, text: `${hourLabel(r.hour)}: ${names(idle.map((s) => s.name))} had little to do while there were queues or empty shelves elsewhere.` });
      break;
    }
  }

  return out
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((x) => x.text);
}
