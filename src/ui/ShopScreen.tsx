import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CONFIG, DEPTS, hourLabel, type DeptId } from '../sim/config';
import { STEP_MINUTES, assignmentLimit, clockLabel, deptUnits, markdownActive, onShift, perDept, promotionActive, shelfCapacity } from '../sim/engine';
import { intervalOutcomes, jobPreview, outlook, problems as computeProblems, runOutWarnings, type Outlook } from '../sim/insight';
import { incomingFor } from '../sim/restock';
import { ASSIGNMENT_FUTURE, ASSIGNMENT_LABEL } from '../sim/roster';
import type { AssignmentId, HourPlan, HourReport, SimState, StaffMember } from '../sim/types';
import { fitFromContext, Store, storeViewFromState, ZONE_JOB, ZONE_NAME, type Activity, type CoinPop, type JobHint, type StoreFloor, type StoreStockroom, type ShopNotice, type StoreView, type ZoneId } from './Store';
import { stepActivity } from './activity';
import { liveBrowsing } from './shopperLayout';
import type { LessonFocus } from '../sim/tutorial';

/** What the one contextual panel is showing. Opening something replaces what was there. */
export type Selection =
  | { kind: 'staff'; id: string }
  | { kind: 'zone'; zone: ZoneId }
  | { kind: 'attention' }
  | { kind: 'team' }
  | { kind: 'forecast' }
  | { kind: 'outlook' }
  | { kind: 'stockroom' }
  | { kind: 'office' }
  | null;

export interface PanelContext {
  sel: Selection;
  setSel: (s: Selection) => void;
  /** Replay step being shown. */
  step: number;
  /** Plan changes go through here so assignments are confirmed in the shop. */
  onPlanChange: (p: HourPlan) => void;
  /** The last interval's summary, until it is dismissed. */
  summary: HourReport | null;
  dismissSummary: () => void;
}

export interface PrimaryAction {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  /** Short line beside the button: what it will cost, or why it can't run. */
  note?: string;
  noteTone?: 'bad';
}

interface Props {
  state: SimState;
  plan: HourPlan | null;
  setPlan: (p: HourPlan) => void;
  /** 'live': the clock runs; changes take effect at once. */
  phase: 'plan' | 'replay' | 'results' | 'live';
  report: HourReport | null;
  onRun: () => void;
  onReplayDone: () => void;
  reduced: boolean;
  replaySpeed: 'normal' | 'fast';
  /** Ten-minute steps the next run covers. */
  steps: number;
  panel: (ctx: PanelContext) => ReactNode;
  /** The action bar's main button (advance). */
  primary: PrimaryAction | null;
  /** Left side of the action bar (timeline, Needs attention, Team). */
  tools?: (ctx: PanelContext) => ReactNode;
  focus?: LessonFocus;
  /** Show the last interval's summary while planning the next one. */
  summaryOnPlan?: boolean;
  /** False shows the shop without letting the player select or move anyone (before opening, between days). */
  interactive?: boolean;
  /** Labels to show beside places in the shop (the morning briefing's stock labels). */
  notices?: ShopNotice[];
  /** Live play: move someone now (swapping with the person there if the place is full). */
  onMove?: (staffId: string, job: AssignmentId) => void;
  /** Live play: the clock controls, shown where the run button was. */
  clock?: ReactNode;
  /** Live play: coins over the tills. */
  pops?: CoinPop[];
  /** Live play: the clock is paused. */
  paused?: boolean;
  /** Live play: floor jobs and the cue at the door. */
  floor?: StoreFloor;
  /** Live play: send someone to a floor job. */
  onAssignTask?: (taskId: string, staffId: string) => void;
  /** Live play: a line to show briefly (e.g. what an answer did). */
  notice?: { id: number; text: string } | null;
  /** Your shop: the office opens hiring. */
  office?: boolean;
}

const STEP_MS = { normal: 800, fast: 380 };

