import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CONFIG, DEPTS, hourLabel } from '../sim/config';
import { assignmentLimit, deptUnits, markdownActive, onShift, perDept, promotionActive, shelfCapacity } from '../sim/engine';
import { intervalOutcomes, jobPreview, problems as computeProblems } from '../sim/insight';
import { ASSIGNMENT_FUTURE, ASSIGNMENT_LABEL } from '../sim/roster';
import type { AssignmentId, HourPlan, HourReport, SimState, StaffMember } from '../sim/types';
import { Store, storeViewFromState, ZONE_JOB, type Activity, type JobHint, type ShopNotice, type StoreView, type ZoneId } from './Store';
import { shopNotices } from './Coach';
import { Forecast } from './Forecast';
import { stepActivity } from './activity';
import type { LessonFocus } from '../sim/tutorial';

export interface PanelContext {
  selected: string | null;
  setSelected: (id: string | null) => void;
  context: ZoneId | null;
  setContext: (z: ZoneId | null) => void;
  /** Replay step being shown. */
  step: number;
  /** Plan changes go through here so assignments are confirmed in the shop. */
  onPlanChange: (p: HourPlan) => void;
}

interface Props {
  state: SimState;
  plan: HourPlan | null;
  setPlan: (p: HourPlan) => void;
  phase: 'plan' | 'replay' | 'results';
  report: HourReport | null;
  onRun: () => void;
  onReplayDone: () => void;
  reduced: boolean;
  replaySpeed: 'normal' | 'fast';
  /** Ten-minute steps the next run covers. */
  steps: number;
  panel: (ctx: PanelContext) => ReactNode;
  focus?: LessonFocus;
  showForecast?: boolean;
}

const STEP_MS = { normal: 800, fast: 380 };

export function ShopScreen({ state, plan, setPlan, phase, report, onRun, onReplayDone, reduced, replaySpeed, steps, panel, focus, showForecast = true }: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const [context, setContext] = useState<ZoneId | null>(null);
  const [toast, setToast] = useState<{ text: string; warn?: boolean } | null>(null);
  const [step, setStep] = useState(0);
  const toastTimer = useRef<number | undefined>(undefined);

  const say = useCallback((text: string, warn = false) => {
    setToast({ text, warn });
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 3600);
  }, []);

  // Context opened for a lesson's price comparison.
  useEffect(() => {
    if (focus?.priceDept && phase === 'plan') setContext(focus.priceDept);
  }, [focus?.priceDept, phase]);
  useEffect(() => {
    if (phase !== 'plan') {
      setSelected(null);
      setToast(null);
    }
  }, [phase]);

  // Replay timer: purely presentational; the interval is already resolved.
  useEffect(() => {
    if (phase !== 'replay' || !report) return;
    setStep(0);
    const ms = reduced ? 1000 : STEP_MS[replaySpeed];
    let i = 0;
    let done: number | undefined;
    const t = window.setInterval(() => {
      i += 1;
      if (i >= report.steps.length) {
        window.clearInterval(t);
        done = window.setTimeout(onReplayDone, ms / 2);
      } else setStep(i);
    }, ms);
    return () => {
      window.clearInterval(t);
      if (done) window.clearTimeout(done);
    };
  }, [phase, report, reduced, replaySpeed, onReplayDone]);

  const when = steps >= 6 ? 'next hour' : `for the next ${steps * 10} minutes`;
  const onPlanChange = useCallback(
    (p: HourPlan) => {
      if (plan) {
        const changed = Object.entries(p.assignments).filter(([id, a]) => plan.assignments[id] !== a);
        if (changed.length) {
          const names = changed.map(([id, a]) => `${state.staff.find((s) => s.id === id)?.name} will ${ASSIGNMENT_FUTURE[a]}`);
          say(`${names.join('; ')} ${when}.`);
        }
      }
      setPlan(p);
    },
    [plan, setPlan, state.staff, say, when],
  );

  const onZone = useCallback(
    (a: AssignmentId) => {
      if (!selected || !plan) return;
      const count = Object.entries(plan.assignments).filter(([id, x]) => x === a && id !== selected).length;
      if (count >= assignmentLimit(a)) {
        say(`${ASSIGNMENT_LABEL[a]} already has ${assignmentLimit(a)}. Move someone out first.`, true);
        return;
      }
      onPlanChange({ ...plan, assignments: { ...plan.assignments, [selected]: a } });
      setSelected(null);
    },
    [selected, plan, onPlanChange, say],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if (e.key === 'Escape') {
        setSelected(null);
        setContext(null);
      }
      if ((e.key === 'r' || e.key === 'R') && phase === 'plan' && !e.metaKey && !e.ctrlKey) onRun();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, onRun]);

  const built = useMemo(() => buildView(state, phase, report, step, plan), [state, phase, report, step, plan]);

  const jobHints = useMemo(() => {
    if (phase !== 'plan' || !selected || !plan) return undefined;
    const out: Partial<Record<ZoneId, JobHint>> = {};
    for (const z of Object.keys(ZONE_JOB) as ZoneId[]) {
      const job = ZONE_JOB[z];
      if (plan.assignments[selected] === job) {
        out[z] = { text: 'Current job', blocked: false };
        continue;
      }
      const pv = jobPreview(state, plan, selected, job);
      out[z] = pv.full ? { text: 'Full', blocked: true } : pv.blocked ? { text: pv.blocked, blocked: true } : { text: pv.yield, blocked: false };
    }
    return out;
  }, [phase, selected, plan, state]);

  const problemZones = useMemo(() => {
    if (phase !== 'plan' || !plan) return undefined;
    const out: Partial<Record<ZoneId, 'urgent' | 'warn'>> = {};
    for (const p of computeProblems(state, plan)) if (out[p.zone] !== 'urgent') out[p.zone] = p.level;
    return out;
  }, [phase, plan, state]);

  const selectedStaff = state.staff.find((s) => s.id === selected);
  const banner = phase === 'plan' ? 'Plan · not started yet' : phase === 'replay' ? 'Recorded result · playing back' : 'Result';

  return (
    <main className="shop" id="main">
      <div className="store-col">
        <div className="store-wrap">
          <div className="store-stage">
            <Store
              view={built.view}
              staff={built.staff}
              assignments={built.assignments}
              activity={built.activity}
              selected={phase === 'plan' ? selected : null}
              onSelectStaff={(id) => setSelected((s) => (s === id ? null : id))}
              onZone={onZone}
              context={phase === 'plan' ? context : null}
              onContext={setContext}
              interactive={phase === 'plan'}
              animating={phase === 'replay'}
              reducedMotion={reduced}
              highlightZones={phase === 'plan' ? focus?.zones : undefined}
              highlightStaff={phase === 'plan' ? focus?.staff : undefined}
              jobHints={jobHints}
              problemZones={problemZones}
            />
            <p className={`stage-banner stage-${phase}`}>{banner}</p>
            {phase === 'plan' && selectedStaff && (
              <p className="stage-chip" role="status">
                Moving {selectedStaff.name} · click a place · Esc to cancel
              </p>
            )}
            {toast && (
              <p className={`stage-chip stage-toast ${toast.warn ? 'warn' : ''}`} role="status">
                {toast.text}
              </p>
            )}
          </div>
        </div>
        {showForecast && (
          <div className="below-store">
            <Forecast scenario={state.scenario} currentHour={phase === 'plan' ? state.hour : (report?.hour ?? state.hour)} knownUpTo={state.hour} reports={state.history} strip />
            <Legend />
          </div>
        )}
      </div>
      <aside className="panel" aria-label="Decisions and results">
        {panel({ selected, setSelected, context, setContext, step, onPlanChange })}
      </aside>
    </main>
  );
}

