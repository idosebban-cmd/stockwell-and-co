import { useCallback, useEffect, useMemo, useState } from 'react';
import { CONFIG, DEPTS, hourLabel } from './sim/config';
import { assignmentLimit, deptUnits, markdownActive, onShift, perDept, promotionActive, shelfCapacity } from './sim/engine';
import { ASSIGNMENT_LABEL } from './sim/roster';
import type { AssignmentId, HourPlan, HourReport, SimState, StaffMember } from './sim/types';
import { useGame, type Game } from './ui/useGame';
import { StatusBar } from './ui/StatusBar';
import { STORE_SIZE, Store, staffPositions, storeViewFromState, type Activity, type StoreView, type ZoneId } from './ui/Store';
import { activeTip, shopNotices, tipText, TIP_ORDER, type TipId } from './ui/Coach';
import { PlanPanel } from './ui/PlanPanel';
import { ReplayPanel, ResultsPanel } from './ui/ResultsPanel';
import { Setup } from './ui/Setup';
import { Closing } from './ui/Closing';
import { Forecast } from './ui/Forecast';
import { Help, Menu, SettingsDialog } from './ui/Dialogs';
import { stepActivity } from './ui/activity';

export default function App() {
  const game = useGame();
  const [dialog, setDialog] = useState<null | 'help' | 'settings' | 'menu'>(null);
  const reduced = game.settings.reducedMotion || prefersReducedMotion();

  return (
    <div className={`app ${reduced ? 'reduced-motion' : ''}`}>
      <a className="skip-link" href="#main">
        Skip to main content
      </a>
      <StatusBar
        state={game.phase === 'setup' ? null : game.phase === 'replay' ? (game.previousState ?? game.state) : game.state}
        saveOk={game.saveOk}
        onHelp={() => setDialog('help')}
        onSettings={() => setDialog('settings')}
        onMenu={() => setDialog('menu')}
      />
      {game.phase === 'setup' && <Setup key={game.record.seed} seed={game.record.seed} onConfirm={game.confirmSetup} />}
      {game.phase === 'closed' && game.state && <Closing state={game.state} onRetry={game.retrySameSaturday} onNew={game.newSaturday} />}
      {(game.phase === 'plan' || game.phase === 'replay' || game.phase === 'results') && game.state && <Shop game={game} state={game.state} reduced={reduced} />}
      {dialog === 'help' && <Help onClose={() => setDialog(null)} />}
      {dialog === 'settings' && <SettingsDialog settings={game.settings} onChange={game.setSettings} onClose={() => setDialog(null)} />}
      {dialog === 'menu' && (
        <Menu
          seed={game.record.seed}
          onClose={() => setDialog(null)}
          onRetry={() => {
            game.retrySameSaturday();
            setDialog(null);
          }}
          onNew={() => {
            game.newSaturday();
            setDialog(null);
          }}
          onCurated={() => {
            game.playCurated();
            setDialog(null);
          }}
        />
      )}
    </div>
  );
}

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

const STEP_MS = { normal: 800, fast: 380 };

