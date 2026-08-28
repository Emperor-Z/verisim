import { useCallback, useEffect, useRef, useState } from 'react';
import { BAY_SCRIPT, BUBBLE_DWELL_MS, type ScriptLine, type Speaker } from './bayScript';

/** Demo build flag. Off in a normal `npm run dev`, so the live path is unaffected. */
export const DEMO_MODE = !!import.meta.env.VITE_DEMO_MODE;

interface Bubble {
  speaker: Speaker;
  text: string;
  until: number;
}

export interface BayScriptState {
  /** Every line said so far, oldest first. */
  revealed: ScriptLine[];
  /** Who is mid-utterance right now, and what they are saying. */
  speaking: Map<Speaker, string>;
  /**
   * The clinician's next line, waiting to be said. The script holds here until it is
   * sent — nothing the player says reaches the room without going through the chat box.
   */
  cue: string | null;
  /** Say something as the clinician. Releases the script if it was waiting on a cue. */
  send: (text: string) => void;
  /** True once the consultation has played out. */
  finished: boolean;
}

const IDLE: BayScriptState = {
  revealed: [],
  speaking: new Map(),
  cue: null,
  send: () => {},
  finished: false,
};

/**
 * Plays the scripted consultation, stopping at every clinician line.
 *
 * The first version auto-played the clinician's lines alongside everyone else's, so the
 * player watched themselves talk. Here the script only ever advances the other three; when
 * it reaches one of the clinician's lines it stops, offers the line as a cue in the chat
 * box, and waits. Whatever is actually sent is what gets said — the cue is a suggestion,
 * not a rail, so the player can clear it and type their own.
 */
export function useBayScript(enabled: boolean): BayScriptState {
  const [revealed, setRevealed] = useState<ScriptLine[]>([]);
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [cue, setCue] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [, forceTick] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  const show = useCallback((line: ScriptLine) => {
    setRevealed((prev) => [...prev, line]);
    setBubbles((prev) => [
      ...prev.filter((b) => b.speaker !== line.speaker),
      { speaker: line.speaker, text: line.text, until: Date.now() + BUBBLE_DWELL_MS },
    ]);
  }, []);

  // Advance through the script. Stops dead on a clinician line and waits for `send`.
  useEffect(() => {
    if (!enabled || index >= BAY_SCRIPT.length) return;
    const line = BAY_SCRIPT[index];
    if (line.speaker === 'You') {
      setCue(line.text);
      return;
    }
    const previous = index > 0 ? BAY_SCRIPT[index - 1].at : 0;
    timer.current = setTimeout(() => {
      show(line);
      setIndex((i) => i + 1);
    }, Math.max(400, line.at - previous));
    return () => clearTimeout(timer.current);
  }, [enabled, index, show]);

  // Expire speech bubbles.
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => {
      const now = Date.now();
      setBubbles((prev) => (prev.some((b) => b.until <= now)
        ? prev.filter((b) => b.until > now)
        : prev));
      forceTick((n) => n + 1);
    }, 250);
    return () => clearInterval(id);
  }, [enabled]);

  const send = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      show({ speaker: 'You', text: trimmed, at: Date.now() });
      // Only step the script on if it was actually waiting on the clinician; otherwise
      // the player is talking out of turn, which is allowed and changes nothing.
      setCue((current) => {
        if (current !== null) setIndex((i) => i + 1);
        return null;
      });
    },
    [show],
  );

  if (!enabled) return IDLE;

  const now = Date.now();
  const speaking = new Map<Speaker, string>();
  for (const b of bubbles) {
    if (b.until > now) speaking.set(b.speaker, b.text);
  }
  return {
    revealed,
    speaking,
    cue,
    send,
    finished: index >= BAY_SCRIPT.length,
  };
}
