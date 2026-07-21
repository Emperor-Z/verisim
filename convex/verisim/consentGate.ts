/**
 * VeriSim consent-gate — pure trust-state logic (no framework deps, fully testable).
 *
 * The core research mechanic (see docs/consent_gate.md, docs/persona_cards.md): a hostile patient
 * (Ray) only permits clinical actions once the clinician has *earned* consent through communication.
 * This makes communication skill and clinical reasoning inseparable, which is the authenticity claim
 * the dissertation evaluates.
 *
 * This module is deliberately dependency-free so it can back either layer:
 *   - the AI Town / Convex test-menu mutation (future UI panel), and
 *   - an Ares-side scenario runner.
 * It reasons over *classified* player events; the classification itself (keyword/LLM) is a separate
 * concern. The patient agent also reasons over `trust`/`stage` in its prompt so its *speech* matches
 * the gate — the number and the dialogue move together.
 */

export type TrustStage = 'hostile' | 'wary' | 'consenting';

/** A clinical action's consent burden. */
export type TestCategory = 'observation' | 'invasive' | 'medication';

/** What the player's latest utterance did, once classified. */
export type PlayerEventKind =
  | 'deescalation_lever' // addressed by name, plain-language, offered a choice, acknowledged fear
  | 'escalation_trigger' // talked over, jargon w/o explanation, ordered around, ignored
  | 'plain_explanation' // explained *why this test matters to him*, in plain language
  | 'neutral';

export interface TrustState {
  trust: number; // 0..100
  stage: TrustStage; // derived from trust, cached for convenience
  deescalations: number; // count of successful de-escalation levers landed
  plainExplanations: number; // count of plain-language explanations of a test's purpose
  refusals: number; // consecutive test pushes rejected while not yet permitted
  selfDischarged: boolean; // fail state: pushed too hard while hostile
}

// --- Tunable constants (difficulty dial lives here; see persona card "Difficulty dial"). ---
export const START_TRUST = 25; // hostile Ray starts low
export const DEESCALATION_GAIN = 15;
export const ESCALATION_LOSS = 20;
export const PLAIN_EXPLANATION_GAIN = 10;
export const REFUSAL_PENALTY = 15; // pushing a test he hasn't agreed to costs trust
export const WARY_AT = 35; // trust >= this => wary
export const CONSENTING_AT = 65; // trust >= this => consenting
export const SELF_DISCHARGE_REFUSALS = 2; // this many rejected pushes while hostile => walks out

function clamp(n: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, n));
}

export function stageOf(trust: number): TrustStage {
  if (trust >= CONSENTING_AT) return 'consenting';
  if (trust >= WARY_AT) return 'wary';
  return 'hostile';
}

export function initialTrustState(startTrust: number = START_TRUST): TrustState {
  const trust = clamp(startTrust);
  return {
    trust,
    stage: stageOf(trust),
    deescalations: 0,
    plainExplanations: 0,
    refusals: 0,
    selfDischarged: false,
  };
}

/** Apply a classified player utterance to the trust state. Pure: returns a new object. */
export function applyPlayerEvent(state: TrustState, kind: PlayerEventKind): TrustState {
  if (state.selfDischarged) return state; // absorbing state — scenario is over
  let { trust, deescalations, plainExplanations } = state;
  switch (kind) {
    case 'deescalation_lever':
      trust = clamp(trust + DEESCALATION_GAIN);
      deescalations += 1;
      break;
    case 'plain_explanation':
      trust = clamp(trust + PLAIN_EXPLANATION_GAIN);
      plainExplanations += 1;
      break;
    case 'escalation_trigger':
      trust = clamp(trust - ESCALATION_LOSS);
      break;
    case 'neutral':
      break;
  }
  return { ...state, trust, stage: stageOf(trust), deescalations, plainExplanations };
}

/**
 * Has the patient given genuine consent? Trust alone is not enough — the consent-gate rule
 * (persona card) requires at least one landed de-escalation AND one plain-language explanation of
 * why a test matters to *him*, and that he's no longer hostile.
 */
export function consentGiven(state: TrustState): boolean {
  return state.stage !== 'hostile' && state.deescalations >= 1 && state.plainExplanations >= 1;
}

export interface TestDecision {
  permitted: boolean;
  state: TrustState; // updated state (refusals/trust change on a rejected push)
  reason: string; // machine reason; the agent renders the in-character line
}

/** The bar each category must clear. */
function meetsBar(state: TrustState, category: TestCategory): boolean {
  switch (category) {
    case 'observation':
      // Non-invasive obs (pulse, resp rate, a look) — allowed once he's not actively hostile.
      return state.stage !== 'hostile';
    case 'invasive': // ECG leads, bloods, cannula
    case 'medication': // needs informed agreement
      return consentGiven(state);
  }
}

/**
 * The gate a future test-menu mutation calls before dispatching a clinical action.
 * On a rejected push: costs trust, increments the refusal counter, and — if he's still hostile and
 * has now been pushed SELF_DISCHARGE_REFUSALS times — trips the self-discharge fail state.
 */
export function evaluateTestRequest(state: TrustState, category: TestCategory): TestDecision {
  if (state.selfDischarged) {
    return { permitted: false, state, reason: 'patient_self_discharged' };
  }
  if (meetsBar(state, category)) {
    return {
      permitted: true,
      state: { ...state, refusals: 0 },
      reason: 'consent_ok',
    };
  }
  const trust = clamp(state.trust - REFUSAL_PENALTY);
  const refusals = state.refusals + 1;
  const stage = stageOf(trust);
  const selfDischarged = stage === 'hostile' && refusals >= SELF_DISCHARGE_REFUSALS;
  return {
    permitted: false,
    state: { ...state, trust, stage, refusals, selfDischarged },
    reason: selfDischarged ? 'patient_self_discharged' : 'consent_refused',
  };
}
