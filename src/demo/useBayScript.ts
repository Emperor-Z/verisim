import { useCallback, useEffect, useRef, useState } from 'react';
import { BAY_SCRIPT, type ScriptLine, type Speaker } from './bayScript';

/** Demo build flag. Off in a normal `npm run dev`, so the live path is unaffected. */
export const DEMO_MODE = !!import.meta.env.VITE_DEMO_MODE;

// Pacing is derived from how long a line actually takes to read and "type", not from the
// original wall-clock timestamps the script was first authored with — those were tuned for
// uninterrupted auto-play and land too fast once turns actually wait on the player. A pause
// before someone starts, a visible typing beat, and a lingering dwell after they finish is
// what makes a static script read as a conversation rather than a slideshow of captions.
const THINK_MS = 900;             // pause before the next speaker starts
const MS_PER_CHAR = 55;           // typing speed
const MIN_TYPE_MS = 700;
const MAX_TYPE_MS = 3200;
const DWELL_PER_CHAR = 70;        // how long a line stays up after it lands, on top of...
const MIN_DWELL_MS = 2600;        // ...this floor, so even "On it." gets read

function typingDuration(text: string) {
  return Math.min(MAX_TYPE_MS, Math.max(MIN_TYPE_MS, text.length * MS_PER_CHAR));
}

function dwellDuration(text: string) {
  return MIN_DWELL_MS + text.length * DWELL_PER_CHAR;
}

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
  /** Who is composing their next line right now, text not revealed yet. */
  typing: Speaker | null;
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
  typing: null,
  cue: null,
  send: () => {},
  finished: false,
};

/**
 * Plays the scripted consultation, stopping at every clinician line.
 *
 * The script only ever advances the other three. When it reaches one of the clinician's
 * lines it stops, offers the line as a cue in the chat box, and waits — nothing the player
 * says reaches the room without going through the composer, and the cue is a suggestion,
 * not a rail. Every other line goes think -> type -> reveal -> dwell, so the bay reads as
 * people talking rather than captions appearing on a timer.
 */
export function useBayScript(enabled: boolean): BayScriptState {
  const [revealed, setRevealed] = useState<ScriptLine[]>([]);
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [typing, setTyping] = useState<Speaker | null>(null);
  const [cue, setCue] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [, forceTick] = useState(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const show = useCallback((line: ScriptLine) => {
    setTyping(null);
    setRevealed((prev) => [...prev, line]);
    setBubbles((prev) => [
      ...prev.filter((b) => b.speaker !== line.speaker),
      { speaker: line.speaker, text: line.text, until: Date.now() + dwellDuration(line.text) },
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
    const t1 = setTimeout(() => {
      setTyping(line.speaker);
      const t2 = setTimeout(() => {
        show(line);
        setIndex((i) => i + 1);
      }, typingDuration(line.text));
      timers.current.push(t2);
    }, THINK_MS);
    timers.current.push(t1);
    return () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
    };
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
    typing,
    cue,
    send,
    finished: index >= BAY_SCRIPT.length,
  };
}
