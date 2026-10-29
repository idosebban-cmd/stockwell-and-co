import { CONFIG, DEPTS, type DeptId } from './config';
import { intBetween, mulberry32, pick, signed } from './rng';
import type { EventKind, Scenario, ScenarioEvent } from './types';

/** Seed 1 is the curated, approachable first Saturday. */
export const CURATED_SEED = 1;

/** Seed 0 is the guided shift: steady footfall, no hidden variation, no events. */
export const TUTORIAL_SEED = 0;

export function makeScenario(seed: number): Scenario {
  if (seed === TUTORIAL_SEED) return tutorialScenario();
  return seed === CURATED_SEED ? curated() : generated(seed);
}

function tutorialScenario(): Scenario {
  const n = CONFIG.hours;
  return {
    seed: TUTORIAL_SEED,
    name: 'Learn to play',
    curated: true,
    forecast: Array.from({ length: n }, () => 40),
    customerNoise: Array.from({ length: n }, () => 1),
    deptNoise: Object.fromEntries(DEPTS.map((d) => [d, Array.from({ length: n }, () => 1)])) as Record<DeptId, number[]>,
    events: [],
  };
}

function noise(rng: () => number, amount: number, n: number): number[] {
  return Array.from({ length: n }, () => 1 + signed(rng) * amount);
}

function curated(): Scenario {
  const rng = mulberry32(CURATED_SEED * 7919);
  const n = CONFIG.hours;
  // Gentle, mostly-positive variation for a fair first game.
  const customerNoise = noise(rng, CONFIG.demand.customerNoise * 0.6, n);
  const deptNoise = Object.fromEntries(
    DEPTS.map((d) => [d, noise(rng, CONFIG.demand.deptNoise * 0.6, n)]),
  ) as Record<DeptId, number[]>;
  return {
    seed: CURATED_SEED,
    name: 'An ordinary Saturday (probably)',
    curated: true,
    forecast: [...CONFIG.demand.forecast],
    customerNoise,
    deptNoise,
    events: [
      { id: 'fridge', kind: 'fridgeFault', hour: 2, warnAt: 2 },
      { id: 'rush', kind: 'rush', hour: 5, warnAt: 3 },
    ],
  };
}

function generated(seed: number): Scenario {
  const rng = mulberry32(seed);
  const n = CONFIG.hours;
  // Shift the peak a little and scale the day within a balanced band.
  const scale = 0.94 + rng() * 0.12;
  const shift = intBetween(rng, -1, 1);
  const base = CONFIG.demand.forecast;
  const forecast = base.map((_, i) => {
    const j = Math.min(n - 1, Math.max(0, i - shift));
    const blended = (base[i] + base[j]) / 2;
    return Math.round(blended * scale);
  });
  const customerNoise = noise(rng, CONFIG.demand.customerNoise, n);
  const deptNoise = Object.fromEntries(DEPTS.map((d) => [d, noise(rng, CONFIG.demand.deptNoise, n)])) as Record<
    DeptId,
    number[]
  >;

  const kinds: EventKind[] = ['rush', 'delayedDelivery', 'fridgeFault'];
  const first = pick(rng, kinds);
  const second = pick(
    rng,
    kinds.filter((k) => k !== first),
  );
  const chosen = rng() < 0.2 ? [first] : [first, second];
  const events: ScenarioEvent[] = [];
  const takenHours = new Set<number>();
  for (const kind of chosen) {
    const ev = placeEvent(rng, kind, takenHours);
    if (ev) {
      events.push(ev);
      takenHours.add(ev.hour);
    }
  }
  return {
    seed,
    name: `Saturday #${seed % 10000}`,
    curated: false,
    forecast,
    customerNoise,
    deptNoise,
    events: events.slice(0, CONFIG.events.maxPerShift),
  };
}

/**
 * Places an event so it never lands as a surprise on the final turn:
 * unwarned events happen between 10:00 and 14:00; rushes are announced
 * two hours ahead; a delayed midday delivery is announced the hour before.
 */
function placeEvent(rng: () => number, kind: EventKind, taken: Set<number>): ScenarioEvent | null {
  for (let tries = 0; tries < 10; tries++) {
    let hour: number;
    let warnAt: number;
    if (kind === 'rush') {
      hour = intBetween(rng, 3, 6);
      warnAt = hour - 2;
    } else if (kind === 'delayedDelivery') {
      hour = CONFIG.openingOrder.middayHour;
      warnAt = hour - 1;
    } else {
      hour = intBetween(rng, 1, 5);
      warnAt = hour;
    }
    if (!taken.has(hour)) return { id: kind, kind, hour, warnAt };
  }
  return null;
}
