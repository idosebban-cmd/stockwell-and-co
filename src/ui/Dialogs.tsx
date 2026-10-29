import { useEffect, useRef, type ReactNode } from 'react';
import { CONFIG } from '../sim/config';
import { money } from '../sim/engine';
import type { Settings } from '../sim/save';

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('button, input, select')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, [onClose]);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" ref={ref} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2 id="modal-title">{title}</h2>
          <button type="button" className="btn-ghost" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Help({ onClose }: { onClose: () => void }) {
  const T = CONFIG.targets;
  return (
    <Modal title="How to play" onClose={onClose}>
      <div className="help">
        <p>
          <strong>The week:</strong> run the shop from Sunday to Saturday. Each day has a profit goal. By Saturday night, aim for business value of{' '}
          <strong>{money(CONFIG.campaign.objective.growth)}</strong> more than you started with, reputation <strong>{CONFIG.campaign.objective.reputation}+</strong> and
          team wellbeing <strong>{CONFIG.campaign.objective.wellbeing}+</strong>. Days start short and quiet and get longer and busier; new things (deliveries,
          prices, chilled food) arrive as you go.
        </p>
        <p>
          <strong>Quick play:</strong> one Saturday, 09:00–17:00, in the fully fitted shop. Win with <strong>{money(T.operatingProfit)}</strong> operating profit,
          satisfaction <strong>{T.satisfaction}+</strong> and wellbeing <strong>{T.wellbeing}+</strong>.
        </p>
        <h3>Each morning (the week)</h3>
        <p>Check the forecast and confirm the recommended stock order (or adjust it). Nothing is bought until you open the shop.</p>
        <h3>After closing (the week)</h3>
        <p>
          You keep cash and stock that is still in date. Staff rest overnight, but long days without breaks build up. Reputation moves part of the way towards how
          customers felt that day. You can buy an improvement (another person, a third till, more shelving, a chilled department, better refrigeration) or save the
          money.
        </p>
        <h3>Each hour</h3>
        <ol>
          <li>Check <strong>Needs attention</strong> under the shop, or click a red or yellow “!” on a fixture. Each opens the problem with the actions that work, their cost and timing.</li>
          <li>Click a person, then a highlighted place, to move them (or choose from the list in their panel). <strong>Team</strong> shows everyone at once.</li>
          <li>Click a department to see its stock, who is filling it and its price. <strong>Change prices</strong> compares Low, Regular and High.</li>
          <li>Press <strong>Run next hour</strong> (or R). Watch the replay or skip it, then read the short summary; <strong>View details</strong> has the rest.</li>
        </ol>
        <h3>How the shop works</h3>
        <ul>
          <li>
            <strong>Customers</strong> pick what is on the shelves, then queue at the tills. If the wait is too long, some give up and leave their basket (it goes back on the
            shelf, though some chilled has to be binned).
          </li>
          <li>
            <strong>Shelves</strong> only refill when someone is filling that department, and only from the stockroom. Deliveries land on the dock and need receiving
            first. Chilled spoils on the dock.
          </li>
          <li>
            <strong>Energy</strong> falls while working and recovers on a break. Below {CONFIG.staff.tiredBelow}, people slow down. Wellbeing counts the whole day:
            long stretches without a break leave a mark that a late rest does not erase. The break room fits two.
          </li>
          <li>
            <strong>Money:</strong> stock costs cash when bought but only becomes a cost when sold (or wasted). Unsold stock keeps its value.
          </li>
          <li>
            <strong>Prices</strong> are the same products at a low, regular or high price. Lower prices sell more but earn less per item; fuller baskets take longer at the
            tills. Which pays depends on the stock you have, how long it keeps and how busy the tills are.
          </li>
          <li>
            <strong>Dates:</strong> Friday’s produce goes past its best at 13:00. Chilled comes short-dated (“use by Sunday”, cheaper; binned at close if unsold, as we are closed Sundays) or longer-life (dearer, keeps). You choose per delivery when you customise the opening order. Cupboard stock keeps.
          </li>
        </ul>
        <h3>In the shop</h3>
        <ul>
          <li>“!” needs attention (red: urgent). “Low” or “Empty” beside a department: few items on the shelf.</li>
          <li>“z” above someone: tired, working slower. “…”: nothing to do. “?” above a shopper: can’t find what they want.</li>
          <li>Counts and energy show when you select a place or a person.</li>
        </ul>
        <h3>Keyboard</h3>
        <p>Tab through controls; Enter or Space to press. R runs the hour; Escape cancels a selection or closes this box.</p>
      </div>
    </Modal>
  );
}

export function SettingsDialog({ settings, onChange, onClose }: { settings: Settings; onChange: (s: Partial<Settings>) => void; onClose: () => void }) {
  return (
    <Modal title="Settings" onClose={onClose}>
      <div className="settings">
        <label className="check">
          <input type="checkbox" checked={settings.reducedMotion} onChange={(e) => onChange({ reducedMotion: e.target.checked })} />
          Reduced motion (no walking shoppers; replay steps without movement)
        </label>
        <label className="check">
          <input type="checkbox" checked={settings.skipReplay} onChange={(e) => onChange({ skipReplay: e.target.checked })} />
          Skip the replay and go straight to results
        </label>
        <fieldset className="radio-row">
          <legend>Replay speed</legend>
          <label>
            <input type="radio" name="speed" checked={settings.replaySpeed === 'normal'} onChange={() => onChange({ replaySpeed: 'normal' })} /> Normal
          </label>
          <label>
            <input type="radio" name="speed" checked={settings.replaySpeed === 'fast'} onChange={() => onChange({ replaySpeed: 'fast' })} /> Fast
          </label>
        </fieldset>
        <p className="tiny muted">Replay settings never change results.</p>
      </div>
    </Modal>
  );
}

export interface MenuItem {
  label: string;
  onClick: () => void;
  primary?: boolean;
}

/** The game menu: what you can start or restart from here. Starting again never happens without choosing it. */
export function Menu({ title, note, items, onClose }: { title: string; note?: string; items: MenuItem[]; onClose: () => void }) {
  return (
    <Modal title={title} onClose={onClose}>
      <div className="menu">
        {note && <p className="tiny muted">{note}</p>}
        {items.map((it) => (
          <button key={it.label} type="button" className={it.primary ? 'btn-primary' : 'btn-ghost'} onClick={it.onClick}>
            {it.label}
          </button>
        ))}
      </div>
    </Modal>
  );
}
