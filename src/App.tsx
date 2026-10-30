import { useEffect, useMemo, useState } from 'react';
import { CONFIG } from './sim/config';
import { describeAction, recommendedSetup, teamSize, weekdayName } from './sim/engine';
import { campaignPool, liveValue, teamWellbeing, type CampaignState, type UpgradeId } from './sim/campaign';
import { getStorage, loadMode, saveMode, type Mode } from './sim/save';
import { CORE_LESSONS, LESSONS } from './sim/tutorial';
import { QUICK_TARGETS } from './sim/summary';
import { useGame } from './ui/useGame';
import { useCampaign } from './ui/useCampaign';
import type { LiveDay } from './ui/useLiveDay';
import { StatusBar, type CampaignStatus } from './ui/StatusBar';
import { GamePanel } from './ui/PlanPanel';
import { GameTools } from './ui/ActionTools';
import { Setup } from './ui/Setup';
import { Opening } from './ui/Opening';
import { Closing } from './ui/Closing';
import { ClockControls } from './ui/ClockControls';
import { dayKicker, Investments, MorningScreen, ValueLines } from './ui/CampaignScreens';
import { Help, Menu, SettingsDialog, type MenuItem } from './ui/Dialogs';
import { ShopScreen } from './ui/ShopScreen';
import { LessonPanel, lessonPrimary, useTutorial } from './ui/Tutorial';
import { unlockAudio } from './ui/sound';
import { EventDialog } from './ui/EventDialog';
import type { HiringProps } from './ui/Hiring';
import type { StoreFloor } from './ui/Store';
import { BURST_TEXT, burstAtDoor, taskText } from './sim/floor';
import { stepOf } from './sim/live';
import type { SimState } from './sim/types';
import type { Game } from './ui/useGame';

type AppMode = Mode | 'tutorial';

