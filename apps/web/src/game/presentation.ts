import {
  BUILD_COSTS,
  RESOURCE_TYPES,
  activePlayerId,
  checkCityPlacement,
  checkRoadPlacement,
  checkSettlementPlacement,
  containsResources,
  playerIdAtSeat,
  playerScore,
  playerTwoId,
  totalResources,
  type EdgeId,
  type GameEvent,
  type GameState,
  type HexId,
  type PlayerId,
  type ResourceBundle,
  type ResourceType,
  type VertexId,
} from "@kaataan/game-engine";

export const PLAYER_COLORS = ["#156f62", "#d85c41", "#d9a52b", "#526cc7", "#8a57a3", "#8a5a35"] as const;

export type BoardAction = "inspect" | "road" | "settlement" | "city" | "robber";
export type BoardTargetId = HexId | VertexId | EdgeId;

export interface LegalTargets {
  readonly action: BoardAction;
  readonly ids: ReadonlySet<BoardTargetId>;
  readonly instruction: string;
}

export function phaseLabel(state: GameState): string {
  const { phase } = state;
  if (phase.kind === "setup") {
    return `${phase.round === "forward" ? "First" : "Second"} placement · ${phase.step}`;
  }
  if (phase.kind === "player1-pre-roll") return "Roll to begin";
  if (phase.kind === "player1-actions") return "Player 1 actions";
  if (phase.kind === "player2-actions") return "Player 2 actions";
  if (phase.kind === "discarding") return "Discard half your hand";
  if (phase.kind === "robber-move") return "Move the robber";
  if (phase.kind === "robber-steal") return "Choose a player to steal from";
  if (phase.kind === "road-building") return `Place ${phase.remainingRoads} free road${phase.remainingRoads === 1 ? "" : "s"}`;
  if (phase.kind === "year-of-plenty") return "Choose resources";
  if (phase.kind === "monopoly") return "Choose a resource";
  return "Game complete";
}

export function actionPlayerId(state: GameState): PlayerId | null {
  if (state.phase.kind === "discarding") {
    const phase = state.phase;
    return Object.keys(phase.requiredByPlayer).find((id) =>
      !phase.submittedPlayerIds.includes(id)) ?? null;
  }
  return activePlayerId(state);
}

export function playerColor(state: GameState, playerId: PlayerId): string {
  const seat = state.players.get(playerId)?.seat ?? 0;
  return PLAYER_COLORS[seat % PLAYER_COLORS.length] ?? PLAYER_COLORS[0];
}

function legalRoads(state: GameState, actorId: PlayerId, setupVertexId?: VertexId): Set<EdgeId> {
  const actor = state.players.get(actorId);
  if (!actor) return new Set();
  return new Set(state.layout.topology.edgeIds.filter((edgeId) =>
    checkRoadPlacement(state.layout.topology, state.occupancy, actorId, edgeId, {
      pieces: actor.pieces,
      ...(setupVertexId ? { setupSettlementVertexId: setupVertexId } : {}),
    }).legal));
}

export function legalTargetsFor(
  state: GameState,
  actorId: PlayerId,
  requestedAction: BoardAction,
): LegalTargets {
  const actor = state.players.get(actorId);
  if (!actor) return { action: "inspect", ids: new Set(), instruction: "Waiting for a player" };

  if (state.phase.kind === "setup") {
    if (state.phase.step === "settlement") {
      return {
        action: "settlement",
        ids: new Set(state.layout.topology.vertexIds.filter((vertexId) =>
          checkSettlementPlacement(state.layout.topology, state.occupancy, actorId, vertexId, {
            setup: true,
            pieces: actor.pieces,
          }).legal)),
        instruction: "Choose a glowing corner for your settlement",
      };
    }
    return {
      action: "road",
      ids: legalRoads(state, actorId, state.phase.pendingSettlementVertexId),
      instruction: "Choose a road connected to your new settlement",
    };
  }

  if (state.phase.kind === "robber-move") {
    return {
      action: "robber",
      ids: new Set(state.layout.topology.hexIds.filter((id) => id !== state.layout.robberHexId)),
      instruction: "Choose a different tile for the robber",
    };
  }

  if (state.phase.kind === "road-building") {
    return {
      action: "road",
      ids: legalRoads(state, actorId),
      instruction: `Place ${state.phase.remainingRoads} free road${state.phase.remainingRoads === 1 ? "" : "s"}`,
    };
  }

  const actionsPhase = state.phase.kind === "player1-actions" || state.phase.kind === "player2-actions";
  if (!actionsPhase) return { action: "inspect", ids: new Set(), instruction: phaseLabel(state) };

  if (requestedAction === "road" && containsResources(actor.hand, BUILD_COSTS.road)) {
    return { action: "road", ids: legalRoads(state, actorId), instruction: "Choose a glowing edge" };
  }
  if (requestedAction === "settlement" && containsResources(actor.hand, BUILD_COSTS.settlement)) {
    return {
      action: "settlement",
      ids: new Set(state.layout.topology.vertexIds.filter((vertexId) =>
        checkSettlementPlacement(state.layout.topology, state.occupancy, actorId, vertexId, {
          pieces: actor.pieces,
        }).legal)),
      instruction: "Choose a glowing corner",
    };
  }
  if (requestedAction === "city" && containsResources(actor.hand, BUILD_COSTS.city)) {
    return {
      action: "city",
      ids: new Set(state.layout.topology.vertexIds.filter((vertexId) =>
        checkCityPlacement(state.layout.topology, state.occupancy, actorId, vertexId, actor.pieces).legal)),
      instruction: "Choose one of your settlements to upgrade",
    };
  }
  return { action: "inspect", ids: new Set(), instruction: "Explore the island or choose an action" };
}

