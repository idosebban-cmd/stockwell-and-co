import { useCallback, useEffect, useMemo, useState } from 'react';
import { newRecord, rebuild, retryRecord, type GameRecord } from '../sim/game';
import { randomSeed } from '../sim/rng';
import { CURATED_SEED } from '../sim/scenario';
import { clearSave, getStorage, loadGame, loadSettings, saveGame, saveSettings, type Settings } from '../sim/save';
import type { SetupPlan } from '../sim/types';
import { useLiveDay } from './useLiveDay';

export type Phase = 'setup' | 'trading' | 'closed';

/** Quick play: one Saturday, played live. Also holds the settings shared by every mode. */
export function useGame() {
  const storage = useMemo(() => getStorage(), []);
  const initial = useMemo(() => loadGame(storage), [storage]);
  const [settings, setSettingsState] = useState<Settings>(() => loadSettings(storage));
  const [record, setRecord] = useState<GameRecord>(() => initial?.record ?? newRecord(CURATED_SEED));
  const [session, setSession] = useState(0);
  const [saveOk, setSaveOk] = useState<boolean>(storage !== null);

  const day = useLiveDay({
    dayKey: `${record.seed}:${session}`,
    build: () => rebuild(record),
    onChoices: (choices, minute) => setRecord((r) => ({ ...r, choices: [...r.choices, ...choices], minute: Math.max(r.minute, minute) })),
    onProgress: (minute) => setRecord((r) => (r.setup && r.minute !== minute ? { ...r, minute } : r)),
    sound: settings.sound,
    startPaused: !!initial?.record.setup && session === 0,
  });
  const phase: Phase = !record.setup || !day.live ? 'setup' : day.closed ? 'closed' : 'trading';

  // Autosave whenever the record changes.
  useEffect(() => {
    setSaveOk(saveGame(storage, { record }));
  }, [storage, record]);

  const setSettings = useCallback(
    (s: Partial<Settings>) => {
      setSettingsState((prev) => {
        const next = { ...prev, ...s };
        saveSettings(storage, next);
        return next;
      });
    },
    [storage],
  );

  const restartWith = useCallback((r: GameRecord) => {
    setRecord(r);
    setSession((n) => n + 1);
  }, []);
  const confirmSetup = useCallback((setup: SetupPlan) => restartWith({ ...newRecord(record.seed), setup }), [record.seed, restartWith]);
  const retrySameSaturday = useCallback((setup?: SetupPlan) => restartWith({ ...retryRecord(record), setup: setup ?? null }), [record, restartWith]);
  // The first Saturday is curated; after that, new seeds vary demand and events.
  const newSaturday = useCallback((setup?: SetupPlan) => restartWith({ ...newRecord(randomSeed()), setup: setup ?? null }), [restartWith]);
  const playCurated = useCallback((setup?: SetupPlan) => restartWith({ ...newRecord(CURATED_SEED), setup: setup ?? null }), [restartWith]);
  const wipe = useCallback(() => clearSave(storage), [storage]);

  return {
    settings,
    setSettings,
    record,
    day,
    state: day.live?.state ?? null,
    phase,
    saveOk,
    confirmSetup,
    retrySameSaturday,
    newSaturday,
    playCurated,
    wipe,
  };
}

export type Game = ReturnType<typeof useGame>;
