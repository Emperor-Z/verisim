import { v } from 'convex/values';
import { defineTable } from 'convex/server';
import { playerId } from '../aiTown/ids';

/**
 * VeriSim consent-gate persistence — deliberately a standalone table, not a field on the AI Town
 * engine's `worlds` document. The engine treats that document as its own tick-owned state (see
 * `convex/aiTown/schema.ts`); keeping TrustState here avoids coupling this research mechanic to
 * the engine's input/tick lifecycle. One row per (worldId, playerId) — created on first read.
 */
export const verisimTables = {
  verisimTrustStates: defineTable({
    worldId: v.id('worlds'),
    playerId,
    trust: v.number(),
    stage: v.union(v.literal('hostile'), v.literal('wary'), v.literal('consenting')),
    deescalations: v.number(),
    plainExplanations: v.number(),
    refusals: v.number(),
    selfDischarged: v.boolean(),
  }).index('worldId', ['worldId', 'playerId']),

  /**
   * Debrief data trail (wiring-plan step 4, docs/consent_gate.md): one row per classified utterance
   * or test dispatch, so a session can be replayed/scored after the fact. Append-only — never
   * patched, unlike verisimTrustStates.
   */
  verisimSessionEvents: defineTable({
    worldId: v.id('worlds'),
    playerId,
    kind: v.union(v.literal('utterance'), v.literal('testDispatch')),
    // utterance: the classified event; testDispatch: the requested category.
    label: v.string(),
    detail: v.string(), // raw utterance text, or the test id/label
    trustBefore: v.number(),
    trustAfter: v.number(),
    permitted: v.optional(v.boolean()), // testDispatch only
  }).index('worldId', ['worldId', 'playerId']),

  /**
   * The Bay 3 transcript (bay.ts): everything said in the room, by everyone, in order. One
   * conversation per world rather than AI Town's per-pair `messages`, because the scenario is
   * four people in one bay and the engine can only stage two at a time.
   */
  verisimBayLines: defineTable({
    worldId: v.id('worlds'),
    speaker: v.union(
      v.literal('Ray'),
      v.literal('Kelly'),
      v.literal('Sam'),
      v.literal('You'),
      v.literal('System'),
    ),
    text: v.string(),
  }).index('worldId', ['worldId']),

  /**
   * One row per world: who is composing a line right now, and the clinician turn the room is
   * answering. A reply generated for an older turn is dropped rather than posted late.
   */
  verisimBayStatus: defineTable({
    worldId: v.id('worlds'),
    turn: v.number(),
    typing: v.optional(v.union(v.literal('Ray'), v.literal('Kelly'), v.literal('Sam'))),
  }).index('worldId', ['worldId']),
};
