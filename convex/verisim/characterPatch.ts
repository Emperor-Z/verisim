import { internalMutation } from '../_generated/server';
import { Descriptions, CLINICIAN_CHARACTER } from '../../data/characters';

/**
 * One-off: repoint the live default world's player sprites from the inherited AI Town
 * villager sheet (`f1`/`f4`/`f6` on 32x32folk.png) to the A&E sheet, without recreating
 * the world — same reasoning as mapPatch.ts, which would otherwise lose agent state.
 *
 * Matched on name rather than old character id, because the human clinician's row was
 * written with Ray's own sprite id ('f4') and the two are indistinguishable by id alone.
 */
export const patchDefaultWorldCharacters = internalMutation({
  args: {},
  handler: async (ctx) => {
    const worldStatus = await ctx.db
      .query('worldStatus')
      .filter((q) => q.eq(q.field('isDefault'), true))
      .unique();
    if (!worldStatus) throw new Error('No default world found');

    const byName = new Map(Descriptions.map((d) => [d.name, d.character]));
    const rows = await ctx.db
      .query('playerDescriptions')
      .withIndex('worldId', (q) => q.eq('worldId', worldStatus.worldId))
      .collect();

    const patched: Record<string, string> = {};
    for (const row of rows) {
      // Anyone who isn't one of the three scripted agents is a human clinician.
      const character = byName.get(row.name) ?? CLINICIAN_CHARACTER;
      if (row.character !== character) {
        await ctx.db.patch(row._id, { character });
        patched[row.name] = character;
      }
    }
    return { patched, checked: rows.length };
  },
});
