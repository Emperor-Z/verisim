/**
 * VeriSim consent session — pure orchestration tying the pieces together (no framework deps).
 *
 *   classify utterance ─▶ update trust ─▶ (optionally) gate a test request
 *                                    └─▶ produce the prompt line that keeps the patient's SPEECH
 *                                        in sync with the trust number.
 *
 * A future Convex `dispatchTest` mutation / chat hook calls these; keeping them pure means the whole
 * mechanic is unit-testable and demo-able on CPU without the game engine (see docs/consent_gate.md).
 */

import { classifyUtterance } from './eventClassifier';
import {
  applyPlayerEvent,
  consentGiven,
  type PlayerEventKind,
  type TrustState,
} from './consentGate';

export interface UtteranceResult {
  event: PlayerEventKind;
  state: TrustState;
}

/** One clinician turn: classify what they said and update the patient's trust state. */
export function handlePlayerUtterance(
  state: TrustState,
  utterance: string,
  patientName: string,
): UtteranceResult {
  const event = classifyUtterance(utterance, { patientName });
  return { event, state: applyPlayerEvent(state, event) };
}

/**
 * The line injected into the patient agent's prompt each turn (via `agentPrompts` in
 * convex/agent/conversation.ts) so the model's tone tracks the trust number — the gate value and the
 * dialogue move together, which is the whole point of the mechanic.
 */
export function trustPromptLine(state: TrustState, patientName: string): string {
  if (state.selfDischarged) {
    return (
      `${patientName} has been pushed too hard and is now trying to leave against medical advice. ` +
      `He is angry, closed off, and refusing all further interaction. Speak accordingly.`
    );
  }
  const consented = consentGiven(state)
    ? `${patientName} HAS agreed to necessary tests being done.`
    : `${patientName} has NOT agreed to any tests yet.`;

  switch (state.stage) {
    case 'hostile':
      return (
        `Right now ${patientName} does NOT trust this clinician. He is guarded and defensive, ` +
        `minimises his symptoms ("it's just indigestion"), and snaps if patronised or talked over. ` +
        consented
      );
    case 'wary':
      return (
        `${patientName} is beginning to trust this clinician but stays cautious. He will answer ` +
        `questions and is softening, but is not fully cooperative and still deflects at times. ` +
        consented
      );
    case 'consenting':
      return (
        `${patientName} now trusts this clinician and is willing to cooperate, including agreeing ` +
        `to tests that are clearly explained to him. He is calmer and more open. ` +
        consented
      );
  }
}

/** Run a whole scripted transcript through the state machine (handy for demos / tests). */
export function replayTranscript(
  initial: TrustState,
  patientName: string,
  utterances: string[],
): { finalState: TrustState; trail: UtteranceResult[] } {
  const trail: UtteranceResult[] = [];
  let state = initial;
  for (const u of utterances) {
    const r = handlePlayerUtterance(state, u, patientName);
    trail.push(r);
    state = r.state;
  }
  return { finalState: state, trail };
}
