/**
 * Autosave to localStorage (or any Storage-like object). Every call is
 * wrapped so a full, blocked or missing storage never breaks the game.
 */
import { DEPTS, PRICE_TIERS } from './config';
import { convertRecordV3, rebuild, RECORD_VERSION, type GameRecord } from './game';
import { CAMPAIGN_VERSION, convertCampaignV1, replayToday, type CampaignRecord } from './campaign';
import type { Choice } from './live';
import { ASSIGNMENTS, type HourPlan, type SetupPlan } from './types';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const SAVE_KEY = 'stockwell-and-co:save';
export const SETTINGS_KEY = 'stockwell-and-co:settings';
export const CAMPAIGN_KEY = 'stockwell-and-co:campaign';
/** Which mode was open last: the week, Quick play or the home screen. */
export const MODE_KEY = 'stockwell-and-co:mode';

export interface SaveFile {
  record: GameRecord;
  savedAt: string;
}

export interface Settings {
  reducedMotion: boolean;
  /** Sound effects (the till ding). On by default, at a gentle volume. */
  sound: boolean;
  seenIntro: boolean;
  /** First-shift tips already completed or dismissed. */
  tipsDone: string[];
}

export const DEFAULT_SETTINGS: Settings = { reducedMotion: false, sound: true, seenIntro: false, tipsDone: [] };

export function getStorage(): StorageLike | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const probe = '__stockwell_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return null;
  }
}

