import type { GameState } from "./gameState.ts";
import type { BoardOccupancy, BoardTopology, EdgeId, PlayerId, VertexId } from "./types.ts";

export interface PlayerScore {
  readonly buildings: number;
  readonly longestRoad: number;
  readonly largestArmy: number;
  readonly revealedVictoryPoints: number;
  readonly hiddenVictoryPoints: number;
  readonly publicScore: number;
  readonly authoritativeScore: number;
}

export function longestRoadLength(
  topology: BoardTopology,
  occupancy: BoardOccupancy,
  playerId: PlayerId,
): number {
  const ownedEdges = new Set(
    [...occupancy.roadsByEdge.entries()]
      .filter(([, road]) => road.playerId === playerId)
      .map(([edgeId]) => edgeId),
  );
  if (ownedEdges.size === 0) return 0;

  const incident = new Map<VertexId, EdgeId[]>();
  for (const edgeId of ownedEdges) {
    const edge = topology.edges.get(edgeId);
    if (!edge) continue;
    for (const vertexId of edge.vertexIds) {
      const edges = incident.get(vertexId) ?? [];
      edges.push(edgeId);
      incident.set(vertexId, edges);
    }
  }

  function search(vertexId: VertexId, used: ReadonlySet<EdgeId>): number {
    const building = occupancy.buildingsByVertex.get(vertexId);
    if (used.size > 0 && building && building.playerId !== playerId) return used.size;
    let best = used.size;
    for (const edgeId of incident.get(vertexId) ?? []) {
      if (used.has(edgeId)) continue;
      const edge = topology.edges.get(edgeId);
      if (!edge) continue;
      const nextVertexId = edge.vertexIds[0] === vertexId
        ? edge.vertexIds[1]
        : edge.vertexIds[0];
      const nextUsed = new Set(used);
      nextUsed.add(edgeId);
      best = Math.max(best, search(nextVertexId, nextUsed));
    }
    return best;
  }

  let best = 0;
  for (const vertexId of incident.keys()) {
    best = Math.max(best, search(vertexId, new Set()));
  }
  return best;
}

export function longestRoadLengths(state: GameState): ReadonlyMap<PlayerId, number> {
  return new Map(state.playerOrder.map((playerId) => [
    playerId,
    longestRoadLength(state.layout.topology, state.occupancy, playerId),
  ]));
}

export function resolveLongestRoadHolder(
  playerOrder: readonly PlayerId[],
  lengths: ReadonlyMap<PlayerId, number>,
  currentHolderId: PlayerId | null,
): PlayerId | null {
  const maximum = Math.max(0, ...playerOrder.map((playerId) => lengths.get(playerId) ?? 0));
  if (maximum < 5) return null;
  const leaders = playerOrder.filter((playerId) => (lengths.get(playerId) ?? 0) === maximum);
  if (currentHolderId && leaders.includes(currentHolderId)) return currentHolderId;
  return leaders.length === 1 ? leaders[0] ?? null : null;
}

export function resolveLargestArmyHolder(
  state: GameState,
  currentHolderId: PlayerId | null,
): PlayerId | null {
  const maximum = Math.max(0, ...state.playerOrder.map((playerId) =>
    state.players.get(playerId)?.playedKnights ?? 0));
  if (maximum < 3) return null;
  const leaders = state.playerOrder.filter((playerId) =>
    state.players.get(playerId)?.playedKnights === maximum);
  if (currentHolderId && leaders.includes(currentHolderId)) return currentHolderId;
  return leaders.length === 1 ? leaders[0] ?? null : currentHolderId;
}

export function playerScore(state: GameState, playerId: PlayerId): PlayerScore {
  let buildings = 0;
  for (const building of state.occupancy.buildingsByVertex.values()) {
    if (building.playerId === playerId) buildings += building.kind === "city" ? 2 : 1;
  }
  const longestRoad = state.longestRoadHolderId === playerId ? 2 : 0;
  const largestArmy = state.largestArmyHolderId === playerId ? 2 : 0;
  const revealedVictoryPoints = state.resolvedDevelopmentCards.filter((card) =>
    card.playerId === playerId && card.type === "victory-point").length;
  const hiddenVictoryPoints = state.players.get(playerId)?.developmentCards.filter((card) =>
    card.type === "victory-point").length ?? 0;
  const publicScore = buildings + longestRoad + largestArmy + revealedVictoryPoints;
  return {
    buildings,
    longestRoad,
    largestArmy,
    revealedVictoryPoints,
    hiddenVictoryPoints,
    publicScore,
    authoritativeScore: publicScore + hiddenVictoryPoints,
  };
}
