import clsx from 'clsx';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { ScriptLine, Speaker } from '../demo/bayScript';

// Name colours, so a glance at the transcript tells you who is talking. Picked from the
// same palette family as the character sprites.
const SPEAKER_COLOUR: Record<Speaker, string> = {
  Ray: 'text-amber-800',
  Kelly: 'text-red-700',
  Sam: 'text-sky-800',
  You: 'text-brown-900 font-bold',
};

const SPEAKER_ROLE: Record<Speaker, string> = {
  Ray: 'patient',
  Kelly: 'daughter',
  Sam: 'nurse',
  You: '',
};

/**
 * The full Bay 3 transcript — everything said in the room, by everyone, always visible.
 *
 * The inherited panel showed one conversation at a time and, while the clinician was in a
 * conversation, force-selected whoever they were talking to (PlayerDetails.tsx). Bystander
 * dialogue was therefore unreachable while it was most relevant: you could not read what
 * Kelly said about the onset time while you were mid-history with Ray.
 */
export function BayTranscript({
  lines,
  typing,
  cue,
  onSend,
  finished,
}: {
  lines: ScriptLine[];
  /** Who is composing their next line right now, text not revealed yet. */
  typing: Speaker | null;
  /** The clinician's next line, offered in the composer. Null while others are talking. */
  cue: string | null;
  onSend: (text: string) => void;
  finished: boolean;
}) {
  const endRef = useRef<HTMLDivElement>(null);
  const count = lines.length;

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [count, typing]);

  return (
    <div className="flex flex-col min-h-0 flex-grow">
      <div className="box shrink-0">
        <h2 className="bg-brown-700 p-2 font-display text-2xl tracking-wider shadow-solid text-center">
          Bay 3
        </h2>
      </div>
      <div className="mt-4 flex-grow overflow-y-auto bg-brown-200 text-black p-2 text-base sm:text-sm">
        {count === 0 && !typing && (
          <p className="text-brown-700 text-center py-4">The bay is quiet.</p>
        )}
        {lines.map((line, i) => (
          <div key={i} className="leading-tight mb-4">
            <div className="flex gap-3 items-baseline">
              <span className={clsx('uppercase flex-grow', SPEAKER_COLOUR[line.speaker])}>
                {line.speaker}
                {SPEAKER_ROLE[line.speaker] && (
                  <span className="text-brown-600 lowercase"> · {SPEAKER_ROLE[line.speaker]}</span>
                )}
              </span>
            </div>
            <div className={clsx('bubble', line.speaker === 'You' && 'bubble-mine')}>
              <p className="bg-white -mx-3 -my-1">{line.text}</p>
            </div>
          </div>
        ))}
        {typing && (
          <div className="leading-tight mb-4">
            <span className={clsx('uppercase', SPEAKER_COLOUR[typing])}>{typing}</span>
            <div className="bubble">
              <p className="bg-white -mx-3 -my-1">
                <TypingDots />
              </p>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>
      <Composer cue={cue} onSend={onSend} finished={finished} />
    </div>
  );
}

function TypingDots() {
  return (
    <span className="inline-flex gap-1 items-center h-4">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-1.5 h-1.5 bg-brown-700 rounded-full animate-bounce"
          style={{ animationDelay: `${i * 120}ms` }}
        />
      ))}
    </span>
  );
}

/**
 * Where the clinician speaks.
 *
 * The live build only shows an input once you are already in a conversation with someone
 * (Messages.tsx gates MessageInput on `inConversationWithMe`), which in a room of three
 * people usually means nowhere at all. Here the bay is the conversation, so the composer
 * is always there.
 *
 * When the script is waiting on the clinician it types their line into the box rather
 * than saying it for them: the words appear in the input, and only reach the room when
 * the player sends them. The cue is editable — clear it and say something else.
 */
function Composer({
  cue,
  onSend,
  finished,
}: {
  cue: string | null;
  onSend: (text: string) => void;
  finished: boolean;
}) {
  const [draft, setDraft] = useState('');
  // Once the player edits a cue we stop driving the field, or the typewriter fights them.
  const [claimed, setClaimed] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Type the cue in a character at a time, so it reads as the clinician composing it.
  useEffect(() => {
    if (cue === null) {
      setClaimed(false);
      return;
    }
    setDraft('');
    setClaimed(false);
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      setDraft((prev) => {
        // Bail out if the player has started typing over it.
        if (prev !== cue.slice(0, i - 1)) {
          clearInterval(id);
          return prev;
        }
        return cue.slice(0, i);
      });
      if (i >= cue.length) clearInterval(id);
    }, 28);
    return () => clearInterval(id);
  }, [cue]);

  useEffect(() => {
    if (cue !== null) inputRef.current?.focus();
  }, [cue]);

  const submit = () => {
    if (!draft.trim()) return;
    onSend(draft);
    setDraft('');
    setClaimed(false);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    // The map listens for keys to move the camera; typing must not reach it.
    e.stopPropagation();
    if (e.key === 'Enter') {
      e.preventDefault();
      submit();
    }
  };

  const waiting = cue !== null;
  return (
    <div className="shrink-0 mt-3">
      <div className="flex gap-2 items-stretch">
        <input
          ref={inputRef}
          type="text"
          value={draft}
          onChange={(e) => {
            setClaimed(true);
            setDraft(e.target.value);
          }}
          onKeyDown={onKeyDown}
          placeholder={finished ? 'Consultation over.' : 'Say something…'}
          aria-label="Say something to the bay"
          className={clsx(
            'flex-grow min-w-0 bg-brown-200 text-black placeholder:text-brown-600 px-3 py-2',
            'text-base sm:text-sm border-2 outline-none focus:outline-none',
            'focus-visible:outline-none focus:border-clay-700',
            waiting ? 'border-clay-700' : 'border-brown-900',
          )}
        />
        <button
          type="button"
          onClick={submit}
          disabled={!draft.trim()}
          className="button text-white shadow-solid text-lg cursor-pointer pointer-events-auto disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <div className="h-full bg-clay-700 px-3 flex items-center">Send</div>
        </button>
      </div>
      <p className="mt-1 h-4 text-xs text-brown-300">
        {waiting && !claimed && "Your turn — type your own and press Enter to send."}
        {waiting && claimed && 'Type your own and press Enter to send.'}
      </p>
    </div>
  );
}
