import { useCallback, useEffect, useRef, useState } from 'react';
import { CONFIG } from '../sim/config';

export interface Clock {
  paused: boolean;
  speed: number;
  setPaused: (p: boolean) => void;
  togglePause: () => void;
  setSpeed: (s: number) => void;
}

/**
 * The live clock: calls `onMinute` once per in-game minute while running.
 * At 1x an hour takes `live.secondsPerHour` seconds. Space pauses and
 * resumes, 1–3 set the speed; it also pauses when the tab is hidden.
 */
export function useClock(active: boolean, onMinute: () => void, startPaused = false): Clock {
  const [paused, setPaused] = useState(startPaused);
  const [speed, setSpeedState] = useState(1);
  const tick = useRef(onMinute);
  tick.current = onMinute;

  useEffect(() => {
    if (!active || paused) return;
    const ms = (CONFIG.live.secondsPerHour * 1000) / 60 / speed;
    const t = window.setInterval(() => tick.current(), ms);
    return () => window.clearInterval(t);
  }, [active, paused, speed]);

  const togglePause = useCallback(() => setPaused((p) => !p), []);
  const setSpeed = useCallback((s: number) => {
    setSpeedState(s);
    setPaused(false);
  }, []);

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || e.metaKey || e.ctrlKey || e.altKey) return;
      if (document.querySelector('[role="dialog"]')) return;
      if (e.code === 'Space' || e.key === ' ') {
        // Space always pauses (buttons and the shop still respond to Enter).
        e.preventDefault();
        togglePause();
      } else if (e.key === 'p' || e.key === 'P') togglePause();
      else if (CONFIG.live.speeds.includes(Number(e.key))) setSpeed(Number(e.key));
    };
    const onHide = () => {
      if (document.hidden) setPaused(true);
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, [active, togglePause, setSpeed]);

  return { paused, speed, setPaused, togglePause, setSpeed };
}
