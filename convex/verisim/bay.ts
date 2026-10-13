import { v } from 'convex/values';
import {
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type DatabaseReader,
  type DatabaseWriter,
} from '../_generated/server';
import { internal } from '../_generated/api';
import { Id } from '../_generated/dataModel';
import { GameId } from '../aiTown/ids';
import { Descriptions } from '../../data/characters';
import { chatCompletion, getLLMConfig } from '../util/llm';
import { evaluateTestRequest, type TestCategory } from './consentGate';
import { handlePlayerUtterance, trustPromptLine } from './session';
import { testResultLine } from './testResults';
import { loadState, logEvent, saveState } from './trustStates';
import { cleanLine, pickResponders, type Agent, type BayLine } from './bayDirector';

/**
 * The live Bay 3 conversation: what the demo build's script fakes, done for real.
 *
 *   clinician says something ─▶ classify + update Ray's trust (consent gate)
 *                             └▶ director picks who answers (bayDirector.ts)
 *                                 └▶ each answers in turn, generated from their persona card
 *
 * Deliberately outside the AI Town engine's tick loop. The engine stages two-party
 * conversations only, and every input waits on a tick — the stall in
 * ARCHITECTURE_AND_VALIDATION.md §4.4 froze the whole room. Here a slow or dead model costs
 * one reply, not the engine.
 */

const PATIENT = 'Ray';
// Lines of transcript the model sees. Enough for the consultation so far without letting a
// long session push the persona card out of a small model's attention.
const CONTEXT_LINES = 24;
// Wall-clock budget for one reply, including llm.ts's own retries. Past this the bay says
// so rather than leaving a typing indicator up indefinitely.
const replyBudgetMs = () => Number(process.env.BAY_REPLY_BUDGET_MS ?? 90_000);

const speakerValidator = v.union(v.literal('Ray'), v.literal('Kelly'), v.literal('Sam'));

/** Ray's player id — the consent gate's trust state is keyed on the patient. */
async function patientPlayerId(
  db: DatabaseReader,
  worldId: Id<'worlds'>,
): Promise<GameId<'players'>> {
  const row = await db
    .query('playerDescriptions')
    .withIndex('worldId', (q) => q.eq('worldId', worldId))
    .filter((q) => q.eq(q.field('name'), PATIENT))
    .first();
  if (!row) throw new Error(`${PATIENT} is not in this world`);
  return row.playerId as GameId<'players'>;
}

async function getStatus(db: DatabaseReader, worldId: Id<'worlds'>) {
  return await db
    .query('verisimBayStatus')
    .withIndex('worldId', (q) => q.eq('worldId', worldId))
    .first();
}

/** Start a new clinician turn: anything still being generated for the last one is dropped. */
async function nextTurn(db: DatabaseWriter, worldId: Id<'worlds'>): Promise<number> {
  const status = await getStatus(db, worldId);
  const turn = (status?.turn ?? 0) + 1;
  if (status) await db.patch(status._id, { turn, typing: undefined });
  else await db.insert('verisimBayStatus', { worldId, turn });
  return turn;
}

async function recentLines(db: DatabaseReader, worldId: Id<'worlds'>, n: number) {
  const rows = await db
    .query('verisimBayLines')
    .withIndex('worldId', (q) => q.eq('worldId', worldId))
    .order('desc')
    .take(n);
  return rows.reverse();
}

/** Everything the bay panel needs: the transcript, who is typing, and Ray's trust state. */
export const transcript = query({
  args: { worldId: v.id('worlds') },
  handler: async (ctx, { worldId }) => {
    const lines = await ctx.db
      .query('verisimBayLines')
      .withIndex('worldId', (q) => q.eq('worldId', worldId))
      .collect();
    const status = await getStatus(ctx.db, worldId);
    const patientId = await patientPlayerId(ctx.db, worldId).catch(() => undefined);
    const trust = patientId ? await loadState(ctx.db, worldId, patientId) : undefined;
    return {
      lines: lines.map((l) => ({
        id: l._id,
        at: l._creationTime,
        speaker: l.speaker,
        text: l.text,
      })),
      typing: status?.typing ?? null,
      trust: trust ?? null,
    };
  },
});

