import { useEffect, useState } from 'react';
import { CONFIG, hourLabel } from '../sim/config';
import { clockLabel, money, operatingProfit, pounds, satisfactionSoFar, wellbeing } from '../sim/engine';
import type { SimState } from '../sim/types';

interface Props {
  state: SimState | null;
  onHelp: () => void;
  onSettings: () => void;
  onMenu: () => void;
  saveOk: boolean;
  /** During the guided shift the bar shows the lesson instead of the day's score. */
  tutorial?: { label: string; progress: number; onExit: () => void };
  /** In your shop: the day, cash, the shop's reputation and the team (no targets; business value is in the end-of-day summary). */
  campaign?: CampaignStatus;
  /** The mute button. */
  sound?: { on: boolean; toggle: () => void };
}

export interface CampaignStatus {
  day: string;
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

type StatKey = 'profit' | 'satisfaction' | 'wellbeing' | 'value';

const EXPLAIN: Record<StatKey, string> = {
  profit: 'Takings minus the cost of goods sold, waste, wages and other costs so far. Unsold stock is not a cost.',
  satisfaction: 'How customers feel on average today: whether they found what they wanted, how long they queued, and prices.',
  wellbeing: 'How the team is holding up across the whole shift. Long stretches without a break leave a mark.',
  value: 'Cash, plus stock at what it cost, plus equipment at what you paid, minus anything owed.',
};


function Indicator({
  k,
  label,
  value,
  target,
  ok,
  open,
  onToggle,
  progress,
  status,
  explain,
}: {
  explain?: string;
  k: StatKey;
  label: string;
  value: string;
  target: string;
  ok: boolean | null;
  open: boolean;
  onToggle: () => void;
  /** 0..1 progress towards a closing target (profit). */
  progress?: number;
  status: string;
}) {
  return (
    <div className="indicator-wrap">
      <button type="button" className={`indicator ${ok === null ? 'ind-neutral' : ok ? 'ind-ok' : 'ind-bad'}`} aria-expanded={open} aria-controls={`ind-${k}`} onClick={onToggle}>
        <span className="stat-label">{label}</span>
        <span className="stat-value">
          {value}{' '}
          {ok !== null && (
            <span className="ind-mark" aria-label={ok ? 'on target' : 'below target'}>
              {ok ? '✓' : '!'}
            </span>
          )}
        </span>
        {progress !== undefined && (
          <span className="ind-progress" aria-hidden="true">
            <span style={{ width: `${Math.max(0, Math.min(1, progress)) * 100}%` }} />
          </span>
        )}
      </button>
      {open && (
        <div className="ind-pop" id={`ind-${k}`} role="region" aria-label={target ? `${label} target` : label}>
          {target && <strong>Target: {target}</strong>}
          <span>{status}</span>
          <p>{explain ?? EXPLAIN[k]}</p>
        </div>
      )}
    </div>
  );
}

export function StatusBar({ state, onHelp, onSettings, onMenu, saveOk, tutorial, campaign, sound }: Props) {
  const T = CONFIG.targets;
  const [open, setOpen] = useState<StatKey | null>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== 'Escape') return;
      if (e instanceof MouseEvent && (e.target as HTMLElement).closest?.('.indicator-wrap')) return;
      setOpen(null);
    };
    window.addEventListener('keydown', close);
    window.addEventListener('mousedown', close);
    return () => {
      window.removeEventListener('keydown', close);
      window.removeEventListener('mousedown', close);
    };
  }, [open]);
  const toggle = (k: StatKey) => setOpen((o) => (o === k ? null : k));
  const closed = !!state && state.hour >= state.ctx.hours;
  const profitTarget = T.operatingProfit;
  return (
    <header className="statusbar">
      <Brand />
      {tutorial && (
        <div className="stats tutorial-bar">
          <span className="lesson-label">{tutorial.label}</span>
          <span className="ind-progress lesson-progress" aria-hidden="true">
            <span style={{ width: `${tutorial.progress * 100}%` }} />
          </span>
          <button type="button" className="btn-ghost" onClick={tutorial.onExit}>
            Exit tutorial
          </button>
        </div>
      )}
      {state && (
        <div className="stats" aria-label="Shop status">
          <div className="stat">
            <span className="stat-label">{campaign ? campaign.day : 'Saturday'}</span>
            <span className="stat-value stat-clock">{state.hour >= state.ctx.hours ? 'Closed' : clockLabel(state.hour, state.step ?? 0)}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Cash</span>
            <span className="stat-value">{money(state.cash)}</span>
          </div>
          {campaign ? null : (
            <Indicator
              k="profit"
              label="Profit"
              value={`${money(operatingProfit(state))} / ${pounds(profitTarget)}`}
              target={`${money(profitTarget)} profit or more by ${hourLabel(state.ctx.hours)}`}
              ok={closed ? operatingProfit(state) >= profitTarget : null}
              progress={operatingProfit(state) / Math.max(1, profitTarget)}
              status={
                closed
                  ? operatingProfit(state) >= profitTarget
                    ? 'Target met'
                    : 'Target missed'
                  : `${money(Math.max(0, profitTarget - operatingProfit(state)))} to go · closes at ${hourLabel(state.ctx.hours)}`
              }
              open={open === 'profit'}
              onToggle={() => toggle('profit')}
            />
          )}
          {campaign ? null : (
            <>
          <Indicator
            k="satisfaction"
            label="Customers"
            value={`${Math.round(satisfactionSoFar(state))}`}
            target={`${T.satisfaction} or more`}
            ok={satisfactionSoFar(state) >= T.satisfaction}
            status={satisfactionSoFar(state) >= T.satisfaction ? 'On target so far' : 'Below target so far'}
            open={open === 'satisfaction'}
            onToggle={() => toggle('satisfaction')}
          />
          <Indicator
            k="wellbeing"
            label="Staff"
            value={`${Math.round(wellbeing(state))}`}
            target={`${T.wellbeing} or more`}
            ok={wellbeing(state) >= T.wellbeing}
            status={wellbeing(state) >= T.wellbeing ? 'On target so far' : 'Below target so far'}
            open={open === 'wellbeing'}
            onToggle={() => toggle('wellbeing')}
          />
            </>
          )}
        </div>
      )}
      <nav className="topnav">
        {!saveOk && (
          <span className="save-warn" role="status">
            Autosave unavailable
          </span>
        )}
        {sound && (
          <button type="button" className="btn-ghost sound-btn" onClick={sound.toggle} aria-pressed={!sound.on} aria-label={sound.on ? 'Sound on. Mute' : 'Sound muted. Turn sound on'} title={sound.on ? 'Mute' : 'Sound on'}>
            <SpeakerIcon on={sound.on} /> {sound.on ? 'Sound' : 'Muted'}
          </button>
        )}
        <button type="button" className="btn-ghost" onClick={onHelp}>
          How to play
        </button>
        <button type="button" className="btn-ghost" onClick={onSettings}>
          Settings
        </button>
        <button type="button" className="btn-ghost" onClick={onMenu}>
          Menu ▾
        </button>
      </nav>
    </header>
  );
}

function SpeakerIcon({ on }: { on: boolean }) {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" style={{ verticalAlign: '-3px' }}>
      <path d="M3 8h3l4-3v10l-4-3H3z" fill="currentColor" />
      {on ? (
        <path d="M13 7.5a3.5 3.5 0 0 1 0 5M15 5.5a6 6 0 0 1 0 9" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      ) : (
        <path d="M13 7.5l4.5 5M17.5 7.5l-4.5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      )}
    </svg>
  );
}
