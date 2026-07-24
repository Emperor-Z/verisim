# VeriSim Build Notes & Findings

## Status (16 July 2026)
Full stack runs end-to-end locally: self-hosted Convex backend (Docker), engine ticking,
three clinical personas (Ray/Kelly/Sam) loaded and verified in the world, pixel frontend at
`localhost:5173/ai-town`. Personas converse (conversations spawn), but **message text is not
yet rendering cleanly** — see Finding 3.

## How to run
```
cd /home/z/verisim
docker compose up -d backend        # self-hosted Convex (host networking via override)
npx convex dev --once               # push functions
npx convex run init                 # seed world (once)
npx vite                            # frontend on :5173
```
Ollama must be running on the host (127.0.0.1:11434).

## Findings (model selection on RAM-constrained CPU box)

**Finding 1 — Reasoning models leak chain-of-thought into persona speech.**
`qwen3:4b` and `deepseek-r1:7b` output internal monologue ("(We're in the waiting area, I'm
Ray, I hate being patronised...)") instead of dialogue, even with `think:false`. Unusable for
roleplay. → Use non-reasoning models.

**Finding 2 — 7b model times out inside Convex actions.**
`qwen2.5-coder:7b` produces excellent in-character dialogue ("I'm not having a heart attack!
Just indigestion. Leave me alone.") but takes 6–24s/generation on CPU (machine RAM-starved,
~250Mi free → no GPU headroom). Convex actions hit `UserTimeout` and discard the completed
result. `qwen2.5-coder:3b` runs in ~3s and avoids timeouts, at some cost to character nuance.

**Finding 3 — AI Town's completion-style prompt format breaks instruction-tuned models.**
AI Town prompts end with `"<Speaker> to <Other>:"` and uses the speaker names as stop words —
a design for base/completion models. Instruction-tuned chat models (incl. the qwen coders)
*echo the scaffolding*: given `"Ray to Sam:"` they generate `"Sam to Ray: ..."`, which the
stop word `"Ray:"` truncates to garbage (`"Sam to "`). This is why message text renders empty.

### Fix options for Finding 3 (decision pending)
1. **Rewrite prompt to chat-native** in `convex/agent/conversation.ts`: move persona to a
   `system` message, add an explicit `user` turn, drop the `"X to Y:"` suffix and name stop
   words. Cleanest; ~30 lines across 3 completion fns. Recommended.
2. **Better local model + more RAM**: an instruct model (qwen3.5:4b / llama3.1-8b-instruct)
   handles the format better but needs headroom this box lacks right now.
3. **Post-process**: strip any leading `"X to Y:"` prefix and stop on newline instead of names.
   Quick patch, less robust.

### Finding 3 — RESOLVED (21 July 2026): option 1 implemented (+ option 3 as a safety net)
Rewrote all three completion paths in `convex/agent/conversation.ts` to be chat-native:
- Dropped the trailing `"<Speaker> to <Other>:"` scaffold; added an explicit instruction
  (`replyInstruction`): *"Reply with ONLY what <Speaker> says next, first person, no name prefix…"*.
- `previousMessages` now role-tags history — the speaker's own past lines as `assistant`, the other
  party's as `user` — instead of one `user` blob with `"Author to Recipient:"` prefixes.
- Replaced the name-based `stopWords` (the direct cause of the empty output) with `turnStops`, which
  only stop on a **newline-prefixed** new label (`\n<Name>:`), so a label can never match at offset 0.
- Kept a defensive `stripSpeakerPrefix` (option 3) for any residual leading label.

**Verification (local CPU, no GPU):** `npx convex dev --once` pushes clean (no type errors).
A direct `/v1/chat/completions` call mirroring the new message shape, on the current model
`qwen2.5-coder:3b` (~3s, no timeout), returned a non-empty in-character line:
`"I just need a glass of water and I'll be fine."` — vs the old format's empty `"Sam to "`.
**The empty-text bug is fixed at the logic level.** GPU (see `kaggle_gpu_setup.md`) now only buys
dialogue *quality* and lower latency, and an in-world capture with the engine running is still to do.

**Note (pre-existing, harmless):** `convex/util/llm.ts` has a duplicate-case warning —
`TOGETHER_EMBEDDING_DIMENSION` and `OLLAMA_EMBEDDING_DIMENSION` are both 768, so the OLLAMA case is
dead code. Functionally irrelevant because `detectMismatchedLLMProvider` early-returns when OLLAMA_*
env is set. Left as-is.

