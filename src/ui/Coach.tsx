/**
 * The short labels the shop shows next to the dock and departments when
 * something becomes relevant.
 */
import { CONFIG, hourLabel } from '../sim/config';
import { deptUnits, onShift, shortDatedUnits } from '../sim/engine';
import { total } from '../sim/stock';
import type { HourPlan, SimState } from '../sim/types';
import type { ShopNotice } from './Store';

/** Labels attached to places in the shop, shown only when they matter. */
export function shopNotices(state: SimState, plan: HourPlan | null): ShopNotice[] {
  const h = state.hour;
  const out: ShopNotice[] = [];
  if (h >= CONFIG.hours) return out;
  const due = new Map<string, number>();
  for (const del of state.deliveries) {
    if (del.arrivesAt - h > 1) continue;
    const k = `${del.kind === 'emergency' ? 'Emergency order' : 'Delivery'}: ${hourLabel(del.arrivesAt)}`;
    due.set(k, (due.get(k) ?? 0) + del.qty);
  }
  for (const [k, qty] of due) out.push({ zone: 'dock', text: `${k} · ${Math.round(qty).toLocaleString('en-GB')} items`, tone: 'info' });
  const dock = total([...state.stock.produce.dock, ...state.stock.chilled.dock, ...state.stock.ambient.dock]);
  const receivers = plan ? Object.values(plan.assignments).filter((a) => a === 'receive').length : 1;
  if (dock > 0 && receivers === 0) out.push({ zone: 'dock', text: 'Nobody receiving', tone: 'warn' });
  if (state.stock.chilled.dock.length && deptUnits(state, 'chilled').dock > 0) out.push({ zone: 'dock', text: 'Chilled spoiling here', tone: 'warn' });

  const friday = total([...state.stock.produce.shelf, ...state.stock.produce.backroom].filter((b) => b.label === "Friday's produce"));
  if (h >= 2 && h < 4 && friday >= 1) out.push({ zone: 'produce', text: `Expires 13:00: ${Math.round(friday)}`, tone: h === 3 ? 'warn' : 'info' });
  const short = shortDatedUnits(state, 'chilled');
  if (h >= 5 && short >= 1) out.push({ zone: 'chilled', text: `Expires tonight: ${Math.round(short)}`, tone: h >= 6 ? 'warn' : 'info' });

  const tired = onShift(state).filter((s) => !s.isTemp && s.consecutive >= CONFIG.wellbeing.hoursBeforeBreakNeeded - 1 && plan?.assignments[s.id] !== 'break');
  if (tired.length) out.push({ zone: 'break', text: `Due a break: ${tired.map((s) => s.name).slice(0, 3).join(', ')}${tired.length > 3 ? '…' : ''}`, tone: 'warn' });
  return out;
}
