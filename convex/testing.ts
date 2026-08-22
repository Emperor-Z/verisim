import { Id, TableNames } from './_generated/dataModel';
import { internal } from './_generated/api';
import {
  DatabaseReader,
  internalAction,
  internalMutation,
  mutation,
  query,
} from './_generated/server';
import { v } from 'convex/values';
import schema from './schema';
import { DELETE_BATCH_SIZE } from './constants';
import { kickEngine, startEngine, stopEngine } from './aiTown/main';
import { insertInput } from './aiTown/insertInput';
import { fetchEmbedding } from './util/llm';
import { chatCompletion } from './util/llm';
import { startConversationMessage } from './agent/conversation';
import { GameId } from './aiTown/ids';

// Clear all of the tables except for the embeddings cache.
const excludedTables: Array<TableNames> = ['embeddingsCache'];

export const wipeAllTables = internalMutation({
  handler: async (ctx) => {
    for (const tableName of Object.keys(schema.tables)) {
      if (excludedTables.includes(tableName as TableNames)) {
        continue;
      }
      await ctx.scheduler.runAfter(0, internal.testing.deletePage, { tableName, cursor: null });
    }
  },
});

export const deletePage = internalMutation({
  args: {
    tableName: v.string(),
    cursor: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    const results = await ctx.db
      .query(args.tableName as TableNames)
      .paginate({ cursor: args.cursor, numItems: DELETE_BATCH_SIZE });
    for (const row of results.page) {
      await ctx.db.delete(row._id);
    }
    if (!results.isDone) {
      await ctx.scheduler.runAfter(0, internal.testing.deletePage, {
        tableName: args.tableName,
        cursor: results.continueCursor,
      });
    }
  },
});

export const kick = internalMutation({
  handler: async (ctx) => {
    const { worldStatus } = await getDefaultWorld(ctx.db);
    await kickEngine(ctx, worldStatus.worldId);
  },
});

export const stopAllowed = query({
  handler: async () => {
    return !process.env.STOP_NOT_ALLOWED;
  },
});

export const stop = mutation({
  handler: async (ctx) => {
    if (process.env.STOP_NOT_ALLOWED) throw new Error('Stop not allowed');
    const { worldStatus, engine } = await getDefaultWorld(ctx.db);
    if (worldStatus.status === 'inactive' || worldStatus.status === 'stoppedByDeveloper') {
      if (engine.running) {
        throw new Error(`Engine ${engine._id} isn't stopped?`);
      }
      console.debug(`World ${worldStatus.worldId} is already inactive`);
      return;
    }
    console.log(`Stopping engine ${engine._id}...`);
    await ctx.db.patch(worldStatus._id, { status: 'stoppedByDeveloper' });
    await stopEngine(ctx, worldStatus.worldId);
  },
});

export const resume = mutation({
  handler: async (ctx) => {
    const { worldStatus, engine } = await getDefaultWorld(ctx.db);
    if (worldStatus.status === 'running') {
      if (!engine.running) {
        throw new Error(`Engine ${engine._id} isn't running?`);
      }
      console.debug(`World ${worldStatus.worldId} is already running`);
      return;
    }
    console.log(
      `Resuming engine ${engine._id} for world ${worldStatus.worldId} (state: ${worldStatus.status})...`,
    );
    await ctx.db.patch(worldStatus._id, { status: 'running' });
    await startEngine(ctx, worldStatus.worldId);
  },
});

export const forcePositions = internalMutation({
  args: {
    positions: v.array(v.object({ playerId: v.string(), x: v.number(), y: v.number() })),
  },
  handler: async (ctx, args) => {
    const { worldStatus } = await getDefaultWorld(ctx.db);
    const world = await ctx.db.get(worldStatus.worldId);
    if (!world) {
      throw new Error(`No world for ${worldStatus.worldId}`);
    }
    const byId = new Map(args.positions.map((p) => [p.playerId, p]));
    const players = world.players.map((p: any) => {
      const override = byId.get(p.id);
      if (!override) return p;
      return { ...p, position: { x: override.x, y: override.y }, speed: 0 };
    });
    await ctx.db.patch(world._id, { players });
  },
});

