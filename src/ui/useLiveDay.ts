import { useCallback, useEffect, useRef, useState } from 'react';
import { CONFIG } from '../sim/config';
import { advance, choicesFor, choose, isClosed, moveStaff, stepOf, type Choice, type Live } from '../sim/live';
import type { AssignmentId, HourPlan, HourReport } from '../sim/types';
import type { CoinPop } from './Store';
import { playDing } from './sound';
import { useClock } from './useClock';

export interface LiveDayOptions {
  /** Changes whenever a different day (or a fresh attempt) starts: the day is rebuilt. */
  dayKey: string;
  build: () => Live | null;
  /** New choices to store, with the minute they were made. */
  onChoices: (choices: Choice[], minute: number) => void;
  /** Minutes played, to store now and then (and at closing). */
  onProgress: (minute: number) => void;
  sound: boolean;
  /** Start the clock paused (a day resumed from a save). */
  startPaused: boolean;
}

/**
 * A day played live: the clock, the standing plan, choices recorded as they
 * are made, autosave of progress, and the till's ding and coin pops.
 */
export function useLiveDay(o: LiveDayOptions) {
  const [box, setBox] = useState(() => ({ key: o.dayKey, live: o.build() }));
  let live = box.live;
  if (box.key !== o.dayKey) {
    live = o.build();
    setBox({ key: o.dayKey, live });
  }
  const liveRef = useRef(live);
  liveRef.current = live;
  const opts = useRef(o);
  opts.current = o;
  const [pops, setPops] = useState<CoinPop[]>([]);
  const juice = useRef({ acc: [0, 0, 0], last: [0, 0, 0], lastAny: 0, id: 0 });
  const lastSave = useRef(Date.now());

  const persist = useCallback((force = false) => {
    const cur = liveRef.current;
    if (!cur) return;
    if (force || Date.now() - lastSave.current >= CONFIG.live.autosaveSeconds * 1000) {
      lastSave.current = Date.now();
      opts.current.onProgress(stepOf(cur.state));
    }
  }, []);

  const celebrate = useCallback((reports: HourReport[], tills: number) => {
    if (tills <= 0) return;
    const j = juice.current;
    const now = performance.now();
    const fresh: CoinPop[] = [];
    for (const r of reports) for (const s of r.steps) for (let i = 0; i < tills; i++) j.acc[i] += (s.takings ?? 0) / tills;
    for (let i = 0; i < tills; i++) {
      if (j.acc[i] >= CONFIG.juice.dingAfterPounds && now - j.last[i] >= CONFIG.juice.dingEveryMs && now - j.lastAny >= 350) {
        fresh.push({ id: ++j.id, lane: i, text: `+£${Math.round(j.acc[i])}` });
        if (opts.current.sound) playDing(i);
        j.acc[i] = 0;
        j.last[i] = now;
        j.lastAny = now;
      }
    }
    if (fresh.length) {
      setPops((p) => [...p.slice(-8), ...fresh]);
      window.setTimeout(() => setPops((p) => p.filter((x) => !fresh.includes(x))), 1200);
    }
  }, []);

  const tick = useCallback(() => {
    const cur = liveRef.current;
    if (!cur || isClosed(cur)) return;
    const r = advance(cur, 1);
    liveRef.current = r.live;
    setBox((b) => ({ ...b, live: r.live }));
    const tills = Object.values(cur.plan.assignments).filter((a) => a === 'tills').length;
    celebrate(r.reports, tills);
    persist(isClosed(r.live));
  }, [celebrate, persist]);

  const running = !!live && !isClosed(live);
  const clock = useClock(running, tick, o.startPaused);
  // A new day starts running; a day resumed from a save starts paused.
  const { setPaused } = clock;
  useEffect(() => {
    setPaused(opts.current.startPaused);
  }, [o.dayKey, setPaused]);

  // Save progress when pausing, and when the page is hidden or closed.
  useEffect(() => {
    if (clock.paused) persist(true);
  }, [clock.paused, persist]);
  useEffect(() => {
    const onHide = () => persist(true);
    window.addEventListener('pagehide', onHide);
    return () => {
      window.removeEventListener('pagehide', onHide);
      persist(true);
    };
  }, [persist]);

  const record = useCallback((next: Live, made: Choice[]) => {
    liveRef.current = next;
    setBox((b) => ({ ...b, live: next }));
    if (made.length) opts.current.onChoices(made, stepOf(next.state));
  }, []);

  /** Applies an edited plan from the panels (jobs, prices, actions). Returns why not, if it can't. */
  const apply = useCallback(
    (plan: HourPlan): string | null => {
      const cur = liveRef.current;
      if (!cur || isClosed(cur)) return 'The shop is closed.';
      let next = cur;
      const made: Choice[] = [];
      try {
        for (const c of choicesFor(cur, plan)) {
          next = choose(next, c);
          made.push(c);
        }
      } catch (e) {
        record(next, made);
        return e instanceof Error ? e.message : 'That can’t be done now.';
      }
      record(next, made);
      return null;
    },
    [record],
  );

  const move = useCallback(
    (staffId: string, job: AssignmentId) => {
      const cur = liveRef.current;
      if (!cur || isClosed(cur)) return;
      const assignments = moveStaff(cur, staffId, job);
      if (!assignments) return;
      const c: Choice = { at: stepOf(cur.state), kind: 'jobs', assignments };
      record(choose(cur, c), [c]);
    },
    [record],
  );

  return { live, clock, pops, apply, move, closed: !!live && isClosed(live) };
}

export type LiveDay = ReturnType<typeof useLiveDay>;
