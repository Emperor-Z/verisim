# VeriSim — Architecture, Traceability and Validation Evidence

Prepared 22 Aug 2026, the night before the Mr Praveen Pillai (Consultant Urologist) interview.
Everything in this document is either (a) directly observed by running the actual VeriSim codebase
tonight, or (b) explicitly marked as not yet done / deferred. Nothing here is aspirational —
where the earlier draft text claimed something as validated that turned out not to be, this
document corrects it rather than repeating it.

**Evaluated commit:** `4b03d4874136baccf7ce9b52592b793fded50d6a` (22 Aug 2026, "Confine idle
wander and clinician spawn to Bay 3"), built on `ca50f25` (11 Aug 2026). See
`evidence/evaluated_commit.txt`. The repo's actual HEAD has one further commit
(`d499d574...`) adding demo-only debug mutations (`forcePositions`, `forceConversation`,
`forceMessage`, `forceJoinHuman`, `resetTrustState`, and three cleanup helpers) used purely to
stage this pack's screenshots/video while local Ollama inference was unavailable (§6) — these are
not part of the evaluated consent-gate logic and should not be cited as prototype behaviour.

---

## 1. System architecture

```
 Clinician (human, browser)
        |
        |  free-text chat  +  structured test-menu actions
        v
 VeriSim frontend (PixiJS / AI Town fork)
        |
        v
 Multi-agent conversation layer  ---------------------------+
   - Ray    (patient, chest pain, hostile -> wary -> calm)   |
   - Kelly  (daughter, anxious, escalates/calms with Ray)    |
   - Sam    (nurse, professional, expects rationale)         |
        |                                                    |
        |  clinician utterance                                |
        v                                                    |
 Deterministic event classifier (eventClassifier.ts)         |
   utterance -> {deescalation_lever | plain_explanation |    |
                 escalation_trigger | neutral}                |
        |                                                    |
        v                                                    |
 Persisted TrustState (consentGate.ts + Convex table          |
 verisimTrustStates: trust, stage, deescalations,             |
 plainExplanations, refusals, selfDischarged)                 |
        |                                                    |
        v                                                    |
 Consent condition (per test category:                       |
 observation / invasive / medication)                        |
        |                                                    |
        v                                                    |
 Client shows test as available/locked  <--------------------+
        |
        |  clinician requests a test
        v
 Server-side recheck (dispatchTest, Convex mutation)
   re-evaluates the SAME consent condition — the client's
   displayed state is never trusted on its own
        |
   permitted? --- no  --> in-character refusal, trust -15, refusals++
        |
       yes
        v
 Canned clinical result inserted into the conversation
 (testResults.ts, delivered as a message "from" the patient/nurse)
        |
        v
 Every utterance and test dispatch also appended to
 verisimSessionEvents (debrief / research audit trail)
   -> queryable via getSessionEvents, not yet exported to an
      external sink (Langfuse) — data exists, export doesn't.
```

Separately, and unmodified from upstream AI Town: each agent also runs an autonomous
"decide what to do next" loop (`finishDoSomething`) that is independent of the consent-gate
path above — see §3 for why this matters.

## 2. Traceability table

| Prototype feature | Implementation | Research purpose | Theoretical connection |
|---|---|---|---|
| Multi-agent patient, family and nurse | Independent persona-driven agents (`data/characters.ts`) | Create social rather than single-patient interaction | Social/behavioural authenticity, SQ2 |
| Free-text clinician interaction | Conversational interface via chat-native message format | Avoid fixed branching dialogue | Functional correspondence |
| Consent-gate | Persistent trust state controlling selected actions | Make communication consequential | Non-technical skills, CRM |
| Structured clinical tests | Explicit selectable actions, server-rechecked | Separate conversation from formal clinical actions | Clinical task structure |
| Deterministic event classifier | Rule-based classification of clinician dialogue (`eventClassifier.ts`) | Reproducible trust-state transitions | Methodological transparency |
| Persona/state prompting | Trust state fed into patient response generation (`trustPromptLine`) | Connect prior interaction to future behaviour | Behavioural credibility |
| Automated tests | Unit tests over classifier + consent-gate reducer (`eventClassifier.test.ts`) | Verify implementation independently of user opinion | Technical dependability |
| RAG diagnostic layer | Future development (§7.4) | Ground synthetic disease cases, evaluate learner diagnosis | Future evidence-grounded diagnostic training |

## 3. Technical validation — what is actually true tonight

Three different kinds of claim, kept separate on purpose (this distinction matters for an examiner):

**3.1 Implementation validation — TRUE, re-run live tonight with exact counts.**
Three test files, all passing at the evaluated commit:

| File | Assertions | Result |
|---|---|---|
| `eventClassifier.test.ts` | 16 | ALL PASSED |
| `consentGate.test.ts` | 11 | ALL PASSED |
| `session.test.ts` | 9 | ALL PASSED |

**3.2 Integration validation — TRUE as of tonight, FALSE before tonight.**
Before tonight, `docs/consent_gate.md` stated plainly: only the map/schema layer had ever been run
live; the LLM/agent side of the loop was unexercised and no human had ever clicked through it in a
browser. Do not let the dissertation claim otherwise for anything before 22 Aug 2026.

Tonight, for the first time, the real deployed mutations were exercised end-to-end against the
live database (not a mock), with a real audit trail. Full sequence (see
`evidence/session_events.json` for the raw export):

1. Baseline: `trust=25, stage=hostile`.
2. `dispatchTest("bloods", "invasive")` **before** any de-escalation → refused
   (`consent_refused`), trust drops 25→10.
3. Clinician utterance *"Ray, take your time — there's no rush at all."* → classified
   `deescalation_lever`, trust 10→25.
4. Clinician utterance *"I can see this is really frightening for you."* → `deescalation_lever`,
   trust 25→40, stage advances to `wary`.
5. Clinician utterance *"I'd like to do an ECG because it shows me what your heart is doing right
   now."* → `plain_explanation`, trust 40→50.
6. `dispatchTest("bloods", "invasive")` **after** de-escalation → **permitted**
   (`consent_ok`), refusals reset to 0.

This is the actual `verisim/trustStates.ts` mutations, called against the live Convex backend,
not a simulated or hand-written trace.

**3.3 Model/dialogue validation — NOT YET DONE tonight; deferred.**
No live LLM-generated patient/nurse dialogue was captured tonight. Local Ollama models available
on this machine (qwen3.5:4b and similar) were not exercised for the demo — the interview-pack
video uses the persona panels and the backend trace above, not generated in-character dialogue.
The GPU-benchmarked run (university machine, RTX Pro Blackwell, ~47GB VRAM) is the one that will
produce citable dialogue-quality/latency evidence and should be reported separately, with that
machine's specs stated explicitly, compared against this local machine's specs. Do not backdate
GPU-run numbers into tonight's date.

## 4. Bugs found tonight and their status

Running the live stack surfaced four integration bugs that were not visible from reading the code
or docs alone:

1. **Stale world data — fixed.** The default world in the database still had the original AI Town
   default characters (villagers "gardening", "reading a book") rather than Ray/Kelly/Sam, because
   `init`'s agent-creation step silently no-ops whenever a world already has agents, and this
   world predated the persona rework. Fixed via `testing:wipeAllTables` + re-`init`.
2. **No scenario confinement — fixed, not yet observed over a full autonomous cycle.**
   Ray/Kelly/Sam ran the unmodified upstream AI Town "wander and do something" idle-activity loop
   across the full 64×48 map, and the human clinician's join position sampled the same way. Both
   `wanderDestination()` (`convex/aiTown/agentOperations.ts`) and `Player.join()`
   (`convex/aiTown/player.ts`) now sample only within Bay 3's floor tiles (x:6–12, y:5–11, read
   from `data/aeBay.js`, not guessed). Deployed and building clean at commit `4b03d487...`. Not
   yet watched through several unattended idle cycles to confirm it holds — say so honestly until
   that's done, don't claim full confinement as observed.
