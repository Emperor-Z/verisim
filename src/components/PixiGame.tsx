import * as PIXI from 'pixi.js';
import { useApp } from '@pixi/react';
import { Player, SelectElement } from './Player.tsx';
import { useEffect, useRef, useState } from 'react';
import { PixiStaticMap } from './PixiStaticMap.tsx';
import PixiViewport from './PixiViewport.tsx';
import { Viewport } from 'pixi-viewport';
import { Id } from '../../convex/_generated/dataModel';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api.js';
import { useSendInput } from '../hooks/sendInput.ts';
import { toastOnError } from '../toasts.ts';
import { DebugPath } from './DebugPath.tsx';
import { PositionIndicator } from './PositionIndicator.tsx';
import { SHOW_DEBUG_UI } from './Game.tsx';
import { ServerGame } from '../hooks/serverGame.ts';
import { SpeechLayer } from './SpeechLayer.tsx';
import { BackWall } from './BackWall.tsx';
import { mapSpeakerToPlayer } from '../bay/speakerMapping.ts';
import type { BaySpeaker } from '../../convex/verisim/bayDirector.ts';

// The bay as drawn by scripts/gen_map.py: back wall at y3 down to the open front, left
// wall to cubicle curtain. Kept here rather than imported from the map data because it is
// a framing choice, not a property of the map.
const BAY_3_FRAME = { minX: 5, maxX: 19, minY: 3, maxY: 11 };

export const PixiGame = (props: {
  worldId: Id<'worlds'>;
  engineId: Id<'engines'>;
  game: ServerGame;
  historicalTime: number | undefined;
  width: number;
  height: number;
  setSelectedElement: SelectElement;
  /** playerId -> line currently being spoken, drawn above the character. */
  speech?: Map<string, string>;
  /** Who in the bay is composing their next line right now. */
  typingSpeaker?: BaySpeaker | null;
}) => {
  // PIXI setup.
  const pixiApp = useApp();
  const viewportRef = useRef<Viewport | undefined>();

  const humanTokenIdentifier = useQuery(api.world.userStatus, { worldId: props.worldId }) ?? null;
  const humanPlayerId = [...props.game.world.players.values()].find(
    (p) => p.human === humanTokenIdentifier,
  )?.id;

  const moveTo = useSendInput(props.engineId, 'moveTo');

  // Interaction for clicking on the world to navigate.
  const dragStart = useRef<{ screenX: number; screenY: number } | null>(null);
  const onMapPointerDown = (e: any) => {
    // https://pixijs.download/dev/docs/PIXI.FederatedPointerEvent.html
    dragStart.current = { screenX: e.screenX, screenY: e.screenY };
  };

  const [lastDestination, setLastDestination] = useState<{
    x: number;
    y: number;
    t: number;
  } | null>(null);
  const onMapPointerUp = async (e: any) => {
    if (dragStart.current) {
      const { screenX, screenY } = dragStart.current;
      dragStart.current = null;
      const [dx, dy] = [screenX - e.screenX, screenY - e.screenY];
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 10) {
        console.log(`Skipping navigation on drag event (${dist}px)`);
        return;
      }
    }
    if (!humanPlayerId) {
      return;
    }
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }
    const gameSpacePx = viewport.toWorld(e.screenX, e.screenY);
    const tileDim = props.game.worldMap.tileDim;
    const gameSpaceTiles = {
      x: gameSpacePx.x / tileDim,
      y: gameSpacePx.y / tileDim,
    };
    setLastDestination({ t: Date.now(), ...gameSpaceTiles });
    const roundedTiles = {
      x: Math.floor(gameSpaceTiles.x),
      y: Math.floor(gameSpaceTiles.y),
    };
    console.log(`Moving to ${JSON.stringify(roundedTiles)}`);
    await toastOnError(moveTo({ playerId: humanPlayerId, destination: roundedTiles }));
  };
  const { width, height, tileDim } = props.game.worldMap;
  const players = [...props.game.world.players.values()];
  const typingPlayerId = mapSpeakerToPlayer(props.game, props.typingSpeaker ?? null);
  // Ray is confined to the bed for the whole scenario, and the tile at his position is now
  // the occupied-bed art with a reclining figure baked in (scripts/gen_tileset.py) rather
  // than the plain bed — rendering his normal standing walk-cycle sprite on top of that
  // read as a patient standing up on his own mattress. Hidden here, not removed from the
  // world: he still occupies the tile and speaks — just isn't drawn twice.
  const bedriddenPlayerId = mapSpeakerToPlayer(props.game, 'Ray');

  // Fit the bay to whatever the frame happens to be. It's a single-room scenario, so the
  // camera frames the room rather than following the clinician. A fixed zoom only looks
  // right at one window size — too tight and the bed and monitor are cropped, too loose and
  // the room sits in a field of empty floor.
  useEffect(() => {
    if (!viewportRef.current || !props.width || !props.height) return;
    const { minX, maxX, minY, maxY } = BAY_3_FRAME;
    const roomW = (maxX - minX + 1) * tileDim;
    const roomH = (maxY - minY + 1) * tileDim;
    viewportRef.current.animate({
      position: new PIXI.Point(
        ((minX + maxX + 1) / 2) * tileDim,
        ((minY + maxY + 1) / 2) * tileDim,
      ),
      scale: Math.min(props.width / roomW, props.height / roomH),
      time: 600,
    });
  }, [props.width, props.height]);

  return (
    <PixiViewport
      app={pixiApp}
      screenWidth={props.width}
      screenHeight={props.height}
      worldWidth={width * tileDim}
      worldHeight={height * tileDim}
      viewportRef={viewportRef}
    >
      <PixiStaticMap
        map={props.game.worldMap}
        onpointerup={onMapPointerUp}
        onpointerdown={onMapPointerDown}
      />
      <BackWall />
      {players.map(
        (p) =>
          // Only show the path for the human player in non-debug mode.
          (SHOW_DEBUG_UI || p.id === humanPlayerId) && (
            <DebugPath key={`path-${p.id}`} player={p} tileDim={tileDim} />
          ),
      )}
      {lastDestination && <PositionIndicator destination={lastDestination} tileDim={tileDim} />}
      {players
        .filter((p) => p.id !== bedriddenPlayerId)
        .map((p) => (
          <Player
            key={`player-${p.id}`}
            game={props.game}
            player={p}
            isViewer={p.id === humanPlayerId}
            onClick={props.setSelectedElement}
            historicalTime={props.historicalTime}
            typing={p.id === typingPlayerId}
          />
        ))}
      {/* Drawn last so bubbles sit above every sprite, not just the ones before them. */}
      <SpeechLayer
        game={props.game}
        speech={props.speech ?? new Map()}
        historicalTime={props.historicalTime}
      />
    </PixiViewport>
  );
};
export default PixiGame;
