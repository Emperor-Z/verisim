import type { Speaker } from './bayScript';
import type { ServerGame } from '../hooks/serverGame';

/**
 * Resolve script speakers to live player ids, so scripted lines can be drawn above the
 * right character on the map.
 *
 * 'You' is the human clinician, who has no fixed name — matched by the `human` field
 * instead. If nobody has joined yet the clinician's lines simply have nowhere to appear on
 * the map; they still show in the transcript.
 */
export function mapSpeakersToPlayers(
  game: ServerGame,
  speaking: Map<Speaker, string>,
): Map<string, string> {
  const out = new Map<string, string>();
  if (speaking.size === 0) return out;

  for (const player of game.world.players.values()) {
    const name = game.playerDescriptions.get(player.id)?.name;
    for (const [speaker, text] of speaking) {
      const isMatch = speaker === 'You' ? !!player.human : name === speaker;
      if (isMatch) out.set(player.id, text);
    }
  }
  return out;
}
