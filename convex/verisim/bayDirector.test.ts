import { addressee, cleanLine, pickResponders, type DirectorInput } from './bayDirector';

function assert(c: boolean, msg: string) {
  if (!c) { console.error('FAIL:', msg); process.exit(1); }
  console.log('ok  -', msg);
}

const base: DirectorInput = {
  utterance: '',
  event: 'neutral',
  stage: 'hostile',
  clinicianTurns: 1,
  history: [],
};
const turn = (over: Partial<DirectorInput>) => pickResponders({ ...base, ...over }).join(',');

// --- Addressing ---
assert(addressee('Kelly, can you tell me when it started?') === 'Kelly', 'named Kelly is the addressee');
assert(addressee('Sam, can we get an ECG please') === 'Sam', 'named Sam is the addressee');
assert(addressee('Mr Turner, how are you feeling?') === 'Ray', 'Mr Turner resolves to Ray');
assert(addressee('Ray, would Kelly mind stepping out?') === 'Ray', 'first name mentioned wins');
assert(addressee('How are you feeling?') === undefined, 'nobody named -> no addressee');
assert(addressee('Is that the same pain?') === undefined, '"same" does not read as Sam');

// --- Responders ---
assert(turn({ utterance: 'How are you feeling?' }) === 'Ray', 'unaddressed question goes to Ray');
assert(turn({ utterance: 'When did the pain start?' }) === 'Ray,Kelly',
  'history question while hostile: Kelly answers over him');
assert(turn({ utterance: 'When did the pain start?', stage: 'consenting' }) === 'Ray',
  'once Ray trusts the clinician he answers for himself');
assert(turn({ utterance: 'Just sit still.', event: 'escalation_trigger' }) === 'Ray,Kelly',
  'an escalation winds Kelly up too');
assert(turn({ utterance: 'Sam, obs please' }) === 'Sam', 'instruction to Sam goes to Sam alone');
assert(turn({ utterance: 'Kelly, does he take any tablets?' }) === 'Kelly',
  'question put to Kelly is hers alone');
assert(turn({ utterance: 'Okay.', clinicianTurns: 3 }) === 'Ray,Sam',
  'Sam flags obs every fourth turn if quiet');
assert(turn({ utterance: 'Okay.', clinicianTurns: 3, history: [{ speaker: 'Sam', text: 'On it.' }] }) === 'Ray',
  'Sam stays quiet if she spoke recently');
assert(turn({ utterance: 'When did it start?', clinicianTurns: 3 }).split(',').length === 2,
  'never more than two responders');

// --- Cleaning model output ---
assert(cleanLine('Ray: "It\'s indigestion."', 'Ray') === "It's indigestion.", 'name prefix and quotes stripped');
assert(cleanLine('<think>he is hostile</think>I\'m not staying.', 'Ray') === "I'm not staying.", 'reasoning block stripped');
assert(cleanLine('*folds arms* Leave it.', 'Ray') === 'Leave it.', 'stage direction stripped');
assert(cleanLine('Fine.\nKelly: Dad!', 'Ray') === 'Fine.', 'only the speaker\'s own line kept');
assert(cleanLine('One. Two. Three. Four.', 'Sam') === 'One. Two. Three.', 'capped at three sentences');
