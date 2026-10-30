/**
 * Problems shown as speech bubbles in the shop, each one something the
 * player can fix by moving someone (design rule 6). Pure, so tests can check
 * them. Floor jobs and the burst at the door draw their own bubbles.
 */
import { CONFIG, type DeptId } from '../sim/config';
import { onShift } from '../sim/engine';
import * as S from '../sim/stock';
import type { HourPlan, SimState } from '../sim/types';
import type { Layout } from './art/Shop';

export interface ShopBubble {
  id: string;
  /** Where the bubble's tail points (viewBox units). */
  x: number;
  y: number;
  text: string;
  tone: 'bad' | 'warn';
}

const EMPTY_WORD: Record<DeptId, string> = { produce: 'No apples!', chilled: 'No milk!', ambient: 'No tins!' };

/** The queue is long and a till stands closed: open it. */
export function queueTooLong(state: SimState, plan: HourPlan): boolean {
  const open = Object.values(plan.assignments).filter((a) => a === 'tills').length;
  return open < state.ctx.tills && state.queue.customers > CONFIG.live.auto.busyQueuePerTill * Math.max(1, open);
}

/** An empty shelf with stock behind it and nobody filling it: send someone. */
export function emptyShelves(state: SimState, plan: HourPlan): DeptId[] {
  const working = new Set(onShift(state).map((s) => plan.assignments[s.id]));
  return state.ctx.depts.filter(
    (d) => S.total(state.stock[d].shelf) < state.ctx.shelfCap[d] * 0.03 && S.total(state.stock[d].backroom) >= 1 && !working.has(`replenish:${d}` as HourPlan['assignments'][string]),
  );
}

export function shopBubbles(state: SimState, plan: HourPlan, L: Layout): ShopBubble[] {
  if (state.hour >= state.ctx.hours) return [];
  const out: ShopBubble[] = [];
  if (queueTooLong(state, plan)) out.push({ id: 'queue', x: L.queueFrontX - 60, y: L.laneY[0] + 4, text: 'Queue!', tone: 'bad' });
  for (const d of emptyShelves(state, plan)) {
    const [x, y] = L.noticeAt[d];
    out.push({ id: `empty-${d}`, x, y: y + 18, text: EMPTY_WORD[d], tone: 'bad' });
  }
  return out;
}
