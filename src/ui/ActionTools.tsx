import { useMemo } from 'react';
import { CONFIG, hourLabel } from '../sim/config';
import type { HourPlan, SimState } from '../sim/types';
import { attentionItems } from './PlanPanel';
import type { PanelContext } from './ShopScreen';

/** The day as eight hours: past, now, later, with announced rushes. Opens the forecast. */
export function Timeline({ state, current, onOpen, open }: { state: SimState; current: number; onOpen: () => void; open: boolean }) {
  const rushes = new Set(state.scenario.events.filter((e) => e.kind === 'rush' && e.warnAt <= state.hour).map((e) => e.hour));
  return (
    <button type="button" className={`timeline ${open ? 'on' : ''}`} onClick={onOpen} aria-expanded={open} aria-label={`Day timeline, now ${hourLabel(current)}${rushes.size ? `, rush expected at ${[...rushes].map((h) => hourLabel(h)).join(', ')}` : ''}. Open forecast.`}>
      {Array.from({ length: CONFIG.hours }, (_, h) => (
        <span key={h} className={`tl-hour ${h < current ? 'past' : h === current ? 'now' : ''} ${rushes.has(h) ? 'rush' : ''}`} aria-hidden="true">
          {hourLabel(h).slice(0, 2)}
          {rushes.has(h) && <i>rush</i>}
        </span>
      ))}
    </button>
  );
}

/** Timeline, Needs attention · N, Team: the full game's action bar tools. */
export function GameTools({ state, plan, ctx, current, planning }: { state: SimState; plan: HourPlan | null; ctx: PanelContext; current: number; planning: boolean }) {
  const items = useMemo(() => (planning && plan ? attentionItems(state, plan) : []), [planning, plan, state]);
  const urgent = items.some((p) => p.level === 'urgent');
  const toggle = (kind: 'attention' | 'team' | 'forecast') => ctx.setSel(ctx.sel?.kind === kind ? null : { kind });
  return (
    <>
      <Timeline state={state} current={current} onOpen={() => planning && toggle('forecast')} open={ctx.sel?.kind === 'forecast'} />
      {planning && (
        <>
          <button
            type="button"
            className={`tool-btn attention-btn ${items.length ? (urgent ? 'urgent' : 'warn') : 'clear'} ${ctx.sel?.kind === 'attention' ? 'on' : ''}`}
            aria-expanded={ctx.sel?.kind === 'attention'}
            onClick={() => toggle('attention')}
          >
            {items.length ? (
              <>
                <span className="att-dot" aria-hidden="true">
                  !
                </span>
                Needs attention · {items.length}
              </>
            ) : (
              'Nothing needs attention'
            )}
          </button>
          <button type="button" className={`tool-btn ${ctx.sel?.kind === 'team' ? 'on' : ''}`} aria-expanded={ctx.sel?.kind === 'team'} onClick={() => toggle('team')}>
            Team
          </button>
        </>
      )}
    </>
  );
}