export function canAfford(state: GameState, playerId: PlayerId, item: keyof typeof BUILD_COSTS): boolean {
  const player = state.players.get(playerId);
  return Boolean(player && containsResources(player.hand, BUILD_COSTS[item]));
}

export function resourceTotal(bundle: ResourceBundle): number {
  return totalResources(bundle);
}

export const RESOURCE_META: Readonly<Record<ResourceType, { label: string; short: string; color: string }>> = {
  brick: { label: "Brick", short: "BR", color: "#bb5b45" },
  lumber: { label: "Lumber", short: "LU", color: "#34745c" },
  wool: { label: "Wool", short: "WO", color: "#8eae62" },
  grain: { label: "Grain", short: "GR", color: "#d7a63e" },
  ore: { label: "Ore", short: "OR", color: "#6d7781" },
};

export function buildCostEntries(item: keyof typeof BUILD_COSTS): readonly [ResourceType, number][] {
  return RESOURCE_TYPES.flatMap((resource) => {
    const count = BUILD_COSTS[item][resource];
    return count > 0 ? [[resource, count] as const] : [];
  });
}

export function eventMessage(event: GameEvent, state: GameState): string | null {
  const name = (id: PlayerId) => state.players.get(id)?.name ?? "A player";
  switch (event.type) {
    case "INITIAL_SETTLEMENT_PLACED": return `${name(event.playerId)} founded a settlement`;
    case "INITIAL_ROAD_PLACED": return `${name(event.playerId)} placed a road`;
    case "ROAD_BUILT": return `${name(event.playerId)} built a road`;
    case "SETTLEMENT_BUILT": return `${name(event.playerId)} built a settlement`;
    case "CITY_BUILT": return `${name(event.playerId)} grew a city`;
    case "DICE_ROLLED": return `${name(event.playerId)} rolled ${event.total}`;
    case "DEVELOPMENT_CARD_PURCHASED": return `${name(event.playerId)} bought a development card`;
    case "DEVELOPMENT_CARD_PLAYED": return `${name(event.playerId)} played ${event.card.type.replaceAll("-", " ")}`;
    case "ROBBER_MOVED": return `${name(event.playerId)} moved the robber`;
    case "RESOURCE_STOLEN": return `${name(event.playerId)} stole from ${name(event.targetPlayerId)}`;
    case "MARITIME_TRADE_COMPLETED": return `${name(event.playerId)} traded with the bank`;
    case "DOMESTIC_TRADE_COMPLETED": return `${name(event.playerId)} traded with ${name(event.partnerId)}`;
    case "LONGEST_ROAD_HOLDER_CHANGED": return event.holderId ? `${name(event.holderId)} claimed Longest Road` : "Longest Road is unclaimed";
    case "LARGEST_ARMY_HOLDER_CHANGED": return event.holderId ? `${name(event.holderId)} claimed Largest Army` : "Largest Army is unclaimed";
    case "GAME_WON": return `${name(event.winnerId)} won with ${event.publicScore} points`;
    default: return null;
  }
}

export function pairedRole(state: GameState, playerId: PlayerId): string | null {
  if (playerId === playerIdAtSeat(state, state.player1Seat)) return "Player 1";
  if (playerId === playerTwoId(state)) return "Player 2";
  return null;
}

export function displayedScore(state: GameState, playerId: PlayerId, viewerId?: PlayerId): number {
  const score = playerScore(state, playerId);
  return playerId === viewerId || state.phase.kind === "game-over"
    ? score.authoritativeScore
    : score.publicScore;
}
