import { internalMutation } from '../_generated/server';
import { BAY_MARKS, CLINICIAN_MARK } from './marks';

/**
 * Demo-only: stand the cast where the scripted consultation assumes they are.
 *
 * The engine tick can stall (ARCHITECTURE_AND_VALIDATION.md §4.4), so agents may be left
 * anywhere on the map from a previous run — including Ray, who should be in the bed. This
 * writes positions straight to the world doc, the same bypass testing.ts:forceJoinHuman
 * already uses, so staging a demo take does not depend on the engine running.
 *
 * The engine now holds agents on these marks itself (aiTown/agent.ts); this is for when the
 * engine isn't running at all.
 */
export const placeDemoCast = internalMutation({
  args: {},
  handler: async (ctx) => {
    const worldStatus = await ctx.db
      .query('worldStatus')
      .filter((q) => q.eq(q.field('isDefault'), true))
      .unique();
    if (!worldStatus) throw new Error('No default world found');
    const world = await ctx.db.get(worldStatus.worldId);
    if (!world) throw new Error('No world doc');

    const descriptions = await ctx.db
      .query('playerDescriptions')
      .withIndex('worldId', (q) => q.eq('worldId', worldStatus.worldId))
      .collect();
    const nameById = new Map(descriptions.map((d) => [d.playerId as string, d.name]));

    const placed: Record<string, string> = {};
    const players = world.players.map((p: any) => {
      const name = nameById.get(p.id) ?? '';
      const mark = BAY_MARKS[name] ?? (p.human ? CLINICIAN_MARK : undefined);
      if (!mark) return p;
      placed[name || 'clinician'] = `${mark.x},${mark.y}`;
      return {
        ...p,
        position: { x: mark.x, y: mark.y },
        facing: { dx: mark.dx, dy: mark.dy },
        speed: 0,
        pathfinding: undefined,
      };
    });

    await ctx.db.patch(world._id, { players });
    return { placed };
  },
});