3. **Idle-activity flavour text unchanged.** Ray/Kelly/Sam's idle descriptions (gardening, reading
   a book) are still generic AI Town text, not clinically scripted. Cosmetic, not corrected
   tonight — low priority relative to the above.
4. **Engine tick loop can stall indefinitely.** During testing the engine's own step counter froze
   for several minutes while its status remained "running," consistent with an agent step
   blocking forever on a hung local Ollama call with no timeout. This blocks *everything* engine-
   dependent (joins, conversation invites, moves), not just message generation — worth flagging as
   a robustness gap distinct from the consent-gate mechanism itself, which does not depend on the
   engine tick (§3.2 was validated via direct mutation calls, unaffected by this).

None of these affect the correctness of the consent-gate logic itself (§3.1–3.2), but all four
should be listed as prototype limitations in Methodology §3.10 / Discussion, not left implicit.

## 5. Capability: implemented / validated / future

Kept as three separate columns rather than one yes/no, because "the code exists" and "this run
proved it works" are different claims — collapsing them is exactly the kind of overclaim this
document exists to avoid.

| Capability | Implemented | Validated (this evaluation) | Future |
|---|---|---|---|
| Multi-agent conversation | Yes | Backend mechanics yes (§3.2); full live in-browser session yes (§3.2, 22 Aug) | Expanded |
| Patient/family/nurse personas | Yes | Yes — persona panels confirmed live | Dynamic agent generation |
| Consent-dependent actions, server-rechecked | Yes | Yes — full refuse→de-escalate→permit cycle, both via direct mutation and a real UI click | Expanded clinical state |
| Structured clinical tests (6, see §6) | Yes | Yes — live UI click produced the correct canned result | Larger test catalogue |
| Single-room scenario confinement | Yes (fixed 22 Aug) | **Not yet — fix deployed but not watched through an unattended cycle** | — |
| Clinician spawns inside Bay 3 | Yes (fixed 22 Aug) | **Not yet — same as above** | — |
| Live GPU-quality generated dialogue | Yes (code path exists) | **No — local Ollama inference hung tonight; deferred to uni RTX Pro Blackwell run** | Benchmarked dialogue quality/latency |
| RAG-grounded disease model | No | — | Yes (§7.4) |
| Learner diagnosis evaluation | No | — | Yes |
| Hospital-scale simulation | No | — | Yes |
| Real-patient clinical decision support | No | — | Not an intended use |

