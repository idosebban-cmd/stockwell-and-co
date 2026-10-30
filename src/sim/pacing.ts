/**
 * Pacing: how often something worth reacting to happens, and how often there
 * are more jobs than people. Used by the dev counter in the UI and by
 * `npm run pacing`. At 1x an in-game hour is one real minute.
 */
import { CONFIG, DEPTS } from './config';
import { burstAtDoor } from './floor';
import { stepOf, type Live } from './live';
import { deptUnits, expectedCustomers, onShift } from './engine';
import type { SimState } from './types';

export type PromptKind = 'burst' | 'task' | 'event' | 'shelf' | 'queue' | 'dock';

export interface PacingWatch {
  /** What was showing last minute, to count only new prompts. */
  seen: Set<string>;
  /** Conditions showing last minute (they count again once cleared). */
  showing: Set<string>;
  counts: Record<PromptKind, number>;
  minutes: number;
  /** Minutes in which there were more jobs wanting a person than people free to do them. */
  stretched: number;
}

export function newWatch(): PacingWatch {
  return { seen: new Set(), showing: new Set(), counts: { burst: 0, task: 0, event: 0, shelf: 0, queue: 0, dock: 0 }, minutes: 0, stretched: 0 };
}

/** The prompts showing now. Conditions (a low shelf, a queue, stock on the dock) count again only after they have cleared. */
export function promptsNow(state: SimState): { key: string; kind: PromptKind }[] {
  const out: { key: string; kind: PromptKind }[] = [];
  const now = stepOf(state);
  const door = burstAtDoor(state.floor, now);
  if (door) out.push({ key: door.burst.id, kind: 'burst' });
  for (const t of state.floor?.tasks ?? []) if (t.kind !== 'errand') out.push({ key: t.id, kind: 'task' });
  if (state.floor?.pending) out.push({ key: state.floor.pending.id, kind: 'event' });
  for (const d of DEPTS) {
    if (!state.ctx.depts.includes(d)) continue;
    const u = deptUnits(state, d);
    if (u.shelf < state.ctx.shelfCap[d] * 0.25 && u.backroom > 0) out.push({ key: `shelf-${d}`, kind: 'shelf' });
  }
  if (state.queue.customers > 4) out.push({ key: 'queue', kind: 'queue' });
  if (DEPTS.some((d) => deptUnits(state, d).dock > 0)) out.push({ key: 'dock', kind: 'dock' });
  return out;
}

/** Jobs that want a person right now (tills for the expected flow, low shelves, the dock, floor jobs, tired people). */
export function jobsWanted(state: SimState): number {
  const tills = Math.max(1, Math.ceil(expectedCustomers(state) / CONFIG.checkout.customersPerHour));
  let n = Math.min(state.ctx.tills, tills + (burstAtDoor(state.floor, stepOf(state)) ? 1 : 0));
  for (const d of DEPTS) if (state.ctx.depts.includes(d) && deptUnits(state, d).shelf < state.ctx.shelfCap[d] * 0.7 && deptUnits(state, d).backroom > 0) n += 1;
  if (DEPTS.some((d) => deptUnits(state, d).dock > 0)) n += 1;
  n += state.floor?.tasks.filter((t) => t.kind !== 'errand').length ?? 0;
  n += onShift(state).filter((s) => s.energy < CONFIG.staff.tiredBelow).length > 0 ? 1 : 0;
  return n;
}

/** Records one minute. Returns the new prompts that appeared. */
export function watchMinute(w: PacingWatch, live: Live): PromptKind[] {
  const fresh: PromptKind[] = [];
  const now = promptsNow(live.state);
  const conditions = new Set<string>();
  for (const p of now) {
    const condition = p.kind === 'shelf' || p.kind === 'queue' || p.kind === 'dock';
    const isNew = condition ? !w.showing.has(p.key) : !w.seen.has(p.key);
    if (condition) conditions.add(p.key);
    else w.seen.add(p.key);
    if (isNew) {
      w.counts[p.kind] += 1;
      fresh.push(p.kind);
    }
  }
  w.showing = conditions;
  w.minutes += 1;
  if (jobsWanted(live.state) > onShift(live.state).length) w.stretched += 1;
  return fresh;
}
