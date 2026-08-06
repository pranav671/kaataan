import {
  RULESET_VERSION,
  createResourceBundle,
  type BoardTopology,
  type DevelopmentCardDefinition,
  type EdgeId,
  type EdgeTopology,
  type GameState,
  type HexId,
  type HexTopology,
  type NumberToken,
  type OwnedDevelopmentCard,
  type PlayerState,
  type ResolvedDevelopmentCard,
  type TerrainType,
  type VertexId,
  type VertexTopology,
} from "@kaataan/game-engine";
import type { GameSnapshot } from "@kaataan/protocol";

function asHexId(value: string): HexId { return value as HexId; }
function asVertexId(value: string): VertexId { return value as VertexId; }
function asEdgeId(value: string): EdgeId { return value as EdgeId; }

export function hydrateGameSnapshot(snapshot: GameSnapshot): GameState {
  const edgeViews = new Map(snapshot.topology.edges.map((edge) => [edge.id, edge]));
  const hexes = new Map<HexId, HexTopology>();
  for (const hex of snapshot.topology.hexes) {
    const id = asHexId(hex.id);
    const [, q, r] = hex.id.split(":");
    const neighbors = new Set<HexId>();
    for (const edgeId of hex.edgeIds) {
      for (const adjacentId of edgeViews.get(edgeId)?.adjacentHexIds ?? []) {
        if (adjacentId !== hex.id) neighbors.add(asHexId(adjacentId));
      }
    }
    hexes.set(id, {
      id,
      coordinate: { q: Number(q), r: Number(r) },
      position: hex.position,
      vertexIds: hex.vertexIds.map(asVertexId) as [VertexId, VertexId, VertexId, VertexId, VertexId, VertexId],
      edgeIds: hex.edgeIds.map(asEdgeId) as [EdgeId, EdgeId, EdgeId, EdgeId, EdgeId, EdgeId],
      neighboringHexIds: [...neighbors],
    });
  }
  const vertices = new Map<VertexId, VertexTopology>(snapshot.topology.vertices.map((vertex) => {
    const id = asVertexId(vertex.id);
    return [id, {
      id,
      lattice: {
        x: Math.round(vertex.position.x * 2 / Math.sqrt(3)),
        y: Math.round(vertex.position.y * 2),
      },
      position: vertex.position,
      adjacentHexIds: vertex.adjacentHexIds.map(asHexId),
      adjacentEdgeIds: vertex.adjacentEdgeIds.map(asEdgeId),
      neighboringVertexIds: vertex.neighboringVertexIds.map(asVertexId),
    }];
  }));
  const edges = new Map<EdgeId, EdgeTopology>(snapshot.topology.edges.map((edge) => {
    const id = asEdgeId(edge.id);
    return [id, {
      id,
      vertexIds: edge.vertexIds.map(asVertexId) as [VertexId, VertexId],
      adjacentHexIds: edge.adjacentHexIds.map(asHexId),
    }];
  }));
  const topology: BoardTopology = {
    hexes,
    vertices,
    edges,
    hexIds: snapshot.topology.hexes.map((hex) => asHexId(hex.id)),
    vertexIds: snapshot.topology.vertices.map((vertex) => asVertexId(vertex.id)),
    edgeIds: snapshot.topology.edges.map((edge) => asEdgeId(edge.id)),
  };
  const players = new Map<string, PlayerState>();
  const resolvedDevelopmentCards: ResolvedDevelopmentCard[] = [];
  let syntheticCardId = 9000;
  for (const player of snapshot.players) {
    const developmentCards = (player.developmentCards ?? []).map((card): OwnedDevelopmentCard => ({
      id: card.id as `dev:${number}`,
      type: card.type,
      purchasedPlayerTurn: card.purchasedPlayerTurn,
    }));
    let buildingPoints = 0;
    for (const building of snapshot.buildings) {
      if (building.playerId === player.id) buildingPoints += building.kind === "city" ? 2 : 1;
    }
    const awardPoints = (snapshot.longestRoadHolderId === player.id ? 2 : 0)
      + (snapshot.largestArmyHolderId === player.id ? 2 : 0);
    const revealedPoints = Math.max(0, player.publicScore - buildingPoints - awardPoints);
    if (player.developmentCards === null && player.victoryPointCardCount != null) {
      const hiddenPoints = Math.max(0, player.victoryPointCardCount - revealedPoints);
      for (let index = 0; index < hiddenPoints; index += 1) {
        developmentCards.push({
          id: `dev:${syntheticCardId++}`,
          type: "victory-point",
          purchasedPlayerTurn: player.playerTurnSequence,
        });
      }
    }
    players.set(player.id, {
      id: player.id,
      name: player.name,
      seat: player.seat,
      hand: player.hand ?? createResourceBundle({ brick: player.resourceCardCount }),
      pieces: player.pieces,
      playerTurnSequence: player.playerTurnSequence,
      developmentCards,
      playedKnights: player.playedKnights,
      developmentCardPlayedThisTurn: player.developmentCardPlayedThisTurn,
    });
    for (let index = 0; index < revealedPoints; index += 1) {
      resolvedDevelopmentCards.push({
        id: `dev:${syntheticCardId++}`,
        type: "victory-point",
        playerId: player.id,
        playedPlayerTurn: player.playerTurnSequence,
      });
    }
    for (let index = revealedPoints; index < (player.playedDevelopmentCardCount ?? revealedPoints); index += 1) {
      resolvedDevelopmentCards.push({
        id: `dev:${syntheticCardId++}`,
        type: "knight",
        playerId: player.id,
        playedPlayerTurn: player.playerTurnSequence,
      });
    }
  }
  const developmentDeck: DevelopmentCardDefinition[] = Array.from(
    { length: snapshot.developmentDeckCount },
    (_, index) => ({ id: `dev:${8000 + index}`, type: "knight" }),
  );
  const tiles = new Map<HexId, { readonly id: HexId; readonly terrain: TerrainType; readonly token: NumberToken | null }>(
    snapshot.topology.hexes.map((hex) => {
      const id = asHexId(hex.id);
      return [id, { id, terrain: hex.terrain, token: hex.token }];
    }),
  );
  return {
    id: snapshot.id,
    rulesetVersion: RULESET_VERSION,
    version: snapshot.version,
    eventSequence: snapshot.eventSequence,
    layout: { topology, tiles, robberHexId: asHexId(snapshot.robberHexId), seed: "server-private" },
    ports: snapshot.ports.map((port) => ({
      id: port.id,
      edgeId: asEdgeId(port.edgeId),
      vertexIds: port.vertexIds.map(asVertexId) as [VertexId, VertexId],
      kind: port.kind,
    })),
    occupancy: {
      buildingsByVertex: new Map(snapshot.buildings.map((building) => [asVertexId(building.vertexId), { playerId: building.playerId, kind: building.kind }])),
      roadsByEdge: new Map(snapshot.roads.map((road) => [asEdgeId(road.edgeId), { playerId: road.playerId }])),
    },
    bank: snapshot.bank,
    players,
    playerOrder: snapshot.playerOrder,
    startingPlayerSeat: snapshot.startingPlayerSeat,
    player1Seat: snapshot.player1Seat,
    pairedTurn: snapshot.pairedTurn,
    phase: snapshot.phase,
    lastDiceRoll: snapshot.lastDiceRoll,
    developmentDeck,
    resolvedDevelopmentCards,
    longestRoadHolderId: snapshot.longestRoadHolderId,
    largestArmyHolderId: snapshot.largestArmyHolderId,
  };
}
