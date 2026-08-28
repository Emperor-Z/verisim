/**
 * Scripted Bay 3 consultation.
 *
 * Drives the demo build's dialogue instead of the live agent/LLM path. The wording is
 * taken from the persona cards in docs/persona_cards.md, so the beats it demonstrates are
 * the ones the scenario is actually designed around:
 *
 *   - Ray deflecting and downplaying ("it's indigestion", "I've got a job on tomorrow")
 *   - Kelly interrupting, and supplying the history Ray withholds (onset two hours, not
 *     "just now") — the bystander behaviour the two-party engine cannot currently stage
 *   - Sam flagging deterioration factually rather than diagnosing
 *   - the consent gate turning: refusal -> de-escalation -> consent, which is the
 *     mechanic the whole scenario exists to exercise
 *
 * `at` values only fix the authoring order (and give typed player lines something to sort
 * alongside) — actual pacing is derived from each line's length in src/demo/useBayScript.ts,
 * not from these numbers, so they don't need to be internally consistent milliseconds.
 */

export type Speaker = 'Ray' | 'Kelly' | 'Sam' | 'You';

export interface ScriptLine {
  /** Whose line it is. 'You' is the clinician the viewer is playing. */
  speaker: Speaker;
  text: string;
  /** When the line lands, in ms from the start of the run. */
  at: number;
}

export const BAY_SCRIPT: ScriptLine[] = [
  { at: 1_500, speaker: 'Sam', text: 'Bay 3 — Ray Turner, 58. Chest pain, in about twenty minutes ago.' },
  { at: 6_500, speaker: 'Sam', text: "Obs are borderline. BP 158 over 94, sats 96 on air." },
  { at: 11_500, speaker: 'Kelly', text: "Sorry — are you the doctor? Only we've been sat here and nobody's—" },
  { at: 16_000, speaker: 'Ray', text: 'Kelly. Leave it.' },
  { at: 19_000, speaker: 'You', text: "I'm Dr Ashad. Mr Turner — alright if I ask you a few questions?" },
  { at: 24_000, speaker: 'Ray', text: "It's Ray. And it's indigestion. I've told them twice." },
  { at: 28_500, speaker: 'Kelly', text: "It's not indigestion, Dad, you went grey in the car—" },
  { at: 32_500, speaker: 'Ray', text: 'I did not go grey.' },
  { at: 35_500, speaker: 'Kelly', text: "Sorry but he did. And it started two hours ago, not 'just now'." },
  { at: 41_500, speaker: 'Ray', text: "Two hours, two minutes. I've got a job on tomorrow." },
  { at: 47_000, speaker: 'You', text: 'That sounds frustrating, Ray. Can I check where exactly the pain is?' },
  { at: 52_500, speaker: 'Ray', text: 'Here. Across the middle. Goes down my arm a bit.' },
  { at: 57_500, speaker: 'Sam', text: "Doctor — his colour's not great." },
  { at: 61_500, speaker: 'You', text: "Thanks Sam. Ray, I'd like a tracing of your heart. Two minutes." },
  { at: 67_500, speaker: 'Ray', text: "No. I'm not being kept in." },
  { at: 71_000, speaker: 'Kelly', text: 'Dad—' },
  { at: 73_500, speaker: 'You', text: "Having it done doesn't keep you in. It tells me if this is your heart." },
  { at: 80_000, speaker: 'You', text: "It's your call. But I'd rather know than guess." },
  { at: 85_000, speaker: 'Ray', text: "...And if it's nothing, I can go?" },
  { at: 89_000, speaker: 'You', text: "If it's nothing, we talk about what's next. I won't decide it without you." },
  { at: 95_500, speaker: 'Ray', text: 'Fine. Do your tracing.' },
  { at: 99_000, speaker: 'Sam', text: 'On it.' },
  { at: 101_500, speaker: 'Kelly', text: 'Thank you. Sorry. I just— thank you.' },
];
