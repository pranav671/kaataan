import { RESOURCE_TYPES } from "./types.ts";
import { DEVELOPMENT_CARD_COUNTS } from "./development.ts";
import type { GameState } from "./gameState.ts";
import type { DevelopmentCardType } from "./development.ts";
import type { PlayerId, ResourceType } from "./types.ts";
import {
  longestRoadLengths,
  playerScore,
  resolveLargestArmyHolder,
  resolveLongestRoadHolder,
} from "./scoring.ts";

export function assertGameStateInvariants(state: GameState): void {
  if (state.playerOrder.length < 5 || state.playerOrder.length > 6) {
    throw new Error("Player order must contain 5 or 6 players");
  }
  if (new Set(state.playerOrder).size !== state.playerOrder.length) {
    throw new Error("Player order contains duplicate players");
  }
  if (state.players.size !== state.playerOrder.length) {
    throw new Error("Player map and player order have different sizes");
  }
  state.playerOrder.forEach((playerId, seat) => {
    const player = state.players.get(playerId);
    if (!player || player.seat !== seat) throw new Error(`Invalid player seat for ${playerId}`);
  });
  if (!state.layout.tiles.has(state.layout.robberHexId)) {
    throw new Error("Robber is not on a board hex");
  }

  if (state.phase.kind === "discarding") {
    const phase = state.phase;
    const requiredIds = Object.keys(phase.requiredByPlayer);
    for (const playerId of requiredIds) {
      const required = phase.requiredByPlayer[playerId];
      if (!state.players.has(playerId)
        || required === undefined
        || !Number.isSafeInteger(required)
        || required <= 0) {
        throw new Error(`Invalid discard requirement for ${playerId}`);
      }
    }
    if (new Set(phase.submittedPlayerIds).size !== phase.submittedPlayerIds.length) {
      throw new Error("Discard phase contains duplicate submissions");
    }
    if (phase.submittedPlayerIds.some((playerId) =>
      phase.requiredByPlayer[playerId] === undefined)) {
      throw new Error("Discard submitted by a player without a requirement");
    }
  }
  if (state.phase.kind === "robber-move" || state.phase.kind === "robber-steal") {
    if (!state.players.has(state.phase.activePlayerId)) {
      throw new Error("Robber phase references an unknown active player");
    }
  }
  if (state.phase.kind === "robber-steal") {
    const phase = state.phase;
    if (new Set(phase.eligibleTargetIds).size !== phase.eligibleTargetIds.length) {
      throw new Error("Robber phase contains duplicate steal targets");
    }
    if (phase.eligibleTargetIds.some((playerId) =>
      playerId === phase.activePlayerId || !state.players.has(playerId))) {
      throw new Error("Robber phase contains an invalid steal target");
    }
  }
  if (state.phase.kind === "road-building"
    || state.phase.kind === "year-of-plenty"
    || state.phase.kind === "monopoly") {
    if (!state.players.has(state.phase.activePlayerId)) {
      throw new Error("Development-card phase references an unknown active player");
    }
  }

  const developmentCards = [
    ...state.developmentDeck,
    ...[...state.players.values()].flatMap((player) => player.developmentCards),
    ...state.resolvedDevelopmentCards,
  ];
  if (developmentCards.length !== 34) {
    throw new Error(`Development card conservation failed: ${developmentCards.length}`);
  }
  if (new Set(developmentCards.map((card) => card.id)).size !== 34) {
    throw new Error("Development card IDs are not unique across deck, hands, and resolved cards");
  }
  for (const [type, expected] of Object.entries(DEVELOPMENT_CARD_COUNTS) as
    [DevelopmentCardType, number][]) {
    const actual = developmentCards.filter((card) => card.type === type).length;
    if (actual !== expected) {
      throw new Error(`Development card count failed for ${type}: ${actual}`);
    }
  }
  for (const resolved of state.resolvedDevelopmentCards) {
    if (!state.players.has(resolved.playerId)) {
      throw new Error("Resolved development card has an invalid owner or type");
    }
  }

  const lengths = longestRoadLengths(state);
  const expectedLongestRoadHolder = resolveLongestRoadHolder(
    state.playerOrder,
    lengths,
    state.longestRoadHolderId,
  );
  if (expectedLongestRoadHolder !== state.longestRoadHolderId) {
    throw new Error("Longest Road holder is inconsistent with current roads");
  }
  const knightStillResolving = (state.phase.kind === "robber-move"
    || state.phase.kind === "robber-steal") && state.phase.cause === "knight";
  if (!knightStillResolving) {
    const expectedLargestArmyHolder = resolveLargestArmyHolder(state, state.largestArmyHolderId);
    if (expectedLargestArmyHolder !== state.largestArmyHolderId) {
      throw new Error("Largest Army holder is inconsistent with played Knights");
    }
  }
  if (state.phase.kind === "game-over") {
    if (!state.players.has(state.phase.winnerId)
      || playerScore(state, state.phase.winnerId).publicScore < 10) {
      throw new Error("Game-over phase has an invalid winner");
    }
  }
  for (const player of state.players.values()) {
    const playedKnights = state.resolvedDevelopmentCards.filter((card) =>
      card.playerId === player.id && card.type === "knight").length;
    if (player.playedKnights !== playedKnights) {
      throw new Error(`Played Knight count failed for ${player.id}`);
    }
  }

  const onBoardRoads = new Map<PlayerId, number>();
  const settlements = new Map<PlayerId, number>();
  const cities = new Map<PlayerId, number>();
  for (const road of state.occupancy.roadsByEdge.values()) {
    if (!state.players.has(road.playerId)) throw new Error("Road belongs to an unknown player");
    onBoardRoads.set(road.playerId, (onBoardRoads.get(road.playerId) ?? 0) + 1);
  }
  for (const building of state.occupancy.buildingsByVertex.values()) {
    if (!state.players.has(building.playerId)) {
      throw new Error("Building belongs to an unknown player");
    }
    const target = building.kind === "city" ? cities : settlements;
    target.set(building.playerId, (target.get(building.playerId) ?? 0) + 1);
  }
  for (const player of state.players.values()) {
    if (player.pieces.roads + (onBoardRoads.get(player.id) ?? 0) !== 15) {
      throw new Error(`Road supply invariant failed for ${player.id}`);
    }
    if (player.pieces.settlements + (settlements.get(player.id) ?? 0) !== 5) {
      throw new Error(`Settlement supply invariant failed for ${player.id}`);
    }
    if (player.pieces.cities + (cities.get(player.id) ?? 0) !== 4) {
      throw new Error(`City supply invariant failed for ${player.id}`);
    }
  }

  for (const resource of RESOURCE_TYPES) {
    const total = state.bank[resource]
      + [...state.players.values()].reduce((sum, player) => sum + player.hand[resource], 0);
    if (total !== 24) {
      throw new Error(`Resource conservation invariant failed for ${resource}: ${total}`);
    }
  }
  assertNonNegativeResources(state.bank, "bank");
  for (const player of state.players.values()) {
    assertNonNegativeResources(player.hand, `player ${player.id}`);
  }
}

function assertNonNegativeResources(
  bundle: Readonly<Record<ResourceType, number>>,
  owner: string,
): void {
  for (const resource of RESOURCE_TYPES) {
    if (!Number.isSafeInteger(bundle[resource]) || bundle[resource] < 0) {
      throw new Error(`Invalid ${resource} count for ${owner}`);
    }
  }
}