export default function App() {
  const storage = useMemo(() => getStorage(), []);
  const game = useGame();
  const week = useCampaign(storage, game.settings.sound);
  const tutorial = useTutorial(storage, false);
  const [mode, setModeState] = useState<AppMode>(() => (tutorial.progress.active ? 'tutorial' : loadMode(storage)));
  const [dialog, setDialog] = useState<null | 'help' | 'settings' | 'menu'>(null);
  const reduced = game.settings.reducedMotion || prefersReducedMotion();
  const quickInProgress = game.phase === 'trading' && game.record.minute > 0;
  const activeDay: LiveDay | null = mode === 'campaign' && week.phase === 'trading' ? week.day : mode === 'quick' && game.phase === 'trading' ? game.day : null;

  // Browsers only allow sound after a click or key press.
  useEffect(() => {
    const unlock = () => unlockAudio();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  const setMode = (m: AppMode) => {
    setModeState(m);
    if (m !== 'tutorial') saveMode(storage, m);
    setDialog(null);
  };
  // Opening a dialog pauses the clock.
  const openDialog = (d: 'help' | 'settings' | 'menu') => {
    activeDay?.clock.setPaused(true);
    setDialog(d);
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
    if (custom) game.playCurated();
    else if (game.phase !== 'trading') game.playCurated(recommendedSetup());
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
  const sound = { on: game.settings.sound, toggle: () => game.setSettings({ sound: !game.settings.sound }) };
  const bar = (state: SimState | null, campaign?: CampaignStatus) => (
    <StatusBar
      state={state}
      campaign={campaign}
      saveOk={mode === 'campaign' ? week.saveOk : game.saveOk}
      onHelp={() => openDialog('help')}
      onSettings={() => openDialog('settings')}
      onMenu={() => openDialog('menu')}
      sound={sound}
    />
  );

  const menuItems: MenuItem[] =
    mode === 'campaign'
      ? [
          ...(week.phase !== 'morning' ? [{ label: `Restart ${weekdayName(week.camp.day)}`, onClick: () => { week.restart(); setDialog(null); }, primary: true }] : []),
          { label: 'Start again with a new shop', onClick: () => { week.newShop(); setDialog(null); } },
          { label: 'Home', onClick: () => setMode('home') },
        ]
      : mode === 'quick'
        ? [
            { label: 'Retry same Saturday', onClick: () => { game.retrySameSaturday(recommendedSetup()); setDialog(null); }, primary: true },
            { label: 'New Saturday (different demand and events)', onClick: () => { game.newSaturday(recommendedSetup()); setDialog(null); } },
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
            week={{ label: week.started ? `Continue · ${weekdayName(week.camp.day)}, day ${week.camp.day + 1}` : 'Open the shop', continuing: week.started }}
            onWeek={() => setMode('campaign')}
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
            replaySpeed="normal"
            steps={t.lesson.steps}
            focus={t.phase === 'plan' ? t.lesson.focus(t.start, t.draft) : undefined}
            primary={lessonPrimary(t, fullSaturday)}
            panel={(ctx) => <LessonPanel t={t} ctx={ctx} onFullSaturday={fullSaturday} />}
          />
        </>
      )}
      {mode === 'campaign' && <ShopView week={week} reduced={reduced} bar={bar} />}
      {mode === 'quick' && <QuickView game={game} reduced={reduced} bar={bar} onHome={() => setMode('home')} />}
      {dialog === 'help' && <Help onClose={() => setDialog(null)} />}
      {dialog === 'settings' && <SettingsDialog settings={game.settings} onChange={game.setSettings} onClose={() => setDialog(null)} />}
      {dialog === 'menu' && (
        <Menu
          title={mode === 'campaign' ? 'Your shop' : mode === 'quick' ? 'Quick play' : 'Menu'}
          note={mode === 'campaign' ? 'Restarting a day takes you back to its morning: the day’s choices are undone, earlier days are kept.' : mode === 'quick' ? 'Starting again discards this attempt.' : undefined}
          items={menuItems}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Your shop, day after day
// ---------------------------------------------------------------------------

function ShopView({ week, reduced, bar }: { week: ReturnType<typeof useCampaign>; reduced: boolean; bar: (s: SimState | null, c?: CampaignStatus) => JSX.Element }) {
  const { camp, state } = week;
  if (week.phase === 'morning')
    return (
      <>
        {bar(null)}
        <MorningScreen key={`${week.record.seed}-${camp.day}`} camp={camp} onOpen={week.openShop} reduced={reduced} />
      </>
    );
  if (!state) return null;
  if (week.phase === 'closed' && week.closed) {
    const after = week.closed.camp;
    return (
      <>
        {bar(null)}
        <Closing
          key={`close-${camp.day}`}
          state={state}
          title={`${weekdayName(camp.day)}: closed for the day`}
          kicker={dayKicker(camp.day)}
          cash={after.cash}
          wages={state.ledger.wages}
          plain
          targets={{ profit: 0, satisfaction: CONFIG.targets.satisfaction, wellbeing: CONFIG.targets.wellbeing }}
          primary={{ label: `Open tomorrow: ${weekdayName(camp.day + 1)} ▶`, onClick: week.continueDay }}
          extra={<Investments camp={after} closed={state} bought={week.pending} onBuy={(id: UpgradeId) => week.purchase(id)} onUndo={week.undoPurchase} />}
          accountsExtra={<ValueLines camp={after} />}
        />
      </>
    );
  }
  const status: CampaignStatus = {
    day: weekdayName(camp.day),
    reputation: camp.reputation,
    teamWellbeing: teamWellbeing(camp.staff),
    value: liveValue(camp, state),
  };
  return (
    <>
      {bar(state, status)}
      <LiveScreen day={week.day} state={state} reduced={reduced} camp={camp} />
    </>
  );
}

/** A trading day (your shop or Quick play), live: the shop, the clock and the one panel. */
function LiveScreen({ day, state, reduced, camp }: { day: LiveDay; state: SimState; reduced: boolean; camp?: CampaignState }) {
  const plan = day.live!.plan;
  // Your shop: the office's candidates (anyone hired today is off the list).
  const hiring: HiringProps | undefined = camp
    ? {
        candidates: campaignPool(camp).filter((p) => !state.hires?.some((h) => h.person.id === p.id) && !state.staff.some((s) => s.id === p.id)),
        teamSize: teamSize(state),
        teamLimit: state.ctx.teamLimit ?? CONFIG.hiring.teamLimit,
        cash: state.cash,
        step: stepOf(state),
        hours: state.ctx.hours,
        onHire: (p) => void day.apply({ ...plan, actions: [{ kind: 'hire', person: p }] }),
        reasonFor: (p) => describeAction(state, { kind: 'hire', person: p }).reason,
      }
    : undefined;
  const pending = state.floor?.pending ?? null;
  return (
    <>
    {pending && <EventDialog state={state} event={pending} onAnswer={day.answer} />}
    {import.meta.env.DEV && day.pacingLine && <p className="pacing-debug">{day.pacingLine}</p>}
    <ShopScreen
      state={state}
      plan={plan}
      setPlan={(p) => void day.apply(p)}
      phase="live"
      report={null}
      onRun={() => {}}
      onReplayDone={() => {}}
      reduced={reduced}
      replaySpeed="normal"
      steps={CONFIG.stepsPerHour - (state.step ?? 0)}
      primary={null}
      onMove={day.move}
      pops={day.pops}
      paused={day.clock.paused}
      clock={<ClockControls clock={day.clock} state={state} />}
      tools={(ctx) => <GameTools state={state} plan={plan} ctx={ctx} current={state.hour} planning />}
      panel={(ctx) => <GamePanel state={state} plan={plan} onChange={ctx.onPlanChange} sel={ctx.sel} setSel={ctx.setSel} hiring={hiring} />}
      office={!!camp}
      floor={storeFloor(state)}
      onAssignTask={day.assignTask}
      notice={day.toast}
    />
    </>
  );
}

/** Floor jobs and the cue at the door, for the shop drawing. */
function storeFloor(state: SimState): StoreFloor {
  const door = burstAtDoor(state.floor, stepOf(state));
  const now = stepOf(state);
  const tasks = state.floor?.tasks ?? [];
  return {
    tasks,
    labels: Object.fromEntries(tasks.map((t) => [t.id, taskText(t, now, state.staff.find((s) => s.id === t.assigned)?.name)])),
    door: door
      ? door.inMinutes > 0
        ? { text: BURST_TEXT[door.burst.kind].cue, detail: `About ${door.burst.shoppers} shoppers in ${door.inMinutes} min: open another till?`, arriving: false }
        : { text: BURST_TEXT[door.burst.kind].arriving, detail: `About ${door.burst.shoppers} shoppers coming in`, arriving: true }
      : null,
  };
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
  if (game.phase === 'closed')
    return (
      <>
        {bar(null)}
        <Closing
          state={game.state}
          targets={QUICK_TARGETS}
          title="Saturday complete"
          kicker={`Quick play${game.record.seed === 1 ? '' : ` · seed ${game.record.seed}`}`}
          primary={{ label: 'Try again ▶', onClick: () => game.retrySameSaturday(recommendedSetup()) }}
        />
      </>
    );
  return (
    <>
      {bar(game.state)}
      <LiveScreen day={game.day} state={game.state} reduced={reduced} />
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
