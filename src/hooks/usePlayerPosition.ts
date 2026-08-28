import { Location, locationFields, playerLocation } from '../../convex/aiTown/location.ts';
import { Player as ServerPlayer } from '../../convex/aiTown/player.ts';
import { ServerGame } from './serverGame.ts';
import { useHistoricalValue } from './useHistoricalValue.ts';

/**
 * A player's interpolated position, in pixels.
 *
 * Shared by the character sprite and the speech-bubble layer, which are drawn in separate
 * passes so bubbles always sit above every sprite — they have to agree on where a walking
 * character is, or the bubble drifts off its speaker.
 */
export function usePlayerPosition(
  game: ServerGame,
  player: ServerPlayer,
  historicalTime?: number,
): { location: Location; px: number; py: number } | null {
  const locationBuffer = game.world.historicalLocations?.get(player.id);
  const location = useHistoricalValue<Location>(
    locationFields,
    historicalTime,
    playerLocation(player),
    locationBuffer,
  );
  if (!location) return null;
  const tileDim = game.worldMap.tileDim;
  return {
    location,
    px: location.x * tileDim + tileDim / 2,
    py: location.y * tileDim + tileDim / 2,
  };
}
