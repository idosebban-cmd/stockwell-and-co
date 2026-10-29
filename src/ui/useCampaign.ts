import { useCallback, useEffect, useMemo, useState } from 'react';
import { defaultPlan, planErrors } from '../sim/engine';
import { newCampaignRecord, rebuildCampaign, restartDay, type CampaignRecord, type UpgradeId } from '../sim/campaign';
import { randomSeed } from '../sim/rng';
import { clearCampaign, loadCampaign, saveCampaign, type StorageLike } from '../sim/save';
import type { HourPlan, SetupPlan } from '../sim/types';

/** The seed of the first week (later weeks get a new one). */
export const FIRST_WEEK_SEED = 1;

export type CampaignView = 'morning' | 'plan' | 'replay' | 'closed' | 'finished' | 'failed';

export function useCampaign(storage: StorageLike | null, skipReplay: boolean) {
  const initial = useMemo(() => loadCampaign(storage), [storage]);
  const [record, setRecord] = useState<CampaignRecord>(() => initial.file?.record ?? newCampaignRecord(FIRST_WEEK_SEED));
  const [draft, setDraft] = useState<HourPlan | null>(() => initial.file?.draft ?? null);
  const [replaying, setReplaying] = useState(false);
  const [notice, setNotice] = useState<string | null>(initial.problem);
  const [saveOk, setSaveOk] = useState(storage !== null);
  const rb = useMemo(() => rebuildCampaign(record), [record]);
  const state = rb.state;
  const view: CampaignView = replaying && rb.reports.length ? 'replay' : rb.phase === 'trading' ? 'plan' : rb.phase;
  const started = record.days.length > 0;

  // Keep a valid plan for the hour being planned.
  useEffect(() => {
    if (rb.phase !== 'trading' || !state) return;
    if (!draft || planErrors(state, draft).some((e) => e.includes('has no job') || e.includes('room for') || e.includes('doesn’t have'))) setDraft(defaultPlan(state));
  }, [rb.phase, state, draft]);

  useEffect(() => {
    setSaveOk(saveCampaign(storage, { record, draft }));
  }, [storage, record, draft]);

  const update = useCallback((f: (r: CampaignRecord) => CampaignRecord) => setRecord((r) => f(structuredClone(r))), []);

  const openShop = useCallback(
    (setup: SetupPlan) => {
      update((r) => {
        r.days.push({ setup, plans: [], purchases: [], done: false });
        return r;
      });
      setDraft(null);
    },
    [update],
  );

  const runNextHour = useCallback(() => {
    if (!state || !draft || planErrors(state, draft).length) return;
    const plan = draft;
    update((r) => {
      r.days[r.days.length - 1].plans.push(plan);
      return r;
    });
    setDraft(null);
    setReplaying(!skipReplay);
  }, [state, draft, update, skipReplay]);

  const finishReplay = useCallback(() => setReplaying(false), []);

  const purchase = useCallback(
    (id: UpgradeId) =>
      update((r) => {
        r.days[r.days.length - 1].purchases.push(id);
        return r;
      }),
    [update],
  );
  const undoPurchase = useCallback(
    (id: UpgradeId) =>
      update((r) => {
        const d = r.days[r.days.length - 1];
        // Undoing the chilled department also undoes what depends on it.
        const deps: string[] = id === 'chilled' ? ['chilled', 'shelfChilled', 'fridge'] : [id];
        d.purchases = d.purchases.filter((x) => !deps.includes(x));
        return r;
      }),
    [update],
  );

  const continueDay = useCallback(
    () =>
      update((r) => {
        r.days[r.days.length - 1].done = true;
        return r;
      }),
    [update],
  );

  const restart = useCallback(() => {
    update((r) => restartDay(r));
    setDraft(null);
    setReplaying(false);
  }, [update]);

  const newWeek = useCallback((seed?: number) => {
    clearCampaign(storage);
    setRecord(newCampaignRecord(seed ?? randomSeed()));
    setDraft(null);
    setReplaying(false);
  }, [storage]);

  return {
    record,
    rb,
    state,
    view,
    started,
    draft,
    setDraft,
    saveOk,
    notice,
    dismissNotice: () => setNotice(null),
    openShop,
    runNextHour,
    finishReplay,
    purchase,
    undoPurchase,
    continueDay,
    restart,
    newWeek,
    /** Purchases made since the last close (can still be undone). */
    pending: record.days.at(-1)?.done === false && rb.phase === 'closed' ? record.days.at(-1)!.purchases : [],
  };
}

export type Campaign = ReturnType<typeof useCampaign>;
