import { CONFIG } from '../sim/config';
import { clockLabel } from '../sim/engine';
import type { SimState } from '../sim/types';
import type { Clock } from './useClock';

/** Pause/play and 1x, 2x, 3x, beside the shop's clock. Space pauses; 1–3 set the speed. */
export function ClockControls({ clock, state }: { clock: Clock; state: SimState }) {
  const closed = state.hour >= state.ctx.hours;
  return (
    <div className="clock-controls" role="group" aria-label="Clock">
      <span className="clock-time" aria-live="off">
        {closed ? 'Closed' : clockLabel(state.hour, state.step ?? 0)}
      </span>
      <button
        type="button"
        className={`clock-btn play ${clock.paused ? '' : 'running'}`}
        onClick={clock.togglePause}
        disabled={closed}
        aria-label={clock.paused ? 'Carry on (Space)' : 'Pause (Space)'}
        title="Space"
      >
        {clock.paused ? '▶ Carry on' : '❚❚ Pause'}
      </button>
      <span className="clock-speeds" role="group" aria-label="Speed">
        {CONFIG.live.speeds.map((s) => (
          <button key={s} type="button" className="clock-btn" aria-pressed={!clock.paused && clock.speed === s} onClick={() => clock.setSpeed(s)} disabled={closed} title={`Key ${s}`}>
            {s}x
          </button>
        ))}
      </span>
    </div>
  );
}
