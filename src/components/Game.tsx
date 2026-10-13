import { useRef, useState } from 'react';
import PixiGame from './PixiGame.tsx';

import { useElementSize } from 'usehooks-ts';
import { Stage } from '@pixi/react';
import { ConvexProvider, useConvex, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useWorldHeartbeat } from '../hooks/useWorldHeartbeat.ts';
import { useHistoricalTime } from '../hooks/useHistoricalTime.ts';
import { DebugTimeManager } from './DebugTimeManager.tsx';
import { GameId } from '../../convex/aiTown/ids.ts';
import { useServerGame } from '../hooks/serverGame.ts';
import { BayTranscript } from './BayTranscript.tsx';
import { TestMenu, type TestMenuItem } from './TestMenu.tsx';
import { useBayScript, DEMO_MODE } from '../demo/useBayScript.ts';
import { useLiveBay } from '../bay/useLiveBay.ts';
import { mapSpeakersToPlayers } from '../bay/speakerMapping.ts';

export const SHOW_DEBUG_UI = !!import.meta.env.VITE_SHOW_DEBUG_UI;

export default function Game() {
  const convex = useConvex();
  const [, setSelectedElement] = useState<{
    kind: 'player';
    id: GameId<'players'>;
  }>();
  const [gameWrapperRef, { width, height }] = useElementSize();

  const worldStatus = useQuery(api.world.defaultWorldStatus);
  const worldId = worldStatus?.worldId;
  const engineId = worldStatus?.engineId;

  const game = useServerGame(worldId);

  // Send a periodic heartbeat to our world to keep it alive.
  useWorldHeartbeat();

  const worldState = useQuery(api.world.worldState, worldId ? { worldId } : 'skip');
  const { historicalTime, timeManager } = useHistoricalTime(worldState?.engine);

  const scrollViewRef = useRef<HTMLDivElement>(null);

  // The bay's dialogue: live (convex/verisim/bay.ts) by default, or the scripted
  // consultation in the demo build (VITE_DEMO_MODE), for showing the scenario without a model.
  const bayScript = useBayScript(DEMO_MODE);
  const liveBay = useLiveBay(worldId, !DEMO_MODE);
  const bay = DEMO_MODE
    ? {
        lines: bayScript.revealed,
        speaking: bayScript.speaking,
        typing: bayScript.typing,
        cue: bayScript.cue,
        send: bayScript.send,
        finished: bayScript.finished,
      }
    : { ...liveBay, cue: null };
  const [lastRefusal, setLastRefusal] = useState<string | null>(null);
  const onRequestTest = async (item: TestMenuItem) =>
    setLastRefusal(await liveBay.requestTest(item));

  if (!worldId || !engineId || !game) {
    return null;
  }
  return (
    <>
      {SHOW_DEBUG_UI && <DebugTimeManager timeManager={timeManager} width={200} height={100} />}
      <div className="mx-auto w-full max-w grid grid-rows-[240px_1fr] lg:grid-rows-[1fr] lg:grid-cols-[1fr_auto] lg:grow max-w-[1400px] min-h-[480px] game-frame">
        {/* Game area */}
        <div className="relative overflow-hidden bg-brown-900" ref={gameWrapperRef}>
          <div className="absolute inset-0">
            <div className="container">
              <Stage width={width} height={height} options={{ backgroundColor: 0x7ab5ff }}>
                {/* Re-propagate context because contexts are not shared between renderers.
https://github.com/michalochman/react-pixi-fiber/issues/145#issuecomment-531549215 */}
                <ConvexProvider client={convex}>
                  <PixiGame
                    game={game}
                    worldId={worldId}
                    engineId={engineId}
                    width={width}
                    height={height}
                    historicalTime={historicalTime}
                    setSelectedElement={setSelectedElement}
                    speech={mapSpeakersToPlayers(game, bay.speaking)}
                    typingSpeaker={bay.typing}
                  />
                </ConvexProvider>
              </Stage>
            </div>
          </div>
          {/* Over the map, not in the side column: the transcript needs the full height. */}
          {!DEMO_MODE && liveBay.trust && (
            <div className="absolute top-3 right-3 opacity-90 hover:opacity-100">
              <TestMenu
                state={liveBay.trust}
                patientName="Ray"
                lastRefusal={lastRefusal}
                onRequestTest={onRequestTest}
              />
            </div>
          )}
        </div>
        {/* Right column area */}
        <div
          className="flex flex-col overflow-y-auto shrink-0 px-4 py-6 sm:px-6 lg:w-96 xl:pr-6 border-t-8 sm:border-t-0 sm:border-l-8 border-brown-900  bg-brown-800 text-brown-100"
          ref={scrollViewRef}
        >
          <BayTranscript
            lines={bay.lines}
            typing={bay.typing}
            cue={bay.cue}
            onSend={bay.send}
            finished={bay.finished}
            onRestart={DEMO_MODE ? undefined : liveBay.restart}
          />
        </div>
      </div>
    </>
  );
}
