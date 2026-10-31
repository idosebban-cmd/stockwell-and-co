import { CONFIG } from '../sim/config';
import { money } from '../sim/engine';
import type { SimState } from '../sim/types';
import type { Clock } from './useClock';

interface Props {
  /** The day's name, when a day is on screen. */
  day?: string;
  /** The day being played: the sun shows how far through it is. */
  state?: SimState | null;
  /** Cash, shown on every screen with a day. */
  cash?: number;
  /** Live play: pause, play and fast. */
  clock?: Clock | null;
  onHelp: () => void;
  onSettings: () => void;
  onMenu: () => void;
  saveOk: boolean;
  sound?: { on: boolean; toggle: () => void };
  /** Before opening: the upgrades. `ready` when something can be bought. */
  upgrades?: { onOpen: () => void; ready: boolean };
}

export function Brand({ small }: { small?: boolean }) {
  return (
    <div className={`brand ${small ? 'brand-small' : ''}`}>
      <svg viewBox="0 0 40 40" width={small ? 28 : 40} height={small ? 28 : 40} aria-hidden="true">
        <circle cx="20" cy="20" r="19" fill="var(--burgundy)" />
        <path d="M10 25h20l-2.5-9h-15z" fill="var(--mustard)" />
        <path d="M14 16a6 6 0 0 1 12 0" stroke="var(--paper)" strokeWidth="2.5" fill="none" />
        <circle cx="15" cy="29" r="2" fill="var(--paper)" />
        <circle cx="26" cy="29" r="2" fill="var(--paper)" />
      </svg>
      <span className="brand-name">
        Stockwell <span className="amp">&amp;</span> Co
      </span>
    </div>
  );
}

/** How far through the day (0 at opening, 1 at closing). */
function dayShare(state: SimState): number {
  const end = state.ctx.hours * CONFIG.stepsPerHour;
  return Math.max(0, Math.min(1, (state.hour * CONFIG.stepsPerHour + (state.step ?? 0)) / end));
}

function partOfDay(t: number): string {
  return t >= 1 ? 'Closing time' : t < 0.3 ? 'Morning' : t < 0.55 ? 'Midday' : t < 0.85 ? 'Afternoon' : 'Nearly closing';
}

/** The time of day as the sun crossing the sky, from opening to closing. */
export function SunArc({ t }: { t: number }) {
  // Quadratic curve M8 40 Q75 -8 142 40.
  const x = (1 - t) * (1 - t) * 8 + 2 * (1 - t) * t * 75 + t * t * 142;
  const y = (1 - t) * (1 - t) * 40 + 2 * (1 - t) * t * -8 + t * t * 40;
  return (
    <svg className="sun-arc" width="150" height="46" viewBox="0 -4 150 50" role="img" aria-label={partOfDay(t)}>
      <path d="M8 40 Q75 -8 142 40" fill="none" stroke="var(--line)" strokeWidth="5" strokeLinecap="round" />
      <path d="M8 40 Q75 -8 142 40" fill="none" stroke="var(--mustard)" strokeWidth="5" strokeLinecap="round" pathLength={1} strokeDasharray={`${t} 1`} />
      <circle cx="142" cy="40" r="4.5" fill="#3a3f6b" />
      <circle cx={x} cy={y} r="8.5" fill="#f2c23a" stroke="#c98a14" strokeWidth="2" />
    </svg>
  );
}

function Coin({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="14" fill="#f2c23a" stroke="#a8740c" strokeWidth="2.5" />
      <text x="16" y="21.5" textAnchor="middle" fontSize="15" fontWeight="800" fill="#7a540a">
        £
      </text>
    </svg>
  );
}

/** Pause, play and fast. Space pauses; 1–3 still set the speed. */
function Speeds({ clock, closed }: { clock: Clock; closed: boolean }) {
  const playing = !clock.paused;
  const fast = playing && clock.speed > 1;
  return (
    <div className="speeds" role="group" aria-label="Speed">
      <button type="button" className={`speed-btn ${!playing ? 'on' : ''}`} aria-pressed={!playing} aria-label="Pause" title="Space" onClick={() => clock.setPaused(true)} disabled={closed}>
        <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
          <rect x="4" y="3" width="4" height="14" rx="1.5" />
          <rect x="12" y="3" width="4" height="14" rx="1.5" />
        </svg>
      </button>
      <button type="button" className={`speed-btn ${playing && !fast ? 'on' : ''}`} aria-pressed={playing && !fast} aria-label="Play" title="1" onClick={() => clock.setSpeed(1)} disabled={closed}>
        <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
          <path d="M5 3 L17 10 L5 17 Z" />
        </svg>
      </button>
      <button type="button" className={`speed-btn ${fast ? 'on' : ''}`} aria-pressed={fast} aria-label="Fast" title="3" onClick={() => clock.setSpeed(3)} disabled={closed}>
        <svg width="26" height="20" viewBox="0 0 26 20" aria-hidden="true">
          <path d="M2 3 L12 10 L2 17 Z" />
          <path d="M13 3 L23 10 L13 17 Z" />
        </svg>
      </button>
    </div>
  );
}

export function StatusBar({ day, state, cash, clock, onHelp, onSettings, onMenu, saveOk, sound, upgrades }: Props) {
  const closed = !!state && state.hour >= state.ctx.hours;
  return (
    <header className="statusbar">
      <Brand />
      {day && (
        <div className="bar-day">
          <span className="day-pill">{day}</span>
          {state && <SunArc t={dayShare(state)} />}
        </div>
      )}
      <div className="bar-spacer" />
      {cash !== undefined && (
        <div className="cash-pill" aria-label={`Cash ${money(cash)}`}>
          <Coin />
          <span className={cash < 0 ? 'bad' : ''}>{money(cash)}</span>
        </div>
      )}
      {clock && <Speeds clock={clock} closed={closed} />}
      {upgrades && (
        <button type="button" className={`upgrades-btn ${upgrades.ready ? 'ready' : ''}`} onClick={upgrades.onOpen}>
          <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M3 9h18l-2 11H5z" fill="currentColor" />
            <path d="M8 9a4 4 0 0 1 8 0" stroke="currentColor" strokeWidth="2.4" fill="none" />
          </svg>
          Upgrades
        </button>
      )}
      <div className="bar-icons">
        {!saveOk && (
          <span className="save-warn" title="Saving isn’t working in this browser">
            Not saving
          </span>
        )}
        {sound && (
          <button type="button" className="icon-btn" aria-pressed={sound.on} aria-label={sound.on ? 'Sound on' : 'Sound off'} onClick={sound.toggle}>
            <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" />
              {sound.on ? <path d="M16 8q3 4 0 8M18.5 5.5q5 6.5 0 13" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" /> : <path d="M16 9l5 6M21 9l-5 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />}
            </svg>
          </button>
        )}
        <button type="button" className="icon-btn" aria-label="How to play" onClick={onHelp}>
          <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2" />
            <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.8.4-1 1-1 1.7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <circle cx="12" cy="17" r="1.2" fill="currentColor" />
          </svg>
        </button>
        <button type="button" className="icon-btn" aria-label="Settings" onClick={onSettings}>
          <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" strokeWidth="2" />
            <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
        <button type="button" className="icon-btn" aria-label="Menu" onClick={onMenu}>
          <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </header>
  );
}
