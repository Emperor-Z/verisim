import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BAY_SCRIPT,
  BUBBLE_DWELL_MS,
  SCRIPT_DURATION_MS,
  type ScriptLine,
  type Speaker,
} from './bayScript';

/** Demo build flag. Off in a normal `npm run dev`, so the live path is unaffected. */
export const DEMO_MODE = !!import.meta.env.VITE_DEMO_MODE;

export interface BayScriptState {
  /** Every line that has landed so far, oldest first. */
  revealed: ScriptLine[];
  /** Who is mid-utterance right now, and what they are saying. */
  speaking: Map<Speaker, string>;
  /** Add a line the clinician typed. */
  send: (text: string) => void;
}

const NOOP = () => {};

/**
 * Plays BAY_SCRIPT on a wall clock and loops it.
 *
 * Ticks at 250ms rather than per-frame: the only thing that changes is which lines have
 * landed, and the transcript re-renders on each tick, so there is nothing to gain from
 * running it at 60Hz.
 */
export function useBayScript(enabled: boolean): BayScriptState {
  const [elapsed, setElapsed] = useState(0);
  // Lines the clinician typed, stamped with the script time they were sent at so they
  // sort into the transcript where they were said and survive the loop.
  const [typed, setTyped] = useState<ScriptLine[]>([]);
  const elapsedRef = useRef(0);
  elapsedRef.current = elapsed;

  useEffect(() => {
    if (!enabled) return;
    const started = Date.now();
    const id = setInterval(() => {
      setElapsed((Date.now() - started) % SCRIPT_DURATION_MS);
    }, 250);
    return () => clearInterval(id);
  }, [enabled]);

  const send = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setTyped((prev) => [...prev, { speaker: 'You', text: trimmed, at: elapsedRef.current }]);
  }, []);

  return useMemo(() => {
    if (!enabled) return { revealed: [], speaking: new Map(), send: NOOP };
    const revealed = [...BAY_SCRIPT, ...typed]
      .filter((l) => l.at <= elapsed)
      .sort((a, b) => a.at - b.at);
    const speaking = new Map<Speaker, string>();
    for (const line of revealed) {
      // Last line wins if someone talks twice inside one dwell window.
      if (elapsed - line.at <= BUBBLE_DWELL_MS) speaking.set(line.speaker, line.text);
    }
    return { revealed, speaking, send };
  }, [enabled, elapsed, typed, send]);
}
