import { useEffect, useRef, type ReactNode } from 'react';
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
  return (
    <Modal title="How to play" onClose={onClose}>
      <ul className="help help-short">
        <li>Drag staff to jobs.</li>
        <li>Open tills for queues.</li>
        <li>Fix surprises fast.</li>
        <li>Buy upgrades with cash.</li>
        <li>Space pauses. 1, 2, 3: speed.</li>
      </ul>
    </Modal>
  );
}

export function SettingsDialog({ settings, onChange, onClose }: { settings: Settings; onChange: (s: Partial<Settings>) => void; onClose: () => void }) {
  return (
    <Modal title="Settings" onClose={onClose}>
      <div className="settings">
        <label className="check">
          <input type="checkbox" checked={settings.sound} onChange={(e) => onChange({ sound: e.target.checked })} />
          Sound
        </label>
        <label className="check">
          <input type="checkbox" checked={settings.reducedMotion} onChange={(e) => onChange({ reducedMotion: e.target.checked })} />
          Less movement
        </label>
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
export function Menu({ title, items, onClose }: { title: string; items: MenuItem[]; onClose: () => void }) {
  return (
    <Modal title={title} onClose={onClose}>
      <div className="menu">
        {items.map((it) => (
          <button key={it.label} type="button" className={it.primary ? 'btn-primary' : 'btn-ghost'} onClick={it.onClick}>
            {it.label}
          </button>
        ))}
      </div>
    </Modal>
  );
}
