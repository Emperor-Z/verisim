import { useEffect, useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import type { BaySpeaker } from '../../convex/verisim/bayDirector';
import type { TrustState } from '../../convex/verisim/consentGate';
import type { TestMenuItem } from '../components/TestMenu';
import { toastOnError } from '../toasts';

// How long a line stays up as a speech bubble: a floor so even "On it." gets read, plus
// reading time. Same numbers the demo script uses (src/demo/useBayScript.ts).
const MIN_DWELL_MS = 2600;
const DWELL_PER_CHAR = 70;

export interface BayLineView {
  speaker: BaySpeaker;
  text: string;
}

export interface LiveBayState {
  lines: BayLineView[];
  /** speaker -> what they're saying right now, for the map's speech bubbles. */
  speaking: Map<BaySpeaker, string>;
  typing: BaySpeaker | null;
  trust: TrustState | null;
  send: (text: string) => void;
  requestTest: (item: TestMenuItem) => Promise<string | null>;
  restart: () => void;
  finished: boolean;
}

/**
 * The live Bay 3 conversation (convex/verisim/bay.ts), in the same shape the demo script's
 * hook produces, so the transcript and map render either one.
 */
export function useLiveBay(worldId: Id<'worlds'> | undefined, enabled: boolean): LiveBayState {
  const data = useQuery(api.verisim.bay.transcript, enabled && worldId ? { worldId } : 'skip');
  const say = useMutation(api.verisim.bay.say);
  const dispatch = useMutation(api.verisim.bay.requestTest);
  const restartBay = useMutation(api.verisim.bay.restart);

  // Re-render while bubbles are up so they expire on time.
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [enabled]);

  const lines = data?.lines ?? [];
  const speaking = new Map<BaySpeaker, string>();
  for (const line of lines) {
    if (line.speaker === 'System') continue;
    if (line.at + MIN_DWELL_MS + line.text.length * DWELL_PER_CHAR > now) {
      speaking.set(line.speaker, line.text); // later lines win
    }
  }

  return {
    lines,
    speaking,
    typing: data?.typing ?? null,
    trust: data?.trust ?? null,
    send: (text) => {
      if (worldId) toastOnError(say({ worldId, text })).catch(() => {});
    },
    requestTest: async (item) => {
      if (!worldId) return null;
      const decision = await toastOnError(
        dispatch({
          worldId,
          testId: item.id,
          testLabel: item.label,
          category: item.category,
        }),
      ).catch(() => null);
      if (!decision || decision.permitted) return null;
      return decision.reason === 'patient_self_discharged'
        ? 'Ray has had enough and is leaving against medical advice.'
        : "Ray refuses — you haven't earned that yet.";
    },
    restart: () => {
      if (worldId) toastOnError(restartBay({ worldId })).catch(() => {});
    },
    finished: !!data?.trust?.selfDischarged,
  };
}
