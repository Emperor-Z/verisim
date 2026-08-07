import { v } from 'convex/values';
import { ActionCtx, DatabaseReader, DatabaseWriter, mutation, query } from '../_generated/server';
import { Id } from '../_generated/dataModel';
import { api } from '../_generated/api';
import { playerId as playerIdValidator, GameId } from '../aiTown/ids';
import {
  evaluateTestRequest,
  initialTrustState,
  type TestCategory,
  type TrustState,
} from './consentGate';
import { handlePlayerUtterance, trustPromptLine } from './session';

/**
 * Convex persistence for the consent-gate mechanic (docs/consent_gate.md, "Wiring plan" steps 1-3).
 * All the actual reasoning stays in consentGate.ts / session.ts (pure, unit-tested); this file only
 * reads/writes the one row of TrustState per (worldId, playerId) and calls into that pure logic.
 */

async function loadState(
  db: DatabaseReader,
  worldId: Id<'worlds'>,
  playerId: GameId<'players'>,
): Promise<TrustState> {
  const row = await db
    .query('verisimTrustStates')
    .withIndex('worldId', (q) => q.eq('worldId', worldId).eq('playerId', playerId))
    .first();
  if (!row) return initialTrustState();
  const { trust, stage, deescalations, plainExplanations, refusals, selfDischarged } = row;
  return { trust, stage, deescalations, plainExplanations, refusals, selfDischarged };
}

async function saveState(
  db: DatabaseWriter,
  worldId: Id<'worlds'>,
  playerId: GameId<'players'>,
  state: TrustState,
): Promise<void> {
  const row = await db
    .query('verisimTrustStates')
    .withIndex('worldId', (q) => q.eq('worldId', worldId).eq('playerId', playerId))
    .first();
  if (row) {
    await db.patch(row._id, state);
  } else {
    await db.insert('verisimTrustStates', { worldId, playerId, ...state });
  }
}

/** Public query for the React TestMenu panel to subscribe to. */
export const getTrustState = query({
  args: { worldId: v.id('worlds'), playerId: playerIdValidator },
  handler: async (ctx, args) => loadState(ctx.db, args.worldId, args.playerId as GameId<'players'>),
});

/**
 * The gate a test-menu click calls. Persists the resulting state either way (a refused push still
 * costs trust) and returns the decision so the UI can show the in-character refusal reason.
 */
export const dispatchTest = mutation({
  args: {
    worldId: v.id('worlds'),
    playerId: playerIdValidator,
    category: v.union(v.literal('observation'), v.literal('invasive'), v.literal('medication')),
  },
  handler: async (ctx, args) => {
    const gamePlayerId = args.playerId as GameId<'players'>;
    const state = await loadState(ctx.db, args.worldId, gamePlayerId);
    const decision = evaluateTestRequest(state, args.category as TestCategory);
    await saveState(ctx.db, args.worldId, gamePlayerId, decision.state);
    return decision;
  },
});

/**
 * Called after a human message is sent to a patient-persona agent — classifies the utterance and
 * updates trust accordingly (docs/consent_gate.md event taxonomy). Kept separate from `writeMessage`
 * so the consent-gate mechanic stays a VeriSim-specific add-on, not a change to AI Town's core
 * message path.
 */
export const recordUtterance = mutation({
  args: {
    worldId: v.id('worlds'),
    playerId: playerIdValidator,
    patientName: v.string(),
    utterance: v.string(),
  },
  handler: async (ctx, args) => {
    const gamePlayerId = args.playerId as GameId<'players'>;
    const state = await loadState(ctx.db, args.worldId, gamePlayerId);
    const result = handlePlayerUtterance(state, args.utterance, args.patientName);
    await saveState(ctx.db, args.worldId, gamePlayerId, result.state);
    return result;
  },
});

/**
 * Wiring-plan step 2: the trust/stage prompt line for a given agent. Callers are expected to gate
 * this to the designated patient persona (e.g. `player.name === 'Ray'`) before calling — a player
 * with no TrustState row yet gets `initialTrustState()`'s defaults, which is the correct "just
 * walked in, still hostile" starting line, not a signal to skip injection. Called from
 * convex/agent/conversation.ts's three prompt-builders.
 */
export async function verisimTrustPromptLines(
  ctx: ActionCtx,
  worldId: Id<'worlds'>,
  player: { id: string; name: string },
): Promise<string[]> {
  const state = await ctx.runQuery(api.verisim.trustStates.getTrustState, {
    worldId,
    playerId: player.id,
  });
  return [trustPromptLine(state, player.name)];
}