export function ShopScreen({ state, plan, setPlan, phase, report, onRun, onReplayDone, reduced, replaySpeed, steps, panel, primary, tools, focus, summaryOnPlan, interactive = true, notices, onMove, clock, pops, paused, floor, onAssignTask, notice, office }: Props) {
  const live = phase === 'live';
  /** Planning or playing live: the shop can be changed. */
  const planning = phase === 'plan' || live;
  const [sel, setSelState] = useState<Selection>(null);
  const [toast, setToast] = useState<{ text: string; warn?: boolean } | null>(null);
  const [step, setStep] = useState(0);
  const [dismissed, setDismissed] = useState<HourReport | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);

  const summary = report && dismissed !== report && (phase === 'results' || (planning && summaryOnPlan)) ? report : null;
  const dismissSummary = useCallback(() => setDismissed(report), [report]);
  const setSel = useCallback(
    (s: Selection) => {
      setSelState(s);
      // Opening anything replaces the summary.
      if (s && planning) setDismissed(report);
    },
    [planning, report],
  );

  const say = useCallback((text: string, warn = false) => {
    setToast({ text, warn });
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 4200);
  }, []);

  // A lesson's price comparison opens with the lesson.
  useEffect(() => {
    if (focus?.priceDept && planning) setSelState({ kind: 'zone', zone: focus.priceDept });
  }, [focus?.priceDept, planning]);
  useEffect(() => {
    if (!planning) {
      setSelState(null);
      setToast(null);
    }
  }, [planning]);

  // Replay timer: purely presentational; the interval is already resolved.
  useEffect(() => {
    if (phase !== 'replay' || !report) return;
    // One frame per ten minutes of the interval.
    const stride = Math.max(1, Math.round(10 / STEP_MINUTES));
    const last = report.steps.length - 1;
    let i = Math.min(last, stride - 1);
    setStep(i);
    const ms = reduced ? 1000 : STEP_MS[replaySpeed];
    let done: number | undefined;
    const t = window.setInterval(() => {
      if (i >= last) {
        window.clearInterval(t);
        done = window.setTimeout(onReplayDone, ms / 2);
      } else {
        i = Math.min(last, i + stride);
        setStep(i);
      }
    }, ms);
    return () => {
      window.clearInterval(t);
      if (done) window.clearTimeout(done);
    };
  }, [phase, report, reduced, replaySpeed, onReplayDone]);

  const when = steps >= CONFIG.stepsPerHour ? 'next hour' : `for the next ${Math.round(steps * STEP_MINUTES)} minutes`;
  const onPlanChange = useCallback(
    (p: HourPlan) => {
      if (plan) {
        const changed = Object.entries(p.assignments).filter(([id, a]) => plan.assignments[id] !== a);
        if (changed.length && live) {
          say(changed.map(([id, a]) => `${state.staff.find((s) => s.id === id)?.name} → ${ASSIGNMENT_LABEL[a]}`).join(' · '));
        } else if (changed.length) {
          const names = changed.map(([id, a]) => `${state.staff.find((s) => s.id === id)?.name} will ${ASSIGNMENT_FUTURE[a]}`);
          const effect = statusChanges(outlook(state, plan, steps), outlook(state, p, steps));
          say(`${names.join('; ')} ${when}.${effect ? ` ${effect}` : ''}`);
        }
      }
      setPlan(p);
    },
    [plan, setPlan, state, say, when, steps, live],
  );

  const selectedId = sel?.kind === 'staff' ? sel.id : null;
  const contextZone = sel?.kind === 'zone' ? sel.zone : null;

  /** Live play: moves someone now, swapping with the person there if the place is full. */
  const moveTo = useCallback(
    (id: string, job: AssignmentId) => {
      setSelState(null);
      if (!plan || !onMove || plan.assignments[id] === job) return;
      if (assignmentLimit(job, state) === 0) {
        say('The shop doesn’t have that yet.', true);
        return;
      }
      const who = state.staff.find((s) => s.id === id)?.name;
      const swapped = Object.entries(plan.assignments).filter(([x, j]) => j === job && x !== id).length >= assignmentLimit(job, state);
      onMove(id, job);
      say(`${who} → ${ASSIGNMENT_LABEL[job]}${swapped ? ' (swapped places)' : ''}`);
    },
    [plan, onMove, state, say],
  );

  /** Live play: a floor job dropped on or chosen; with nobody selected, says what it needs. */
  const onTask = useCallback(
    (taskId: string, staffId: string | null) => {
      const t = state.floor?.tasks.find((x) => x.id === taskId);
      if (!t || !onAssignTask) return;
      const k = CONFIG.floor.tasks.kinds[t.kind];
      if (!staffId) {
        say(t.assigned ? `${state.staff.find((s) => s.id === t.assigned)?.name} is on it: ${k.label.toLowerCase()}.` : `${k.label}: drag someone here (about ${k.work} minute${k.work === 1 ? '' : 's'}).`);
        return;
      }
      setSelState(null);
      onAssignTask(taskId, staffId);
      say(`${state.staff.find((s) => s.id === staffId)?.name} → ${k.label.toLowerCase()}`);
    },
    [state, onAssignTask, say],
  );
  useEffect(() => {
    if (notice?.text) say(notice.text);
  }, [notice, say]);

  const onZone = useCallback(
    (a: AssignmentId) => {
      if (!selectedId || !plan) return;
      if (onMove) {
        moveTo(selectedId, a);
        return;
      }
      const count = Object.entries(plan.assignments).filter(([id, x]) => x === a && id !== selectedId).length;
      if (count >= assignmentLimit(a, state)) {
        say(assignmentLimit(a, state) === 0 ? `The shop doesn’t have that yet.` : `${ASSIGNMENT_LABEL[a]} already has ${assignmentLimit(a, state)}. Move someone out first.`, true);
        return;
      }
      onPlanChange({ ...plan, assignments: { ...plan.assignments, [selectedId]: a } });
      setSelState(null);
    },
    [selectedId, plan, onPlanChange, say, state, onMove, moveTo],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if (e.key === 'Escape') setSelState(null);
      if ((e.key === 'r' || e.key === 'R') && phase === 'plan' && !e.metaKey && !e.ctrlKey) onRun();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, onRun]);

  const built0 = useMemo(() => buildView(state, phase, report, step, plan, summary), [state, phase, report, step, plan, summary]);
  const built = notices ? { ...built0, view: { ...built0.view, notices } } : built0;

  const jobHints = useMemo(() => {
    if (!planning || !selectedId || !plan) return undefined;
    const out: Partial<Record<ZoneId, JobHint>> = {};
    for (const z of Object.keys(ZONE_JOB) as ZoneId[]) {
      const job = ZONE_JOB[z];
      if (plan.assignments[selectedId] === job) {
        out[z] = { text: 'Current job', blocked: false };
        continue;
      }
      const pv = jobPreview(state, plan, selectedId, job);
      out[z] = pv.full ? { text: 'Full', blocked: true } : pv.blocked ? { text: pv.blocked, blocked: true } : { text: pv.yield, blocked: false };
    }
    return out;
  }, [planning, selectedId, plan, state]);

  const problemZones = useMemo(() => {
    if (!planning || !plan || !interactive) return undefined;
    const out: Partial<Record<ZoneId, 'urgent' | 'warn'>> = {};
    for (const p of computeProblems(state, plan)) if (!p.floor && out[p.zone] !== 'urgent') out[p.zone] = p.level;
    return out;
  }, [planning, plan, state, interactive]);

  // Lessons point at one thing at a time: the person, then (once selected) where they should go.
  const lessonTarget = useMemo(() => {
    if (!planning || !focus) return { staff: [] as string[], zones: [] as ZoneId[] };
    if (!focus.staff.length) return { staff: [], zones: focus.zones };
    if (!selectedId) return { staff: [focus.staff[0]], zones: [] };
    const i = focus.staff.indexOf(selectedId);
    if (i < 0) return { staff: [], zones: [] };
    return { staff: [], zones: focus.staff.length === 1 ? focus.zones : [focus.zones[i]] };
  }, [planning, focus, selectedId]);

  // In a lesson, only the target place (and the person's current job) carries a hint.
  const shownHints = useMemo(() => {
    if (!jobHints || !focus || !plan || !selectedId) return jobHints;
    const keep = new Set<ZoneId>([...lessonTarget.zones, ...(Object.keys(ZONE_JOB) as ZoneId[]).filter((z) => ZONE_JOB[z] === plan.assignments[selectedId])]);
    return Object.fromEntries(Object.entries(jobHints).filter(([z]) => keep.has(z as ZoneId))) as Partial<Record<ZoneId, JobHint>>;
  }, [jobHints, focus, plan, selectedId, lessonTarget]);

  const selectedStaff = state.staff.find((s) => s.id === selectedId);
  // Live play: the stockroom opens the ordering panel.
  const stockroom = useMemo<StoreStockroom | undefined>(() => {
    if (!live) return undefined;
    const warnings = runOutWarnings(state);
    const tags: Partial<Record<DeptId, string>> = {};
    for (const d of state.ctx.depts) {
      const inc = incomingFor(state, d);
      if (inc.length) tags[d] = inc[0].label;
    }
    return {
      onOpen: () => setSel(sel?.kind === 'stockroom' ? null : { kind: 'stockroom' }),
      open: sel?.kind === 'stockroom',
      alert: warnings.some((w) => w.minutes <= 20) ? 'urgent' : warnings.length ? 'warn' : null,
      tags,
    };
  }, [live, state, sel, setSel]);
  const ctx: PanelContext = { sel, setSel, step, onPlanChange, summary, dismissSummary };
  const replayClock = phase === 'replay' && report ? built.view.clock : null;

  return (
    <main className="shop" id="main">
      <div className="stage-col">
        <div className="store-stage">
          <Store
            view={built.view}
            staff={built.staff}
            assignments={built.assignments}
            activity={built.activity}
            fit={fitFromContext(state.ctx)}
            selected={planning ? selectedId : null}
            onSelectStaff={(id) => setSel(selectedId === id ? null : { kind: 'staff', id })}
            onZone={onZone}
            context={planning ? contextZone : null}
            onContext={(z) => setSel(z && contextZone !== z ? { kind: 'zone', zone: z } : null)}
            interactive={planning && interactive}
            animating={phase === 'replay' || (live && !paused)}
            onDrop={onMove && interactive ? moveTo : undefined}
            pops={pops}
            floor={floor}
            onTask={onAssignTask && interactive ? onTask : undefined}
            stockroom={stockroom}
            office={office && live ? { onOpen: () => setSel(sel?.kind === 'office' ? null : { kind: 'office' }), open: sel?.kind === 'office' } : undefined}
            reducedMotion={reduced}
            highlightZones={lessonTarget.zones}
            highlightStaff={lessonTarget.staff}
            jobHints={shownHints}
            problemZones={problemZones}
            detail={planning ? contextZone : null}
          />
          {replayClock && (
            <p className="stage-chip stage-replay" role="status">
              Replay of what happened · {replayClock}
            </p>
          )}
          {live && paused && !selectedStaff && (
            <p className="stage-chip stage-paused" role="status">
              Paused · press Space to carry on
            </p>
          )}
          {planning && selectedStaff && (
            <p className="stage-chip" role="status">
              Moving {selectedStaff.name}: {live ? 'drag or click a place' : 'click a highlighted place'} · Esc to cancel
            </p>
          )}
          {toast && (
            <p className={`stage-chip stage-toast ${toast.warn ? 'warn' : ''}`} role="status">
              {toast.text}
            </p>
          )}
        </div>
        <div className="action-bar">
          <div className="action-tools">{tools?.(ctx)}</div>
          {clock && <div className="action-main">{clock}</div>}
          {primary && !clock && (
            <div className="action-main">
              {primary.note && <span className={`action-note ${primary.noteTone === 'bad' ? 'bad' : ''}`}>{primary.note}</span>}
              <button type="button" className="btn-primary btn-run" onClick={primary.onClick} disabled={primary.disabled}>
                {primary.label}
              </button>
            </div>
          )}
        </div>
      </div>
      <aside className="panel" aria-label="Selected">
        {panel(ctx)}
      </aside>
    </main>
  );
}

