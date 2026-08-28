import clsx from 'clsx';
import { useEffect, useRef } from 'react';
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
export function BayTranscript({ lines }: { lines: ScriptLine[] }) {
  const endRef = useRef<HTMLDivElement>(null);
  const count = lines.length;

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [count]);

  return (
    <div className="flex flex-col min-h-0 flex-grow">
      <div className="box shrink-0">
        <h2 className="bg-brown-700 p-2 font-display text-2xl tracking-wider shadow-solid text-center">
          Bay 3
        </h2>
      </div>
      <div className="mt-4 flex-grow overflow-y-auto bg-brown-200 text-black p-2 text-base sm:text-sm">
        {count === 0 && <p className="text-brown-700 text-center py-4">The bay is quiet.</p>}
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
        <div ref={endRef} />
      </div>
    </div>
  );
}
