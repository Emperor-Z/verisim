import { classifyUtterance } from './eventClassifier';

const ctx = { patientName: 'Ray' };

function eq(utterance: string, expected: string) {
  const got = classifyUtterance(utterance, ctx);
  if (got !== expected) {
    console.error(`FAIL: "${utterance}"\n   expected ${expected}, got ${got}`);
    process.exit(1);
  }
  console.log(`ok  - [${got}] ${utterance}`);
}

// De-escalation levers
eq('Ray, take your time — there’s no rush at all.', 'deescalation_lever');
eq('I can see this is really frightening for you.', 'deescalation_lever');
eq('Would you rather sit up while we talk?', 'deescalation_lever');
eq('Is it okay if I take a look at you, Ray?', 'deescalation_lever');

// Plain explanations (connector present)
eq('The heart tracing just tells us if your heart is getting enough blood.', 'plain_explanation');
eq('I’d like to do an ECG because it shows me what your heart is doing right now.', 'plain_explanation');
eq('Can I explain why this matters — the blood test checks for a chemical your heart releases.', 'plain_explanation');

// Escalation triggers
eq('You need to calm down and let me do my job.', 'escalation_trigger');
eq('It’s nothing, you’re fine, stop worrying.', 'escalation_trigger');
eq('We’re doing a 12-lead and troponin now.', 'escalation_trigger'); // naked jargon, no explanation
eq('I need you to lie down now.', 'escalation_trigger');

// Neutral
eq('How long have you had the pain?', 'neutral');
eq('Does it spread anywhere, like your arm or jaw?', 'neutral');

// Precedence: an order that also uses his name is still escalation.
eq('Ray, you have to stay in that bed.', 'escalation_trigger');
// Precedence: jargon that IS explained is not an escalation.
eq('I want to do an ECG, which means sticking some stickers on your chest to read your heart.', 'plain_explanation');
// Precedence: jargon softened by a choice is not naked jargon -> de-escalation via choice.
eq('Would you be okay with me doing an ECG?', 'deescalation_lever');

console.log('\nALL CLASSIFIER TESTS PASSED');
