import { SpeechBubble } from './SpeechBubble.tsx';
import { usePlayerPosition } from '../hooks/usePlayerPosition.ts';
import { Player as ServerPlayer } from '../../convex/aiTown/player.ts';
import { ServerGame } from '../hooks/serverGame.ts';

// Clear of the character's head. Sprites are foot-anchored and 40px tall (see
// Character.tsx / scripts/gen_characters.py) — the head top sits ~34px above the feet, so
// the bubble needs to clear that plus room for its own tail.
const BUBBLE_OFFSET_Y = 42;

function PlayerSpeech({
  game,
  player,
  text,
  historicalTime,
}: {
  game: ServerGame;
  player: ServerPlayer;
  text: string;
  historicalTime?: number;
}) {
  const pos = usePlayerPosition(game, player, historicalTime);
  if (!pos) return null;
  return <SpeechBubble x={pos.px} y={pos.py - BUBBLE_OFFSET_Y} text={text} />;
}

/**
 * Draws every current speech bubble in one pass, on top of all the sprites.
 *
 * Kept out of Player.tsx deliberately: bubbles drawn per-player get occluded by whichever
 * character happens to be rendered after them, which in a four-person bay is most of them.
 */
export function SpeechLayer({
  game,
  speech,
  historicalTime,
}: {
  game: ServerGame;
  /** playerId -> what they are saying right now. */
  speech: Map<string, string>;
  historicalTime?: number;
}) {
  if (speech.size === 0) return null;
  return (
    <>
      {[...game.world.players.values()].map((p) => {
        const text = speech.get(p.id);
        return text ? (
          <PlayerSpeech
            key={`speech-${p.id}`}
            game={game}
            player={p}
            text={text}
            historicalTime={historicalTime}
          />
        ) : null;
      })}
    </>
  );
}
