/**
 * Who speaks after the clinician — pure, no framework deps, unit-tested in bayDirector.test.ts.
 *
 * AI Town's engine only stages two-party conversations, so it cannot produce the bay the
 * scenario is designed around: Kelly cutting across a question meant for her dad, Sam
 * flagging obs mid-history. The bay is one conversation with four people in it, and this
 * decides, deterministically, which of the three agents answer each clinician turn. The
 * words themselves come from the model (bay.ts); the turn order does not, so a session can
 * be replayed and the persona beats can't depend on a small model choosing to take a turn.
 */

import type { PlayerEventKind, TrustStage } from './consentGate';

export type Agent = 'Ray' | 'Kelly' | 'Sam';
export type BaySpeaker = Agent | 'You' | 'System';

export interface BayLine {
  speaker: BaySpeaker;
  text: string;
}

export interface DirectorInput {
  utterance: string;
  event: PlayerEventKind;
  stage: TrustStage;
  /** How many times the clinician has spoken this session, including this turn. */
  clinicianTurns: number;
  /** The transcript before this turn, oldest first. */
  history: BayLine[];
}

const ADDRESS: [Agent, RegExp][] = [
  ['Kelly', /\bkelly\b/i],
  ['Sam', /\b(sam|nurse|sister)\b/i],
  ['Ray', /\b(ray|raymond|mr\.? turner)\b/i],
];

// Things Kelly knows and Ray won't volunteer (persona_cards.md): onset two hours ago, breathless
// on stairs for weeks, stopped the blood pressure tablets. A question that reaches for any of it
// is her cue to answer over him.
const HISTORY_QUESTION =
  /\b(when|how long|start(ed)?|began|stairs|breath(less)?|tablets?|pills?|medication|meds|history|before|family|smok\w*)\b/i;

/** Whoever the clinician named first, if anyone. */
export function addressee(utterance: string): Agent | undefined {
  let best: { agent: Agent; at: number } | undefined;
  for (const [agent, pattern] of ADDRESS) {
    const m = pattern.exec(utterance);
    if (m && (!best || m.index < best.at)) best = { agent, at: m.index };
  }
  return best?.agent;
}

/**
 * The agents who answer this clinician turn, in order. At most two, so the room never talks
 * over the player for longer than it takes to read.
 */
export function pickResponders(input: DirectorInput): Agent[] {
  const first = addressee(input.utterance) ?? 'Ray';
  const out: Agent[] = [first];

  if (first === 'Ray' && input.stage !== 'consenting') {
    // Kelly answers for him when the question is history he's sitting on, or panics when the
    // clinician has just wound him up.
    if (HISTORY_QUESTION.test(input.utterance) || input.event === 'escalation_trigger') {
      out.push('Kelly');
    }
  }

  // Sam flags obs every few turns if nobody has asked her anything — the nurse who keeps the
  // patient's deterioration in front of the clinician.
  if (!out.includes('Sam') && out.length < 2 && input.clinicianTurns % 4 === 3) {
    const recent = input.history.slice(-6);
    if (!recent.some((l) => l.speaker === 'Sam')) out.push('Sam');
  }
  return out;
}

/**
 * Strip what small chat models wrap around a line of dialogue: reasoning blocks, a "Ray:" name
 * prefix, surrounding quotes, *stage directions*. Keeps at most three sentences.
 */
export function cleanLine(raw: string, speaker: Agent): string {
  let s = raw.replace(/<think>[\s\S]*?(<\/think>|$)/gi, '');
  s = s.replace(/\*[^*]*\*/g, '').replace(/\([^)]*\)/g, '');
  // Some models write several speakers' lines; keep only the first.
  s = s.split(/\n\s*(?:Ray|Kelly|Sam|Clinician|Doctor|You)\s*:/i)[0];
  s = s.replace(new RegExp(`^\\s*(${speaker}|${speaker} \\w+)\\s*:\\s*`, 'i'), '');
  s = s.replace(/\s+/g, ' ').trim();
  s = s.replace(/^["“'](.*)["”']$/, '$1').trim();
  const sentences = s.match(/[^.!?]+[.!?]+["”']?|[^.!?]+$/g) ?? [s];
  return sentences.slice(0, 3).join(' ').replace(/\s+/g, ' ').trim();
}
