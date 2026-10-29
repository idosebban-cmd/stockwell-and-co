import { CONFIG, hourRange } from '../sim/config';
import { money, operatingProfit, satisfactionSoFar, wellbeing } from '../sim/engine';
import type { SimState } from '../sim/types';

interface Props {
  state: SimState | null;
  onHelp: () => void;
  onSettings: () => void;
  onMenu: () => void;
  saveOk: boolean;
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

function Stat({ label, value, target, ok, hint }: { label: string; value: string; target: string; ok: boolean; hint?: string }) {
  return (
    <div className={`stat ${ok ? 'stat-ok' : 'stat-bad'}`} title={hint}>
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      <span className="stat-target">
        <span aria-hidden="true">{ok ? '✓' : '✗'}</span> {ok ? 'on target' : 'below'} ({target})
      </span>
    </div>
  );
}

export function StatusBar({ state, onHelp, onSettings, onMenu, saveOk }: Props) {
  const T = CONFIG.targets;
  return (
    <header className="statusbar">
      <Brand />
      {state && (
        <div className="stats" aria-label="Shop status">
          <div className="stat stat-time">
            <span className="stat-label">Time</span>
            <span className="stat-value">{state.hour >= CONFIG.hours ? 'Closed' : hourRange(state.hour)}</span>
            <span className="stat-target">
              {state.hour >= CONFIG.hours ? 'Doors locked' : `Hour ${state.hour + 1} of ${CONFIG.hours}`}
            </span>
          </div>
          <div className="stat">
            <span className="stat-label">Cash</span>
            <span className="stat-value">{money(state.cash)}</span>
            <span className="stat-target stat-extra">in the till and bank</span>
          </div>
          <Stat
            label="Operating profit"
            value={money(operatingProfit(state))}
            target={`${money(T.operatingProfit)}+ by close`}
            ok={operatingProfit(state) >= T.operatingProfit}
            hint="Takings minus cost of goods sold, waste, wages and other costs so far."
          />
          <Stat
            label="Satisfaction"
            value={String(Math.round(satisfactionSoFar(state)))}
            target={`${T.satisfaction}+`}
            ok={satisfactionSoFar(state) >= T.satisfaction}
            hint="Average customer experience so far: availability, prices and waiting."
          />
          <Stat
            label="Staff wellbeing"
            value={String(Math.round(wellbeing(state)))}
            target={`${T.wellbeing}+`}
            ok={wellbeing(state) >= T.wellbeing}
            hint="Workload and rest across the whole shift, not just energy now."
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
