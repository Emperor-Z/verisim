/**
 * VeriSim free-text event classifier — keyword/heuristic baseline (no framework deps, testable).
 *
 * Turns a clinician's free-text utterance into one of the `PlayerEventKind` labels the consent-gate
 * reducer (`consentGate.ts`) consumes. This is deliberately the *baseline* classifier described in
 * `docs/consent_gate.md`: transparent, deterministic, zero-latency, and good enough to demo the
 * mechanic on CPU. It will be swapped for an LLM classifier later (same interface), at which point
 * these keyword sets become the few-shot examples / eval fixtures.
 *
 * Precedence when several signals fire: escalation (an order/dismissal/naked jargon) dominates,
 * because a single patronising move undoes softer language; then a plain explanation; then a
 * de-escalation lever; otherwise neutral. Rationale: it should be *hard* to earn trust and easy to
 * lose it, matching the hostile persona.
 */

import type { PlayerEventKind } from './consentGate';

export interface ClassifierContext {
  /** Patient's first name, so "Ray, …" counts as addressing him by name. */
  patientName: string;
}

// Lowercase, delete apostrophes (so "you're"/"you’re" → "youre"), turn other punctuation into
// spaces, collapse whitespace, and pad with spaces so every token is bounded by a space.
const norm = (s: string) =>
  ` ${s
    .toLowerCase()
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()} `;
// Strict phrase match: the phrase must appear space-bounded (no accidental "if you" inside "if your").
const hasAny = (h: string, needles: string[]) => needles.some((n) => h.includes(` ${n} `));

// --- Signal lexicons --------------------------------------------------------------------------

// Ordering / commanding without asking.
const ORDER_PHRASES = [
  'you need to',
  'you have to',
  "you've got to",
  'you must',
  'i need you to',
  'just let me',
  'let me just',
  'do as',
  'lie down now',
  'sit down now',
  'stop it',
  'stop being',
  'calm down',
  'relax',
  'settle down',
];

// Dismissing his experience.
const DISMISSIVE_PHRASES = [
  'its nothing',
  'youre fine',
  'theres nothing wrong',
  'nothing wrong with you',
  'stop worrying',
  'dont be silly',
  'overreacting',
];

// Clinical jargon that lands badly when unexplained.
const JARGON = [
  'nstemi',
  'stemi',
  'troponin',
  'ecg',
  'ekg',
  '12-lead',
  '12 lead',
  'cannula',
  'ischaemia',
  'ischemia',
  'infarct',
  'tachycardic',
  'tachycardia',
  'bloods',
  'venepuncture',
  'defib',
];

// Connectors that indicate the clinician is *explaining* rather than just naming.
const EXPLAIN_CONNECTORS = [
  'which means',
  'this checks',
  'checks for',
  'checks whether',
  'this tells',
  'that tells',
  'tells us',
  'tells me',
  'tells you',
  'just tells',
  'this shows',
  'shows us',
  'shows me',
  'so we can',
  'so i can',
  'so that',
  'to make sure',
  'to check',
  'to see if',
  'because',
  'the reason',
  'what this does',
  'it lets us',
  'lets us',
  'helps us',
  'looking for',
  'looks for',
];

// De-escalation levers: acknowledging fear, reassurance, no rush.
const REASSURE_PHRASES = [
  'take your time',
  'no rush',
  'i understand',
  'i can see',
  'i can tell',
  'that sounds',
  'i know this is',
  'this must be',
  'must be frightening',
  'must be scary',
  'overwhelming',
  'youre safe',
  'youre in good hands',
  'here to help',
  'im here',
  'i hear you',
  'its okay',
  'thats okay',
];

// Offering a choice / asking permission.
const CHOICE_PHRASES = [
  'would you rather',
  'would you like',
  'would you be ok',
  'would you be okay',
  'is it okay if',
  'is it ok if',
  'can i',
  'may i',
  'could i',
  'your choice',
  'up to you',
  'whenever you',
  'would that be',
  'happy for me to',
  'if youd like',
  'if you want',
  'if youre happy',
  'if that works',
  'if thats ok',
  'if thats okay',
];

function addressesByName(h: string, name: string): boolean {
  const n = name.trim().toLowerCase();
  return !!n && (h.includes(` ${n} `) || h.includes(` ${n},`) || h.includes(` ${n}`));
}

// --- Classifier -------------------------------------------------------------------------------

export function classifyUtterance(utterance: string, ctx: ClassifierContext): PlayerEventKind {
  const h = norm(utterance);

  const explains = hasAny(h, EXPLAIN_CONNECTORS);
  const hasJargon = hasAny(h, JARGON);
  const orders = hasAny(h, ORDER_PHRASES);
  const dismisses = hasAny(h, DISMISSIVE_PHRASES);
  const reassures = hasAny(h, REASSURE_PHRASES);
  const offersChoice = hasAny(h, CHOICE_PHRASES);
  const byName = addressesByName(h, ctx.patientName);

  // 1) Escalation dominates: a direct order, a dismissal, or naked jargon (jargon with no
  //    explanation and no softening choice/permission) reads as patronising.
  const nakedJargon = hasJargon && !explains && !offersChoice;
  if (orders || dismisses || nakedJargon) {
    return 'escalation_trigger';
  }

  // 2) A plain-language explanation (connector present; a clinical noun makes it clearly about a
  //    test, but a bare "because it helps your heart" still counts).
  if (explains) {
    return 'plain_explanation';
  }

  // 3) De-escalation lever: reassurance, offered choice, or simply addressing him by name warmly.
  if (reassures || offersChoice || byName) {
    return 'deescalation_lever';
  }

  // 4) Otherwise a neutral clinical/history question.
  return 'neutral';
}
