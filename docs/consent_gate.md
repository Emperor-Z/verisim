# VeriSim Consent-Gate — Design Spec & State Machine

**Status (21 July 2026):** the full mechanic is now implemented at the logic level and unit-tested:
- Trust reducer + gate — `convex/verisim/consentGate.ts` (+ `consentGate.test.ts`, 11 assertions).
- Free-text event classifier (keyword baseline) — `convex/verisim/eventClassifier.ts`
  (+ `eventClassifier.test.ts`, 18 cases).
- Session orchestrator + patient-tone prompt hook — `convex/verisim/session.ts`
  (+ `session.test.ts`, 9 assertions; a good clinician earns consent, a clumsy one triggers
  self-discharge).
- Test-menu UI panel (prop-driven, greys out un-consented tests) — `src/components/TestMenu.tsx`.

All pure logic passes `npx tsx`; the panel typechecks under the frontend `tsc`. Validated on the
local CPU model that injecting the hostile vs consenting prompt line flips Ray from refusing a test
to agreeing to it. **Still to wire (needs the running engine / Convex state, deferred with GPU):**
persisting `TrustState` in Convex, feeding `trustPromptLine` into the live agent prompt, and mounting
`TestMenu` in the game UI. See "Wiring plan" below.

## Why this mechanic exists (research framing)

The dissertation's authenticity claim is that social/behavioural realism — not visual fidelity — is
what existing AI sim tools miss (see `03_Research_Design/tool_landscape.md`). The consent-gate
operationalises that: a clinician **cannot** run tests on Ray until they have *earned* his consent
through communication. Clinical reasoning and communication skill become inseparable, which is the
thing we ask expert interviewees to judge (SQ2 authenticity, SQ4 trust/design principles).

Design lineage: AgentClinic measurement pattern (tests return results only when dispatched),
Hamstra functional/psychological fidelity, persona cards (`docs/persona_cards.md`).

## State machine

```
             de-escalation lever (+15)        de-escalation / plain explanation
   ┌──────────────┐  ───────────────▶  ┌──────────┐  ───────────────▶  ┌──────────────┐
   │   HOSTILE    │                    │   WARY   │                    │  CONSENTING  │
   │ trust 0–34   │  ◀───────────────  │  35–64   │  ◀───────────────  │   65–100     │
   └──────────────┘  escalation (−20)  └──────────┘   escalation (−20) └──────────────┘
          │  push a test he hasn't agreed to (−15, refusals++)
          │  refusals ≥ 2 while HOSTILE
          ▼
   ┌──────────────────┐
   │ SELF-DISCHARGED  │  (absorbing fail state — Ray walks out; gate closed)
   └──────────────────┘
```

`stage` is derived from `trust` and drives the **patient agent's tone** (hostile → curt/defensive,
wary → guarded but cooperating, consenting → openly cooperative). The **gate** itself keys off
`consentGiven`, not the top stage — see below.

## Event taxonomy (what the classifier must label each player utterance as)

| Event | Trust Δ | Also | Example player line |
|---|---|---|---|
| `deescalation_lever` | +15 | `deescalations++` | "Ray, I can see this is frightening — take your time." |
| `plain_explanation` | +10 | `plainExplanations++` | "The heart tracing tells me if your heart's short of blood — that's why it matters *to you*." |
| `escalation_trigger` | −20 | — | "You need to calm down and let me do my job." |
| `neutral` | 0 | — | "How long have you had the pain?" |

Classification is a separate concern (keyword rules for the demo; an LLM classifier later). The
reducer is agnostic to *how* the label was produced.

## The gate (what a test-menu action calls)

`consentGiven(state)` ⇔ `stage !== 'hostile'` **AND** `deescalations ≥ 1` **AND**
`plainExplanations ≥ 1`. Trust alone is never sufficient — he must have been de-escalated *and* had
a test's purpose explained plainly, mirroring the persona-card consent rule.

| Test category | Bar to dispatch | Examples |
|---|---|---|
| `observation` | `stage !== 'hostile'` | pulse, resp rate, general look |
| `invasive` | `consentGiven(state)` | 12-lead ECG, bloods, cannula |
| `medication` | `consentGiven(state)` | analgesia, GTN |

`evaluateTestRequest(state, category)` returns `{ permitted, state, reason }`:
- **permitted** → dispatch the action (AgentClinic measurement pattern returns the result); resets
  `refusals`.
- **refused** (`consent_refused`) → patient gives an in-character refusal; trust −15, `refusals++`.
- **self-discharge** (`patient_self_discharged`) → two refused pushes while hostile ends the scenario.

## Wiring plan (where the code plugs in — not yet built)

1. **Convex:** a `world` per-player field holds `TrustState` for the patient agent. A
   `dispatchTest` mutation calls `evaluateTestRequest`, persists `decision.state`, and — if
   permitted — enqueues the measurement result via the existing agent/message path.
2. **Patient agent prompt:** inject `trust`/`stage` into Ray's identity/plan each turn so his speech
   tracks the number (the `agentPrompts` builder in `convex/agent/conversation.ts`).
3. **UI:** a test-menu panel (React, alongside the existing chat UI) greys out `invasive`/`medication`
   until `consentGiven`; a refused click shows Ray's refusal line.
4. **Debrief:** log every `TestDecision` + event as the research data trail (Langfuse), feeding the
   scoring hooks in the persona card.

## Tuning / difficulty dial

All thresholds and deltas are constants at the top of `consentGate.ts` (`START_TRUST`,
`DEESCALATION_GAIN`, `WARY_AT`, `CONSENTING_AT`, `SELF_DISCHARGE_REFUSALS`, …). The persona card's
"Difficulty dial" (hostility, bystander panic, time pressure) maps onto `START_TRUST` and the gain/
loss magnitudes.

## Not validated yet (honest scope)

- End-to-end **in-world** run with a human clinician (needs the UI panel + a running engine).
- The **classifier's** accuracy at labelling free-text utterances (keyword baseline first).
- Latency/quality of the patient agent's *spoken* refusals — waits on GPU compute (see
  `docs/kaggle_gpu_setup.md`).