/** The clinician speaks to the room. */
export const say = mutation({
  args: { worldId: v.id('worlds'), text: v.string() },
  handler: async (ctx, { worldId, text }) => {
    const utterance = text.trim().slice(0, 500);
    if (!utterance) return;
    const patientId = await patientPlayerId(ctx.db, worldId);
    const before = await loadState(ctx.db, worldId, patientId);

    await ctx.db.insert('verisimBayLines', { worldId, speaker: 'You', text: utterance });
    if (before.selfDischarged) return; // He's gone; nobody answers to him any more.

    const result = handlePlayerUtterance(before, utterance, PATIENT);
    await saveState(ctx.db, worldId, patientId, result.state);
    await logEvent(ctx.db, worldId, patientId, {
      kind: 'utterance',
      label: result.event,
      detail: utterance,
      trustBefore: before.trust,
      trustAfter: result.state.trust,
    });

    const clinicianTurns = (
      await ctx.db
        .query('verisimBayLines')
        .withIndex('worldId', (q) => q.eq('worldId', worldId))
        .filter((q) => q.eq(q.field('speaker'), 'You'))
        .collect()
    ).length;
    const history = (await recentLines(ctx.db, worldId, 8)).slice(0, -1) as BayLine[];
    const responders = pickResponders({
      utterance,
      event: result.event,
      stage: result.state.stage,
      clinicianTurns,
      history,
    });
    const turn = await nextTurn(ctx.db, worldId);
    await ctx.scheduler.runAfter(0, internal.verisim.bay.respond, { worldId, turn, responders });
  },
});

/**
 * The clinician asks for a test from the menu. The gate is re-evaluated here, server-side,
 * against the stored trust state — the menu's locked/unlocked display is never trusted on
 * its own. Permitted: Sam carries it out and reads the result. Refused: Ray says no, in his
 * own words.
 */
export const requestTest = mutation({
  args: {
    worldId: v.id('worlds'),
    testId: v.string(),
    testLabel: v.string(),
    category: v.union(v.literal('observation'), v.literal('invasive'), v.literal('medication')),
  },
  handler: async (ctx, args) => {
    const patientId = await patientPlayerId(ctx.db, args.worldId);
    const before = await loadState(ctx.db, args.worldId, patientId);
    const decision = evaluateTestRequest(before, args.category as TestCategory);
    await saveState(ctx.db, args.worldId, patientId, decision.state);
    await logEvent(ctx.db, args.worldId, patientId, {
      kind: 'testDispatch',
      label: args.testId,
      detail: args.testLabel,
      trustBefore: before.trust,
      trustAfter: decision.state.trust,
      permitted: decision.permitted,
    });
    if (before.selfDischarged) return decision;

    await ctx.db.insert('verisimBayLines', {
      worldId: args.worldId,
      speaker: 'You',
      text: `Sam, ${args.testLabel.replace(/\s*\(.*\)$/, '')}, please.`,
    });
    const turn = await nextTurn(ctx.db, args.worldId);
    if (decision.permitted) {
      // Results are hand-authored (testResults.ts), never generated: the model is not
      // trusted to invent clinical ground truth.
      await ctx.db.insert('verisimBayLines', {
        worldId: args.worldId,
        speaker: 'Sam',
        text: testResultLine(args.testId),
      });
    } else {
      await ctx.scheduler.runAfter(0, internal.verisim.bay.respond, {
        worldId: args.worldId,
        turn,
        responders: [PATIENT],
        refusedTest: args.testLabel,
      });
    }
    return decision;
  },
});

