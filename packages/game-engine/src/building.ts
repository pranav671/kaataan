import type {
  BoardOccupancy,
  BoardTopology,
  EdgeId,
  PlayerId,
  PlayerPieceSupply,
  VertexId,
} from "./types.ts";

export type BuildLegalityCode =
  | "LEGAL"
  | "UNKNOWN_EDGE"
  | "UNKNOWN_VERTEX"
  | "EDGE_OCCUPIED"
  | "VERTEX_OCCUPIED"
  | "DISTANCE_RULE"
  | "NOT_CONNECTED"
  | "NOT_OWN_SETTLEMENT"
  | "NO_PIECE_AVAILABLE"
  | "SETUP_ROAD_NOT_ADJACENT";

export interface BuildLegality {
  readonly legal: boolean;
  readonly code: BuildLegalityCode;
}

const LEGAL: BuildLegality = { legal: true, code: "LEGAL" };

function illegal(code: Exclude<BuildLegalityCode, "LEGAL">): BuildLegality {
  return { legal: false, code };
}

export function createEmptyOccupancy(): BoardOccupancy {
  return {
    buildingsByVertex: new Map(),
    roadsByEdge: new Map(),
  };
}

export function checkRoadPlacement(
  topology: BoardTopology,
  occupancy: BoardOccupancy,
  playerId: PlayerId,
  edgeId: EdgeId,
  options: {
    readonly pieces?: PlayerPieceSupply;
    readonly setupSettlementVertexId?: VertexId;
  } = {},
): BuildLegality {
  const edge = topology.edges.get(edgeId);
  if (!edge) return illegal("UNKNOWN_EDGE");
  if (occupancy.roadsByEdge.has(edgeId)) return illegal("EDGE_OCCUPIED");
  if (options.pieces && options.pieces.roads <= 0) return illegal("NO_PIECE_AVAILABLE");

  if (options.setupSettlementVertexId) {
    return edge.vertexIds.includes(options.setupSettlementVertexId)
      ? LEGAL
      : illegal("SETUP_ROAD_NOT_ADJACENT");
  }

  for (const endpointId of edge.vertexIds) {
    const building = occupancy.buildingsByVertex.get(endpointId);
    if (building?.playerId === playerId) return LEGAL;
    if (building && building.playerId !== playerId) continue;

    const endpoint = topology.vertices.get(endpointId);
    const connectsToOwnRoad = endpoint?.adjacentEdgeIds.some((adjacentEdgeId) =>
      adjacentEdgeId !== edgeId
      && occupancy.roadsByEdge.get(adjacentEdgeId)?.playerId === playerId,
    );
    if (connectsToOwnRoad) return LEGAL;
  }

  return illegal("NOT_CONNECTED");
}

export function checkSettlementPlacement(
  topology: BoardTopology,
  occupancy: BoardOccupancy,
  playerId: PlayerId,
  vertexId: VertexId,
  options: {
    readonly setup?: boolean;
    readonly pieces?: PlayerPieceSupply;
  } = {},
): BuildLegality {
  const vertex = topology.vertices.get(vertexId);
  if (!vertex) return illegal("UNKNOWN_VERTEX");
  if (occupancy.buildingsByVertex.has(vertexId)) return illegal("VERTEX_OCCUPIED");
  if (options.pieces && options.pieces.settlements <= 0) {
    return illegal("NO_PIECE_AVAILABLE");
  }
  if (vertex.neighboringVertexIds.some((neighborId) => occupancy.buildingsByVertex.has(neighborId))) {
    return illegal("DISTANCE_RULE");
  }
  if (!options.setup) {
    const connected = vertex.adjacentEdgeIds.some((edgeId) =>
      occupancy.roadsByEdge.get(edgeId)?.playerId === playerId,
    );
    if (!connected) return illegal("NOT_CONNECTED");
  }
  return LEGAL;
}

export function checkCityPlacement(
  topology: BoardTopology,
  occupancy: BoardOccupancy,
  playerId: PlayerId,
  vertexId: VertexId,
  pieces?: PlayerPieceSupply,
): BuildLegality {
  if (!topology.vertices.has(vertexId)) return illegal("UNKNOWN_VERTEX");
  if (pieces && pieces.cities <= 0) return illegal("NO_PIECE_AVAILABLE");
  const building = occupancy.buildingsByVertex.get(vertexId);
  if (building?.playerId !== playerId || building.kind !== "settlement") {
    return illegal("NOT_OWN_SETTLEMENT");
  }
  return LEGAL;
}
