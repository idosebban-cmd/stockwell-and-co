import { useState } from 'react';
import { CONFIG } from '../sim/config';
import { clockLabel, money } from '../sim/engine';
import { STRENGTH } from '../sim/people';
import type { Person, SkillJob, StaffMember, TraitId } from '../sim/types';
import { Person as Portrait, SpecialitySymbol } from './Illustrations';

const STEPS = CONFIG.stepsPerHour;

export const SKILL_LABEL: Record<SkillJob, string> = { tills: 'Tills', shelves: 'Shelves', unloading: 'Unloading', floor: 'Floor jobs' };

export function TraitChips({ traits }: { traits: readonly TraitId[] }) {
  if (!traits.length) return null;
  return (
    <ul className="trait-chips" aria-label="Traits">
      {traits.map((t) => (
        <li key={t} title={CONFIG.traits[t].text}>
          {CONFIG.traits[t].label}
          <span className="sr-only">: {CONFIG.traits[t].text}</span>
        </li>
      ))}
    </ul>
  );
}

/** Skill levels 1–5 per job, as pips. */
export function SkillPips({ skills }: { skills: Record<SkillJob, number> }) {
  return (
    <dl className="skill-pips">
      {(Object.keys(SKILL_LABEL) as SkillJob[]).map((k) => (
        <div key={k} className="contents">
          <dt>{SKILL_LABEL[k]}</dt>
          <dd aria-label={`level ${skills[k]} of 5`}>
            {Array.from({ length: 5 }, (_, i) => (
              <span key={i} className={i < skills[k] ? 'pip on' : 'pip'} aria-hidden="true" />
            ))}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** When someone hired now would start. */
export function startLabel(step: number | null, closed: boolean): string {
  if (closed || step === null) return 'Starts tomorrow morning';
  if (step / STEPS >= CONFIG.hiring.sameDayBefore) return 'Starts tomorrow morning (it’s past 12:00)';
  const at = step + CONFIG.hiring.startDelayMinutes;
  return `Walks in ~${clockLabel(Math.floor(at / STEPS), at % STEPS)} today`;
}

export interface HiringProps {
  candidates: Person[];
  teamSize: number;
  teamLimit: number;
  cash: number;
  /** Minute of the day now, or null between days. */
  step: number | null;
  /** Hours the shop is open today (for the day's wages). */
  hours: number;
  onHire: (p: Person) => void;
  /** Why a hire can't be made now, if so. */
  reasonFor?: (p: Person) => string | null;
}

/** The office: today's candidates as cards, with costs before confirming. */
export function HiringPanel({ candidates, teamSize, teamLimit, cash, step, hours, onHire, reasonFor }: HiringProps) {
  const [confirm, setConfirm] = useState<string | null>(null);
  const full = teamSize >= teamLimit;
  return (
    <div className="hiring">
      <p className="hiring-team">
        Team <strong>{teamSize}</strong> of {teamLimit}
        {full && <span className="bad"> · the break room is full: a bigger break room makes space</span>}
      </p>
      <p className="tiny muted">New faces each morning; more as your reputation grows. New people are a little slower for their first {CONFIG.hiring.newcomer.days} days.</p>
      {candidates.length === 0 && <p className="idle-hint">No one else is looking for work today. Try again tomorrow.</p>}
      <ul className="candidates">
        {candidates.map((p) => {
          const reason = full ? `The break room takes a team of ${teamLimit}.` : cash < CONFIG.hiring.hireCost ? `Needs ${money(CONFIG.hiring.hireCost)}.` : (reasonFor?.(p) ?? null);
          const open = confirm === p.id;
          return (
            <li key={p.id} className={`candidate ${open ? 'open' : ''}`}>
              <div className="cand-top">
                <Portrait id={p.id} look={p.look} />
                <div>
                  <strong className="cand-name">{p.name}</strong>
                  <span className="cand-strength">
                    <SpecialitySymbol s={p.speciality} /> {STRENGTH[p.speciality]}
                  </span>
                  <TraitChips traits={p.traits} />
                </div>
              </div>
              <p className="cand-bio tiny">{p.bio}</p>
              <p className="cand-pay">
                {money(p.wage)}/hour · about {money(p.wage * hours)} a day · <span className="muted">{startLabel(step, false)}</span>
              </p>
              {open ? (
                <div className="cand-confirm" role="group" aria-label={`Hire ${p.name}?`}>
                  <p className="tiny">
                    {money(CONFIG.hiring.hireCost)} to hire now, then {money(p.wage)} an hour on shift, paid at closing. Cash after: <strong className={cash - CONFIG.hiring.hireCost < 0 ? 'bad' : ''}>{money(cash - CONFIG.hiring.hireCost)}</strong>
                  </p>
                  <button
                    type="button"
                    className="btn-primary"
                    autoFocus
                    onClick={() => {
                      onHire(p);
                      setConfirm(null);
                    }}
                  >
                    Hire {p.name} · {money(CONFIG.hiring.hireCost)}
                  </button>
                  <button type="button" className="btn-ghost" onClick={() => setConfirm(null)}>
                    Not now
                  </button>
                </div>
              ) : (
                <button type="button" className="btn-action" disabled={!!reason} onClick={() => setConfirm(p.id)} title={reason ?? ''}>
                  Hire {p.name}…
                </button>
              )}
              {reason && <p className="tiny bad">{reason}</p>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Strength, traits, skills and pay for a team member, with letting go behind a confirmation. */
export function PersonFacts({ s, onLetGo, letGoReason }: { s: StaffMember; onLetGo?: () => void; letGoReason?: string | null }) {
  return (
    <div className="person-facts">
      <p className="cand-strength">
        <SpecialitySymbol s={s.speciality} /> {STRENGTH[s.speciality]}
        {s.newcomer && <span className="new-badge">New</span>}
      </p>
      {s.traits && <TraitChips traits={s.traits} />}
      {s.skills && <SkillPips skills={s.skills} />}
      {!s.isTemp && <p className="tiny muted">{money(s.wage ?? CONFIG.wagePerHour)}/hour, paid at closing.</p>}
      {onLetGo && <LetGo name={s.name} onLetGo={onLetGo} reason={letGoReason ?? null} />}
    </div>
  );
}

/** "Let go…" with a short confirmation. */
export function LetGo({ name, onLetGo, reason }: { name: string; onLetGo: () => void; reason: string | null }) {
  const [asking, setAsking] = useState(false);
  if (!asking)
    return (
      <button type="button" className="btn-ghost let-go" disabled={!!reason} title={reason ?? ''} onClick={() => setAsking(true)}>
        Let go…
      </button>
    );
  return (
    <div className="cand-confirm" role="group" aria-label={`Let ${name} go?`}>
      <p className="tiny">
        Let {name} go? They leave now. The team will be unsettled for a while and word gets round (reputation −{Math.abs(CONFIG.hiring.letGo.reputation)}).
      </p>
      <button
        type="button"
        className="btn-danger"
        autoFocus
        onClick={() => {
          onLetGo();
          setAsking(false);
        }}
      >
        Let {name} go
      </button>
      <button type="button" className="btn-ghost" onClick={() => setAsking(false)}>
        Keep {name}
      </button>
    </div>
  );
}
