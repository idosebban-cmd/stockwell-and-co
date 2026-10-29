/**
 * Turning simulation data into words. Previews are directional (they run the
 * hour on the visible forecast only); hour summaries use recorded results.
 */
import { CONFIG, DEPTS, deptName, hourLabel, type DeptId } from './config';
import { ASSIGNMENT_LABEL } from './roster';
import { deptUnits, expectedCustomers, money, onShift, runHour, shelfCapacity } from './engine';
import { total } from './stock';
import type { HourPlan, HourReport, SimState } from './types';

export type NoteKind = 'checkout' | 'shelfGap' | 'noStock' | 'staff' | 'idle' | 'waste' | 'dock' | 'event' | 'good' | 'money';

export interface Note {
  kind: NoteKind;
  level: 'warn' | 'info' | 'good';
  text: string;
}

const lower = (d: DeptId) => deptName(d).toLowerCase();

function listNames(names: string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

function countWord(n: number): string {
  return ['No one', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven'][n] ?? String(n);
}

/** Directional warnings before the player commits the hour. */
export function previewWarnings(state: SimState, plan: HourPlan): Note[] {
  const notes: Note[] = [];
  let report: HourReport;
  try {
    report = runHour(state, plan, { forecastOnly: true }).report;
  } catch (e) {
    return [{ kind: 'staff', level: 'warn', text: e instanceof Error ? e.message : 'This plan is not valid yet.' }];
  }
  const h = state.hour;
  const tills = Object.entries(plan.assignments).filter(([id, a]) => a === 'tills' && onShift(state).some((s) => s.id === id)).length;

  if (tills === 0) notes.push({ kind: 'checkout', level: 'warn', text: 'Nobody is on the tills. Customers will fill baskets and have nowhere to pay.' });
  else if (report.customersAbandoned > report.customersArrived * 0.02 || report.avgWait > CONFIG.checkout.patienceMinutes)
    notes.push({ kind: 'checkout', level: 'warn', text: 'Checkout capacity is likely to fall short. Expect long queues and some walk-outs.' });
  else if (report.avgWait > CONFIG.satisfaction.waitFreeMinutes + 0.5)
    notes.push({ kind: 'checkout', level: 'info', text: 'Queues may build at the tills; waits could start to annoy people.' });
  else if (tills > 1 && report.tillCapacity > report.customersArrived * 1.9)
    notes.push({ kind: 'idle', level: 'info', text: 'The tills look generously staffed for the expected footfall.' });

  for (const d of DEPTS) {
    const r = report.dept[d];
    if (r.wanted <= 0) continue;
    const u = deptUnits(state, d);
    if (r.lostShelfGap > r.wanted * 0.04) {
      const where = u.backroom < 1 && u.dock > 0 ? 'still on the dock' : 'in the stockroom';
      const peak = expectedCustomers(state, h) >= Math.max(...state.scenario.forecast) * 0.9;
      notes.push({
        kind: 'shelfGap',
        level: 'warn',
        text: `${deptName(d)} shelves may empty before ${peak ? 'the rush ends' : 'the hour is out'}, with stock ${where}.`,
      });
    }
    if (r.lostNoStock > r.wanted * 0.04)
      notes.push({ kind: 'noStock', level: 'warn', text: `${deptName(d)} may run out entirely: there isn't enough in the building to meet demand.` });
  }

  for (const s of report.staff) {
    if (s.utilisation !== null && s.utilisation < 0.3 && s.assignment !== 'tills') {
      let what = 'there is little on the dock to receive';
      if (s.assignment.startsWith('replenish:')) {
        const d = s.assignment.split(':')[1] as DeptId;
        const u = deptUnits(state, d);
        what = u.backroom < 1 && u.dock > 0 ? 'the stock is still on the dock; someone needs to receive it first' : u.backroom < 1 ? 'the stockroom is empty' : 'those shelves are already well stocked';
      } else if (DEPTS.some((d) => deptUnits(state, d).dock > 0)) what = 'the stockroom is too full to take the delivery';
      notes.push({ kind: 'idle', level: 'info', text: `${s.name} may have little to do: ${what}.` });
    }
  }

  const dock = DEPTS.reduce((t, d) => t + deptUnits(state, d).dock, 0);
  const receivers = Object.values(plan.assignments).filter((a) => a === 'receive').length;
  if (dock > 0 && receivers === 0)
    notes.push({
      kind: 'dock',
      level: 'warn',
      text: `About ${roundTo(dock, 10)} items are on the dock with no one receiving them${deptUnits(state, 'chilled').dock > 0 ? '; chilled stock there will warm up and spoil' : ''}.`,
    });

  const working = onShift(state).filter((s) => plan.assignments[s.id] !== 'break');
  const tired = working.filter((s) => s.energy < CONFIG.staff.tiredBelow);
  if (tired.length)
    notes.push({
      kind: 'staff',
      level: 'warn',
      text: `${countWord(tired.length)} employee${tired.length > 1 ? 's are' : ' is'} working at reduced capacity (${listNames(tired.map((s) => s.name))}).`,
    });
  const stretched = working.filter((s) => s.consecutive + 1 > CONFIG.wellbeing.hoursBeforeBreakNeeded);
  if (stretched.length)
    notes.push({
      kind: 'staff',
      level: 'warn',
      text: `${listNames(stretched.map((s) => s.name))} ${stretched.length > 1 ? 'have' : 'has'} gone ${CONFIG.wellbeing.hoursBeforeBreakNeeded} hours without a break; working on will hurt wellbeing.`,
    });
  const noBreak = onShift(state).filter((s) => !s.isTemp && s.breaks === 0 && plan.assignments[s.id] !== 'break');
  const hoursLeft = CONFIG.hours - h;
  if (h >= 3 && noBreak.length > 0 && noBreak.length >= hoursLeft * CONFIG.staff.limits.break - 2)
    notes.push({ kind: 'staff', level: 'warn', text: `${noBreak.length} people still need a break and the break room only fits ${CONFIG.staff.limits.break}. Time is running out.` });

  if (state.fridge.status === 'fault' && state.fridge.repairAtStep === null) {
    const onChilled = Object.values(plan.assignments).filter((a) => a === 'replenish:chilled').length;
    const stranded = Math.max(0, deptUnits(state, 'chilled').shelf - shelfCapacity(state, 'chilled'));
    notes.push({
      kind: 'event',
      level: 'warn',
      text:
        onChilled === 0 && stranded > 1
          ? 'The broken chiller is warming stock and nobody is on chilled to move it to the cold room.'
          : 'The broken chiller halves chilled shelf space until it is repaired.',
    });
  }

  if (h >= 4) {
    const shortDated = total(
      [...state.stock.chilled.shelf, ...state.stock.chilled.backroom, ...state.stock.chilled.dock].filter(
        (b) => b.expiresAt !== null && b.expiresAt <= CONFIG.hours,
      ),
    );
    let demand = 0;
    for (let k = h; k < CONFIG.hours; k++) demand += expectedCustomers(state, k) * CONFIG.departments.chilled.basket;
    if (shortDated > demand * 0.85)
      notes.push({
        kind: 'waste',
        level: 'info',
        text: `Around ${roundTo(Math.max(0, shortDated - demand * 0.85), 10)} short-dated chilled items may not sell before close. A markdown could shift some.`,
      });
  }

  for (const ev of state.scenario.events) {
    if (ev.kind === 'rush' && ev.warnAt <= h && ev.hour > h)
      notes.push({ kind: 'event', level: 'info', text: `A rush is expected from ${hourLabel(ev.hour)}. Full shelves and open tills before then will help.` });
  }

  if (notes.length === 0) notes.push({ kind: 'good', level: 'good', text: 'No obvious bottlenecks. Which is, historically, when something happens.' });
  return notes;
}

function roundTo(x: number, step: number): number {
  return Math.max(step, Math.round(x / step) * step);
}

/** What actually happened in an hour, from the recorded results. */
export function explainHour(report: HourReport): Note[] {
  const notes: Note[] = [];
  const arrived = Math.round(report.customersArrived);
  const served = Math.round(report.customersServed);
  const left = Math.round(report.customersAbandoned);
  notes.push({
    kind: 'money',
    level: 'info',
    text: `${arrived} customers came in and ${served} paid. Takings ${money(report.money.revenue)}; average wait about ${Math.max(1, Math.round(report.avgWait))} min.`,
  });

  if (report.customersAbandoned >= 0.5) {
    const itemsValue = DEPTS.reduce((t, d) => t + report.dept[d].abandonedItems * report.dept[d].price, 0);
    notes.push({
      kind: 'checkout',
      level: 'warn',
      text: `Checkout bottleneck: the queue reached ${Math.round(report.maxQueue)} and ${left} shopper${left === 1 ? '' : 's'} gave up, leaving about ${money(itemsValue)} of shopping in baskets (put back on the shelves).`,
    });
  }

  for (const d of DEPTS) {
    const r = report.dept[d];
    const mins = r.shelfEmptySteps * 10;
    if (r.lostShelfGap >= 5) {
      const where = r.backroomEnd < 1 && r.dockEnd > 0 ? 'stock was still waiting on the dock' : 'stock was sitting in the stockroom';
      notes.push({
        kind: 'shelfGap',
        level: 'warn',
        text: `Replenishment shortage: ${lower(d)} shelves were empty for about ${mins} min while ${where}. Around ${Math.round(r.lostShelfGap)} items went unsold (${money(r.lostShelfGap * r.price)} of sales).`,
      });
    }
    if (r.lostNoStock >= 5)
      notes.push({
        kind: 'noStock',
        level: 'warn',
        text: `Missing stock: ${lower(d)} ran out completely. Around ${Math.round(r.lostNoStock)} items wanted could not be sold (${money(r.lostNoStock * r.price)}).`,
      });
  }

  const idle = report.staff.filter((s) => s.utilisation !== null && s.utilisation < 0.3 && s.assignment !== 'tills');
  for (const s of idle) {
    let what = 'there was little on the dock';
    if (s.assignment === 'receive') {
      const blocked = DEPTS.some((d) => report.dept[d].dockEnd > 1);
      if (blocked) what = 'the stockroom was full, so the delivery had nowhere to go';
    } else if (s.assignment.startsWith('replenish:')) {
      const d = s.assignment.split(':')[1] as DeptId;
      const r = report.dept[d];
      what =
        r.backroomEnd < 1 && r.dockEnd > 1
          ? `the stockroom was empty and ${Math.round(r.dockEnd)} items were still on the dock, unreceived`
          : r.backroomEnd < 1
            ? 'the stockroom had run out'
            : 'the shelves were already full';
    }
    notes.push({ kind: 'idle', level: s.assignment === 'receive' ? 'info' : 'warn', text: `${s.name} (${ASSIGNMENT_LABEL[s.assignment].toLowerCase()}) had little to do: ${what}.` });
  }
  const slow = report.staff.filter((s) => s.assignment !== 'break' && s.productivity < 0.9 && s.id !== 'temp');
  if (slow.length)
    notes.push({ kind: 'staff', level: 'warn', text: `${listNames(slow.map((s) => s.name))} worked noticeably slower through tiredness.` });
  const rested = report.staff.filter((s) => s.assignment === 'break');
  if (rested.length) notes.push({ kind: 'staff', level: 'good', text: `${listNames(rested.map((s) => s.name))} had a break and came back with more energy.` });

  const wasteBy: Record<string, number> = {};
  for (const w of report.waste) wasteBy[w.reason] = (wasteBy[w.reason] ?? 0) + w.cost;
  const reasonText: Record<string, string> = {
    expired: 'went past its date',
    shrink: 'was bruised on display',
    dock: 'spoiled waiting on the dock',
    abandoned: 'was left warm in abandoned baskets',
    fridge: 'warmed up in the broken chiller',
  };
  for (const [reason, cost] of Object.entries(wasteBy)) {
    if (cost >= 3) notes.push({ kind: 'waste', level: cost >= 15 ? 'warn' : 'info', text: `Waste: ${money(cost)} of stock ${reasonText[reason]}.` });
  }

  const issues = notes.filter((n) => n.level === 'warn').length;
  if (issues === 0) notes.push({ kind: 'good', level: 'good', text: 'A tidy hour. Nobody complained, which in this town is practically a standing ovation.' });
  return notes;
}
