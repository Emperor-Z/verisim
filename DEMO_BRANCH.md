# demo/hardcoded-bay-ui

A presentation build of Bay 3. **Do not merge into `main`.**

## What this branch does

`main`'s dialogue comes from the live agent path, which currently produces nothing: the
local Ollama call hangs with no timeout and the engine's step counter freezes while its
status still reads "running" (ARCHITECTURE_AND_VALIDATION.md §4.4). Nobody in the bay
speaks, so there is nothing to show.

This branch replaces that one input — where the words come from — with a fixed script, so
the interface can be seen working as it is intended to. Everything else is the real thing:
the map, the sprites, the transcript panel and the speech bubbles are the same components
`main` uses.

- `src/demo/bayScript.ts` — the scripted consultation, written from `docs/persona_cards.md`
- `src/demo/useBayScript.ts` — playback, gated on `VITE_DEMO_MODE`

The script only ever advances the other three. When it reaches one of the clinician's
lines it stops, types that line into the chat box as a cue, and waits — nothing the player
says reaches the room without being sent from the composer. The cue is editable, so you
can clear it and say something else; the script picks up either way.
- `src/components/BayTranscript.tsx` — the always-visible bay transcript
- `convex/verisim/demoStage.ts` — stands the cast in their marks without needing the engine

## Running it

```
VITE_DEMO_MODE=1 npx vite
npx convex run verisim/demoStage:placeDemoCast '{}'
```

Without `VITE_DEMO_MODE` the app behaves exactly as `main` does.

## What the dialogue is

Scripted, not generated. The lines are authored from the persona cards, so the beats are
the designed ones — Ray deflecting, Kelly interrupting with the history he withholds, Sam
flagging deterioration, and the consent gate turning from refusal to consent. It is a
faithful picture of the intended behaviour, but it is not evidence that the model produces
it. Live dialogue quality is still unvalidated and is listed as such in
ARCHITECTURE_AND_VALIDATION.md §5.
