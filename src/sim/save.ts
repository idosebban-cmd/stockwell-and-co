/**
 * Autosave to localStorage (or any Storage-like object). Every call is
 * wrapped so a full, blocked or missing storage never breaks the game.
 */
import { DEPTS, PRICE_TIERS } from './config';
import { rebuild, RECORD_VERSION, type GameRecord } from './game';
import { CAMPAIGN_DAYS, CAMPAIGN_VERSION, rebuildCampaign, type CampaignRecord } from './campaign';
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
  draft: HourPlan | null;
  savedAt: string;
}

export interface Settings {
  reducedMotion: boolean;
  replaySpeed: 'normal' | 'fast';
  skipReplay: boolean;
  seenIntro: boolean;
  /** First-shift tips already completed or dismissed. */
  tipsDone: string[];
}

export const DEFAULT_SETTINGS: Settings = { reducedMotion: false, replaySpeed: 'normal', skipReplay: false, seenIntro: false, tipsDone: [] };

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
  /** The hour being planned. */
  draft: HourPlan | null;
  savedAt: string;
}

export interface CampaignLoad {
  file: CampaignSaveFile | null;
  /** Set when a saved week exists but can't be continued, to tell the player why it was reset. */
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
  const reset = 'Your saved week was made with an earlier version of the game and can’t be continued with the current rules, so a new week starts. Quick play saves are not affected.';
  try {
    const data = JSON.parse(raw) as CampaignSaveFile;
    const r = data?.record;
    if (!r || r.version !== CAMPAIGN_VERSION || typeof r.seed !== 'number' || !Array.isArray(r.days) || r.days.length > CAMPAIGN_DAYS) return { file: null, problem: reset };
    for (const d of r.days) {
      if ((d.setup !== null && !isSetup(d.setup)) || !Array.isArray(d.plans) || !d.plans.every(isPlan) || !Array.isArray(d.purchases) || typeof d.done !== 'boolean') return { file: null, problem: reset };
    }
    rebuildCampaign(r);
    const draft = data.draft && isPlan(data.draft) ? data.draft : null;
    return { file: { record: r, draft, savedAt: String(data.savedAt ?? '') }, problem: null };
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
