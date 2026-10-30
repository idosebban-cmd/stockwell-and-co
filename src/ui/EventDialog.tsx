import { useEffect, useRef } from 'react';
import { describeEvent } from '../sim/live';
import type { FloorEvent, SimState } from '../sim/types';

/** A question from the shop floor. The day waits until it is answered. */
export function EventDialog({ state, event, onAnswer }: { state: SimState; event: FloorEvent; onAnswer: (option: number) => void }) {
  const card = describeEvent(state, event);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('button')?.focus();
  }, [event.id]);
  return (
    <div className="modal-backdrop">
      <div className="modal event-card" role="dialog" aria-modal="true" aria-labelledby="event-title" aria-describedby="event-text" ref={ref}>
        <p className="panel-kicker">The day is paused</p>
        <h2 id="event-title">{card.title}</h2>
        <p id="event-text">{card.text}</p>
        <div className="event-options">
          {card.options.map((o, i) => (
            <button key={o.label} type="button" className="event-option" onClick={() => onAnswer(i)}>
              <strong>{o.label}</strong>
              <span>{o.effect}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
