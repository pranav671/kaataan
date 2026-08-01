export type HexId = `h:${number}:${number}`;
export type VertexId = `v:${number}:${number}`;
export type EdgeId = `e:${string}|${string}`;
export type PlayerId = string;

export type ResourceType = "brick" | "lumber" | "wool" | "grain" | "ore";
export type ProductiveTerrain =
  | "forest"
  | "hills"
  | "pasture"
  | "fields"
  | "mountains";
export type TerrainType = ProductiveTerrain | "desert";
export type NumberTokenValue = 2 | 3 | 4 | 5 | 6 | 8 | 9 | 10 | 11 | 12;
export type NumberTokenLabel =
  | "A" | "B" | "C" | "D" | "E" | "F" | "G"
  | "H" | "I" | "J" | "K" | "L" | "M" | "N"
  | "O" | "P" | "Q" | "R" | "S" | "T" | "U"
  | "V" | "W" | "X" | "Y" | "ZA" | "ZB" | "ZC";

export const RESOURCE_TYPES: readonly ResourceType[] = [
  "brick",
  "lumber",
  "wool",
  "grain",
  "ore",
] as const;

export const TERRAIN_TO_RESOURCE: Readonly<Record<ProductiveTerrain, ResourceType>> = {
  forest: "lumber",
  hills: "brick",
  pasture: "wool",
  fields: "grain",
  mountains: "ore",
};

export interface AxialCoordinate {
  readonly q: number;
  readonly r: number;
}

export interface RenderPosition {
  readonly x: number;
  readonly y: number;
}

export interface HexTopology {
  readonly id: HexId;
  readonly coordinate: AxialCoordinate;
  readonly position: RenderPosition;
  readonly vertexIds: readonly [VertexId, VertexId, VertexId, VertexId, VertexId, VertexId];
  readonly edgeIds: readonly [EdgeId, EdgeId, EdgeId, EdgeId, EdgeId, EdgeId];
  readonly neighboringHexIds: readonly HexId[];
}

export interface VertexTopology {
  readonly id: VertexId;
  readonly lattice: { readonly x: number; readonly y: number };
  readonly position: RenderPosition;
  readonly adjacentHexIds: readonly HexId[];
  readonly adjacentEdgeIds: readonly EdgeId[];
  readonly neighboringVertexIds: readonly VertexId[];
}

export interface EdgeTopology {
  readonly id: EdgeId;
  readonly vertexIds: readonly [VertexId, VertexId];
  readonly adjacentHexIds: readonly HexId[];
}

export interface BoardTopology {
  readonly hexes: ReadonlyMap<HexId, HexTopology>;
  readonly vertices: ReadonlyMap<VertexId, VertexTopology>;
  readonly edges: ReadonlyMap<EdgeId, EdgeTopology>;
  readonly hexIds: readonly HexId[];
  readonly vertexIds: readonly VertexId[];
  readonly edgeIds: readonly EdgeId[];
}

export interface NumberToken {
  readonly label: NumberTokenLabel;
  readonly value: NumberTokenValue;
}

export interface HexTile {
  readonly id: HexId;
  readonly terrain: TerrainType;
  readonly token: NumberToken | null;
}

export interface BoardLayout {
  readonly topology: BoardTopology;
  readonly tiles: ReadonlyMap<HexId, HexTile>;
  readonly robberHexId: HexId;
  readonly seed: string;
}

export type BuildingKind = "settlement" | "city";

export interface Building {
  readonly playerId: PlayerId;
  readonly kind: BuildingKind;
}

export interface Road {
  readonly playerId: PlayerId;
}

export interface BoardOccupancy {
  readonly buildingsByVertex: ReadonlyMap<VertexId, Building>;
  readonly roadsByEdge: ReadonlyMap<EdgeId, Road>;
}

export type ResourceBundle = Readonly<Record<ResourceType, number>>;

export type PortKind = "generic" | ResourceType;

export interface PortPlacement {
  readonly id: string;
  readonly edgeId: EdgeId;
  readonly vertexIds: readonly [VertexId, VertexId];
  readonly kind: PortKind;
}

export interface PlayerPieceSupply {
  readonly roads: number;
  readonly settlements: number;
  readonly cities: number;
}
