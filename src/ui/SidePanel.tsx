/**
 * The side panel during a day: what needs doing now as one picture card, and
 * the team as cards (face, name, one word). Selecting a card picks that
 * person, the keyboard way to move someone.
 */
import type { ReactNode } from 'react';
import type { DeptId } from '../sim/config';
import { onShift } from '../sim/engine';
import { BURST_TEXT, burstAtDoor, taskText } from '../sim/floor';
import { stepOf } from '../sim/live';
import type { AssignmentId, FloorTask, HourPlan, SimState, StaffMember } from '../sim/types';
import { StaffFigure } from './art/Characters';
import { emptyShelves, queueTooLong } from './bubbles';
import { HiringPanel, type HiringProps } from './Hiring';
import type { PanelContext } from './ShopScreen';
import { staffMood } from './Store';

type Pic = FloorTask['kind'] | 'bus' | 'queue' | 'empty' | 'cat';

interface Surprise {
  pic: Pic;
  title: string;
  line: string | null;
  tone: 'bad' | 'warn' | 'calm';
}

const EMPTY_TITLE: Record<DeptId, string> = { produce: 'No apples!', chilled: 'No milk!', ambient: 'No tins!' };

/** The one thing most worth doing now, or a calm card. */
export function surpriseNow(state: SimState, plan: HourPlan): Surprise {
  const now = stepOf(state);
  const door = burstAtDoor(state.floor, now);
  if (door && door.inMinutes > 0) return { pic: 'bus', title: BURST_TEXT[door.burst.kind].cue, line: 'Open a till!', tone: 'warn' };
  const task = state.floor?.tasks.find((t) => t.assigned === null && t.kind !== 'errand');
  if (task) return { pic: task.kind, title: taskText(task, now), line: 'Drag someone there', tone: task.kind === 'spill' ? 'bad' : 'warn' };
  if (queueTooLong(state, plan)) return { pic: 'queue', title: 'Long queue!', line: 'Open another till', tone: 'bad' };
  const empty = emptyShelves(state, plan)[0];
  if (empty) return { pic: 'empty', title: EMPTY_TITLE[empty], line: 'Send someone to fill', tone: 'bad' };
  return { pic: 'cat', title: 'All calm!', line: null, tone: 'calm' };
}

function teamWord(state: SimState, s: StaffMember, a: AssignmentId | undefined): string {
  if (s.availableFromStep !== undefined && s.availableFromStep > stepOf(state)) return 'On the way';
  if (!a) return 'Off';
  const mood = staffMood(s, a);
  if (mood === 'resting') return 'On a break';
  if (a === 'task') return 'On a job';
  if (mood === 'sleepy') return 'Sleepy';
  if (a === 'tills') return 'On the till';
  if (a === 'receive') return 'Unloading';
  return 'Filling shelves';
}

