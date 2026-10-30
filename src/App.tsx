import { useEffect, useMemo, useState } from 'react';
import { CONFIG } from './sim/config';
import { describeAction, teamSize, weekdayName } from './sim/engine';
import { campaignPool, type CampaignState, type UpgradeId } from './sim/campaign';
import { getStorage, loadMode, saveMode } from './sim/save';
import { useCampaign } from './ui/useCampaign';
import { useSettings } from './ui/useSettings';
import type { LiveDay } from './ui/useLiveDay';
import { StatusBar, type CampaignStatus } from './ui/StatusBar';
import { GamePanel } from './ui/PlanPanel';
import { GameTools } from './ui/ActionTools';
import { Opening } from './ui/Opening';
import { Closing } from './ui/Closing';
import { ClockControls } from './ui/ClockControls';
import { dayKicker, Investments, MorningScreen, ValueLines, ValueSummary } from './ui/CampaignScreens';
import { Help, Menu, SettingsDialog, type MenuItem } from './ui/Dialogs';
import { ShopScreen } from './ui/ShopScreen';
import { unlockAudio } from './ui/sound';
import { EventDialog } from './ui/EventDialog';
import type { HiringProps } from './ui/Hiring';
import type { StoreFloor } from './ui/Store';
import { BURST_TEXT, burstAtDoor, taskText } from './sim/floor';
import { stepOf } from './sim/live';
import type { SimState } from './sim/types';

type AppMode = 'home' | 'campaign';

export default function App() {
  const storage = useMemo(() => getStorage(), []);
  const { settings, setSettings } = useSettings();
  const week = useCampaign(storage, settings.sound);
  const [mode, setModeState] = useState<AppMode>(() => (loadMode(storage) === 'campaign' ? 'campaign' : 'home'));
  const [dialog, setDialog] = useState<null | 'help' | 'settings' | 'menu'>(null);
  const reduced = settings.reducedMotion || prefersReducedMotion();
  const activeDay: LiveDay | null = mode === 'campaign' && week.phase === 'trading' ? week.day : null;

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
    saveMode(storage, m);
    setDialog(null);
  };
  // Opening a dialog pauses the clock.
  const openDialog = (d: 'help' | 'settings' | 'menu') => {
    activeDay?.clock.setPaused(true);
    setDialog(d);
  };

  const sound = { on: settings.sound, toggle: () => setSettings({ sound: !settings.sound }) };
  const bar = (state: SimState | null, campaign?: CampaignStatus) => (
    <StatusBar
      state={state}
      campaign={campaign}
      saveOk={week.saveOk}
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
          { label: 'New shop', onClick: () => { week.newShop(); setDialog(null); } },
          { label: 'Home', onClick: () => setMode('home') },
        ]
      : [{ label: 'Play', onClick: () => setMode('campaign'), primary: true }];

  return (
    <div className={`app ${reduced ? 'reduced-motion' : ''}`}>
      <a className="skip-link" href="#main">
        Skip to main content
      </a>
      {mode === 'home' && (
        <>
          {bar(null)}
          <Opening label={week.started ? `Play · ${weekdayName(week.camp.day)}` : 'Play'} onPlay={() => setMode('campaign')} notice={week.notice} onDismissNotice={week.dismissNotice} />
        </>
      )}
      {mode === 'campaign' && <ShopView week={week} reduced={reduced} bar={bar} />}
      {dialog === 'help' && <Help onClose={() => setDialog(null)} />}
      {dialog === 'settings' && <SettingsDialog settings={settings} onChange={setSettings} onClose={() => setDialog(null)} />}
      {dialog === 'menu' && <Menu title="Menu" items={menuItems} onClose={() => setDialog(null)} />}
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
          value={<ValueSummary camp={after} />}
          accountsExtra={<ValueLines camp={after} />}
        />
      </>
    );
  }
  const status: CampaignStatus = { day: weekdayName(camp.day) };
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

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}
