import { internalMutation } from '../_generated/server';
import * as map from '../../data/aeBay';

// One-off: swap the live default world's map row from the fantasy-village
// gentle.js layout to the A&E Bay 3 ward layout, without recreating the world
// (which would lose existing agent/conversation state).
export const patchDefaultWorldMap = internalMutation({
  args: {},
  handler: async (ctx) => {
    const worldStatus = await ctx.db
      .query('worldStatus')
      .filter((q) => q.eq(q.field('isDefault'), true))
      .unique();
    if (!worldStatus) throw new Error('No default world found');
    const existing = await ctx.db
      .query('maps')
      .withIndex('worldId', (q) => q.eq('worldId', worldStatus.worldId))
      .unique();
    if (!existing) throw new Error('No map row found for default world');
    await ctx.db.patch(existing._id, {
      width: map.mapwidth,
      height: map.mapheight,
      tileSetUrl: map.tilesetpath,
      tileSetDimX: map.tilesetpxw,
      tileSetDimY: map.tilesetpxh,
      tileDim: map.tiledim,
      bgTiles: map.bgtiles,
      objectTiles: map.objmap,
      animatedSprites: map.animatedsprites,
    });
    return { patched: existing._id };
  },
});