## 6. The six clinical tests (hand-authored, not model-generated)

Deliberately scenario-authored rather than LLM-generated, so the system never has to trust a model
to invent clinical ground truth — the test's *availability* is gated by the consent logic; its
*result* is a fixed, pre-written string.

| id | Label | Category | Canned result |
|---|---|---|---|
| `obs` | Observations (pulse, resp, colour) | observation | "Obs: pulse 96, RR 22, sats 97% on air, looks pale but alert." |
| `ecg` | 12-lead ECG | invasive | "12-lead ECG: sinus tachycardia, 1mm ST depression in II, III, aVF. No acute ST elevation." |
| `bloods` | Bloods (troponin, FBC) | invasive | "Bloods sent — troponin and FBC back in 20 minutes." |
| `cannula` | IV cannula | invasive | "IV cannula sited, 18G, left ACF. Flushed, no issues." |
| `gtn` | GTN spray | medication | "GTN spray given sublingually. Ray reports the pain easing slightly after two minutes." |
| `analgesia` | Analgesia (morphine) | medication | "Morphine given per protocol. Ray visibly settles, breathing slower within a few minutes." |

Source: `src/components/TestMenu.tsx` (ids/labels/categories), `convex/verisim/testResults.ts`
(result text).

## 7. What's in this pack

- `screenshots/01_bay3_overview.jpg` / `01_bay3_overview_close.jpg` — Bay 3 with Ray, Kelly, Sam
  (and, in the close version, the clinician) present. Positions were staged via a local debug
  mutation for a clean shot — caption these as a view of the scenario environment, not as proof
  the agents remain there unattended (§4.2/§5).
- `screenshots/02–04_*_persona_panel.jpg` — each character's real, live persona panel.
- `screenshots/05_consent_gate_trace.png` — rendered summary of the direct-mutation trace.
- `screenshots/06_conversation_early.jpg` — the real in-game chat thread, live UI, real messages.
- `screenshots/07_test_menu_wary.jpg` — the real Test Menu panel, WARY stage, all 6 tests visible.
- `screenshots/08_bloods_permitted_live_click.jpg` — the result of an actual click on "Bloods" in
  the browser: the canned result line appearing in the conversation, chat input ready below it.
  This one is not staged — it's a real UI interaction with the real `dispatchTest` handler.
- `video/verisim_concept_walkthrough.mp4` — the above frames stitched into an MP4. **Note:** this
  is a frame-stitched slideshow, not a continuous screen capture — this environment's Wayland
  session doesn't have the portal/pipewire tooling set up for live screen recording. Say so if
  asked; don't present it as a continuous recording.
- `evidence/session_events.json` — raw export of the full audit trail from §3.2.
- `evidence/evaluated_commit.txt` — the exact commits this pack corresponds to.

## 8. Suggested use in the dissertation

- §3.7 architecture figure: adapt the diagram in §1 above.
- Table 3.2: use §2 as-is.
- §3.7.3 Technical validation: use the three-tier distinction in §3 — this is the version that
  matches what has actually been done, unlike a draft that asserts integration validation as
  settled fact.
- §3.10 Methodological limitations: add the three gaps in §4.
- §7 Future work / Recommendations: §5's capability table works as-is.
- Appendix C: the screenshots and video in this pack, plus the session_events.json trace as a
  worked example of the debrief data trail mentioned in Methodology §3.7.
