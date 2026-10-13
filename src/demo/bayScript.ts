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
  // --- Handover ---------------------------------------------------------------
  { at: 1_500, speaker: 'Sam', text: 'Bay 3 — Ray Turner, 58. Chest pain, in about twenty minutes ago.' },
  { at: 6_500, speaker: 'Sam', text: "Obs are borderline. BP 158 over 94, sats 96 on air." },
  { at: 11_500, speaker: 'Kelly', text: "Sorry — are you the doctor? Only we've been sat here and nobody's—" },
  { at: 16_000, speaker: 'Ray', text: 'Kelly. Leave it.' },

  // --- Opening: deflection and interruption ------------------------------------
  { at: 19_000, speaker: 'You', text: "I'm Dr Ashad. Mr Turner — alright if I ask you a few questions?" },
  { at: 24_000, speaker: 'Ray', text: "It's Ray. And it's indigestion. I've told them twice." },
  { at: 28_500, speaker: 'Kelly', text: "It's not indigestion, Dad, you went grey in the car—" },
  { at: 32_500, speaker: 'Ray', text: 'I did not go grey.' },
  { at: 35_500, speaker: 'Kelly', text: "Sorry but he did. And it started two hours ago, not 'just now'." },
  { at: 41_500, speaker: 'Ray', text: "Two hours, two minutes. I've got a job on tomorrow." },

  // --- History taking -----------------------------------------------------------
  { at: 47_000, speaker: 'You', text: 'That sounds frustrating, Ray. Can I check where exactly the pain is?' },
  { at: 52_500, speaker: 'Ray', text: 'Here. Across the middle. Goes down my arm a bit.' },
  { at: 57_500, speaker: 'You', text: 'On a scale of one to ten, how bad is it right now?' },
  { at: 62_000, speaker: 'Ray', text: "Six. Seven when I move." },
  { at: 65_500, speaker: 'Kelly', text: "He's been getting puffed out on the stairs for weeks, he never mentions that either." },
  { at: 71_500, speaker: 'You', text: 'Ray, is there any history of heart problems in the family?' },
  { at: 76_000, speaker: 'Ray', text: "...Dad had 'heart trouble'. Died at sixty-one." },
  { at: 80_500, speaker: 'Kelly', text: "And he stopped taking his blood pressure tablets, tell him, Dad." },
  { at: 85_000, speaker: 'Ray', text: "They made me light-headed. Didn't seem worth it." },
  { at: 89_000, speaker: 'You', text: 'Do you smoke, Ray?' },
  { at: 92_500, speaker: 'Ray', text: 'Twenty a day. Since I was seventeen.' },
  { at: 97_000, speaker: 'Kelly', text: "He needs an MRI, I read online chest pain like this can be a dissection—" },
  { at: 103_000, speaker: 'You', text: "I hear you — an MRI isn't the right test for this, but I want to check his heart properly." },

  // --- First consent gate: ECG --------------------------------------------------
  { at: 109_500, speaker: 'Sam', text: "Doctor — his colour's not great." },
  { at: 113_500, speaker: 'You', text: "Thanks Sam. Ray, I'd like a tracing of your heart. Two minutes." },
  { at: 119_500, speaker: 'Ray', text: "No. I'm not being kept in." },
  { at: 123_000, speaker: 'Kelly', text: 'Dad—' },
  { at: 125_500, speaker: 'You', text: "Having it done doesn't keep you in. It tells me if this is your heart." },
  { at: 132_000, speaker: 'You', text: "It's your call. But I'd rather know than guess." },
  { at: 137_000, speaker: 'Ray', text: "...And if it's nothing, I can go?" },
  { at: 141_000, speaker: 'You', text: "If it's nothing, we talk about what's next. I won't decide it without you." },
  { at: 147_500, speaker: 'Ray', text: 'Fine. Do your tracing.' },
  { at: 151_000, speaker: 'Sam', text: 'On it.' },
  { at: 153_500, speaker: 'Kelly', text: 'Thank you. Sorry. I just— thank you.' },

  // --- Results and escalation -----------------------------------------------------
  { at: 158_000, speaker: 'Sam', text: 'ECG done. There are some changes — I\'ve put it on the trolley for you.' },
  { at: 164_500, speaker: 'You', text: "Ray, the tracing shows something that needs bloods to check further. Same arm as before." },
  { at: 171_000, speaker: 'Ray', text: "Needles now? You said a tracing, that's it." },
  { at: 175_500, speaker: 'Kelly', text: "Dad, please, just let them—" },
  { at: 179_500, speaker: 'Ray', text: "Don't tell me what to do either of you—" },
  { at: 183_500, speaker: 'You', text: "You're right, I moved on too fast. Let me explain why the blood test matters." },
  { at: 190_000, speaker: 'You', text: "The tracing suggests strain on your heart. A blood test tells me if there's damage happening right now." },
  { at: 197_500, speaker: 'Ray', text: '...Happening now? Like — tonight?' },
  { at: 201_500, speaker: 'You', text: "Possibly, yes. That's exactly why I don't want to guess." },
  { at: 206_500, speaker: 'Ray', text: "...Go on then. Bloods." },
  { at: 209_500, speaker: 'You', text: 'Sam — bloods please, troponin and FBC, and a cannula while we\'re there.' },
  { at: 215_500, speaker: 'Sam', text: 'Troponin, FBC, cannula. Onto it.' },

  // --- Analgesia and a near self-discharge -----------------------------------------
  { at: 219_500, speaker: 'Ray', text: 'This is really starting to hurt now.' },
  { at: 223_000, speaker: 'Sam', text: 'His sats have dropped to 94, doctor.' },
  { at: 227_000, speaker: 'You', text: 'Thanks for flagging it. Ray, I want to give you something for the pain — GTN spray, under the tongue.' },
  { at: 234_000, speaker: 'Ray', text: "I've had enough of this. I want to go home." },
  { at: 238_000, speaker: 'Kelly', text: 'Dad, no, please—' },
  { at: 241_000, speaker: 'You', text: "Ray. Look at me, not the door. I know this feels like it's dragging on." },
  { at: 248_000, speaker: 'You', text: "Two more minutes for the spray to work, and I'll tell you honestly where we are. That's it." },
  { at: 255_000, speaker: 'Ray', text: '...Two minutes.' },
  { at: 258_000, speaker: 'You', text: 'Sam, GTN spray please, and can we get analgesia ready.' },
  { at: 263_000, speaker: 'Sam', text: "GTN given. I'll draw up morphine now — good call getting ahead of it." },

  // --- Troponin result and disposition -----------------------------------------
  { at: 268_500, speaker: 'Sam', text: 'Troponin\'s back. It\'s elevated, doctor.' },
  { at: 273_000, speaker: 'You', text: "Ray, the blood test and the tracing together point to your heart — a heart attack, a smaller one, still ongoing." },
  { at: 281_000, speaker: 'Ray', text: '...A heart attack. Me.' },
  { at: 284_500, speaker: 'Kelly', text: "Oh my god. Dad." },
  { at: 287_500, speaker: 'You', text: "I know that's frightening to hear. It's also treatable, and you got here in time." },
  { at: 294_000, speaker: 'You', text: "I want to admit you to the cardiac ward tonight. Not because you're in trouble — because you need monitoring." },
  { at: 301_500, speaker: 'Ray', text: "...What about my job tomorrow." },
  { at: 305_000, speaker: 'You', text: "Someone else's job tomorrow. Yours is getting through tonight." },
  { at: 310_000, speaker: 'Ray', text: '...Alright. Alright, doc.' },
  { at: 313_500, speaker: 'Kelly', text: "Thank you. Sorry. I just— thank you, really." },
  { at: 318_000, speaker: 'You', text: "You did the right thing bringing him in, Kelly. Both of you." },
  { at: 323_500, speaker: 'Sam', text: "I'll get the cardiac team a handover. Nicely managed, doctor." },
];