function Shop({ game, state, reduced }: { game: Game; state: SimState; reduced: boolean }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [context, setContext] = useState<ZoneId | null>(null);
  const [zoneMsg, setZoneMsg] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const report = game.lastReport;
  const phase = game.phase;

  // Replay timer: purely presentational; the hour is already resolved.
  useEffect(() => {
    if (phase !== 'replay' || !report) return;
    setStep(0);
    const ms = reduced ? 1000 : STEP_MS[game.settings.replaySpeed];
    let i = 0;
    let done: number | undefined;
    const t = window.setInterval(() => {
      i += 1;
      if (i >= report.steps.length) {
        window.clearInterval(t);
        done = window.setTimeout(game.finishReplay, ms / 2);
      } else setStep(i);
    }, ms);
    return () => {
      window.clearInterval(t);
      if (done) window.clearTimeout(done);
    };
  }, [phase, report, reduced, game.settings.replaySpeed, game.finishReplay]);

  const plan = game.draft;
  const tipsDone = game.settings.tipsDone;
  const markTip = (...ids: TipId[]) => {
    const missing = ids.filter((t) => !tipsDone.includes(t));
    if (missing.length) game.setSettings({ tipsDone: [...tipsDone, ...missing] });
  };
  const tip = phase === 'plan' ? activeTip(tipsDone, selected) : null;
  const onPlanChange = (p: HourPlan) => {
    if (plan && JSON.stringify(p.assignments) !== JSON.stringify(plan.assignments)) markTip('select', 'assign');
    game.setDraft(p);
  };
  const run = () => {
    markTip(...TIP_ORDER);
    game.runNextHour();
  };
  const onZone = useCallback(
    (a: AssignmentId) => {
      if (!selected || !plan) return;
      const count = Object.entries(plan.assignments).filter(([id, x]) => x === a && id !== selected).length;
      if (count >= assignmentLimit(a)) {
        setZoneMsg(`${ASSIGNMENT_LABEL[a]} already has ${assignmentLimit(a)}. Move someone out first.`);
        return;
      }
      game.setDraft({ ...plan, assignments: { ...plan.assignments, [selected]: a } });
      markTip('select', 'assign');
      setZoneMsg(null);
      setSelected(null);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selected, plan, game],
  );

  // Keyboard: R runs the hour, Escape clears the selection.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if (e.key === 'Escape') {
        setSelected(null);
        setZoneMsg(null);
      }
      if ((e.key === 'r' || e.key === 'R') && phase === 'plan' && !e.metaKey && !e.ctrlKey) run();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const built = useMemo(() => buildView(state, phase, report, step, plan), [state, phase, report, step, plan]);
  const selectedName = state.staff.find((s) => s.id === selected)?.name;
  const positions = staffPositions(built.staff, built.assignments);
  const anchorId = tip === 'assign' ? selected : (built.staff.find((s) => s.id === 'mags') ?? built.staff[0])?.id;
  const anchor = anchorId ? positions[anchorId] : undefined;

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
            onSelectStaff={(id) => {
              setZoneMsg(null);
              markTip('select');
              setSelected((s) => (s === id ? null : id));
            }}
            onZone={onZone}
            context={phase === 'plan' ? context : null}
            onContext={setContext}
            interactive={phase === 'plan'}
            animating={phase === 'replay'}
            reducedMotion={reduced}
          />
          {(tip === 'select' || tip === 'assign') && anchor && (
            <Callout
              x={anchor[0]}
              y={anchor[1] - 62}
              text={tipText(tip, selectedName)}
              onDismiss={() => markTip(tip)}
              onSkipAll={() => markTip(...TIP_ORDER)}
            />
          )}
          {zoneMsg && selected && anchor && <Callout x={anchor[0]} y={anchor[1] - 62} text={zoneMsg} warn onDismiss={() => setZoneMsg(null)} />}
          {phase === 'plan' && selected && !tip && !zoneMsg && (
            <p className="stage-chip" role="status">
              Moving {selectedName} · click a place · Esc to cancel
            </p>
          )}
          </div>
        </div>
        <div className="below-store">
          <Forecast scenario={state.scenario} currentHour={phase === 'plan' ? state.hour : (report?.hour ?? state.hour)} knownUpTo={state.hour} reports={state.history} strip />
          <Legend />
        </div>
      </div>
      <aside className="panel" aria-label="Decisions and results">
        {phase === 'plan' && plan && (
          <PlanPanel
            state={state}
            plan={plan}
            onChange={onPlanChange}
            runTip={tip === 'run' ? { text: tipText('run'), onDismiss: () => markTip('run') } : null}
            selected={selected}
            onSelect={setSelected}
            context={context}
            onContext={setContext}
            onRun={run}
          />
        )}
        {phase === 'replay' && report && <ReplayPanel report={report} step={step} onSkip={game.finishReplay} />}
        {phase === 'results' && report && <ResultsPanel report={report} onContinue={game.continueAfterResults} last={state.hour >= CONFIG.hours} />}
        {phase === 'results' && !report && (
          <div className="panel-inner">
            <button type="button" className="btn-primary" onClick={game.continueAfterResults}>
              Continue
            </button>
          </div>
        )}
      </aside>
    </main>
  );
}

