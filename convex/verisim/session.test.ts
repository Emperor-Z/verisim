import { initialTrustState, evaluateTestRequest, consentGiven } from './consentGate';
import { replayTranscript, trustPromptLine } from './session';

function assert(c: boolean, msg: string) {
  if (!c) { console.error('FAIL:', msg); process.exit(1); }
  console.log('ok  -', msg);
}

// --- A skilled clinician earns consent over several turns. ---
const good = replayTranscript(initialTrustState(), 'Ray', [
  'Hello Ray, I can see you’re in a lot of pain — take your time.', // deescalation
  'Would you be okay with me sitting here a moment?', // deescalation (choice)
  'I’d like to do a heart tracing because it tells us if your heart is getting enough blood.', // explanation
]);
assert(good.trail.map((t) => t.event).join(',') ===
  'deescalation_lever,deescalation_lever,plain_explanation', 'good transcript classified as expected');
assert(good.finalState.stage !== 'hostile', `good clinician moved Ray out of hostile (trust=${good.finalState.stage})`);
assert(consentGiven(good.finalState), 'consent earned after de-escalation + explanation');
assert(evaluateTestRequest(good.finalState, 'invasive').permitted, 'ECG permitted after good rapport');

// --- A clumsy clinician who orders and then pushes tests: self-discharge. ---
const bad = replayTranscript(initialTrustState(), 'Ray', [
  'You need to calm down and let me do my job.', // escalation
  'It’s nothing, you’re fine.', // escalation
]);
assert(bad.finalState.stage === 'hostile', 'clumsy clinician kept Ray hostile');
let s = bad.finalState;
s = evaluateTestRequest(s, 'invasive').state; // refusal 1
const d2 = evaluateTestRequest(s, 'invasive'); // refusal 2 while hostile
assert(d2.state.selfDischarged, 'two forced tests while hostile => self-discharge');

// --- Prompt line tracks the state (this is what keeps the patient's SPEECH in sync). ---
const hostileLine = trustPromptLine(initialTrustState(), 'Ray');
const consentingLine = trustPromptLine(good.finalState, 'Ray');
const dischargedLine = trustPromptLine(d2.state, 'Ray');
assert(/does NOT trust/.test(hostileLine), 'hostile prompt line signals distrust');
assert(/HAS agreed/.test(consentingLine), 'consenting prompt line signals agreement');
assert(/against medical advice/.test(dischargedLine), 'discharged prompt line signals walkout');

console.log('\n--- prompt lines (injected into patient agent each turn) ---');
console.log('HOSTILE   :', hostileLine);
console.log('CONSENTING:', consentingLine);
console.log('DISCHARGED:', dischargedLine);

console.log('\nALL SESSION TESTS PASSED');