// Demo-only helper: directly stage an active conversation between two players, bypassing the
// walk-over/accept state machine (which races against the agents' own autonomous wander loop —
// see docs/consent_gate.md and ARCHITECTURE_AND_VALIDATION.md §4.2/§4.4). Used only to produce a
// scripted screenshot/video sequence for the interview pack; not part of evaluated behaviour.
export const forceConversation = internalMutation({
  args: {
    conversationId: v.string(),
    creator: v.string(),
    participantIds: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const { worldStatus } = await getDefaultWorld(ctx.db);
    const world = await ctx.db.get(worldStatus.worldId);
    if (!world) throw new Error('No world');
    const now = Date.now();
    const conversation = {
      id: args.conversationId,
      creator: args.creator,
      created: now,
      numMessages: 0,
      participants: args.participantIds.map((playerId) => ({
        playerId,
        invited: now,
        status: { kind: 'participating' as const, started: now },
      })),
    };
    // Demo world only ever needs one staged conversation at a time — replace outright rather than
    // accumulate, so a bad id from an earlier take can't linger and crash the client parser.
    await ctx.db.patch(world._id, { conversations: [conversation] });
  },
});

export const forceMessage = internalMutation({
  args: {
    worldId: v.id('worlds'),
    conversationId: v.string(),
    playerId: v.string(),
    text: v.string(),
    messageUuid: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert('messages', {
      conversationId: args.conversationId as any,
      author: args.playerId as any,
      messageUuid: args.messageUuid,
      text: args.text,
      worldId: args.worldId,
    });
    const { worldStatus } = await getDefaultWorld(ctx.db);
    const world = await ctx.db.get(worldStatus.worldId);
    if (!world) throw new Error('No world');
    const conversations = world.conversations.map((c: any) =>
      c.id === args.conversationId
        ? {
            ...c,
            numMessages: (c.numMessages ?? 0) + 1,
            lastMessage: { author: args.playerId, timestamp: Date.now() },
          }
        : c,
    );
    await ctx.db.patch(world._id, { conversations });
  },
});

// Demo-only: reset a player's persisted consent-gate TrustState back to baseline, e.g. between
// scripted demo takes. Not part of evaluated behaviour.
export const resetTrustState = internalMutation({
  args: { worldId: v.id('worlds'), playerId: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query('verisimTrustStates')
      .withIndex('worldId', (q) => q.eq('worldId', args.worldId).eq('playerId', args.playerId as any))
      .first();
    if (row) await ctx.db.delete(row._id);
    const events = await ctx.db
      .query('verisimSessionEvents')
      .withIndex('worldId', (q) => q.eq('worldId', args.worldId).eq('playerId', args.playerId as any))
      .collect();
    for (const e of events) await ctx.db.delete(e._id);
  },
});

// Demo-only: add a human player directly, bypassing the input queue/engine tick — needed because
// the engine loop was found tonight to stall indefinitely (see ARCHITECTURE_AND_VALIDATION.md),
// which blocks the normal joinWorld input from ever being processed.
export const forceJoinHuman = internalMutation({
  args: { playerId: v.string(), x: v.number(), y: v.number() },
  handler: async (ctx, args) => {
    const { worldStatus } = await getDefaultWorld(ctx.db);
    const world = await ctx.db.get(worldStatus.worldId);
    if (!world) throw new Error('No world');
    if (world.players.some((p: any) => p.id === args.playerId)) return;
    const players = [
      ...world.players,
      {
        id: args.playerId,
        human: 'Me',
        lastInput: Date.now(),
        position: { x: args.x, y: args.y },
        facing: { dx: 0, dy: 1 },
        speed: 0,
      },
    ];
    await ctx.db.patch(world._id, { players });
    const descRow = await ctx.db
      .query('playerDescriptions')
      .withIndex('worldId', (q) => q.eq('worldId', world._id).eq('playerId', args.playerId as any))
      .first();
    if (!descRow) {
      await ctx.db.insert('playerDescriptions', {
        worldId: world._id,
        playerId: args.playerId as any,
        name: 'Dr. Ashad',
        character: 'f4',
        description: 'You are the clinician assessing Ray in A&E Bay 3.',
      });
    }
  },
});

