/**
 * Ordering during the day: how long each department's stock will last at
 * today's forecast, what is already on its way, what to top up and what each
 * way of ordering costs. Estimates use the visible forecast (not the hidden
 * variation or the bursts), so they are labelled as such in the UI.
 */
import { CONFIG, type DeptId } from './config';
import { clockLabel, deptUnits, describeAction, expectedCustomers, footfallMultiplier, nextDeliveryAt, orderQty, tierDemand, tripMultiplier, type ActionInfo } from './engine';
import type { ActionRequest, SimState } from './types';

const C = CONFIG;
const STEPS = C.stepsPerHour;

export type OrderOption = 'emergency' | 'cashAndCarry' | 'nextDelivery';

export interface Incoming {
  qty: number;
  /** Step since opening, or tomorrow morning. */
  at: number | 'tomorrow';
  /** "+60 arriving 11:20" */
  label: string;
}

export interface StockOutlook {
  dept: DeptId;
  shelf: number;
  stockroom: number;
  dock: number;
  incoming: Incoming[];
  /** Step at which it runs out at the forecast rate, or null if it lasts until closing. */
  runsOutAt: number | null;
  /** Items wanted from now until closing at the forecast. */
  wantedToClose: number;
  /** Wanted until closing, less everything in the shop and on its way today. */
  shortfall: number;
}

function now(state: SimState): number {
  return state.hour * STEPS + (state.step ?? 0);
}

/** Items wanted per minute in hour `h` at today's prices and the visible forecast. */
export function wantedPerMinute(state: SimState, d: DeptId, h: number): number {
  if (!state.ctx.depts.includes(d) || h >= state.ctx.hours) return 0;
  const perCustomer = C.departments[d].basket * state.ctx.range[d] * tierDemand(d, state.pricing[d]) * tripMultiplier(state.pricing, d);
  return (expectedCustomers(state, h) * footfallMultiplier(state) * perCustomer) / STEPS;
}

export function incomingFor(state: SimState, d: DeptId): Incoming[] {
  const out: Incoming[] = [];
  for (const x of state.deliveries) {
    if (x.dept !== d) continue;
    const at = x.arrivesAtStep ?? x.arrivesAt * STEPS;
    out.push({ qty: x.qty, at, label: `+${Math.round(x.qty)} arriving ${clockLabel(Math.floor(at / STEPS), at % STEPS)}` });
  }
  for (const t of state.floor?.tasks ?? []) {
    if (t.kind !== 'errand' || !t.brings || t.brings.dept !== d) continue;
    const at = now(state) + Math.max(0, Math.ceil(t.work - t.progress));
    out.push({ qty: t.brings.qty, at, label: `+${t.brings.qty} arriving ${clockLabel(Math.floor(at / STEPS), at % STEPS)}` });
  }
  const tomorrow = (state.tomorrow ?? []).filter((o) => o.dept === d).reduce((s, o) => s + o.qty, 0);
  if (tomorrow > 0) out.push({ qty: tomorrow, at: 'tomorrow', label: `+${tomorrow} tomorrow morning` });
  return out.sort((a, b) => (a.at === 'tomorrow' ? 1 : b.at === 'tomorrow' ? -1 : a.at - b.at));
}

export function stockOutlook(state: SimState, d: DeptId): StockOutlook {
  const u = deptUnits(state, d);
  const incoming = incomingFor(state, d);
  const end = state.ctx.hours * STEPS;
  let stock = u.shelf + u.backroom + u.dock;
  let wanted = 0;
  let runsOutAt: number | null = null;
  for (let m = now(state); m < end; m++) {
    for (const x of incoming) if (x.at === m) stock += x.qty;
    const w = wantedPerMinute(state, d, Math.floor(m / STEPS));
    wanted += w;
    stock -= w;
    if (runsOutAt === null && stock <= 0 && w > 0) runsOutAt = m;
  }
  const today = incoming.reduce((s, x) => s + (x.at === 'tomorrow' ? 0 : x.qty), 0);
  return { dept: d, shelf: u.shelf, stockroom: u.backroom, dock: u.dock, incoming, runsOutAt, wantedToClose: wanted, shortfall: Math.max(0, wanted - (u.shelf + u.backroom + u.dock + today)) };
}

/** The action for an order. */
export function orderAction(option: OrderOption, d: DeptId, qty: number, staffId?: string): ActionRequest {
  if (option === 'cashAndCarry') return { kind: 'cashAndCarry', dept: d, staffId: staffId ?? '', qty };
  if (option === 'nextDelivery') return { kind: 'nextDelivery', dept: d, qty };
  return { kind: 'emergency', dept: d, qty };
}

export function orderStep(option: OrderOption): number {
  return C.actions[option].step;
}

export function orderMax(option: OrderOption): number {
  return C.actions[option].maxQty;
}

/** "Top up until closing": the shortfall plus a tenth for bursts, in the option's steps and within its limit (0 when it already lasts). */
export function suggestedQty(state: SimState, d: DeptId, option: OrderOption): number {
  const o = stockOutlook(state, d);
  if (o.shortfall <= 0) return 0;
  const step = orderStep(option);
  return Math.min(orderMax(option), Math.ceil((o.shortfall * 1.1) / step) * step);
}

export interface Quote {
  action: ActionRequest;
  info: ActionInfo;
  qty: number;
  unitPrice: number;
  cost: number;
  cashAfter: number;
  /** "~11:20", "with the lorry at 12:00", "tomorrow morning" */
  arrives: string;
}

export function quote(state: SimState, d: DeptId, option: OrderOption, qty: number, staffId?: string): Quote {
  const action = orderAction(option, d, qty, staffId);
  const info = describeAction(state, action);
  const q = orderQty(action);
  const t = now(state);
  let arrives = '';
  if (option === 'emergency') {
    const at = t + C.actions.emergency.arrivalMinutes;
    arrives = `~${clockLabel(Math.floor(at / STEPS), at % STEPS)} on the dock`;
  } else if (option === 'cashAndCarry') {
    const at = t + C.actions.cashAndCarry.minutes;
    arrives = `~${clockLabel(Math.floor(at / STEPS), at % STEPS)} in the stockroom`;
  } else {
    const at = nextDeliveryAt(state);
    arrives = at === 'tomorrow' ? 'tomorrow morning, on the dock' : at === null ? 'no more deliveries today' : `with the lorry at ${clockLabel(Math.floor(at / STEPS))}`;
  }
  return { action, info, qty: q, unitPrice: q > 0 ? (info.cost - (option === 'emergency' ? C.actions.emergency.deliveryFee : 0)) / q : 0, cost: info.cost, cashAfter: state.cash - info.cost, arrives };
}
