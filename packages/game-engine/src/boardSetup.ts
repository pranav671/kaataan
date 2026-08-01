import { createSeededRandom, shuffled } from "./random.ts";
import { createExtendedBoardTopology, toHexId } from "./topology.ts";
import type {
  AxialCoordinate,
  BoardLayout,
  BoardTopology,
  HexId,
  HexTile,
  NumberToken,
  TerrainType,
} from "./types.ts";

export const EXTENDED_TERRAIN_INVENTORY: readonly TerrainType[] = [
  ...Array<TerrainType>(6).fill("forest"),
  ...Array<TerrainType>(5).fill("hills"),
  ...Array<TerrainType>(6).fill("pasture"),
  ...Array<TerrainType>(6).fill("fields"),
  ...Array<TerrainType>(5).fill("mountains"),
  ...Array<TerrainType>(2).fill("desert"),
];

export const EXTENDED_NUMBER_TOKENS: readonly NumberToken[] = [
  { label: "A", value: 2 },
  { label: "B", value: 5 },
  { label: "C", value: 4 },
  { label: "D", value: 6 },
  { label: "E", value: 3 },
  { label: "F", value: 9 },
  { label: "G", value: 8 },
  { label: "H", value: 11 },
  { label: "I", value: 11 },
  { label: "J", value: 10 },
  { label: "K", value: 6 },
  { label: "L", value: 3 },
  { label: "M", value: 8 },
  { label: "N", value: 4 },
  { label: "O", value: 8 },
  { label: "P", value: 10 },
  { label: "Q", value: 11 },
  { label: "R", value: 12 },
  { label: "S", value: 10 },
  { label: "T", value: 5 },
  { label: "U", value: 4 },
  { label: "V", value: 9 },
  { label: "W", value: 5 },
  { label: "X", value: 9 },
  { label: "Y", value: 12 },
  { label: "ZA", value: 3 },
  { label: "ZB", value: 2 },
  { label: "ZC", value: 6 },
];

const EXTENDED_SPIRAL_COORDINATES: readonly AxialCoordinate[] = [
  { q: 2, r: -3 }, { q: 1, r: -3 }, { q: 0, r: -3 },
  { q: -1, r: -2 }, { q: -2, r: -1 }, { q: -3, r: 0 },
  { q: -3, r: 1 }, { q: -3, r: 2 }, { q: -3, r: 3 },
  { q: -2, r: 3 }, { q: -1, r: 3 }, { q: 0, r: 2 },
  { q: 1, r: 1 }, { q: 2, r: 0 }, { q: 2, r: -1 },
  { q: 2, r: -2 },

  { q: 1, r: -2 }, { q: 0, r: -2 }, { q: -1, r: -1 },
  { q: -2, r: 0 }, { q: -2, r: 1 }, { q: -2, r: 2 },
  { q: -1, r: 2 }, { q: 0, r: 1 }, { q: 1, r: 0 },
  { q: 1, r: -1 },

  { q: 0, r: -1 }, { q: -1, r: 0 },
  { q: -1, r: 1 }, { q: 0, r: 0 },
];

export function extendedSpiralHexIds(): readonly HexId[] {
  return EXTENDED_SPIRAL_COORDINATES.map(toHexId);
}

export function createVariableBoardLayout(
  seed: string,
  topology: BoardTopology = createExtendedBoardTopology(),
): BoardLayout {
  if (topology.hexes.size !== 30) {
    throw new Error("Variable extended setup requires the 30-hex topology");
  }

  const random = createSeededRandom(seed);
  const shuffledTerrain = shuffled(EXTENDED_TERRAIN_INVENTORY, random);
  const terrainByHex = new Map<HexId, TerrainType>();

  const rowMajorHexIds = [...topology.hexes.values()]
    .sort((left, right) => left.coordinate.r === right.coordinate.r
      ? left.coordinate.q - right.coordinate.q
      : left.coordinate.r - right.coordinate.r)
    .map((hex) => hex.id);

  rowMajorHexIds.forEach((id, index) => {
    terrainByHex.set(id, shuffledTerrain[index] as TerrainType);
  });

  const tiles = new Map<HexId, HexTile>();
  let tokenIndex = 0;
  for (const id of extendedSpiralHexIds()) {
    if (!topology.hexes.has(id)) {
      throw new Error(`Spiral contains unknown hex ${id}`);
    }
    const terrain = terrainByHex.get(id);
    if (!terrain) {
      throw new Error(`Terrain missing for ${id}`);
    }
    const token = terrain === "desert" ? null : EXTENDED_NUMBER_TOKENS[tokenIndex];
    if (terrain !== "desert") {
      tokenIndex += 1;
    }
    if (terrain !== "desert" && !token) {
      throw new Error("Number-token supply exhausted before all productive hexes were assigned");
    }
    tiles.set(id, { id, terrain, token: token ?? null });
  }

  if (tiles.size !== 30 || tokenIndex !== EXTENDED_NUMBER_TOKENS.length) {
    throw new Error("Variable board setup did not consume exactly 30 hexes and 28 tokens");
  }

  const desertHexIds = [...tiles.values()]
    .filter((tile) => tile.terrain === "desert")
    .map((tile) => tile.id);
  const robberHexId = desertHexIds[random.integer(desertHexIds.length)];
  if (!robberHexId) {
    throw new Error("Variable board has no desert for the robber");
  }

  return { topology, tiles, robberHexId, seed };
}
