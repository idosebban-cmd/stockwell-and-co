import { useCallback, useEffect, useMemo, useState } from 'react';
import { afterClose, newCampaignRecord, nextDay, phaseOf, replayToday, restartDay, type CampaignRecord, type UpgradeId } from '../sim/campaign';
import { randomSeed } from '../sim/rng';
import { clearCampaign, loadCampaign, saveCampaign, type StorageLike } from '../sim/save';
import type { SetupPlan } from '../sim/types';
import { useLiveDay } from './useLiveDay';

/** The seed of a new shop. */
export const FIRST_SEED = 1;

/** The shop, day after day: the morning order, the live day, and closing with investments. */
export function useCampaign(storage: StorageLike | null, sound: boolean) {
  const initial = useMemo(() => loadCampaign(storage), [storage]);
  const [record, setRecord] = useState<CampaignRecord>(() => initial.file?.record ?? newCampaignRecord(FIRST_SEED));
  const [session, setSession] = useState(0);
  const [notice, setNotice] = useState<string | null>(initial.problem);
  const [saveOk, setSaveOk] = useState(storage !== null);

  const day = useLiveDay({
    dayKey: `${record.seed}:${record.camp.day}:${session}`,
    build: () => replayToday(record),
    onChoices: (choices, minute) =>
      setRecord((r) => (r.today ? { ...r, today: { ...r.today, choices: [...r.today.choices, ...choices], minute: Math.max(r.today.minute, minute) } } : r)),
    onProgress: (minute) => setRecord((r) => (r.today && r.today.minute !== minute ? { ...r, today: { ...r.today, minute } } : r)),
    sound,
    startPaused: !!initial.file?.record.today && session === 0,
  });
  const phase = phaseOf(record, day.live);
  const closed = useMemo(() => (phase === 'closed' && day.live ? afterClose(record, day.live.state) : null), [phase, day.live, record]);

  useEffect(() => {
    setSaveOk(saveCampaign(storage, { record }));
  }, [storage, record]);

  const begin = useCallback((r: CampaignRecord) => {
    setRecord(r);
    setSession((n) => n + 1);
  }, []);

  const openShop = useCallback((setup: SetupPlan) => begin({ ...record, today: { setup, choices: [], minute: 0 }, purchases: [] }), [record, begin]);
  const purchase = useCallback((id: UpgradeId) => setRecord((r) => ({ ...r, purchases: [...r.purchases, id] })), []);
  const undoPurchase = useCallback(
    // Undoing the chilled department also undoes what depends on it.
    (id: UpgradeId) => setRecord((r) => ({ ...r, purchases: r.purchases.filter((x) => !(id === 'chilled' ? ['chilled', 'shelfChilled', 'fridge'] : [id]).includes(x)) })),
    [],
  );
  const continueDay = useCallback(() => {
    if (day.live && phase === 'closed') begin(nextDay(record, day.live.state));
  }, [day.live, phase, record, begin]);
  const restart = useCallback(() => begin(restartDay(record)), [record, begin]);
  const newShop = useCallback(
    (seed?: number) => {
      clearCampaign(storage);
      begin(newCampaignRecord(seed ?? randomSeed()));
    },
    [storage, begin],
  );

  return {
    record,
    day,
    phase,
    /** The campaign this morning (before the order). */
    camp: record.camp,
    /** After closing: the campaign with today and the purchases since applied, and today's result. */
    closed,
    state: day.live?.state ?? null,
    started: record.camp.day > 0 || !!record.today,
    saveOk,
    notice,
    dismissNotice: () => setNotice(null),
    openShop,
    purchase,
    undoPurchase,
    continueDay,
    restart,
    newShop,
    pending: phase === 'closed' ? record.purchases : [],
  };
}

export type Campaign = ReturnType<typeof useCampaign>;