function Legend() {
  return (
    <ul className="legend" aria-label="Key">
      <li>Bar under a name = energy</li>
      <li>
        <span aria-hidden="true">…</span> nothing to do
      </li>
      <li>
        <span aria-hidden="true">z</span> tired, slower
      </li>
      <li>
        <span aria-hidden="true">?</span> shopper can’t find stock
      </li>
      <li>
        <span aria-hidden="true">!</span> needs attention: click it
      </li>
    </ul>
  );
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

function outcomeNotices(report: HourReport): ShopNotice[] {
  const seen = new Set<string>();
  const out: ShopNotice[] = [];
  for (const o of intervalOutcomes(report)) {
    const key = `${o.zone}-${o.tone}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ zone: o.zone, text: o.tag, tone: o.tone });
    if (out.length >= 5) break;
  }
  return out;
}

function buildView(state: SimState, phase: 'plan' | 'replay' | 'results', report: HourReport | null, step: number, plan: HourPlan | null): Built {
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
      d === 'chilled' && s.fridgeFault ? CONFIG.departments.chilled.shelfCapacity * CONFIG.events.fridgeFault.capacityShare : CONFIG.departments[d].shelfCapacity,
    );
    const abs = report.fromStep + step + 1;
    const mins = String(Math.min(abs, 6) * 10).padStart(2, '0');
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
        clock: `${hourLabel(report.hour).slice(0, 2)}:${mins === '60' ? '59' : mins}`,
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
  const clock = state.hour >= CONFIG.hours ? '17:00' : `${hourLabel(state.hour).slice(0, 2)}:${String((state.step ?? 0) * 10).padStart(2, '0')}`;
  const view = storeViewFromState({
    shelf,
    shelfCap,
    backroom,
    dock,
    queue: state.queue.customers,
    fridgeFault: state.fridge.status === 'fault',
    lorry: false,
    promo: phase === 'plan' ? [...new Set([...promoNow(state.hour), ...planned.flatMap((a) => (a.kind === 'promotion' ? [a.dept] : []))])] : promoNow(state.hour),
    markdown: phase === 'plan' ? [...new Set([...markdownNow(state.hour), ...planned.flatMap((a) => (a.kind === 'markdown' ? [a.dept] : []))])] : markdownNow(state.hour),
    dropped: phase === 'results' && report ? report.customersAbandoned : 0,
    notices: phase === 'results' && report ? outcomeNotices(report) : shopNotices(state, phase === 'plan' ? plan : null),
    clock,
  });
  if (phase === 'results' && report) {
    const assignments = Object.fromEntries(report.staff.map((r) => [r.id, r.assignment]));
    return { view, staff: state.staff.filter((s) => assignments[s.id]), assignments, activity: hourActivity(report) };
  }
  return { view, staff: onShift(state), assignments: plan?.assignments ?? {}, activity: {} };
}
