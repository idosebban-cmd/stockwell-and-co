import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CONFIG } from '../sim/config';
import { defaultPlan, planErrors } from '../sim/engine';
import { newRecord, rebuild, retryRecord, type GameRecord } from '../sim/game';
import { randomSeed } from '../sim/rng';
import { CURATED_SEED } from '../sim/scenario';
import {
  clearSave,
  getStorage,
  loadGame,
  loadSettings,
  saveGame,
  saveSettings,
  type Settings,
} from '../sim/save';
import type { HourPlan, HourReport, SetupPlan } from '../sim/types';

export type Phase = 'setup' | 'plan' | 'replay' | 'results' | 'closed';

export function useGame() {
  const storage = useMemo(() => getStorage(), []);
  const initial = useMemo(() => loadGame(storage), [storage]);
  const [settings, setSettingsState] = useState<Settings>(() => loadSettings(storage));
  const [record, setRecord] = useState<GameRecord>(() => initial?.record ?? newRecord(CURATED_SEED));
  const rebuilt = useMemo(() => rebuild(record), [record]);
  const state = rebuilt.state;
  /** The state before the last committed hour (shown in the status bar during the replay). */
  const previousState = useMemo(
    () => (record.plans.length ? rebuild({ ...record, plans: record.plans.slice(0, -1) }).state : null),
    [record],
  );
  const [draft, setDraft] = useState<HourPlan | null>(() => initial?.draft ?? null);
  const [phase, setPhase] = useState<Phase>(() => {
    if (!initial) return 'setup';
    if (!initial.record.setup) return 'setup';
    if (initial.record.plans.length >= CONFIG.hours) return 'closed';
    return 'plan';
  });
  const [lastReport, setLastReport] = useState<HourReport | null>(null);
  const [saveOk, setSaveOk] = useState<boolean>(storage !== null);
  const resumed = useRef(!!initial && !!initial.record.setup && initial.record.plans.length > 0);

  // Keep a valid draft for the hour being planned.
  useEffect(() => {
    if (!state || state.hour >= CONFIG.hours) return;
    if (!draft || planErrors(state, draft).some((e) => e.includes('has no job'))) setDraft(defaultPlan(state));
  }, [state, draft]);

  // Autosave whenever the record or draft changes.
  useEffect(() => {
    setSaveOk(saveGame(storage, { record, draft }));
  }, [storage, record, draft]);

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

  const confirmSetup = useCallback((setup: SetupPlan) => {
    setRecord((r) => ({ ...r, setup, plans: [] }));
    setDraft(null);
    setLastReport(null);
    setPhase('plan');
  }, []);

  const runNextHour = useCallback(() => {
    if (!state || !draft) return;
    if (planErrors(state, draft).length) return;
    const next = { ...record, plans: [...record.plans, draft] };
    const re = rebuild(next);
    setRecord(next);
    setLastReport(re.reports[re.reports.length - 1] ?? null);
    setDraft(null);
    setPhase(settings.skipReplay ? 'results' : 'replay');
  }, [state, draft, record, settings.skipReplay]);

  const finishReplay = useCallback(() => setPhase('results'), []);

  const continueAfterResults = useCallback(() => {
    if (state && state.hour >= CONFIG.hours) setPhase('closed');
    else setPhase('plan');
  }, [state]);

  const retrySameSaturday = useCallback(() => {
    setRecord((r) => retryRecord(r));
    setDraft(null);
    setLastReport(null);
    setPhase('setup');
  }, []);

  const newSaturday = useCallback(() => {
    // The first Saturday is curated; after that, new seeds vary demand and events.
    setRecord(newRecord(randomSeed()));
    setDraft(null);
    setLastReport(null);
    setPhase('setup');
  }, []);

  const playCurated = useCallback(() => {
    setRecord(newRecord(CURATED_SEED));
    setDraft(null);
    setLastReport(null);
    setPhase('setup');
  }, []);

  const wipe = useCallback(() => {
    clearSave(storage);
  }, [storage]);

  return {
    settings,
    setSettings,
    record,
    state,
    previousState,
    reports: rebuilt.reports,
    draft,
    setDraft,
    phase,
    setPhase,
    lastReport,
    saveOk,
    resumed: resumed.current,
    confirmSetup,
    runNextHour,
    finishReplay,
    continueAfterResults,
    retrySameSaturday,
    newSaturday,
    playCurated,
    wipe,
  };
}

export type Game = ReturnType<typeof useGame>;
