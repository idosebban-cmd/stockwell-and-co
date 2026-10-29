import { useEffect, useState } from 'react';
import { CONFIG, hourRange } from '../sim/config';
import { money, operatingProfit, satisfactionSoFar, wellbeing } from '../sim/engine';
import type { SimState } from '../sim/types';

interface Props {
  state: SimState | null;
  onHelp: () => void;
  onSettings: () => void;
  onMenu: () => void;
  saveOk: boolean;
  /** During the guided shift the bar shows the lesson instead of the day's score. */
  tutorial?: { label: string; progress: number; onExit: () => void };
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

type StatKey = 'profit' | 'satisfaction' | 'wellbeing';

const EXPLAIN: Record<StatKey, string> = {
  profit: 'Takings minus the cost of goods sold, waste, wages and other costs so far. Unsold stock is not a cost.',
  satisfaction: 'How customers feel on average today: whether they found what they wanted, how long they queued, and prices.',
  wellbeing: 'How the team is holding up across the whole shift. Long stretches without a break leave a mark.',
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
}: {
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
        <div className="ind-pop" id={`ind-${k}`} role="region" aria-label={`${label} target`}>
          <strong>Target: {target}</strong>
          <span>{status}</span>
          <p>{EXPLAIN[k]}</p>
        </div>
      )}
    </div>
  );
}

export function StatusBar({ state, onHelp, onSettings, onMenu, saveOk, tutorial }: Props) {
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
  const closed = !!state && state.hour >= CONFIG.hours;
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
            <span className="stat-label">Time</span>
            <span className="stat-value">{state.hour >= CONFIG.hours ? 'Closed' : hourRange(state.hour)}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Cash</span>
            <span className="stat-value">{money(state.cash)}</span>
          </div>
          <Indicator
            k="profit"
            label="Profit"
            value={`${money(operatingProfit(state))} / ${money(T.operatingProfit)}`}
            target={`${money(T.operatingProfit)} or more by 17:00`}
            ok={closed ? operatingProfit(state) >= T.operatingProfit : null}
            progress={operatingProfit(state) / T.operatingProfit}
            status={
              closed
                ? operatingProfit(state) >= T.operatingProfit
                  ? 'Target met'
                  : 'Target missed'
                : `${money(Math.max(0, T.operatingProfit - operatingProfit(state)))} to go · ${CONFIG.hours - state.hour} hours left`
            }
            open={open === 'profit'}
            onToggle={() => toggle('profit')}
          />
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
        </div>
      )}
      <nav className="topnav">
        {!saveOk && (
          <span className="save-warn" role="status">
            Autosave unavailable
          </span>
        )}
        <button type="button" className="btn-ghost" onClick={onHelp}>
          How to play
        </button>
        <button type="button" className="btn-ghost" onClick={onSettings}>
          Settings
        </button>
        <button type="button" className="btn-ghost" onClick={onMenu}>
          Saturday ▾
        </button>
      </nav>
    </header>
  );
}