## Consent-gate logic (21 July 2026)
Trust-state mechanic implemented as pure, framework-free logic in `convex/verisim/consentGate.ts`
with `consentGate.test.ts` (11 assertions passing via `npx tsx`). State machine + wiring plan in
`docs/consent_gate.md`.

## Consent-gate — classifier, session, tone hook, UI panel (21 July 2026, later)
Completed the mechanic at the logic level:
- `convex/verisim/eventClassifier.ts` (+ test, 18 cases) — keyword baseline mapping free-text player
  utterances to `deescalation_lever | escalation_trigger | plain_explanation | neutral`. Precedence:
  escalation > explanation > de-escalation > neutral (hard to earn trust, easy to lose). To be
  swapped for an LLM classifier later behind the same interface.
- `convex/verisim/session.ts` (+ test, 9 assertions) — `handlePlayerUtterance` (classify→update),
  `replayTranscript`, and `trustPromptLine(state)` which is injected into the patient agent prompt so
  the model's *tone* tracks the trust number.
- `src/components/TestMenu.tsx` — prop-driven React/Tailwind panel; greys out invasive/medication
  until `consentGiven`, shows a trust meter + refusal line. Typechecks under the frontend `tsc`.

**Tone-hook validation (local CPU, qwen2.5-coder:3b):** same clinician line ("…do a heart tracing,
is that alright?"), hostile trust line → Ray refuses ("No, thank you… I'm fine now anyway");
consenting trust line → Ray agrees ("Yes… please take a heart tracing"). The behavioural switch is
correct; the 3B model occasionally mis-addresses itself ("…good Ray") — a small-model artifact that
GPU + a stronger instruct model fixes.

**Still to wire (needs running engine / Convex state; deferred with GPU):** persist `TrustState` in
Convex, feed `trustPromptLine` into the live `agentPrompts` path, mount `TestMenu` in the game UI.

## GPU validation — Kaggle T4/P100, llama3.1:8b-instruct-q4_K_M (24 July 2026)

Kaggle account phone-verified, unlocking GPU + internet. Notebook pushed via the `kaggle` CLI
(`verisim/docs/kaggle_gpu_setup.md` cells, as a batch kernel rather than clicking through the
Kaggle web UI — much faster to iterate). One fix needed: Kaggle's base image is missing `zstd`,
which the Ollama install script requires for extraction — added `apt-get install -y zstd` before
the `curl | sh` install. Model pulled (`llama3.1:8b-instruct-q4_K_M`, 4.9 GB) and served over a
`cloudflared` quick tunnel; `convex env set OLLAMA_HOST/OLLAMA_MODEL` pointed the local Convex
backend at it.

**Direct API verification (chat-native prompt shape, same as `conversation.ts` now sends):**
- Hostile system prompt + a "just lie back, it's routine" line → Ray refuses in character: *"I
  don't want some stranger poking around on my chest with sticky straps that are gonna leave
  bruises... What's the point of all this anyway?"*
- Same clinician question preceded by a de-escalation line → Ray agrees: *"Yeah, fine, do whatever
  you need to do, but hurry up and tell me what's wrong with my heart, I'm not getting any younger
  sitting here."*

Both outputs are clean — no name-prefix artifact, no mis-addressing (the 3B CPU model's "…good
Ray" quirk from the tone-hook validation above does not appear on the 8B GPU model). This confirms
Finding 2 (timeout) and the small-model quality artifact are both resolved by GPU + a stronger
instruct model, as predicted; the dialogue-format fix (Finding 3) was already correct at the logic
level independent of hardware.

**Caveat for the write-up:** the Kaggle tunnel is ephemeral (URL changes every notebook restart,
session capped ~12h/30h-per-week). Fine for demo/recording sessions, not for an always-on
deployment — a reproducibility/limitations point, not a design flaw.

## Config touched (vs upstream AI Town)
- `data/characters.ts` — 3 clinical personas
- `convex/util/llm.ts` — Ollama defaults (qwen2.5-coder:3b, nomic-embed-text 768-dim),
  skip provider auto-detection when OLLAMA_* env set
- `docker-compose.override.yml` — backend on host network (reach host Ollama)
- `.npmrc` — location=project
- Env: `OLLAMA_HOST`, `OLLAMA_MODEL`, `OLLAMA_EMBEDDING_MODEL`