export function saveGame(storage: StorageLike | null, file: Omit<SaveFile, 'savedAt'>): boolean {
  if (!storage) return false;
  try {
    const payload: SaveFile = { ...file, savedAt: new Date().toISOString() };
    storage.setItem(SAVE_KEY, JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

export function clearSave(storage: StorageLike | null): void {
  try {
    storage?.removeItem(SAVE_KEY);
  } catch {
    /* ignore */
  }
}

/** Returns a valid save or null. Corrupt or incompatible saves are ignored; hourly (version 3) saves are converted. */
export function loadGame(storage: StorageLike | null): SaveFile | null {
  if (!storage) return null;
  let raw: string | null;
  try {
    raw = storage.getItem(SAVE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as { record?: unknown; savedAt?: unknown };
    let record = data?.record;
    if (isOldRecord(record)) record = convertRecordV3(record);
    if (!isRecord(record)) return null;
    // Make sure it still replays with the current rules.
    rebuild(record);
    return { record, savedAt: String(data.savedAt ?? '') };
  } catch {
    return null;
  }
}

export function loadSettings(storage: StorageLike | null): Settings {
  try {
    const raw = storage?.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const s = JSON.parse(raw) as Partial<Settings>;
    return {
      reducedMotion: typeof s.reducedMotion === 'boolean' ? s.reducedMotion : DEFAULT_SETTINGS.reducedMotion,
      sound: typeof s.sound === 'boolean' ? s.sound : DEFAULT_SETTINGS.sound,
      seenIntro: typeof s.seenIntro === 'boolean' ? s.seenIntro : false,
      tipsDone: Array.isArray(s.tipsDone) ? s.tipsDone.filter((x): x is string => typeof x === 'string') : [],
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(storage: StorageLike | null, s: Settings): boolean {
  try {
    storage?.setItem(SETTINGS_KEY, JSON.stringify(s));
    return !!storage;
  } catch {
    return false;
  }
}

function isRecord(r: unknown): r is GameRecord {
  if (!r || typeof r !== 'object') return false;
  const x = r as GameRecord;
  if (x.version !== RECORD_VERSION || typeof x.seed !== 'number' || !Array.isArray(x.choices) || typeof x.minute !== 'number') return false;
  if (x.setup !== null && !isSetup(x.setup)) return false;
  return x.choices.every(isChoice);
}

function isOldRecord(r: unknown): r is { seed: number; setup: SetupPlan | null; plans: HourPlan[] } {
  const x = r as { version?: unknown; seed?: unknown; setup?: unknown; plans?: unknown };
  return !!x && x.version === 3 && typeof x.seed === 'number' && (x.setup === null || isSetup(x.setup)) && Array.isArray(x.plans) && x.plans.every(isPlan);
}

function isChoice(c: unknown): c is Choice {
  const x = c as Choice;
  if (!x || typeof x !== 'object' || typeof x.at !== 'number') return false;
  if (x.kind === 'jobs') return !!x.assignments && Object.values(x.assignments).every((a) => ASSIGNMENTS.includes(a) || a === 'task');
  if (x.kind === 'task') return typeof x.staffId === 'string' && typeof x.taskId === 'string';
  if (x.kind === 'answer') return typeof x.eventId === 'string' && typeof x.option === 'number';
  if (x.kind === 'prices') return DEPTS.every((d) => PRICE_TIERS.includes(x.pricing?.[d]));
  if (x.kind === 'action') return !!x.action && typeof x.action.kind === 'string';
  return false;
}

function isSetup(s: unknown): s is SetupPlan {
  const x = s as SetupPlan;
  return (
    !!x &&
    typeof x === 'object' &&
    DEPTS.every(
      (d) =>
        typeof x.orders?.[d]?.morning === 'number' &&
        typeof x.orders?.[d]?.midday === 'number' &&
        PRICE_TIERS.includes(x.pricing?.[d]),
    ) &&
    ['short', 'long'].includes(x.chilledLife?.morning) &&
    ['short', 'long'].includes(x.chilledLife?.midday)
  );
}

function isPlan(p: unknown): p is HourPlan {
  const x = p as HourPlan;
  if (!x || typeof x !== 'object' || !x.assignments || !Array.isArray(x.actions)) return false;
  if (!DEPTS.every((d) => PRICE_TIERS.includes(x.pricing?.[d]))) return false;
  return Object.values(x.assignments).every((a) => ASSIGNMENTS.includes(a));
}

// ---------------------------------------------------------------------------
// The week (campaign), saved separately from Quick play
// ---------------------------------------------------------------------------

export interface CampaignSaveFile {
  record: CampaignRecord;
  savedAt: string;
}

export interface CampaignLoad {
  file: CampaignSaveFile | null;
  /** Set when a saved game exists but can't be continued, or was converted, to tell the player. */
  problem: string | null;
}

export function saveCampaign(storage: StorageLike | null, file: Omit<CampaignSaveFile, 'savedAt'>): boolean {
  if (!storage) return false;
  try {
    storage.setItem(CAMPAIGN_KEY, JSON.stringify({ ...file, savedAt: new Date().toISOString() }));
    return true;
  } catch {
    return false;
  }
}

export function clearCampaign(storage: StorageLike | null): void {
  try {
    storage?.removeItem(CAMPAIGN_KEY);
  } catch {
    /* ignore */
  }
}

export function loadCampaign(storage: StorageLike | null): CampaignLoad {
  if (!storage) return { file: null, problem: null };
  let raw: string | null;
  try {
    raw = storage.getItem(CAMPAIGN_KEY);
  } catch {
    return { file: null, problem: null };
  }
  if (!raw) return { file: null, problem: null };
  const reset = 'Your saved shop was made with an earlier version of the game and can’t be continued with the current rules, so a new one starts. Quick play saves are not affected.';
  try {
    const data = JSON.parse(raw) as { record?: Record<string, unknown>; savedAt?: unknown };
    const r = data?.record;
    if (!r || typeof r.seed !== 'number') return { file: null, problem: reset };
    if (r.version === 1 && Array.isArray(r.days)) {
      const days = r.days as { setup: SetupPlan | null; plans: HourPlan[]; purchases: string[]; done: boolean }[];
      if (!days.every((d) => (d.setup === null || isSetup(d.setup)) && Array.isArray(d.plans) && d.plans.every(isPlan) && Array.isArray(d.purchases))) return { file: null, problem: reset };
      const record = convertCampaignV1({ seed: r.seed, days: days as never });
      replayToday(record);
      return {
        file: { record, savedAt: String(data.savedAt ?? '') },
        problem: 'The shop now runs in real time. Your saved week has been carried over: the days you finished are kept, and today continues from where you left it.',
      };
    }
    const record = r as unknown as CampaignRecord;
    if (record.version !== CAMPAIGN_VERSION || !record.camp || typeof record.camp.day !== 'number' || !Array.isArray(record.purchases)) return { file: null, problem: reset };
    if (record.today && (!isSetup(record.today.setup) || !Array.isArray(record.today.choices) || !record.today.choices.every(isChoice) || typeof record.today.minute !== 'number')) return { file: null, problem: reset };
    replayToday(record);
    return { file: { record, savedAt: String(data.savedAt ?? '') }, problem: null };
  } catch {
    return { file: null, problem: reset };
  }
}

export type Mode = 'home' | 'campaign' | 'quick';

export function loadMode(storage: StorageLike | null): Mode {
  try {
    const m = storage?.getItem(MODE_KEY);
    return m === 'campaign' || m === 'quick' ? m : 'home';
  } catch {
    return 'home';
  }
}

export function saveMode(storage: StorageLike | null, m: Mode): void {
  try {
    storage?.setItem(MODE_KEY, m);
  } catch {
    /* ignore */
  }
}
