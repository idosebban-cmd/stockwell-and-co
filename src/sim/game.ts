/**
 * A game is a seed, the opening setup and the list of committed hourly plans.
 * The current state is always rebuilt by replaying them, so the same seed and
 * decisions always produce the same Saturday.
 */
import { CONFIG } from './config';
import { runHour, startDay } from './engine';
import type { HourPlan, HourReport, SetupPlan, SimState } from './types';

/** Version 2 added the chilled shelf-life choice; version 1 saves are discarded. */
export const RECORD_VERSION = 3;

export interface GameRecord {
  version: number;
  seed: number;
  setup: SetupPlan | null;
  plans: HourPlan[];
}

export interface Rebuilt {
  state: SimState | null;
  reports: HourReport[];
}

export function newRecord(seed: number): GameRecord {
  return { version: RECORD_VERSION, seed, setup: null, plans: [] };
}

export function rebuild(record: GameRecord): Rebuilt {
  if (!record.setup) return { state: null, reports: [] };
  let state = startDay(record.seed, record.setup);
  const reports: HourReport[] = [];
  for (const plan of record.plans.slice(0, CONFIG.hours)) {
    const r = runHour(state, plan);
    state = r.state;
    reports.push(r.report);
  }
  return { state, reports };
}

/** Same seed and setup, no hours played. */
export function retryRecord(record: GameRecord): GameRecord {
  return { version: RECORD_VERSION, seed: record.seed, setup: null, plans: [] };
}