/** Clear the bay and Ray's trust state for a fresh consultation. */
export const restart = mutation({
  args: { worldId: v.id('worlds') },
  handler: async (ctx, { worldId }) => {
    const lines = await ctx.db
      .query('verisimBayLines')
      .withIndex('worldId', (q) => q.eq('worldId', worldId))
      .collect();
    for (const l of lines) await ctx.db.delete(l._id);
    await nextTurn(ctx.db, worldId);
    const patientId = await patientPlayerId(ctx.db, worldId);
    const trust = await ctx.db
      .query('verisimTrustStates')
      .withIndex('worldId', (q) => q.eq('worldId', worldId).eq('playerId', patientId))
      .first();
    if (trust) await ctx.db.delete(trust._id);
    // The session event log is kept: it's the research trail, and a restart is part of it.
  },
});

export const promptContext = internalQuery({
  args: { worldId: v.id('worlds'), turn: v.number() },
  handler: async (ctx, { worldId, turn }) => {
    const status = await getStatus(ctx.db, worldId);
    if (status?.turn !== turn) return null; // superseded
    const patientId = await patientPlayerId(ctx.db, worldId);
    const trust = await loadState(ctx.db, worldId, patientId);
    const lines = await recentLines(ctx.db, worldId, CONTEXT_LINES);
    return { trust, lines: lines.map((l) => ({ speaker: l.speaker, text: l.text })) };
  },
});

export const setTyping = internalMutation({
  args: { worldId: v.id('worlds'), turn: v.number(), typing: v.optional(speakerValidator) },
  handler: async (ctx, { worldId, turn, typing }) => {
    const status = await getStatus(ctx.db, worldId);
    if (!status || status.turn !== turn) return false;
    await ctx.db.patch(status._id, { typing });
    return true;
  },
});

export const postLine = internalMutation({
  args: {
    worldId: v.id('worlds'),
    turn: v.number(),
    speaker: v.union(speakerValidator, v.literal('System')),
    text: v.string(),
  },
  handler: async (ctx, { worldId, turn, speaker, text }) => {
    const status = await getStatus(ctx.db, worldId);
    if (!status || status.turn !== turn) return false; // the clinician has moved on
    await ctx.db.insert('verisimBayLines', { worldId, speaker, text });
    await ctx.db.patch(status._id, { typing: undefined });
    return true;
  },
});

const ROLE: Record<Agent, string> = {
  Ray: 'the patient, propped up in the bed',
  Kelly: "Ray's daughter, by the bed",
  Sam: 'the staff nurse looking after Bay 3',
};

// Extra direction per agent: how they come in when the director brings them in unprompted,
// and what they must never do.
const UNPROMPTED: Record<Agent, string> = {
  Ray: '',
  Kelly: 'If the question was meant for your dad, answer over him with what you know.',
  Sam:
    'If the clinician has not spoken to you, keep it to one brief, factual observation about ' +
    "Ray's condition. Never give orders, and never repeat the clinician's words. Never quote " +
    'numbers or readings (sats, BP, pulse, ECG): those only come from tests the clinician ' +
    'orders, and the results are read out separately.',
};

function systemPrompt(speaker: Agent): string {
  const persona = Descriptions.find((d) => d.name === speaker)!;
  const others = (Object.keys(ROLE) as Agent[])
    .filter((a) => a !== speaker)
    .map((a) => `${a} (${ROLE[a]})`)
    .join(', ');
  return [
    persona.identity.replace(/\s+/g, ' '),
    persona.plan,
    `You are in A&E Bay 3 with ${others}, and the clinician who is assessing Ray. ` +
      `The transcript calls the clinician "Clinician".`,
    UNPROMPTED[speaker],
    `Reply with ONLY the words ${speaker} says out loud next, in English: one to three short ` +
      `sentences. No name label, no quotation marks, no actions or stage directions, no ` +
      `narration. Stay in character. Never speak as the clinician or anyone else, and never ` +
      `repeat something already said.`,
  ]
    .filter(Boolean)
    .join('\n\n');
}

