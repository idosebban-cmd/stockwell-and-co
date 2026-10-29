/**
 * Player-facing analysis built on the simulation rules: what a job would
 * achieve, an outlook for the next interval, price comparisons, the problems
 * worth acting on, and the outcomes of the interval just played.
 *
 * Every estimate here runs the real engine on the visible forecast only
 * (no hidden variation, no unannounced events), so it is an estimate, never
 * a promise. Outcomes read recorded results only.
 */
import { CONFIG, DEPTS, PRICE_TIERS, deptName, hourLabel, type DeptId, type PriceTier } from './config';
import {
  actionKey,
  assignmentLimit,
  baseJobRate,
  deptUnits,
  jobRate,
  markdownActive,
  money,
  onShift,
  priceFor,
  productivity,
  promotionActive,
  runSteps,
  shelfCapacity,
  shortDatedUnits,
} from './engine';
import { ASSIGNMENT_LABEL } from './roster';
import { total, value } from './stock';
import type { ActionRequest, AssignmentId, HourPlan, HourReport, SimState } from './types';

const C = CONFIG;
const STEPS = C.stepsPerHour;

export type Zone = 'produce' | 'chilled' | 'ambient' | 'tills' | 'dock' | 'break';

export const JOB_ZONE: Record<AssignmentId, Zone> = {
  tills: 'tills',
  'replenish:produce': 'produce',
  'replenish:chilled': 'chilled',
  'replenish:ambient': 'ambient',
  receive: 'dock',
  break: 'break',
};

export function remainingSteps(state: SimState): number {
  return STEPS - (state.step ?? 0);
}

