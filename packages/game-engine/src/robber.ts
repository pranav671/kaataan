import { totalResources } from "./resources.ts";
import { RESOURCE_TYPES } from "./types.ts";
import type { GameState } from "./gameState.ts";
import type {
  HexId,
  PlayerId,
  ResourceBundle,
  ResourceType,
} from "./types.ts";

export function requiredDiscardCount(hand: ResourceBundle): number {
  const size = totalResources(hand);
  return size > 7 ? Math.floor(size / 2) : 0;
}

export function requiredDiscardsByPlayer(
  state: GameState,
): Readonly<Record<PlayerId, number>> {
  const result = Object.create(null) as Record<PlayerId, number>;
  for (const player of state.players.values()) {
    const required = requiredDiscardCount(player.hand);
    if (required > 0) result[player.id] = required;
  }
  return result;
}

export function eligibleRobberTargets(
  state: GameState,
  hexId: HexId,
  activePlayerId: PlayerId,
): readonly PlayerId[] {
  const hex = state.layout.topology.hexes.get(hexId);
  if (!hex) return [];
  const eligible = new Set<PlayerId>();
  for (const vertexId of hex.vertexIds) {
    const building = state.occupancy.buildingsByVertex.get(vertexId);
    if (building && building.playerId !== activePlayerId && state.players.has(building.playerId)) {
      eligible.add(building.playerId);
    }
  }
  return state.playerOrder.filter((playerId) => eligible.has(playerId));
}

export function resourceAtHandIndex(
  hand: ResourceBundle,
  index: number,
): ResourceType {
  const size = totalResources(hand);
  if (!Number.isSafeInteger(index) || index < 0 || index >= size) {
    throw new RangeError(`Resource-card index ${index} is outside hand size ${size}`);
  }
  let offset = index;
  for (const resource of RESOURCE_TYPES) {
    if (offset < hand[resource]) return resource;
    offset -= hand[resource];
  }
  throw new Error("Resource hand index could not be resolved");
}
