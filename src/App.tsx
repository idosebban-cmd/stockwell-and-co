import { useEffect, useMemo, useState } from 'react';
import { CONFIG } from './sim/config';
import { describeAction, teamSize, weekdayName } from './sim/engine';
import { campaignPool, type CampaignState } from './sim/campaign';
import { getStorage, loadMode, saveMode } from './sim/save';
import { useCampaign } from './ui/useCampaign';
import { useSettings } from './ui/useSettings';
import type { LiveDay } from './ui/useLiveDay';
import { StatusBar } from './ui/StatusBar';
import { SidePanel } from './ui/SidePanel';
import type { Clock } from './ui/useClock';
import { Opening } from './ui/Opening';
import { EndOfDay } from './ui/EndOfDay';
import { anythingOnSale, UpgradeSheet } from './ui/Upgrades';
import { dayHighlight, starsFor } from './sim/highlight';
import { MorningScreen } from './ui/CampaignScreens';
import { Help, Menu, SettingsDialog, type MenuItem } from './ui/Dialogs';
import { ShopScreen } from './ui/ShopScreen';
import { unlockAudio } from './ui/sound';
import { EventDialog } from './ui/EventDialog';
import type { StoreFloor } from './ui/Store';
import { BURST_TEXT, burstAtDoor, taskText } from './sim/floor';
import { stepOf } from './sim/live';
import type { Person, SimState } from './sim/types';

type AppMode = 'home' | 'campaign';

/** What the top bar shows. */
interface BarInfo {
  day?: string;
  state?: SimState;
  cash?: number;
  clock?: Clock;
  upgrades?: { onOpen: () => void; ready: boolean };
}

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
  const bar = (top: BarInfo = {}) => (
    <StatusBar
      day={top.day}
      state={top.state}
      cash={top.cash}
      clock={top.clock}
      upgrades={top.upgrades}
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
          {bar()}
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

function ShopView({ week, reduced, bar }: { week: ReturnType<typeof useCampaign>; reduced: boolean; bar: (top?: BarInfo) => JSX.Element }) {
  const { camp, state } = week;
  const [sheet, setSheet] = useState(false);
  if (week.phase === 'morning')
    return (
      <>
        {bar({ day: weekdayName(camp.day), cash: camp.cash, upgrades: { onOpen: () => setSheet(true), ready: anythingOnSale(camp) } })}
        <MorningScreen key={`${week.record.seed}-${camp.day}`} camp={camp} onOpen={week.openShop} reduced={reduced} onUpgrades={() => setSheet(true)} />
        {sheet && (
          <UpgradeSheet
            camp={camp}
            onBuy={(id) => {
              week.buyNow(id);
              setSheet(false);
            }}
            onClose={() => setSheet(false)}
          />
        )}
      </>
    );
  if (!state) return null;
  if (week.phase === 'closed' && week.closed) {
    const { result } = week.closed;
    const highlight = dayHighlight(state, result, camp);
    return (
      <>
        {bar({ day: weekdayName(camp.day), cash: week.closed.camp.cash })}
        <EndOfDay
          key={`close-${camp.day}`}
          day={weekdayName(camp.day)}
          stars={starsFor(result.satisfaction)}
          highlight={highlight}
          look={highlight.kind === 'staff' ? state.staff.find((s) => s.id === highlight.staffId)?.look : undefined}
          cashChange={result.cashEnd - camp.cash}
          onNext={week.continueDay}
        />
      </>
    );
  }
  return (
    <>
      {bar({ day: weekdayName(camp.day), state, cash: state.cash, clock: week.day.clock })}
      <LiveScreen day={week.day} state={state} reduced={reduced} camp={camp} />
    </>
  );
}

/** A trading day (your shop or Quick play), live: the shop, the clock and the one panel. */
function LiveScreen({ day, state, reduced, camp }: { day: LiveDay; state: SimState; reduced: boolean; camp?: CampaignState }) {
  const plan = day.live!.plan;
  // Your shop: the office's candidates (anyone hired today is off the list).
  // Your shop: people looking for work, while there's room in the team and cash for the fee.
  const hire = camp
    ? {
        people:
          teamSize(state) < (state.ctx.teamLimit ?? CONFIG.hiring.teamLimit)
            ? campaignPool(camp).filter((p) => !state.hires?.some((h) => h.person.id === p.id) && !state.staff.some((s) => s.id === p.id) && describeAction(state, { kind: 'hire', person: p }).available)
            : [],
        onHire: (p: Person) => void day.apply({ ...plan, actions: [{ kind: 'hire', person: p }] }),
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
      live
      reduced={reduced}
      onMove={day.move}
      pops={day.pops}
      paused={day.clock.paused}
      panel={(ctx) => <SidePanel state={state} plan={plan} ctx={ctx} hire={hire} />}
      office={!!hire && hire.people.length > 0}
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
        ? { text: BURST_TEXT[door.burst.kind].cue, arriving: false }
        : { text: BURST_TEXT[door.burst.kind].arriving, arriving: true }
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
