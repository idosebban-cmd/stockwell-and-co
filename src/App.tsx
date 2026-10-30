import { useMemo, useState } from 'react';
import { CONFIG } from './sim/config';
import { recommendedSetup, weekdayName } from './sim/engine';
import { campaignGoal, CAMPAIGN_DAYS, dayConfig, liveValue, teamWellbeing, type UpgradeId } from './sim/campaign';
import { getStorage, loadMode, saveMode, type Mode } from './sim/save';
import { CORE_LESSONS, LESSONS } from './sim/tutorial';
import { QUICK_TARGETS } from './sim/summary';
import { useGame } from './ui/useGame';
import { useCampaign } from './ui/useCampaign';
import { StatusBar, type CampaignStatus } from './ui/StatusBar';
import { GamePanel, runNote } from './ui/PlanPanel';
import { ReplayPanel, SummaryCard } from './ui/ResultsPanel';
import { GameTools } from './ui/ActionTools';
import { Setup } from './ui/Setup';
import { Opening } from './ui/Opening';
import { Closing } from './ui/Closing';
import { FailedWeek, Investments, MorningScreen, ValueLines, WeekResult } from './ui/CampaignScreens';
import { Help, Menu, SettingsDialog, type MenuItem } from './ui/Dialogs';
import { ShopScreen, type PrimaryAction } from './ui/ShopScreen';
import { LessonPanel, lessonPrimary, useTutorial } from './ui/Tutorial';
import type { HourPlan, HourReport, SimState } from './sim/types';
import type { Game } from './ui/useGame';

type AppMode = Mode | 'tutorial';

