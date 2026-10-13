/**
 * Where everyone stands in Bay 3. Coordinates follow the layout in scripts/gen_map.py: the bed
 * occupies x8, y5-6 and is in a background layer, so standing on it is legal and puts Ray in it.
 *
 * Read by the engine (aiTown/agent.ts holds each agent here, aiTown/player.ts drops the clinician
 * here on join) and by demoStage.ts, which writes them straight to the world doc.
 */
export interface Mark {
  x: number;
  y: number;
  dx: number;
  dy: number;
}

export const BAY_MARKS: Record<string, Mark> = {
  Ray: { x: 8, y: 5, dx: 0, dy: 1 }, // propped up in the bed, facing out
  Kelly: { x: 10, y: 7, dx: 0, dy: -1 }, // just off the bedside chair, facing her father
  Sam: { x: 9, y: 9, dx: 0, dy: -1 }, // at the foot of the bed
};

export const CLINICIAN_MARK: Mark = { x: 7, y: 8, dx: 0, dy: -1 };
