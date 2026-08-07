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
};