function Callout({ x, y, text, warn, onDismiss, onSkipAll }: { x: number; y: number; text: string; warn?: boolean; onDismiss: () => void; onSkipAll?: () => void }) {
  const below = y < 140;
  const style = { left: `${(x / STORE_SIZE.w) * 100}%`, top: `${((below ? y + 120 : y) / STORE_SIZE.h) * 100}%` };
  return (
    <div className={`callout ${below ? 'callout-below' : ''} ${warn ? 'callout-warn' : ''}`} style={style} role="status">
      <p>{text}</p>
      <div className="callout-actions">
        {onSkipAll && (
          <button type="button" className="btn-link" onClick={onSkipAll}>
            Skip tips
          </button>
        )}
        <button type="button" className="callout-x" onClick={onDismiss} aria-label="Dismiss">
          ✕
        </button>
      </div>
    </div>
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
        <span aria-hidden="true">✕</span> gave up queueing
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

function stepActivityMap(report: HourReport, step: number): Record<string, Activity> {
  return Object.fromEntries(stepActivity(report, step).map((x) => [x.id, x.activity]));
}

function hourActivity(report: HourReport): Record<string, Activity> {
  return Object.fromEntries(report.staff.map((r) => [r.id, r.utilisation === null || r.utilisation >= 0.3 ? 'work' : 'idle']));
}

function buildView(state: SimState, phase: Game['phase'], report: HourReport | null, step: number, plan: HourPlan | null): Built {
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
    const mins = String((step + 1) * 10).padStart(2, '0');
    const dropped = report.steps.slice(0, step + 1).reduce((t, x) => t + x.abandoned, 0);
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
        lorry: s.dock > 0 && step === 0,
        promo: promoNow(report.hour),
        notices: [],
        markdown: markdownNow(report.hour),
        tick: `${report.hour}-${step}`,
        clock: `${hourLabel(report.hour).slice(0, 2)}:${mins === '60' ? '59' : mins}`,
      },
      staff,
      assignments,
      activity: stepActivityMap(report, step),
    };
  }
  const shelf = perDept((d) => deptUnits(state, d).shelf);
  const backroom = perDept((d) => deptUnits(state, d).backroom);
  const dock = DEPTS.reduce((t, d) => t + deptUnits(state, d).dock, 0);
  const planned = plan?.actions ?? [];
  const view = storeViewFromState({
    shelf,
    shelfCap,
    backroom,
    dock,
    queue: state.queue.customers,
    fridgeFault: state.fridge.status === 'fault',
    lorry: dock > 0,
    // During planning, show this hour's running and planned promotions and markdowns.
    promo: phase === 'plan' ? [...new Set([...promoNow(state.hour), ...planned.flatMap((a) => (a.kind === 'promotion' ? [a.dept] : []))])] : promoNow(state.hour),
    markdown:
      phase === 'plan' ? [...new Set([...markdownNow(state.hour), ...planned.flatMap((a) => (a.kind === 'markdown' ? [a.dept] : []))])] : markdownNow(state.hour),
    dropped: phase === 'results' && report ? report.customersAbandoned : 0,
    notices: shopNotices(state, phase === 'plan' ? plan : null),
    clock: state.hour >= CONFIG.hours ? '17:00' : hourLabel(state.hour),
  });
  if (phase === 'results' && report) {
    const assignments = Object.fromEntries(report.staff.map((r) => [r.id, r.assignment]));
    return { view, staff: state.staff.filter((s) => assignments[s.id]), assignments, activity: hourActivity(report) };
  }
  return { view, staff: onShift(state), assignments: plan?.assignments ?? {}, activity: {} };
}
