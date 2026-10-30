/**
 * The till ding: a short, soft two-note chime made with Web Audio (no sound
 * files). The audio context starts on the first click or key press, as
 * browsers require; until then, and wherever audio isn't available, it is
 * silent.
 */
import { CONFIG } from '../sim/config';

let ctx: AudioContext | null = null;

function context(): AudioContext | null {
  if (ctx) return ctx;
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    ctx = AC ? new AC() : null;
  } catch {
    ctx = null;
  }
  return ctx;
}

/** Call from a user gesture so later dings can play. */
export function unlockAudio(): void {
  const c = context();
  if (c && c.state === 'suspended') void c.resume().catch(() => {});
}

export function playDing(pitch = 0): void {
  const c = context();
  if (!c || c.state !== 'running') return;
  try {
    const t = c.currentTime;
    const out = c.createGain();
    out.gain.value = CONFIG.juice.volume;
    out.connect(c.destination);
    // Two soft bell partials; `pitch` varies the tills slightly.
    for (const [f, g, d] of [
      [1318.5 * (1 + pitch * 0.06), 0.7, 0.55],
      [1975.5 * (1 + pitch * 0.06), 0.3, 0.35],
    ] as const) {
      const o = c.createOscillator();
      const env = c.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(g, t + 0.008);
      env.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(env);
      env.connect(out);
      o.start(t);
      o.stop(t + d + 0.05);
    }
  } catch {
    /* ignore */
  }
}
