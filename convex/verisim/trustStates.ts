import { v } from 'convex/values';
import { ActionCtx, DatabaseReader, DatabaseWriter, mutation, query } from '../_generated/server';
import { Id } from '../_generated/dataModel';
import { api } from '../_generated/api';
import { conversationId as conversationIdValidator, playerId as playerIdValidator, GameId } from '../aiTown/ids';
import { insertInput } from '../aiTown/insertInput';
import {
  evaluateTestRequest,
  initialTrustState,
  type TestCategory,
  type TrustState,
} from './consentGate';
import { handlePlayerUtterance, trustPromptLine } from './session';
import { testResultLine } from './testResults';

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

async function logEvent(
  db: DatabaseWriter,
  worldId: Id<'worlds'>,
  playerId: GameId<'players'>,
  event: {
    kind: 'utterance' | 'testDispatch';
    label: string;
    detail: string;
    trustBefore: number;
    trustAfter: number;
    permitted?: boolean;
  },
): Promise<void> {
  await db.insert('verisimSessionEvents', { worldId, playerId, ...event });
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
 * Debrief data trail (wiring-plan step 4): the full ordered event log for one player's session,
 * research data for post-session scoring/export (Langfuse or otherwise) — not yet wired to an
 * external sink, but the event rows now exist to export.
 */
export const getSessionEvents = query({
  args: { worldId: v.id('worlds'), playerId: playerIdValidator },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('verisimSessionEvents')
      .withIndex('worldId', (q) => q.eq('worldId', args.worldId).eq('playerId', args.playerId))
      .collect();
  },
});

/**
 * The gate a test-menu click calls. Persists the resulting state either way (a refused push still
 * costs trust), logs the attempt to the debrief trail, and — on a permitted dispatch — posts the
 * in-character result reading into the conversation (AgentClinic measurement pattern: the result
 * only appears once the action is actually dispatched). Returns the decision so the UI can show the
 * in-character refusal reason.
 */
export const dispatchTest = mutation({
  args: {
    worldId: v.id('worlds'),
    playerId: playerIdValidator,
    conversationId: conversationIdValidator,
    testId: v.string(),
    testLabel: v.string(),
    category: v.union(v.literal('observation'), v.literal('invasive'), v.literal('medication')),
  },
  handler: async (ctx, args) => {
    const gamePlayerId = args.playerId as GameId<'players'>;
    const state = await loadState(ctx.db, args.worldId, gamePlayerId);
    const decision = evaluateTestRequest(state, args.category as TestCategory);
    await saveState(ctx.db, args.worldId, gamePlayerId, decision.state);
    await logEvent(ctx.db, args.worldId, gamePlayerId, {
      kind: 'testDispatch',
      label: args.testId,
      detail: args.testLabel,
      trustBefore: state.trust,
      trustAfter: decision.state.trust,
      permitted: decision.permitted,
    });
    if (decision.permitted) {
      const messageUuid = crypto.randomUUID();
      await ctx.db.insert('messages', {
        worldId: args.worldId,
        conversationId: args.conversationId,
        author: args.playerId,
        messageUuid,
        text: testResultLine(args.testId),
      });
      await insertInput(ctx, args.worldId, 'finishSendingMessage', {
        conversationId: args.conversationId,
        playerId: args.playerId,
        timestamp: Date.now(),
      });
    }
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
    await logEvent(ctx.db, args.worldId, gamePlayerId, {
      kind: 'utterance',
      label: result.event,
      detail: args.utterance,
      trustBefore: state.trust,
      trustAfter: result.state.trust,
    });
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
