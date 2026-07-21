import {
  initialTrustState, applyPlayerEvent, evaluateTestRequest, consentGiven,
} from './consentGate';

function assert(c: boolean, msg: string) { if (!c) { console.error('FAIL:', msg); process.exit(1); } else console.log('ok  -', msg); }

// Path A: earn consent for an invasive test.
let s = initialTrustState();
assert(s.stage === 'hostile', 'starts hostile (trust 25)');
assert(!consentGiven(s), 'no consent at start');

// Pushing an ECG immediately => refused, trust drops.
let d = evaluateTestRequest(s, 'invasive');
assert(!d.permitted && d.reason === 'consent_refused', 'immediate ECG refused');
s = d.state;

// De-escalate + explain why it matters.
s = applyPlayerEvent(s, 'deescalation_lever'); // +15
s = applyPlayerEvent(s, 'deescalation_lever'); // +15
s = applyPlayerEvent(s, 'plain_explanation');  // +10
assert(s.stage !== 'hostile', `no longer hostile (trust=${s.trust})`);
assert(consentGiven(s), 'consent given after de-escalation + explanation');

d = evaluateTestRequest(s, 'invasive');
assert(d.permitted && d.reason === 'consent_ok', 'ECG now permitted');

// Path B: bulldoze a hostile patient => self-discharge.
let h = initialTrustState();
h = evaluateTestRequest(h, 'invasive').state; // refusal 1
let d2 = evaluateTestRequest(h, 'invasive');   // refusal 2 while hostile
assert(d2.state.selfDischarged, 'two hostile pushes => self-discharge fail state');
assert(evaluateTestRequest(d2.state, 'observation').reason === 'patient_self_discharged', 'gate closed after discharge');

// Path C: observations allowed once merely wary (no full consent needed).
let w = initialTrustState();
w = applyPlayerEvent(w, 'deescalation_lever'); // trust 40 => wary
assert(w.stage === 'wary', `wary at trust=${w.trust}`);
assert(evaluateTestRequest(w, 'observation').permitted, 'obs allowed when wary');
assert(!evaluateTestRequest(w, 'invasive').permitted, 'invasive still blocked when only wary/no explanation');

console.log('\nALL CONSENT-GATE TESTS PASSED');