// The state that should colour this line goes last, next to the question, where a small
// model actually attends to it — in the system prompt alone it was ignored.
function userPrompt(
  speaker: Agent,
  lines: { speaker: string; text: string }[],
  trustLine: string,
  refusedTest?: string,
): string {
  const spoken = lines.filter((l) => l.speaker !== 'System');
  const transcript = spoken.length
    ? spoken.map((l) => `${l.speaker === 'You' ? 'Clinician' : l.speaker}: ${l.text}`).join('\n')
    : '(Nobody has spoken yet.)';
  const now = [speaker === 'Ray' ? trustLine : `How Ray is right now: ${trustLine}`];
  if (refusedTest) {
    now.push(
      `The clinician has just asked the nurse to do "${refusedTest}" to Ray` +
        (speaker === 'Ray'
          ? '. You have NOT agreed to it. Refuse it, in your own words.'
          : ', without his agreement.'),
    );
  }
  return `${transcript}\n\n${now.join(' ')}\n\nWhat does ${speaker} say next?`;
}

const normalise = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
// Qwen models occasionally drift into Chinese mid-sentence on a long English prompt.
const NON_LATIN = /[\u0400-\u04ff\u0590-\u06ff\u3000-\u9fff\uac00-\ud7af]/;

async function complete(system: string, user: string, temperature: number): Promise<string> {
  const reply = chatCompletion({
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    max_tokens: 120,
    temperature,
    stream: false,
    // Reasoning models (qwen3, qwen3.5) otherwise spend the whole token budget thinking and
    // return no content. Ollama-only: OpenAI rejects it for non-reasoning models.
    ...(getLLMConfig().provider === 'ollama' ? { reasoning_effort: 'none' } : {}),
  } as Parameters<typeof chatCompletion>[0] & { stream: false });
  const budget = replyBudgetMs();
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`no reply within ${budget}ms`)), budget),
  );
  return (await Promise.race([reply, timeout])).content;
}

/**
 * One line for `speaker`. A reply that repeats something already said, or slips out of
 * English, gets one retry at a higher temperature; small local models do both often enough
 * to stall a scene.
 */
async function generateLine(
  speaker: Agent,
  lines: { speaker: string; text: string }[],
  trustLine: string,
  refusedTest?: string,
): Promise<string> {
  const system = systemPrompt(speaker);
  const user = userPrompt(speaker, lines, trustLine, refusedTest);
  const said = new Set(lines.map((l) => normalise(l.text)));
  let line = '';
  for (const temperature of [0.8, 1.1]) {
    line = cleanLine(await complete(system, user, temperature), speaker);
    if (line && !said.has(normalise(line)) && !NON_LATIN.test(line)) return line;
  }
  line = line.replace(new RegExp(NON_LATIN.source, 'g'), '').trim();
  if (!line) throw new Error('empty reply from the model');
  return line;
}

/** Generate each responder's line in turn, so each one hears what the last one said. */
export const respond = internalAction({
  args: {
    worldId: v.id('worlds'),
    turn: v.number(),
    responders: v.array(speakerValidator),
    refusedTest: v.optional(v.string()),
  },
  handler: async (ctx, { worldId, turn, responders, refusedTest }) => {
    for (const speaker of responders) {
      if (
        !(await ctx.runMutation(internal.verisim.bay.setTyping, { worldId, turn, typing: speaker }))
      ) {
        return;
      }
      const context = await ctx.runQuery(internal.verisim.bay.promptContext, { worldId, turn });
      if (!context) return;
      let text: string;
      try {
        const trustLine = trustPromptLine(context.trust, PATIENT);
        text = await generateLine(speaker, context.lines, trustLine, refusedTest);
      } catch (e: any) {
        console.error(`Bay reply from ${speaker} failed`, e);
        await ctx.runMutation(internal.verisim.bay.postLine, {
          worldId,
          turn,
          speaker: 'System',
          text: `${speaker} didn't answer (${String(e?.message ?? e)}).`,
        });
        return;
      }
      if (
        !(await ctx.runMutation(internal.verisim.bay.postLine, { worldId, turn, speaker, text }))
      ) {
        return;
      }
    }
    await ctx.runMutation(internal.verisim.bay.setTyping, { worldId, turn, typing: undefined });
  },
});
