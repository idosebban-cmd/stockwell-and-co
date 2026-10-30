/**
 * Life on the shop floor: seeded bursts of shoppers, small floor jobs and
 * the questions that pause the day. Everything is scheduled when the day
 * opens from the seed and the day's forecast, so a day replays exactly.
 * The engine spawns and works the jobs and adds the bursts' shoppers; the
 * live layer raises the questions and applies the answers.
 */
import { CONFIG, type DeptId, type TaskPlace } from './config';
import { mulberry32 } from './rng';
import type { Burst, DayContext, Floor, FloorEventKind, FloorTask, TaskKind } from './types';

const F = CONFIG.floor;
const STEPS = CONFIG.stepsPerHour;

export function emptyFloor(): Floor {
  return { bursts: [], schedule: [], tasks: [], events: [], pending: null, mood: [], counts: { resolved: 0, expired: 0, answered: 0 } };
}

/** Spots per place where a job can appear (indices into the shop drawing's spots). */
export const TASK_SPOTS: Record<TaskPlace, number> = { produce: 3, chilled: 3, ambient: 3, tills: 2, entrance: 1 };

function burstKind(clockHour: number, weekday: number, r: number): Burst['kind'] {
  if (weekday === 0 && clockHour >= 10 && clockHour < 12 && r < 0.7) return 'church';
  if (clockHour >= 15 && clockHour < 17 && weekday >= 1 && weekday <= 5 && r < 0.6) return 'school';
  if (clockHour >= 12 && clockHour < 14 && r < 0.5) return 'lunch';
  return r < 0.85 ? 'bus' : 'coach';
}

export const BURST_TEXT: Record<Burst['kind'], { cue: string; arriving: string }> = {
  bus: { cue: 'A bus is pulling up', arriving: 'Bus passengers coming in' },
  school: { cue: 'School’s out: parents on the way', arriving: 'School-run rush' },
  church: { cue: 'Church is letting out', arriving: 'After-church crowd' },
  lunch: { cue: 'Lunch break crowd heading over', arriving: 'Lunchtime rush' },
  coach: { cue: 'A coach party has stopped', arriving: 'Coach party in the aisles' },
};

export const TASK_KINDS = Object.keys(F.tasks.kinds) as TaskKind[];

/** The day's bursts, jobs and questions, from the seed. */
export function makeFloor(seed: number, ctx: DayContext, forecast: readonly number[]): Floor {
  const rng = mulberry32(seed * 7717 + ctx.weekday * 131 + ctx.hours * 17 + 99);
  const floor = emptyFloor();
  const end = ctx.hours * STEPS;
  const B = F.bursts;

  // Bursts: at most one an hour, more likely in busy hours, never in the last 15 minutes.
  let lastBurst = -Infinity;
  for (let h = 0; h < ctx.hours; h++) {
    const p = Math.min(B.maxPerHour, B.perHour * (forecast[h] / B.busyAt));
    if (rng() >= p) continue;
    const at = h * STEPS + Math.floor(rng() * STEPS);
    if (at - lastBurst < B.minGapMinutes || at < B.warnMinutes + 5 || at > end - 15) continue;
    const minutes = B.minutes[0] + Math.floor(rng() * (B.minutes[1] - B.minutes[0] + 1));
    const share = B.share[0] + rng() * (B.share[1] - B.share[0]);
    const shoppers = Math.max(B.minShoppers, Math.round(forecast[h] * share));
    floor.bursts.push({ id: `burst-${h}`, kind: burstKind(CONFIG.openingHour + h, ctx.weekday, rng()), at, minutes, shoppers, warnAt: at - B.warnMinutes });
    lastBurst = at;
  }

  // Floor jobs: a Poisson-like stream per minute, busier when the forecast is.
  const T = F.tasks;
  const kinds = TASK_KINDS.filter((k) => T.kinds[k].weight > 0 && T.kinds[k].where.some((w) => placeExists(w, ctx)));
  const weightSum = kinds.reduce((t, k) => t + T.kinds[k].weight, 0);
  let lastTask = -Infinity;
  let n = 0;
  const firstAt = 5 + Math.floor(rng() * (T.firstWithinMinutes - 5));
  for (let at = 3; at < end - 5; at++) {
    const h = Math.floor(at / STEPS);
    const rate = (T.perHour + T.perCustomer * forecast[h]) / STEPS;
    const forced = n === 0 && at === firstAt;
    if ((!forced && rng() >= rate) || at - lastTask < T.minGapMinutes || !kinds.length) continue;
    let r = rng() * weightSum;
    const kind = kinds.find((k) => (r -= T.kinds[k].weight) < 0) ?? kinds[0];
    const cfg = T.kinds[kind];
    const places = cfg.where.filter((w) => placeExists(w, ctx));
    const place = places[Math.floor(rng() * places.length)];
    floor.schedule.push({ id: `task-${n++}`, kind, place, spot: Math.floor(rng() * TASK_SPOTS[place]), at, work: cfg.work, progress: 0, assigned: null, expiresAt: null });
    lastTask = at;
  }

  // Questions: spread through the day, each kind at most once.
  const E = F.events;
  const count = Math.min(E.maxPerDay, Math.max(1, Math.round(ctx.hours * E.perHour)));
  const pool: FloorEventKind[] = ['breakRequest', 'favour', 'nearDate', 'complaint', 'donation'];
  let last = E.firstAfterMinutes - E.minGapMinutes;
  for (let i = 0; i < count && pool.length; i++) {
    const earliest = last + E.minGapMinutes;
    const latest = end - 20 - (count - i - 1) * E.minGapMinutes;
    if (latest < earliest) break;
    const at = earliest + Math.floor(rng() * Math.min(latest - earliest + 1, STEPS * 1.5));
    const kind = pool.splice(Math.floor(rng() * pool.length), 1)[0];
    floor.events.push({ id: `event-${i}`, kind, at });
    last = at;
  }
  return floor;
}

