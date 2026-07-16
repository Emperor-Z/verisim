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

## Config touched (vs upstream AI Town)
- `data/characters.ts` — 3 clinical personas
- `convex/util/llm.ts` — Ollama defaults (qwen2.5-coder:3b, nomic-embed-text 768-dim),
  skip provider auto-detection when OLLAMA_* env set
- `docker-compose.override.yml` — backend on host network (reach host Ollama)
- `.npmrc` — location=project
- Env: `OLLAMA_HOST`, `OLLAMA_MODEL`, `OLLAMA_EMBEDDING_MODEL`
