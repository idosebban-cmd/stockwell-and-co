import { useEffect, useRef, type ReactNode } from 'react';
import { CONFIG } from '../sim/config';
import { money } from '../sim/engine';
import type { Settings } from '../sim/save';
import { CURATED_SEED } from '../sim/scenario';

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
          Run Stockwell &amp; Co for one Saturday, 09:00–17:00. Win with <strong>{money(T.operatingProfit)}</strong> operating profit, satisfaction{' '}
          <strong>{T.satisfaction}+</strong> and wellbeing <strong>{T.wellbeing}+</strong>.
        </p>
        <h3>Each hour</h3>
        <ol>
          <li>Read the Tannoy and the shift manager’s notes.</li>
          <li>Give everyone a job: pick from their list, or select a person and click a zone in the shop.</li>
          <li>Click a department, the tills, the dock or the break room to see its details, prices and actions (each shows cost and timing first).</li>
          <li>Press “Run” (or R). Watch the replay, or skip it. Read why things happened.</li>
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
            <strong>Dates:</strong> Friday’s produce goes past its best at 13:00. Chilled comes short-dated (“use by Sunday”, cheaper; binned at close if unsold, as we are closed Sundays) or longer-life (dearer, keeps). You choose per delivery when you customise the opening order. Cupboard stock keeps.
          </li>
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
        <button type="button" className="btn-secondary" onClick={() => onChange({ tipsDone: [] })} disabled={settings.tipsDone.length === 0}>
          Show the first-shift tips again
        </button>
        <p className="tiny muted">Replay settings never change results.</p>
      </div>
    </Modal>
  );
}

export function Menu({
  seed,
  onClose,
  onRetry,
  onNew,
  onCurated,
}: {
  seed: number;
  onClose: () => void;
  onRetry: () => void;
  onNew: () => void;
  onCurated: () => void;
}) {
  return (
    <Modal title="Saturday" onClose={onClose}>
      <div className="menu">
        <p className="tiny muted">
          Current Saturday: {seed === CURATED_SEED ? 'the first (curated) Saturday' : `seed ${seed}`}. Starting again discards this attempt.
        </p>
        <button type="button" className="btn-primary" onClick={onRetry}>
          Retry same Saturday
        </button>
        <button type="button" className="btn-ghost" onClick={onNew}>
          New Saturday (different demand and events)
        </button>
        {seed !== CURATED_SEED && (
          <button type="button" className="btn-ghost" onClick={onCurated}>
            Play the first Saturday again
          </button>
        )}
      </div>
    </Modal>
  );
}
