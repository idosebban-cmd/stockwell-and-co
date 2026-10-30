/**
 * A Quick play game is a seed, the opening setup and the minute-stamped
 * choices made since. The day is always rebuilt by replaying them, so the
 * same seed and decisions always give the same Saturday.
 */
import { startDay } from './engine';
import { choicesFromHourlyPlans, replayLive, type Choice, type Live } from './live';
import type { HourPlan, SetupPlan } from './types';
import { CONFIG } from './config';

/** Version 4 plays live (minute-stamped choices); version 3 stored one plan per hour and is converted. */
export const RECORD_VERSION = 4;

export interface GameRecord {
  version: number;
  seed: number;
  setup: SetupPlan | null;
  choices: Choice[];
  /** Minutes played. */
  minute: number;
}

export function newRecord(seed: number): GameRecord {
  return { version: RECORD_VERSION, seed, setup: null, choices: [], minute: 0 };
}

export function rebuild(record: GameRecord): Live | null {
  if (!record.setup) return null;
  return replayLive(startDay(record.seed, record.setup), record.choices, record.minute);
}

/** Same seed, no order yet. */
export function retryRecord(record: GameRecord): GameRecord {
  return newRecord(record.seed);
}

/** A version 3 save (hourly plans) as a version 4 one. */
export function convertRecordV3(old: { seed: number; setup: SetupPlan | null; plans: HourPlan[] }): GameRecord {
  return { version: RECORD_VERSION, seed: old.seed, setup: old.setup, choices: choicesFromHourlyPlans(old.plans), minute: Math.min(old.plans.length, CONFIG.hours) * CONFIG.stepsPerHour };
}
