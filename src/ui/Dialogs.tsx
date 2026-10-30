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
  const K = CONFIG.campaign;
  return (
    <Modal title="How to play" onClose={onClose}>
      <div className="help">
        <p>
          <strong>Your shop:</strong> run Stockwell &amp; Co day after day, Sunday to Saturday and round again. There’s no deadline and no failing: take your time, grow the
          business and look after the team. Days start short and quiet; new things (deliveries, prices, chilled food) arrive as you go, and each week brings a few more shoppers.
        </p>
        <p>
          <strong>Quick play:</strong> one Saturday, 09:00–17:00, in the fully fitted shop. Aim for <strong>{money(T.operatingProfit)}</strong> operating profit,
          satisfaction <strong>{T.satisfaction}+</strong> and wellbeing <strong>{T.wellbeing}+</strong>.
        </p>
        <h3>The clock</h3>
        <p>
          The shop runs in real time: an hour takes about a minute at 1x. There are usually more jobs than people, so keep an eye on the queue, the shelves and the
          floor. <strong>Space</strong> pauses and carries on; 1, 2 and 3 set the speed. While paused you can still
          move people and take actions, then carry on to see what happens.
        </p>
        <h3>Each morning</h3>
        <p>
          Check the forecast and confirm the recommended stock order (or adjust it). Nothing is bought until you open the shop. Short of cash? The wholesaler puts up to{' '}
          {money(K.supplierCredit.limit)} of stock on account and takes part of the takings until it is paid off.
        </p>
        <h3>During the day</h3>
        <ol>
          <li>Drag a person to a place to give them that job; they walk over and start straight away. (Or click a person, then a place.) Moving someone to a full place swaps them with the person there.</li>
          <li>Send people to the break room: a break lasts half an hour, then they go back to what they were doing.</li>
          <li>
            <strong>Running low?</strong> Click the stockroom. Each department shows how long its stock will last at today’s forecast and what’s on its way, and
            you can order more: a <strong>rush delivery</strong> (dearer, on the dock in about 20 minutes), a <strong>cash-and-carry run</strong> (send someone for half
            an hour; they bring a car-load straight into the stockroom) or the <strong>next delivery</strong> (normal price; tomorrow morning if there’s none left
            today). Deliveries land on the dock and need unloading. A good morning order is still the cheapest way to stock the day.
          </li>
          <li>
            <strong>Floor jobs</strong> pop up as a red “!” where they happen: a spill, a shopper who can’t find something, a price check, a cage in the aisle, baskets
            running out. Customers nearby get grumpier until someone sorts it: drag a person onto the “!”. It takes a minute or three, then they go back to their job.
          </li>
          <li>
            <strong>Bursts:</strong> a sign at the door warns a few minutes ahead when a bus, the school run or the after-church crowd is coming. Open another till before
            they reach it.
          </li>
          <li>
            <strong>Questions</strong> (a tired colleague, a regular’s favour, a cheap offer from the wholesaler, a complaint) pause the day until you choose. Each answer
            says what it will do.
          </li>
          <li>Check <strong>Needs attention</strong> under the shop, or click a red or yellow “!” on a fixture. Each opens the problem with the actions that work, their cost and timing.</li>
          <li>Click a department to see its stock, who is filling it and its price. <strong>Change prices</strong> compares Low, Regular and High.</li>
        </ol>
        <h3>After closing</h3>
        <p>
          You keep cash and stock that is still in date. Staff rest overnight, but long days without breaks build up. Reputation moves part of the way towards how customers felt that
          day. You can buy an improvement (another person, a third till, more shelving, a chilled department, better refrigeration) or save the money.
        </p>
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
            <strong>Dates:</strong> stock is dated “use by” a day and binned if it passes it. Chilled comes short-dated (cheaper; binned at closing if unsold) or longer-life
            (dearer, keeps). Cupboard stock keeps.
          </li>
        </ul>
        <h3>In the shop</h3>
        <ul>
          <li>“!” needs attention (red: urgent). “Low” or “Empty” beside a department: few items on the shelf.</li>
          <li>“z” above someone: tired, working slower. “…”: nothing to do. A red “!” on the floor: a floor job (a shopper waiting for help stands beside it).</li>
          <li>Counts and energy show when you select a place or a person.</li>
        </ul>
        <h3>Keyboard</h3>
        <p>
          Space pauses; 1, 2, 3 set the speed. Tab to a person and press Enter, then Tab to a place and press Enter to move them. Escape cancels a selection or closes this box.
        </p>
      </div>
    </Modal>
  );
}

export function SettingsDialog({ settings, onChange, onClose }: { settings: Settings; onChange: (s: Partial<Settings>) => void; onClose: () => void }) {
  return (
    <Modal title="Settings" onClose={onClose}>
      <div className="settings">
        <label className="check">
          <input type="checkbox" checked={settings.sound} onChange={(e) => onChange({ sound: e.target.checked })} />
          Sound (a soft ding when the tills take money)
        </label>
        <label className="check">
          <input type="checkbox" checked={settings.reducedMotion} onChange={(e) => onChange({ reducedMotion: e.target.checked })} />
          Reduced motion (no walking, no coin pops)
        </label>
        <p className="tiny muted">Settings are remembered on this device and never change results.</p>
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