/** Runs the engine on the visible forecast for the coming interval. */
export function previewReport(state: SimState, plan: HourPlan, steps = remainingSteps(state)): HourReport | null {
  try {
    return runSteps(state, plan, steps, { forecastOnly: true }).report;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// What a person would achieve in a job
// ---------------------------------------------------------------------------

export interface JobPreview {
  job: AssignmentId;
  /** e.g. "~34 customers/h" or "+40 energy". */
  yield: string;
  /** Why the job would achieve nothing right now, if so. */
  blocked: string | null;
  full: boolean;
}

export function jobPreview(state: SimState, plan: HourPlan, staffId: string, job: AssignmentId): JobPreview {
  const s = state.staff.find((x) => x.id === staffId)!;
  const others = Object.entries(plan.assignments).filter(([id, a]) => a === job && id !== staffId).length;
  const full = others >= assignmentLimit(job);
  const rate = baseJobRate(job) * jobRate(s, job);
  let y = '';
  let blocked: string | null = null;
  if (job === 'break') {
    y = `+${C.staff.energy.break} energy/h`;
    if (s.energy >= 100) blocked = 'Already fully rested';
  } else if (job === 'tills') {
    y = `~${Math.round(rate)} customers/h`;
  } else if (job === 'receive') {
    y = `~${Math.round(rate)} items/h`;
    const dock = DEPTS.filter((d) => deptUnits(state, d).dock > 0);
    if (!dock.length) blocked = 'Nothing on the dock to unload';
    else if (dock.every((d) => deptUnits(state, d).backroom >= C.departments[d].backroomCapacity - 1)) blocked = 'Stockroom full: fill shelves first';
  } else {
    const d = job.split(':')[1] as DeptId;
    const u = deptUnits(state, d);
    y = `~${Math.round(rate)} items/h`;
    const overCap = d === 'chilled' && state.fridge.status === 'fault' && u.shelf > shelfCapacity(state, d);
    if (overCap) y = `rescues stock, then ~${Math.round(rate)}/h`;
    else if (u.backroom < 1) blocked = u.dock > 0 ? 'No stock in the stockroom: unload the dock first' : 'No stock available to replenish';
    else if (u.shelf >= shelfCapacity(state, d) - 1) blocked = 'Shelves already full';
  }
  return { job, yield: y, blocked, full };
}

// ---------------------------------------------------------------------------
// Outlook for the coming interval
// ---------------------------------------------------------------------------

export type Status = 'ok' | 'tight' | 'short';

export interface OutlookRow {
  zone: Zone;
  label: string;
  /** Demand or work waiting (customers or items). */
  need: number;
  /** What the shop can do about it with this plan. */
  can: number;
  status: Status;
  /** Compact comparison, e.g. "Wanted ~140 · on shelf + filling ~120". */
  text: string;
}

export interface Outlook {
  steps: number;
  rows: OutlookRow[];
  tired: { id: string; name: string; productivity: number }[];
}

export function outlook(state: SimState, plan: HourPlan, steps = remainingSteps(state)): Outlook | null {
  const r = previewReport(state, plan, steps);
  if (!r) return null;
  const share = steps / STEPS;
  const rows: OutlookRow[] = [];
  const queue = state.queue.customers;
  const demand = queue + r.customersArrived;
  const cap = r.tillCapacity * share;
  rows.push({
    zone: 'tills',
    label: 'Tills',
    need: demand,
    can: cap,
    status: r.customersAbandoned >= 1 ? 'short' : cap < demand ? 'tight' : 'ok',
    text: `Customers ~${Math.round(demand)} · can serve ~${Math.round(cap)}`,
  });
  for (const d of DEPTS) {
    const x = r.dept[d];
    const short = x.lostShelfGap + x.lostNoStock;
    rows.push({
      zone: d,
      label: deptName(d),
      need: x.wanted,
      can: x.picked,
      status: short > Math.max(4, x.wanted * 0.05) ? 'short' : x.shelfEnd < shelfCapacity(state, d) * 0.15 ? 'tight' : 'ok',
      text: `Wanted ~${Math.round(x.wanted)} · on the shelf ~${Math.round(x.picked)}`,
    });
  }
  const dock = DEPTS.reduce((t, d) => t + deptUnits(state, d).dock, 0);
  if (dock > 0) {
    const unloaded = DEPTS.reduce((t, d) => t + r.dept[d].received, 0);
    rows.push({
      zone: 'dock',
      label: 'Dock',
      need: dock,
      can: unloaded,
      status: unloaded < 1 ? 'short' : unloaded < dock - 1 ? 'tight' : 'ok',
      text: `Waiting ${Math.round(dock)} · unloaded ~${Math.round(unloaded)}`,
    });
  }
  const tired = onShift(state)
    .filter((s) => plan.assignments[s.id] !== 'break' && productivity(s.energy) < 1)
    .map((s) => ({ id: s.id, name: s.name, productivity: productivity(s.energy) }));
  return { steps, rows, tired };
}

/** Differences between two outlooks, for showing what a reassignment changed. */
export function outlookChanges(before: Outlook | null, after: Outlook | null): Partial<Record<Zone, number>> {
  const out: Partial<Record<Zone, number>> = {};
  if (!before || !after) return out;
  for (const row of after.rows) {
    const prev = before.rows.find((x) => x.zone === row.zone);
    if (!prev) continue;
    const delta = row.can - prev.can;
    if (Math.abs(delta) >= 1) out[row.zone] = delta;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Price comparison
// ---------------------------------------------------------------------------

export interface PriceOption {
  tier: PriceTier;
  price: number;
  margin: number;
  wanted: number;
  sold: number;
  revenue: number;
  grossProfit: number;
  /** Cost of this department's stock written off during the estimate (incl. binning at close). */
  waste: number;
  leftover: number;
  shortDatedLeft: number;
  satisfaction: number;
  unmet: number;
  walkouts: number;
}

export function priceOptions(state: SimState, plan: HourPlan, d: DeptId, steps = remainingSteps(state)): PriceOption[] {
  const stock = [...state.stock[d].shelf, ...state.stock[d].backroom];
  const avgCost = total(stock) > 0 ? value(stock) / total(stock) : C.departments[d].unitCost;
  return PRICE_TIERS.map((tier) => {
    const p = { ...plan, pricing: { ...plan.pricing, [d]: tier } };
    const after = (() => {
      try {
        return runSteps(state, p, steps, { forecastOnly: true });
      } catch {
        return null;
      }
    })();
    const x = after?.report.dept[d];
    const price = priceFor(state, d, state.hour, tier);
    const left = after ? deptUnits(after.state, d) : { shelf: 0, backroom: 0, dock: 0 };
    return {
      tier,
      price,
      margin: price - avgCost,
      wanted: x?.wanted ?? 0,
      sold: x?.sold ?? 0,
      revenue: x?.revenue ?? 0,
      grossProfit: x ? x.revenue - x.cogs : 0,
      waste: after ? after.report.waste.filter((w) => w.dept === d).reduce((t, w) => t + w.cost, 0) : 0,
      leftover: left.shelf + left.backroom + left.dock,
      shortDatedLeft: after ? shortDatedUnits(after.state, d) : 0,
      satisfaction: C.pricing[tier].satisfaction,
      unmet: x ? x.lostShelfGap + x.lostNoStock : 0,
      walkouts: after?.report.customersAbandoned ?? 0,
    };
  });
}

/** True when every price is expected to sell (almost) the same number of items. */
export function allSellOut(opts: PriceOption[]): boolean {
  const sold = opts.map((o) => o.sold);
  const lo = Math.min(...sold);
  return lo > 0 && Math.max(...sold) - lo <= Math.max(2, lo * 0.03) && opts.every((o) => o.unmet > 1);
}

/**
 * One short trade-off for the selected option, from the estimate's own figures
 * compared with the regular price. Never says which price is best.
 */
export function priceTradeOff(_state: SimState, opts: PriceOption[], tier: PriceTier, _d: DeptId): string {
  const o = opts.find((x) => x.tier === tier)!;
  const reg = opts.find((x) => x.tier === 'regular')!;
  const name = C.pricing[tier].label;
  if (allSellOut(opts)) return `All prices are expected to sell out; ${name} ${tier === 'low' ? 'earns less' : tier === 'high' ? 'earns more' : 'earns the regular margin'} per item.`;
  if (tier === 'regular') return 'The usual price and margin.';
  const items = Math.round(o.sold - reg.sold);
  const net = o.grossProfit - o.waste - (reg.grossProfit - reg.waste);
  const parts = [`${Math.abs(items)} ${items >= 0 ? 'more' : 'fewer'} sold than at the regular price`];
  const wasteDiff = o.waste - reg.waste;
  if (Math.abs(wasteDiff) >= 1) parts.push(`£${Math.round(Math.abs(wasteDiff))} ${wasteDiff < 0 ? 'less' : 'more'} binned`);
  if (o.walkouts - reg.walkouts >= 1) parts.push(`${Math.round(o.walkouts - reg.walkouts)} more walk-outs`);
  parts.push(`gross profit after waste ${net >= 0 ? '+' : '−'}£${Math.round(Math.abs(net))}`);
  return parts.join('; ') + '.';
}

/** Running markdowns or promotions that change the comparison. */
export function priceModifiers(state: SimState, plan: HourPlan, d: DeptId): string[] {
  const out: string[] = [];
  const has = (a: ActionRequest) => plan.actions.some((x) => actionKey(x) === actionKey(a));
  if (markdownActive(state, d) || has({ kind: 'markdown', dept: d })) out.push('Markdown: short-dated items sell at the sticker price');
  if (promotionActive(state, d) || has({ kind: 'promotion', dept: d })) out.push(`Promotion: +${Math.round((C.actions.promotion.demandMult - 1) * 100)}% demand`);
  return out;
}

// ---------------------------------------------------------------------------
// Problems worth acting on
// ---------------------------------------------------------------------------

export interface Problem {
  zone: Zone;
  level: 'urgent' | 'warn';
  title: string;
}

export function problems(state: SimState, plan: HourPlan, look: Outlook | null = outlook(state, plan)): Problem[] {
  const out: Problem[] = [];
  if (state.fridge.status === 'fault') {
    out.push({ zone: 'chilled', level: 'urgent', title: state.fridge.repairAtStep !== null || plan.actions.some((a) => a.kind === 'repair') ? 'Chiller fault · engineer booked' : 'Chiller fault' });
  }
  const dock = DEPTS.reduce((t, d) => t + deptUnits(state, d).dock, 0);
  if (dock > 0) out.push({ zone: 'dock', level: Object.values(plan.assignments).includes('receive') ? 'warn' : 'urgent', title: `${Math.round(dock)} items to unload` });
  for (const row of look?.rows ?? []) {
    if (row.zone === 'dock') continue;
    if (row.status === 'short') out.push({ zone: row.zone, level: 'warn', title: row.zone === 'tills' ? 'Queue likely to overflow' : `${row.label} likely to run short` });
  }
  if (look?.tired.length) out.push({ zone: 'break', level: 'warn', title: `Tired: ${look.tired.map((t) => t.name).join(', ')}` });
  return out;
}

/** Facts for the chiller fault decision card, straight from the engine's rules. */
export function fridgeFacts(state: SimState, plan: HourPlan) {
  const u = deptUnits(state, 'chilled');
  const cap = shelfCapacity(state, 'chilled');
  const atRisk = Math.max(0, u.shelf - cap);
  const space = Math.max(0, C.departments.chilled.backroomCapacity - u.backroom);
  const movers = onShift(state).filter((s) => plan.assignments[s.id] === 'replenish:chilled');
  const moveRate = movers.reduce((t, s) => t + C.departments.chilled.replenishRate * jobRate(s, 'replenish:chilled'), 0);
  const booked = state.fridge.repairAtStep !== null || plan.actions.some((a) => a.kind === 'repair');
  const arrivalStep = state.fridge.repairAtStep ?? state.hour * STEPS + (state.step ?? 0) + C.actions.repair.arrivalSteps;
  const at = `${hourLabel(Math.floor(arrivalStep / STEPS)).slice(0, 2)}:${String((arrivalStep % STEPS) * 10).padStart(2, '0')}`;
  return {
    atRisk,
    atRiskValue: atRisk * C.departments.chilled.unitCost,
    spoilPerHour: Math.round(C.events.fridgeFault.spoilPerHour * 100),
    capacity: cap,
    fullCapacity: C.departments.chilled.shelfCapacity,
    coldRoomSpace: space,
    movers: movers.map((s) => s.name),
    moveRate,
    booked,
    engineerAt: at,
    cost: C.actions.repair.cost,
  };
}

// ---------------------------------------------------------------------------
// What happened in the interval just played
// ---------------------------------------------------------------------------

export interface Outcome {
  zone: Zone;
  tone: 'good' | 'bad';
  /** Beside the affected object, e.g. "Unloaded 290". */
  tag: string;
  /** One line for the summary, from recorded results. */
  text: string;
  weight: number;
}

export function intervalOutcomes(report: HourReport): Outcome[] {
  const out: Outcome[] = [];
  const mins = (report.toStep - report.fromStep) * 10;
  const received = DEPTS.reduce((t, d) => t + report.dept[d].received, 0);
  if (received >= 1)
    out.push({ zone: 'dock', tone: 'good', tag: `Unloaded ${Math.round(received)}`, text: `${Math.round(received)} items moved from the dock into the stockroom.`, weight: received / 10 });
  for (const d of DEPTS) {
    const x = report.dept[d];
    if (x.rescued >= 1)
      out.push({
        zone: d,
        tone: 'good',
        tag: `${Math.round(x.rescued)} rescued`,
        text: `${Math.round(x.rescued)} ${deptName(d).toLowerCase()} items moved off the broken chiller into the cold room.`,
        weight: x.rescued / 8,
      });
    if (x.replenished >= 1)
      out.push({
        zone: d,
        tone: 'good',
        tag: `+${Math.round(x.replenished)} on shelf`,
        text: `${Math.round(x.replenished)} ${deptName(d).toLowerCase()} items went from the stockroom onto the shelves${x.shelfEnd >= x.shelfStart ? ` (shelf ${Math.round(x.shelfStart)} → ${Math.round(x.shelfEnd)})` : `; shoppers took more, so the shelf went ${Math.round(x.shelfStart)} → ${Math.round(x.shelfEnd)}`}.`,
        weight: x.replenished / 12,
      });
    const missed = x.lostShelfGap + x.lostNoStock;
    if (missed >= 3)
      out.push({
        zone: d,
        tone: 'bad',
        tag: `${Math.round(missed)} not found`,
        text: `${Math.round(missed)} ${deptName(d).toLowerCase()} items wanted weren’t on the shelf${x.lostShelfGap >= x.lostNoStock ? ' (stock was out the back)' : ' (none left anywhere)'}.`,
        weight: missed / 3,
      });
  }
  const served = Math.round(report.customersServed);
  const lost = Math.round(report.customersAbandoned);
  out.push({
    zone: 'tills',
    tone: lost >= 1 ? 'bad' : 'good',
    tag: lost >= 1 ? `Served ${served} · ${lost} left` : `Served ${served}`,
    text: lost >= 1 ? `Served ${served} customers in ${mins} minutes; ${lost} gave up queueing.` : `Served ${served} customers in ${mins} minutes; nobody gave up.`,
    weight: lost >= 1 ? 20 + lost * 3 : served / 4,
  });
  const rested = report.staff.filter((s) => s.assignment === 'break' && s.energyAfter > s.energyBefore + 0.5);
  if (rested.length)
    out.push({
      zone: 'break',
      tone: 'good',
      tag: `Energy +${Math.round(rested[0].energyAfter - rested[0].energyBefore)}`,
      text: rested.map((s) => `${s.name}’s energy ${Math.round(s.energyBefore)} → ${Math.round(s.energyAfter)}`).join('; ') + '.',
      weight: 8,
    });
  const spoiled = report.waste.reduce((t, w) => t + w.qty, 0);
  const spoiledCost = report.waste.reduce((t, w) => t + w.cost, 0);
  if (spoiled >= 1) {
    const worst = [...report.waste].sort((a, b) => b.cost - a.cost)[0];
    const zone: Zone = worst.reason === 'dock' ? 'dock' : worst.dept;
    out.push({ zone, tone: 'bad', tag: `Spoiled ${Math.round(spoiled)}`, text: `${Math.round(spoiled)} items spoiled or expired (${money(spoiledCost)} written off).`, weight: spoiledCost / 2 });
  }
  return out.sort((a, b) => b.weight - a.weight);
}

export function jobLabel(a: AssignmentId): string {
  return ASSIGNMENT_LABEL[a];
}