/** "Chilled food: short → OK" for rows whose estimated status a move changed. */
function statusChanges(before: Outlook | null, after: Outlook | null): string {
  if (!before || !after) return '';
  const word = { ok: 'OK', tight: 'tight', short: 'short' } as const;
  const out: string[] = [];
  for (const r of after.rows) {
    const b = before.rows.find((x) => x.zone === r.zone);
    if (b && b.status !== r.status) out.push(`${r.label}: ${word[b.status]} → ${word[r.status]}`);
  }
  return out.length ? `Estimate: ${out.join(', ')}.` : '';
}

interface Built {
  view: StoreView;
  staff: StaffMember[];
  assignments: Record<string, AssignmentId>;
  activity: Record<string, Activity>;
}

function hourActivity(report: HourReport): Record<string, Activity> {
  return Object.fromEntries(report.staff.map((r) => [r.id, r.utilisation === null || r.utilisation >= 0.3 ? 'work' : 'idle']));
}

/** The summary's outcomes, tagged beside the places they happened. */
function outcomeNotices(report: HourReport): ShopNotice[] {
  return intervalOutcomes(report)
    .slice(0, 3)
    .map((o) => ({ zone: o.zone, text: o.tag, tone: o.tone }));
}

function buildView(state: SimState, phase: 'plan' | 'replay' | 'results' | 'live', report: HourReport | null, step: number, plan: HourPlan | null, summary: HourReport | null): Built {
  const shelfCap = perDept((d) => shelfCapacity(state, d));
  const promoNow = (h: number) => DEPTS.filter((d) => promotionActive(state, d, h));
  const markdownNow = (h: number) => DEPTS.filter((d) => markdownActive(state, d, h));
  if (phase === 'replay' && report) {
    const s = report.steps[Math.min(step, report.steps.length - 1)];
    const frac = (step + 1) / report.steps.length;
    const staff = report.staff.map((r) => {
      const base = state.staff.find((x) => x.id === r.id)!;
      return { ...base, energy: r.energyBefore + (r.energyAfter - r.energyBefore) * frac };
    });
    const assignments = Object.fromEntries(report.staff.map((r) => [r.id, r.assignment]));
    const cap = perDept((d) =>
      d === 'chilled' && s.fridgeFault ? state.ctx.shelfCap.chilled * CONFIG.events.fridgeFault.capacityShare : state.ctx.shelfCap[d],
    );
    const abs = Math.min(report.fromStep + step + 1, CONFIG.stepsPerHour - 1);
    const dropped = report.steps.slice(0, step + 1).reduce((t, x) => t + x.abandoned, 0);
    const acts = Object.fromEntries(stepActivity(report, step).map((x) => [x.id, x.activity]));
    return {
      view: {
        shelf: s.shelf,
        shelfCap: cap,
        backroom: s.backroom,
        dock: s.dock,
        queue: s.queue,
        arrivals: s.arrivals,
        abandoned: s.abandoned,
        dropped,
        emptyDepts: s.emptyDepts,
        fridgeFault: s.fridgeFault,
        lorry: s.dock > 0 && step === 0 && report.fromStep === 0,
        promo: promoNow(report.hour),
        markdown: markdownNow(report.hour),
        notices: [],
        tick: `${report.hour}-${report.fromStep}-${step}`,
        clock: clockLabel(report.hour, abs),
      },
      staff,
      assignments,
      activity: acts,
    };
  }
  const shelf = perDept((d) => deptUnits(state, d).shelf);
  const backroom = perDept((d) => deptUnits(state, d).backroom);
  const dock = DEPTS.reduce((t, d) => t + deptUnits(state, d).dock, 0);
  const planned = plan?.actions ?? [];
  const clock = state.hour >= state.ctx.hours ? hourLabel(state.ctx.hours) : clockLabel(state.hour, state.step ?? 0);
  const view = storeViewFromState({
    shelf,
    shelfCap,
    backroom,
    dock,
    queue: state.queue.customers,
    fridgeFault: state.fridge.status === 'fault',
    lorry: false,
    promo: phase === 'plan' || phase === 'live' ? [...new Set([...promoNow(state.hour), ...planned.flatMap((a) => (a.kind === 'promotion' ? [a.dept] : []))])] : promoNow(state.hour),
    markdown: phase === 'plan' || phase === 'live' ? [...new Set([...markdownNow(state.hour), ...planned.flatMap((a) => (a.kind === 'markdown' ? [a.dept] : []))])] : markdownNow(state.hour),
    dropped: summary ? summary.customersAbandoned : 0,
    notices: summary ? outcomeNotices(summary) : [],
    clock,
  });
  if (phase === 'live' && state.hour < state.ctx.hours) {
    // Shoppers browsing: about ten minutes' worth of arrivals, refreshed every ten minutes.
    view.arrivals = liveBrowsing(state);
    view.tick = `${state.hour}-${Math.floor((state.step ?? 0) / 10)}`;
  }
  if (phase === 'results' && report) {
    const assignments = Object.fromEntries(report.staff.map((r) => [r.id, r.assignment]));
    return { view, staff: state.staff.filter((s) => assignments[s.id]), assignments, activity: hourActivity(report) };
  }
  return { view, staff: onShift(state), assignments: plan?.assignments ?? {}, activity: {} };
}

export { ZONE_NAME };

/** A still picture of the shop (before opening, between days, at closing). */
export function ShopPicture({ state, plan = null, label }: { state: SimState; plan?: HourPlan | null; label: string }) {
  const built = buildView(state, 'plan', null, 0, plan, null);
  return (
    <div className="shop-picture" role="img" aria-label={label}>
      <Store
        view={built.view}
        staff={built.staff}
        assignments={built.assignments}
        activity={built.activity}
        fit={fitFromContext(state.ctx)}
        selected={null}
        onSelectStaff={() => {}}
        onZone={() => {}}
        context={null}
        onContext={() => {}}
        interactive={false}
        animating={false}
        reducedMotion
      />
    </div>
  );
}