function placeExists(w: TaskPlace, ctx: DayContext): boolean {
  return w === 'tills' || w === 'entrance' || ctx.depts.includes(w as DeptId);
}

/** Burst shoppers arriving during this step. */
export function burstArrivals(floor: Floor | undefined, abs: number): number {
  if (!floor) return 0;
  let n = 0;
  for (const b of floor.bursts) if (abs >= b.at && abs < b.at + b.minutes) n += b.shoppers / b.minutes;
  return n;
}

/** The burst announced at the door now (coming or arriving), if any. */
export function burstAtDoor(floor: Floor | undefined, abs: number): { burst: Burst; inMinutes: number } | null {
  if (!floor) return null;
  const b = floor.bursts.find((x) => abs >= x.warnAt && abs < x.at + x.minutes);
  return b ? { burst: b, inMinutes: Math.max(0, b.at - abs) } : null;
}

/** New jobs appear, and unattended ones that have run their time go away. Called at the start of each step. */
export function spawnAndExpire(floor: Floor, abs: number, messages: string[]): void {
  while (floor.schedule.length && floor.schedule[0].at <= abs) {
    if (floor.tasks.filter((t) => t.kind !== 'errand').length >= F.tasks.maxOpen) {
      // The floor is busy enough: this one comes a little later.
      for (const t of floor.schedule) if (t.at <= abs) t.at = abs + 1;
      break;
    }
    const t = floor.schedule.shift()!;
    const exp = F.tasks.kinds[t.kind].expires;
    floor.tasks.push({ ...t, at: abs, expiresAt: exp === null ? null : abs + exp });
  }
  for (const t of [...floor.tasks]) {
    if (t.assigned === null && t.expiresAt !== null && abs >= t.expiresAt) {
      floor.tasks = floor.tasks.filter((x) => x !== t);
      floor.counts.expired += 1;
      messages.push(t.kind === 'help' ? 'A shopper gave up looking and left without asking again.' : 'The price check customer gave up and left their shopping.');
    }
  }
}

/** Satisfaction lost this minute from jobs nobody is on, and gained or lost from earlier answers. */
export function floorMood(floor: Floor | undefined, abs: number, penaltyScale: number): number {
  if (!floor) return 0;
  const open = floor.tasks.filter((t) => t.assigned === null).reduce((s, t) => s + F.tasks.kinds[t.kind].penalty, 0);
  const mood = floor.mood.filter((m) => m.until > abs).reduce((s, m) => s + (m.delta < 0 ? m.delta * penaltyScale : m.delta), 0);
  return mood - Math.min(F.tasks.maxPenalty, open) * penaltyScale;
}

export function taskLabel(t: FloorTask): string {
  return F.tasks.kinds[t.kind].label;
}

/** What a shopper needing help is looking for (fixed per job). */
export function helpItem(t: FloorTask): string {
  const items = t.place === 'produce' || t.place === 'chilled' || t.place === 'ambient' ? F.tasks.helpItems[t.place] : F.tasks.helpItems.ambient;
  const n = Number(t.id.replace(/\D/g, '')) || 0;
  return items[n % items.length];
}

/**
 * A job's short label for the shop and Needs attention: what it is and the
 * time that matters (until the shopper gives up, or the work it takes; once
 * someone is on it, who and how long to go).
 */
export function taskText(t: FloorTask, now: number, worker?: string): string {
  const what =
    t.kind === 'help'
      ? `Can’t find ${helpItem(t)}`
      : t.kind === 'spill'
        ? 'Spill to mop'
        : t.kind === 'priceCheck'
          ? 'Price check'
          : t.kind === 'pallet'
            ? 'Cage blocking aisle'
            : 'Baskets running out';
  if (t.kind === 'errand') return `${worker ?? 'Someone'} at the cash-and-carry · back in ${Math.max(1, Math.ceil(t.work - t.progress))} min`;
  if (t.assigned) return `${worker ?? 'Someone'} on it · ${Math.max(1, Math.ceil(t.work - t.progress))} min to go`;
  if (t.expiresAt !== null) return `${what} · ${Math.max(1, t.expiresAt - now)} min left`;
  return `${what} · ${t.work} min job`;
}