export function SidePanel({ state, plan, ctx, hiring }: { state: SimState; plan: HourPlan; ctx: PanelContext; hiring?: HiringProps }) {
  if (ctx.sel?.kind === 'office' && hiring) {
    return (
      <section className="panel-inner side-panel" aria-label="Hiring">
        <div className="card-head">
          <h2>Hire someone</h2>
          <button type="button" className="icon-btn" aria-label="Close" onClick={() => ctx.setSel(null)}>
            ✕
          </button>
        </div>
        <HiringPanel {...hiring} />
      </section>
    );
  }
  const sup = surpriseNow(state, plan);
  const selected = ctx.sel?.kind === 'staff' ? ctx.sel.id : null;
  const team = [...state.staff.filter((s) => !state.leavers?.includes(s.id))];
  const shift = new Set(onShift(state).map((s) => s.id));
  return (
    <div className="panel-inner side-panel">
      <section className={`surprise-card tone-${sup.tone}`} aria-live="polite">
        <SurprisePicture pic={sup.pic} />
        <div>
          <h2>{sup.title}</h2>
          {sup.line && <p>{sup.line}</p>}
        </div>
      </section>
      <ul className="team-cards" aria-label="Team">
        {team.map((s) => {
          const a = shift.has(s.id) ? plan.assignments[s.id] : undefined;
          const on = selected === s.id;
          return (
            <li key={s.id}>
              <button
                type="button"
                className={`team-card ${on ? 'on' : ''}`}
                aria-pressed={on}
                disabled={!shift.has(s.id)}
                onClick={() => ctx.setSel(on ? null : { kind: 'staff', id: s.id })}
              >
                <Face s={s} a={a} />
                <span className="team-text">
                  <strong>{s.name}</strong>
                  <span>{on ? 'Pick a place' : teamWord(state, s, a)}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** The person's head, with a little mood mark. */
function Face({ s, a }: { s: StaffMember; a: AssignmentId | undefined }) {
  const mood = a ? staffMood(s, a) : 'ok';
  return (
    <span className="team-face">
      <svg viewBox="-24 -64 48 48" width="64" height="64" aria-hidden="true">
        <circle cx="0" cy="-40" r="24" fill="#f3e2c3" />
        <StaffFigure id={s.id} look={s.look} pose="stand" tired={mood === 'sleepy'} />
      </svg>
      {mood === 'bouncy' && <span className="mood-mark bouncy" aria-hidden="true">✦</span>}
      {mood === 'sleepy' && <span className="mood-mark sleepy" aria-hidden="true">z</span>}
    </span>
  );
}

function SurprisePicture({ pic }: { pic: Pic }) {
  const box = (children: ReactNode, bg: string) => (
    <svg className="surprise-pic" width="72" height="72" viewBox="0 0 72 72" aria-hidden="true">
      <circle cx="36" cy="36" r="34" fill={bg} />
      {children}
    </svg>
  );
  switch (pic) {
    case 'spill':
      return box(
        <>
          <ellipse cx="38" cy="50" rx="24" ry="8" fill="#fbfbf8" stroke="#9cc7d6" strokeWidth="2.5" />
          <rect x="16" y="22" width="18" height="26" rx="3" transform="rotate(-60 25 35)" fill="#fbfbf8" stroke="#3b6fb0" strokeWidth="2.5" />
        </>,
        '#dcecf1',
      );
    case 'help':
      return box(
        <text x="36" y="49" textAnchor="middle" fontSize="38" fontWeight="900" fill="#7a1f2b">
          ?
        </text>,
        '#f3dc9a',
      );
    case 'priceCheck':
      return box(
        <>
          <rect x="18" y="24" width="36" height="26" rx="4" fill="#f2d16b" stroke="#a8740c" strokeWidth="2" />
          <text x="36" y="43" textAnchor="middle" fontSize="18" fontWeight="900" fill="#7a1f2b">
            £?
          </text>
        </>,
        '#fbeedd',
      );
    case 'pallet':
      return box(
        <>
          <rect x="14" y="34" width="22" height="20" rx="2" fill="#c99a63" stroke="rgba(60,28,12,0.5)" />
          <rect x="36" y="34" width="22" height="20" rx="2" fill="#c99a63" stroke="rgba(60,28,12,0.5)" />
          <rect x="25" y="15" width="22" height="20" rx="2" fill="#b98a53" stroke="rgba(60,28,12,0.5)" />
        </>,
        '#efe0c4',
      );
    case 'baskets':
    case 'errand':
      return box(
        <>
          <rect x="18" y="30" width="36" height="20" rx="3" fill="#7a1f2b" />
          <path d="M24 30 q12 -14 24 0" stroke="#7a1f2b" strokeWidth="3" fill="none" />
        </>,
        '#f3dc9a',
      );
    case 'bus':
      return box(
        <>
          <rect x="12" y="22" width="48" height="28" rx="6" fill="#c2452d" />
          <rect x="17" y="27" width="10" height="9" fill="#cfe6ee" />
          <rect x="31" y="27" width="10" height="9" fill="#cfe6ee" />
          <rect x="45" y="27" width="10" height="9" fill="#cfe6ee" />
          <circle cx="22" cy="51" r="5" fill="#2f1308" />
          <circle cx="50" cy="51" r="5" fill="#2f1308" />
        </>,
        '#f3dc9a',
      );
    case 'queue':
      return box(
        <>
          {[16, 28, 40, 52].map((x, i) => (
            <g key={x}>
              <circle cx={x} cy="30" r="6" fill={['#e8b48f', '#a86b45', '#f1c9a5', '#6b4430'][i]} />
              <rect x={x - 6} y="37" width="12" height="16" rx="4" fill={['#3f7d74', '#8a5a8c', '#c2452d', '#2f6f8f'][i]} />
            </g>
          ))}
        </>,
        '#f8e3df',
      );
    case 'empty':
      return box(
        <>
          <rect x="14" y="36" width="44" height="18" rx="3" fill="#a8673a" />
          <rect x="14" y="30" width="44" height="8" rx="3" fill="#6f3f1f" />
        </>,
        '#f8e3df',
      );
    case 'cat':
      return box(
        <g transform="translate(36 48)">
          <ellipse cx="0" cy="-6" rx="16" ry="9" fill="#e08a3c" />
          <circle cx="13" cy="-13" r="8" fill="#e08a3c" />
          <path d="M8 -19 l2 -7 l4 6z M15 -20 l4 -6 l1 7z" fill="#e08a3c" />
          <path d="M9.5 -13 q1.6 1.2 3.2 0 M15 -13 q1.6 1.2 3.2 0" stroke="#3a2418" strokeWidth="1.2" fill="none" />
          <path d="M-15 -4 q-12 2 -9 -9" fill="none" stroke="#e08a3c" strokeWidth="4.5" strokeLinecap="round" />
        </g>,
        '#e3efe2',
      );
  }
}
