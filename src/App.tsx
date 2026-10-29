import { useCallback, useEffect, useMemo, useState } from 'react';
import { CONFIG, DEPTS, hourLabel } from './sim/config';
import { assignmentLimit, deptUnits, onShift, shelfCapacity, perDept } from './sim/engine';
import type { AssignmentId, HourReport, SimState, StaffMember } from './sim/types';
import { useGame, type Game } from './ui/useGame';
import { Brand, StatusBar } from './ui/StatusBar';
import { Store, storeViewFromState, type StoreView } from './ui/Store';
import { PlanPanel } from './ui/PlanPanel';
import { ReplayPanel, ResultsPanel } from './ui/ResultsPanel';
import { Setup } from './ui/Setup';
import { Closing } from './ui/Closing';
import { Help, Menu, SettingsDialog } from './ui/Dialogs';
import { ASSIGNMENT_LABEL } from './sim/roster';

export default function App() {
  const game = useGame();
  const [dialog, setDialog] = useState<null | 'help' | 'settings' | 'menu'>(null);
  const reduced = game.settings.reducedMotion || prefersReducedMotion();

  return (
    <div className={`app ${reduced ? 'reduced-motion' : ''}`}>
      <a className="skip-link" href="#main">
        Skip to main content
      </a>
      {game.phase === 'intro' ? (
        <Intro onStart={game.startSetup} />
      ) : (
        <>
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
        </>
      )}
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

function Intro({ onStart }: { onStart: () => void }) {
  return (
    <main className="intro" id="main">
      <div className="intro-card">
        <Brand />
        <h1>Stockwell &amp; Co</h1>
        <p className="lede">A small independent supermarket. One busy Saturday. You’re in charge.</p>
        <ol className="intro-steps">
          <li>
            <strong>Open:</strong> order stock and set prices for fruit &amp; veg, chilled food and cupboard essentials.
          </li>
          <li>
            <strong>Each hour:</strong> give your six staff a job — tills, filling a department, receiving deliveries or a break. Add a promotion, markdown,
            emergency order or temp if you need one.
          </li>
          <li>
            <strong>Run the hour</strong> and watch what happens. Then adjust. Eight hours, 09:00 to 17:00.
          </li>
        </ol>
        <p>
          Win with <strong>£{CONFIG.targets.operatingProfit}</strong> operating profit, customer satisfaction of <strong>{CONFIG.targets.satisfaction}</strong> and staff
          wellbeing of <strong>{CONFIG.targets.wellbeing}</strong>. Short-staffed tills mean queues; empty shelves mean lost sales; nobody can work all day without a cup
          of tea.
        </p>
        <p className="tiny muted">Progress saves automatically in this browser. Everything works with keyboard and mouse.</p>
        <button type="button" className="btn-primary btn-big" onClick={onStart} autoFocus>
          Put the kettle on and begin ▶
        </button>
      </div>
    </main>
  );
}

const STEP_MS = { normal: 700, fast: 320 };

function Shop({ game, state, reduced }: { game: Game; state: SimState; reduced: boolean }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const report = game.lastReport;
  const phase = game.phase;

  // Replay timer: purely presentational; the hour is already resolved.
  useEffect(() => {
    if (phase !== 'replay' || !report) return;
    setStep(0);
    const ms = reduced ? 900 : STEP_MS[game.settings.replaySpeed];
    let i = 0;
    const t = window.setInterval(() => {
      i += 1;
      if (i >= report.steps.length) {
        window.clearInterval(t);
        window.setTimeout(game.finishReplay, ms / 2);
      } else setStep(i);
    }, ms);
    return () => window.clearInterval(t);
  }, [phase, report, reduced, game.settings.replaySpeed, game.finishReplay]);

  const plan = game.draft;
  const [zoneMsg, setZoneMsg] = useState<string | null>(null);
  const onZone = useCallback(
    (a: AssignmentId) => {
      if (!selected || !plan) return;
      const count = Object.entries(plan.assignments).filter(([id, x]) => x === a && id !== selected).length;
      if (count >= assignmentLimit(a)) {
        setZoneMsg(`${ASSIGNMENT_LABEL[a]} already has ${assignmentLimit(a)}. Move someone out first.`);
        return;
      }
      game.setDraft({ ...plan, assignments: { ...plan.assignments, [selected]: a } });
      setZoneMsg(null);
      setSelected(null);
    },
    [selected, plan, game],
  );

  // Keyboard: R runs the hour, Escape clears the selection.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if (e.key === 'Escape') setSelected(null);
      if ((e.key === 'r' || e.key === 'R') && phase === 'plan' && !e.metaKey && !e.ctrlKey) game.runNextHour();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, game]);

  const { view, staff, assignments } = useMemo(() => buildView(state, phase, report, step, plan?.assignments ?? {}), [state, phase, report, step, plan]);

  return (
    <main className="shop" id="main">
      <div className="store-wrap">
        <Store
          view={view}
          staff={staff}
          assignments={assignments}
          selected={phase === 'plan' ? selected : null}
          onSelectStaff={(id) => setSelected((s) => (s === id ? null : id))}
          onZone={onZone}
          interactive={phase === 'plan'}
          animating={phase === 'replay'}
          reducedMotion={reduced}
        />
        <p className="store-hint" role="status">
          {phase === 'plan' && selected ? (
            <>
              Placing <strong>{state.staff.find((s) => s.id === selected)?.name}</strong>: click a highlighted zone, or press Escape.{' '}
              {zoneMsg && <strong className="bad">{zoneMsg}</strong>}
            </>
          ) : phase === 'plan' ? (
            'Click a staff token (or their name in the list) to move them.'
          ) : null}
        </p>
        <Legend />
      </div>
      <aside className="panel" aria-label="Decisions and results">
        {phase === 'plan' && plan && (
          <PlanPanel state={state} plan={plan} onChange={game.setDraft} selected={selected} onSelect={setSelected} onRun={game.runNextHour} />
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

function Legend() {
  return (
    <ul className="legend" aria-label="Key">
      <li>
        <span className="lg lg-ring" aria-hidden="true" /> Ring = energy (green fresh, yellow tired, red exhausted)
      </li>
      <li>
        <span className="lg lg-dot" aria-hidden="true" /> Shoppers
      </li>
      <li>
        <span className="lg lg-left" aria-hidden="true">
          ✕
        </span>{' '}
        Walked out
      </li>
      <li>
        <span aria-hidden="true">☕</span> On break · <span aria-hidden="true">·z</span> working slower
      </li>
    </ul>
  );
}

function buildView(
  state: SimState,
  phase: Game['phase'],
  report: HourReport | null,
  step: number,
  draftAssignments: Record<string, AssignmentId>,
): { view: StoreView; staff: StaffMember[]; assignments: Record<string, AssignmentId> } {
  const shelfCap = perDept((d) => shelfCapacity(state, d));
  if (phase === 'replay' && report) {
    const s = report.steps[Math.min(step, report.steps.length - 1)];
    const frac = (step + 1) / report.steps.length;
    const staff = report.staff.map((r) => {
      const base = state.staff.find((x) => x.id === r.id)!;
      return { ...base, energy: r.energyBefore + (r.energyAfter - r.energyBefore) * frac };
    });
    const assignments = Object.fromEntries(report.staff.map((r) => [r.id, r.assignment]));
    const cap = perDept((d) => (d === 'chilled' && s.fridgeFault ? CONFIG.departments.chilled.shelfCapacity * CONFIG.events.fridgeFault.capacityShare : CONFIG.departments[d].shelfCapacity));
    const mins = String((step + 1) * 10).padStart(2, '0');
    return {
      view: {
        shelf: s.shelf,
        shelfCap: cap,
        backroom: s.backroom,
        dock: s.dock,
        queue: s.queue,
        arrivals: s.arrivals,
        abandoned: s.abandoned,
        emptyDepts: s.emptyDepts,
        fridgeFault: s.fridgeFault,
        lorry: s.dock > 0 && step === 0,
        tick: `${report.hour}-${step}`,
        clock: `${hourLabel(report.hour).slice(0, 2)}:${mins === '60' ? '59' : mins}`,
      },
      staff,
      assignments,
    };
  }
  const shelf = perDept((d) => deptUnits(state, d).shelf);
  const backroom = perDept((d) => deptUnits(state, d).backroom);
  const dock = DEPTS.reduce((t, d) => t + deptUnits(state, d).dock, 0);
  const view = storeViewFromState({
    shelf,
    shelfCap,
    backroom,
    dock,
    queue: state.queue.customers,
    fridgeFault: state.fridge.status === 'fault',
    lorry: dock > 0,
    clock: state.hour >= CONFIG.hours ? '17:00' : hourLabel(state.hour),
  });
  if (phase === 'results' && report) {
    const assignments = Object.fromEntries(report.staff.map((r) => [r.id, r.assignment]));
    return { view, staff: state.staff.filter((s) => assignments[s.id]), assignments };
  }
  return { view, staff: onShift(state), assignments: draftAssignments };
}