export default function App() {
  const storage = useMemo(() => getStorage(), []);
  const game = useGame();
  const week = useCampaign(storage, game.settings.skipReplay);
  const tutorial = useTutorial(storage, game.settings.skipReplay);
  const [mode, setModeState] = useState<AppMode>(() => (tutorial.progress.active ? 'tutorial' : loadMode(storage)));
  const [dialog, setDialog] = useState<null | 'help' | 'settings' | 'menu'>(null);
  const reduced = game.settings.reducedMotion || prefersReducedMotion();
  const quickInProgress = !!game.state && game.record.plans.length > 0 && game.phase !== 'closed';

  const setMode = (m: AppMode) => {
    setModeState(m);
    if (m !== 'tutorial') saveMode(storage, m);
    setDialog(null);
  };
  const learn = () => {
    tutorial.begin(0);
    setMode('tutorial');
  };
  const exitTutorial = () => {
    tutorial.exit();
    setMode('home');
  };
  const startQuick = (custom = false) => {
    if (custom || !quickInProgress) {
      game.playCurated();
      if (!custom) game.confirmSetup(recommendedSetup());
    }
    setMode('quick');
  };
  const fullSaturday = () => {
    tutorial.exit();
    setMode('campaign');
  };

  const t = tutorial;
  const lessonLabel = t.lesson.optional
    ? `Pricing ${t.index - CORE_LESSONS + 1} of ${LESSONS.length - CORE_LESSONS} · ${t.lesson.title}`
    : `Lesson ${t.index + 1} of ${CORE_LESSONS} · ${t.lesson.title}`;
  const bar = (state: SimState | null, campaign?: CampaignStatus) => (
    <StatusBar state={state} campaign={campaign} saveOk={mode === 'campaign' ? week.saveOk : game.saveOk} onHelp={() => setDialog('help')} onSettings={() => setDialog('settings')} onMenu={() => setDialog('menu')} />
  );

  const menuItems: MenuItem[] =
    mode === 'campaign'
      ? [
          ...(week.started && week.view !== 'finished' ? [{ label: `Restart ${weekdayName(week.rb.dayStart.day)}`, onClick: () => { week.restart(); setDialog(null); }, primary: true }] : []),
          { label: 'Start a new week', onClick: () => { week.newWeek(); setDialog(null); } },
          { label: 'Home', onClick: () => setMode('home') },
        ]
      : mode === 'quick'
        ? [
            { label: 'Retry same Saturday', onClick: () => { game.retrySameSaturday(); game.confirmSetup(recommendedSetup()); setDialog(null); }, primary: true },
            { label: 'New Saturday (different demand and events)', onClick: () => { game.newSaturday(); game.confirmSetup(recommendedSetup()); setDialog(null); } },
            { label: 'Home', onClick: () => setMode('home') },
          ]
        : [
            { label: 'Learn to play', onClick: learn },
            { label: 'Home', onClick: () => setMode('home') },
          ];

  return (
    <div className={`app ${reduced ? 'reduced-motion' : ''}`}>
      <a className="skip-link" href="#main">
        Skip to main content
      </a>
      {mode === 'home' && (
        <>
          {bar(null)}
          <Opening
            week={{ label: week.started && week.view !== 'finished' ? `Continue the week · ${weekdayName(week.rb.dayStart.day)}` : 'Start the week', continuing: week.started }}
            onWeek={() => {
              if (week.view === 'finished') week.newWeek();
              setMode('campaign');
            }}
            onQuick={() => startQuick()}
            quickInProgress={quickInProgress}
            onCustom={() => startQuick(true)}
            onLearn={learn}
            notice={week.notice}
            onDismissNotice={week.dismissNotice}
          />
        </>
      )}
      {mode === 'tutorial' && (
        <>
          <StatusBar
            state={null}
            tutorial={{ label: lessonLabel, progress: Math.min(t.index, CORE_LESSONS) / CORE_LESSONS, onExit: exitTutorial }}
            saveOk={game.saveOk}
            onHelp={() => setDialog('help')}
            onSettings={() => setDialog('settings')}
            onMenu={() => setDialog('menu')}
          />
          <ShopScreen
            key={`lesson-${t.index}`}
            state={t.state}
            plan={t.phase === 'plan' ? t.draft : null}
            setPlan={t.setDraft}
            phase={t.phase === 'plan' ? 'plan' : t.phase === 'replay' ? 'replay' : 'results'}
            report={t.run?.report ?? null}
            onRun={t.runNow}
            onReplayDone={t.finishReplay}
            reduced={reduced}
            replaySpeed={game.settings.replaySpeed}
            steps={t.lesson.steps}
            focus={t.phase === 'plan' ? t.lesson.focus(t.start, t.draft) : undefined}
            primary={lessonPrimary(t, fullSaturday)}
            panel={(ctx) => <LessonPanel t={t} ctx={ctx} onFullSaturday={fullSaturday} />}
          />
        </>
      )}
      {mode === 'campaign' && <WeekView week={week} reduced={reduced} replaySpeed={game.settings.replaySpeed} bar={bar} onQuick={() => startQuick()} />}
      {mode === 'quick' && <QuickView game={game} reduced={reduced} bar={bar} onHome={() => setMode('home')} />}
      {dialog === 'help' && <Help onClose={() => setDialog(null)} />}
      {dialog === 'settings' && <SettingsDialog settings={game.settings} onChange={game.setSettings} onClose={() => setDialog(null)} />}
      {dialog === 'menu' && (
        <Menu
          title={mode === 'campaign' ? 'The week' : mode === 'quick' ? 'Quick play' : 'Menu'}
          note={mode === 'campaign' ? 'Restarting a day takes you back to its morning: the day’s choices are undone, earlier days are kept.' : mode === 'quick' ? 'Starting again discards this attempt.' : undefined}
          items={menuItems}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The week
// ---------------------------------------------------------------------------

function WeekView({
  week,
  reduced,
  replaySpeed,
  bar,
  onQuick,
}: {
  week: ReturnType<typeof useCampaign>;
  reduced: boolean;
  replaySpeed: 'normal' | 'fast';
  bar: (s: SimState | null, c?: CampaignStatus) => JSX.Element;
  onQuick: () => void;
}) {
  const { rb, view, state } = week;
  const K = CONFIG.campaign;
  const status = (s: SimState): CampaignStatus => {
    const g = campaignGoal(rb.dayStart);
    return {
      day: weekdayName(s.ctx.weekday),
      profitTarget: dayConfig(s.ctx.weekday).profitTarget,
      reputation: rb.dayStart.reputation,
      reputationMin: K.objective.reputation,
      teamWellbeing: teamWellbeing(rb.dayStart.staff),
      wellbeingMin: K.objective.wellbeing,
      value: liveValue(rb.dayStart, s),
      valueTarget: g.target,
    };
  };

  if (view === 'morning')
    return (
      <>
        {bar(null)}
        <MorningScreen key={`${week.record.seed}-${rb.camp.day}`} camp={rb.camp} onOpen={week.openShop} reduced={reduced} />
      </>
    );
  if (view === 'failed')
    return (
      <>
        {bar(null)}
        <FailedWeek camp={rb.camp} onRestart={week.restart} onNewWeek={() => week.newWeek()} />
      </>
    );
  if (view === 'finished')
    return (
      <>
        {bar(null)}
        <WeekResult camp={rb.camp} onNewWeek={() => week.newWeek()} onQuick={onQuick} />
      </>
    );
  if (view === 'closed' && state) {
    const day = state.ctx.weekday;
    const last = day >= CAMPAIGN_DAYS - 1;
    return (
      <>
        {bar(null)}
        <Closing
          key={`close-${day}`}
          state={state}
          title={`${weekdayName(day)} complete`}
          kicker={`Day ${day + 1} of ${CAMPAIGN_DAYS}`}
          cash={rb.camp.cash}
          targets={{ profit: dayConfig(day).profitTarget, satisfaction: K.objective.reputation, wellbeing: K.objective.wellbeing }}
          primary={{ label: last ? 'See the week ▶' : `Next day: ${weekdayName(day + 1)} ▶`, onClick: week.continueDay }}
          extra={last ? undefined : <Investments camp={rb.camp} closed={state} bought={week.pending} onBuy={(id: UpgradeId) => week.purchase(id)} onUndo={week.undoPurchase} />}
          accountsExtra={<ValueLines camp={rb.camp} />}
        />
      </>
    );
  }
  if (!state) return null;
  const report = rb.reports.at(-1) ?? null;
  const planning = view === 'plan' && !!week.draft;
  const primary: PrimaryAction | null =
    view === 'replay'
      ? { label: 'Skip replay ▶', onClick: week.finishReplay }
      : planning
        ? (() => {
            const n = runNote(state, week.draft!);
            return { label: 'Run next hour ▶', onClick: week.runNextHour, disabled: n.disabled, note: n.note, noteTone: n.tone };
          })()
        : null;
  const shown = view === 'replay' ? (rb.previousState ?? state) : state;
  return (
    <>
      {bar(shown, status(shown))}
      <TradingScreen
        state={view === 'replay' ? (rb.previousState ?? state) : state}
        plan={planning ? week.draft : null}
        setPlan={week.setDraft}
        phase={view === 'replay' ? 'replay' : 'plan'}
        report={report}
        onRun={week.runNextHour}
        onReplayDone={week.finishReplay}
        reduced={reduced}
        replaySpeed={replaySpeed}
        primary={primary}
      />
    </>
  );
}

/** A trading day (week or Quick play): the shop, the action bar and the one panel. */
function TradingScreen({
  state,
  plan,
  setPlan,
  phase,
  report,
  onRun,
  onReplayDone,
  reduced,
  replaySpeed,
  primary,
}: {
  state: SimState;
  plan: HourPlan | null;
  setPlan: (p: HourPlan) => void;
  phase: 'plan' | 'replay' | 'results';
  report: HourReport | null;
  onRun: () => void;
  onReplayDone: () => void;
  reduced: boolean;
  replaySpeed: 'normal' | 'fast';
  primary: PrimaryAction | null;
}) {
  return (
    <ShopScreen
      state={state}
      plan={plan}
      setPlan={setPlan}
      phase={phase}
      report={report}
      onRun={onRun}
      onReplayDone={onReplayDone}
      reduced={reduced}
      replaySpeed={replaySpeed}
      steps={6}
      summaryOnPlan
      primary={primary}
      tools={(ctx) => <GameTools state={state} plan={plan} ctx={ctx} current={phase === 'replay' ? (report?.hour ?? state.hour) : state.hour} planning={phase === 'plan'} />}
      panel={(ctx) =>
        phase === 'plan' && plan ? (
          ctx.summary && !ctx.sel ? (
            <SummaryCard report={ctx.summary} onDismiss={ctx.dismissSummary} />
          ) : (
            <GamePanel state={state} plan={plan} onChange={ctx.onPlanChange} sel={ctx.sel} setSel={ctx.setSel} />
          )
        ) : phase === 'replay' && report ? (
          <ReplayPanel report={report} step={ctx.step} />
        ) : report ? (
          <SummaryCard report={report} />
        ) : null
      }
    />
  );
}

// ---------------------------------------------------------------------------
// Quick play: one Saturday
// ---------------------------------------------------------------------------

function QuickView({ game, reduced, bar, onHome }: { game: Game; reduced: boolean; bar: (s: SimState | null) => JSX.Element; onHome: () => void }) {
  if (game.phase === 'setup')
    return (
      <>
        {bar(null)}
        <Setup key={game.record.seed} seed={game.record.seed} onConfirm={game.confirmSetup} onBack={onHome} />
      </>
    );
  if (!game.state) return null;
  if (game.phase === 'closed' || game.phase === 'results') {
    const done = game.phase === 'closed' || game.state.hour >= game.state.ctx.hours;
    if (done && game.phase === 'closed')
      return (
        <>
          {bar(null)}
          <Closing
            state={game.state}
            targets={QUICK_TARGETS}
            title="Saturday complete"
            kicker={`Quick play${game.record.seed === 1 ? '' : ` · seed ${game.record.seed}`}`}
            primary={{ label: 'Try again ▶', onClick: () => { game.retrySameSaturday(); game.confirmSetup(recommendedSetup()); } }}
          />
        </>
      );
  }
  const primary: PrimaryAction | null =
    game.phase === 'replay'
      ? { label: 'Skip replay ▶', onClick: game.finishReplay }
      : game.phase === 'results'
        ? { label: 'Close up ▶', onClick: game.continueAfterResults }
        : game.phase === 'plan' && game.draft
          ? (() => {
              const n = runNote(game.state!, game.draft!);
              return { label: 'Run next hour ▶', onClick: game.runNextHour, disabled: n.disabled, note: n.note, noteTone: n.tone };
            })()
          : null;
  const shown = game.phase === 'replay' ? (game.previousState ?? game.state) : game.state;
  return (
    <>
      {bar(shown)}
      <TradingScreen
        state={game.state}
        plan={game.phase === 'plan' ? game.draft : null}
        setPlan={game.setDraft}
        phase={game.phase === 'replay' ? 'replay' : game.phase === 'results' ? 'results' : 'plan'}
        report={game.lastReport}
        onRun={game.runNextHour}
        onReplayDone={game.finishReplay}
        reduced={reduced}
        replaySpeed={game.settings.replaySpeed}
        primary={primary}
      />
    </>
  );
}

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}
