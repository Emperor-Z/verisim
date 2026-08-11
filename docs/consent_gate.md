# VeriSim Consent-Gate — Design Spec & State Machine

**Status (9 Aug 2026):** the mechanic is now wired end-to-end at the code level, all four wiring-plan
steps closed:
- Trust reducer + gate — `convex/verisim/consentGate.ts` (+ `consentGate.test.ts`, 11 assertions).
- Free-text event classifier (keyword baseline) — `convex/verisim/eventClassifier.ts`
  (+ `eventClassifier.test.ts`, 18 cases).
- Session orchestrator + patient-tone prompt hook — `convex/verisim/session.ts`
  (+ `session.test.ts`, 9 assertions; a good clinician earns consent, a clumsy one triggers
  self-discharge).
- **Convex persistence** — `convex/verisim/schema.ts` (`verisimTrustStates` table, one row per
  worldId+playerId, kept deliberately outside the AI Town engine's own tick-owned `worlds`
  document) and `convex/verisim/trustStates.ts` (`getTrustState` query, `dispatchTest` and
  `recordUtterance` mutations, wrapping the pure logic above).
- **Patient agent prompt injection** — `convex/agent/conversation.ts`'s three prompt-builders
  (`startConversationMessage`, `continueConversationMessage`, `leaveConversationMessage`) now push
  `trustPromptLine` for the designated patient (`VERISIM_PATIENT_NAME = 'Ray'`) via
  `verisimTrustPromptLines`.
- **Test-menu UI panel** — `src/components/TestMenu.tsx` (unchanged, was already prop-driven) is
  now mounted in `src/components/PlayerDetails.tsx` when the selected/in-conversation player is
  Ray, wired to `getTrustState`/`dispatchTest`. `src/components/MessageInput.tsx` calls
  `recordUtterance` after a message is sent to Ray, so player chat drives the trust state.
- **Test-result messages** — a permitted `dispatchTest` now posts the in-character reading
  (`convex/verisim/testResults.ts`, keyed by `TestMenuItem.id`, e.g. the ECG/bloods/obs text) into
  the conversation as a message authored by Ray, using the same `messages` insert + plain
  `finishSendingMessage` input transition human messages use (not the agent-lock
  `agentFinishSendingMessage` path, since this mutation has no `agent.inProgressOperation` to
  match). Canned per-test text lives server-side so the client only ever sends a test id, never the
  result content.
- **Debrief event log** — `convex/verisim/schema.ts`'s new `verisimSessionEvents` table
  (append-only, one row per classified utterance or test dispatch, `worldId`+`playerId` indexed)
  and `getSessionEvents` query in `trustStates.ts` give the full research-data trail: event kind,
  label, trust before/after, and (for test dispatches) whether it was permitted. Not yet exported
  to an external sink (Langfuse) — the rows exist and are queryable, but nothing pushes them out
  yet.

All pure logic still passes `npx tsx` (`consentGate.test.ts`, `session.test.ts`, unchanged, still
green). The whole project typechecks clean (`npx tsc --noEmit`) with the new Convex modules
included.

**Update (11 Aug 2026):** the local Docker Compose stack (see README's "Using Docker Compose with
self-hosted Convex") was run for the first time this project has had it available, and `npx convex
deploy` was run against it for real — this confirmed the hand-patched `convex/_generated/api.d.ts`
entries were correct (and caught one mistake: `verisim/schema` had been hand-added but shouldn't
have been, since it exports no functions — real codegen dropped it, which is correct). The file no
longer needs hand-patching as a rule; it's regenerated automatically by `npx convex deploy` /
`npx convex dev` whenever a live backend is available.

**Still not validated:** an actual in-browser click-through of the test menu, confirming a refused
push shows Ray's refusal line, a permitted push posts the result message into the chat, and the
trust-state prompt line measurably changes the local model's patient-agent dialogue. Ollama wasn't
brought up alongside the Convex backend this session, so the agents/LLM side of the loop is still
unexercised — only the map/schema/data layer was validated. Headless browser automation (synthetic
mouse events) proved too unreliable to navigate the in-game camera precisely enough to click a
specific character, so this genuinely needs a human clicking through it in a real browser.

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

## Wiring plan (all 4 steps code-complete 9 Aug 2026, not yet runtime-validated)

1. **Convex — done.** `TrustState` lives in its own `verisimTrustStates` table (not a `world`
   per-player field — kept outside the AI Town engine's tick-owned document, see
   `convex/verisim/schema.ts`), keyed by `worldId` + `playerId`. `dispatchTest`
   (`convex/verisim/trustStates.ts`) calls `evaluateTestRequest`, persists `decision.state`, and on
   a permitted dispatch inserts the canned result reading (`convex/verisim/testResults.ts`) as a
   message from Ray via the same `messages` table + `finishSendingMessage` input human messages use.
2. **Patient agent prompt — done.** `trustPromptLine` is injected via `verisimTrustPromptLines`
   into all three `agentPrompts` call sites in `convex/agent/conversation.ts`, gated to
   `player.name === 'Ray'`.
3. **UI — done.** `TestMenu` is mounted in `PlayerDetails.tsx` when Ray is the in-conversation
   player; `MessageInput.tsx` classifies the human's utterance and calls `recordUtterance` after
   each message sent to Ray, driving the trust state from real chat input.
4. **Debrief — done, not yet exported.** Every classified utterance and test dispatch is now
   appended to `verisimSessionEvents` (label, detail, trust before/after, permitted flag), readable
   via `getSessionEvents`. Still open: actually pushing this trail to an external sink (Langfuse) —
   the data exists and is queryable but nothing exports it yet.

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
