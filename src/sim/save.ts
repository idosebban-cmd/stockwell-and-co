/**
 * Autosave to localStorage (or any Storage-like object). Every call is
 * wrapped so a full, blocked or missing storage never breaks the game.
 */
import { DEPTS, PRICE_TIERS } from './config';
import { rebuild, RECORD_VERSION, type GameRecord } from './game';
import { ASSIGNMENTS, type HourPlan, type SetupPlan } from './types';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const SAVE_KEY = 'stockwell-and-co:save';
export const SETTINGS_KEY = 'stockwell-and-co:settings';

export interface SaveFile {
  record: GameRecord;
  draft: HourPlan | null;
  savedAt: string;
}

export interface Settings {
  reducedMotion: boolean;
  replaySpeed: 'normal' | 'fast';
  skipReplay: boolean;
  seenIntro: boolean;
}

export const DEFAULT_SETTINGS: Settings = { reducedMotion: false, replaySpeed: 'normal', skipReplay: false, seenIntro: false };

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

/** Returns a valid save or null. Corrupt or incompatible saves are ignored. */
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
    const data = JSON.parse(raw) as SaveFile;
    if (!isRecord(data?.record)) return null;
    // Make sure it still replays with the current rules.
    rebuild(data.record);
    const draft = data.draft && isPlan(data.draft) ? data.draft : null;
    return { record: data.record, draft, savedAt: String(data.savedAt ?? '') };
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
      replaySpeed: s.replaySpeed === 'fast' ? 'fast' : 'normal',
      skipReplay: typeof s.skipReplay === 'boolean' ? s.skipReplay : false,
      seenIntro: typeof s.seenIntro === 'boolean' ? s.seenIntro : false,
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
  if (x.version !== RECORD_VERSION || typeof x.seed !== 'number' || !Array.isArray(x.plans)) return false;
  if (x.setup !== null && !isSetup(x.setup)) return false;
  return x.plans.every(isPlan);
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
    )
  );
}

function isPlan(p: unknown): p is HourPlan {
  const x = p as HourPlan;
  if (!x || typeof x !== 'object' || !x.assignments || !Array.isArray(x.actions)) return false;
  if (!DEPTS.every((d) => PRICE_TIERS.includes(x.pricing?.[d]))) return false;
  return Object.values(x.assignments).every((a) => ASSIGNMENTS.includes(a));
}
