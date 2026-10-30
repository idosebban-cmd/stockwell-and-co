import { useEffect, useRef } from 'react';
import { pounds } from '../sim/engine';
import { describeEvent, type AnswerIcon, type EventPicture } from '../sim/live';
import type { FloorEvent, SimState } from '../sim/types';

/** A surprise as a picture card with two picture answers. The day waits for an answer. */
export function EventDialog({ state, event, onAnswer }: { state: SimState; event: FloorEvent; onAnswer: (option: number) => void }) {
  const card = describeEvent(state, event);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('button')?.focus();
  }, [event.id]);
  return (
    <div className="modal-backdrop">
      <div className="modal event-card" role="dialog" aria-modal="true" aria-labelledby="event-title" ref={ref}>
        <EventArt pic={card.picture} />
        <h2 id="event-title">{card.title}</h2>
        <div className="event-options">
          {card.options.map((o, i) => (
            <button key={o.label} type="button" className="event-option" onClick={() => onAnswer(i)}>
              <AnswerArt icon={o.icon} />
              <strong>{o.label}</strong>
              {o.cost !== undefined && <span className="event-cost">{pounds(o.cost)}</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function EventArt({ pic }: { pic: EventPicture }) {
  return (
    <svg className="event-art" width="150" height="110" viewBox="0 0 150 110" aria-hidden="true">
      <ellipse cx="75" cy="100" rx="58" ry="8" fill="rgba(60,25,5,0.15)" />
      {pic === 'loaf' && (
        <g>
          <ellipse cx="75" cy="66" rx="46" ry="26" fill="#d7a35a" stroke="#8a5a26" strokeWidth="3" />
          <path d="M48 58 q8 -8 16 0 M66 54 q8 -8 16 0 M84 58 q8 -8 16 0" stroke="#a8702e" strokeWidth="3" fill="none" />
          <circle cx="118" cy="30" r="16" fill="#e8b48f" />
          <path d="M104 26 q14 -16 28 0" fill="#c9c4c0" />
          <circle cx="113" cy="31" r="2" fill="#2f1308" />
          <circle cx="123" cy="31" r="2" fill="#2f1308" />
          <path d="M112 37 q6 5 12 0" stroke="#2f1308" strokeWidth="2" fill="none" />
        </g>
      )}
      {pic === 'grumpy' && (
        <g transform="translate(75 58)">
          <circle r="38" fill="#ff9b6b" stroke="#b3362c" strokeWidth="4" />
          <path d="M-20 -12 l12 6 M20 -12 l-12 6" stroke="#2f1308" strokeWidth="5" strokeLinecap="round" />
          <rect x="-14" y="12" width="28" height="8" rx="4" fill="#2f1308" />
          <path d="M30 -46 q6 -9 12 0 q6 -9 12 0 q6 -9 12 0" stroke="#7a7470" strokeWidth="4" fill="none" />
        </g>
      )}
      {pic === 'raffle' && (
        <g>
          <rect x="35" y="48" width="80" height="44" rx="6" fill="#c2452d" stroke="#7a1f2b" strokeWidth="3" />
          <path d="M75 48 v44 M35 66 h80" stroke="#f2c23a" strokeWidth="6" />
          <path d="M75 48 q-22 -26 -26 -6 q14 6 26 6 q12 0 26 -6 q-4 -20 -26 6" fill="#f2c23a" stroke="#a8740c" strokeWidth="2" />
          <rect x="112" y="18" width="28" height="18" rx="3" fill="#fbf7ee" stroke="#7a1f2b" strokeWidth="2" transform="rotate(10 126 27)" />
        </g>
      )}
      {pic === 'sleepy' && (
        <g transform="translate(75 58)">
          <circle r="38" fill="#ffd36b" stroke="#a8740c" strokeWidth="4" />
          <path d="M-20 -6 q7 5 14 0 M6 -6 q7 5 14 0" stroke="#2f1308" strokeWidth="4" fill="none" strokeLinecap="round" />
          <ellipse cx="0" cy="16" rx="8" ry="10" fill="#2f1308" />
          <text x="40" y="-28" fontSize="26" fontWeight="900" fill="#6b5f56">
            z
          </text>
        </g>
      )}
      {pic === 'apples' && (
        <g>
          <rect x="30" y="56" width="90" height="36" rx="4" fill="#a8673a" stroke="#6f3f1f" strokeWidth="3" />
          {[44, 62, 80, 98].map((x) => (
            <circle key={x} cx={x} cy="52" r="11" fill="#c2452d" stroke="#7a1f2b" strokeWidth="2" />
          ))}
        </g>
      )}
    </svg>
  );
}

function AnswerArt({ icon }: { icon: AnswerIcon }) {
  return (
    <svg width="48" height="48" viewBox="0 0 48 48" aria-hidden="true">
      {icon === 'yes' && (
        <>
          <circle cx="24" cy="24" r="21" fill="#3c7a4a" />
          <path d="M13 25 l7 7 l15 -16" stroke="#fff" strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
      {icon === 'no' && (
        <>
          <circle cx="24" cy="24" r="21" fill="#8a7a6a" />
          <path d="M16 16 l16 16 M32 16 l-16 16" stroke="#fff" strokeWidth="5" strokeLinecap="round" />
        </>
      )}
      {icon === 'cake' && (
        <>
          <rect x="9" y="22" width="30" height="18" rx="3" fill="#f3dc9a" stroke="#a8740c" strokeWidth="2" />
          <path d="M9 28 h30" stroke="#e8c1c8" strokeWidth="5" />
          <rect x="22" y="10" width="4" height="12" fill="#e8c1c8" />
          <path d="M24 4 q4 4 0 7 q-4 -3 0 -7" fill="#f2a83a" />
        </>
      )}
      {icon === 'sorry' && (
        <>
          <circle cx="24" cy="24" r="21" fill="#ffd36b" stroke="#a8740c" strokeWidth="2" />
          <path d="M14 20 q4 -3 8 0 M26 20 q4 -3 8 0" stroke="#2f1308" strokeWidth="2.4" fill="none" strokeLinecap="round" />
          <path d="M17 32 q7 -5 14 0" stroke="#2f1308" strokeWidth="2.4" fill="none" strokeLinecap="round" />
        </>
      )}
      {icon === 'gift' && (
        <>
          <rect x="9" y="18" width="30" height="24" rx="3" fill="#c2452d" />
          <path d="M24 18 v24 M9 28 h30" stroke="#f2c23a" strokeWidth="4" />
          <path d="M24 18 q-10 -12 -12 -2 q6 2 12 2 q6 0 12 -2 q-2 -10 -12 2" fill="#f2c23a" />
        </>
      )}
    </svg>
  );
}