export const archive = internalMutation({
  handler: async (ctx) => {
    const { worldStatus, engine } = await getDefaultWorld(ctx.db);
    if (engine.running) {
      throw new Error(`Engine ${engine._id} is still running!`);
    }
    console.log(`Archiving world ${worldStatus.worldId}...`);
    await ctx.db.patch(worldStatus._id, { isDefault: false });
  },
});

async function getDefaultWorld(db: DatabaseReader) {
  const worldStatus = await db
    .query('worldStatus')
    .filter((q) => q.eq(q.field('isDefault'), true))
    .first();
  if (!worldStatus) {
    throw new Error('No default world found');
  }
  const engine = await db.get(worldStatus.engineId);
  if (!engine) {
    throw new Error(`Engine ${worldStatus.engineId} not found`);
  }
  return { worldStatus, engine };
}

export const debugCreatePlayers = internalMutation({
  args: {
    numPlayers: v.number(),
  },
  handler: async (ctx, args) => {
    const { worldStatus } = await getDefaultWorld(ctx.db);
    for (let i = 0; i < args.numPlayers; i++) {
      const inputId = await insertInput(ctx, worldStatus.worldId, 'join', {
        name: `Robot${i}`,
        description: `This player is a robot.`,
        character: `f${1 + (i % 8)}`,
      });
    }
  },
});

export const randomPositions = internalMutation({
  handler: async (ctx) => {
    const { worldStatus } = await getDefaultWorld(ctx.db);
    const map = await ctx.db
      .query('maps')
      .withIndex('worldId', (q) => q.eq('worldId', worldStatus.worldId))
      .unique();
    if (!map) {
      throw new Error(`No map for world ${worldStatus.worldId}`);
    }
    const world = await ctx.db.get(worldStatus.worldId);
    if (!world) {
      throw new Error(`No world for world ${worldStatus.worldId}`);
    }
    for (const player of world.players) {
      await insertInput(ctx, world._id, 'moveTo', {
        playerId: player.id,
        destination: {
          x: 1 + Math.floor(Math.random() * (map.width - 2)),
          y: 1 + Math.floor(Math.random() * (map.height - 2)),
        },
      });
    }
  },
});

export const testEmbedding = internalAction({
  args: { input: v.string() },
  handler: async (_ctx, args) => {
    return await fetchEmbedding(args.input);
  },
});

export const testCompletion = internalAction({
  args: {},
  handler: async (ctx, args) => {
    return await chatCompletion({
      messages: [
        { content: 'You are helpful', role: 'system' },
        { content: 'Where is pizza?', role: 'user' },
      ],
    });
  },
});

export const testConvo = internalAction({
  args: {},
  handler: async (ctx, args) => {
    const a: any = (await startConversationMessage(
      ctx,
      'm1707m46wmefpejw1k50rqz7856qw3ew' as Id<'worlds'>,
      'c:115' as GameId<'conversations'>,
      'p:0' as GameId<'players'>,
      'p:6' as GameId<'players'>,
    )) as any;
    return await a.readAll();
  },
});

export const removePlayer = internalMutation({
  args: { playerId: v.string() },
  handler: async (ctx, args) => {
    const { worldStatus } = await getDefaultWorld(ctx.db);
    const world = await ctx.db.get(worldStatus.worldId);
    if (!world) throw new Error('No world');
    const players = world.players.filter((p: any) => p.id !== args.playerId);
    await ctx.db.patch(world._id, { players });
  },
});

export const removePlayerDescription = internalMutation({
  args: { worldId: v.id('worlds'), playerId: v.string() },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query('playerDescriptions')
      .withIndex('worldId', (q) => q.eq('worldId', args.worldId).eq('playerId', args.playerId as any))
      .collect();
    for (const r of rows) await ctx.db.delete(r._id);
  },
});

export const clearMessagesForConversation = internalMutation({
  args: { worldId: v.id('worlds'), conversationId: v.string() },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query('messages')
      .withIndex('conversationId', (q) => q.eq('worldId', args.worldId).eq('conversationId', args.conversationId as any))
      .collect();
    for (const r of rows) await ctx.db.delete(r._id);
  },
});
