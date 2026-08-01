import { createVariableBoardLayout } from "./boardSetup.ts";
import { createEmptyOccupancy } from "./building.ts";
import { createResourceBundle, emptyResourceBundle } from "./resources.ts";
import { standardBankSupply } from "./trade.ts";
import { createDevelopmentDeck } from "./development.ts";
import type {
  DevelopmentCardDefinition,
  OwnedDevelopmentCard,
  ResolvedDevelopmentCard,
} from "./development.ts";
import type {
  BoardLayout,
  BoardOccupancy,
  PlayerId,
  PlayerPieceSupply,
  PortPlacement,
  ResourceBundle,
  VertexId,
} from "./types.ts";

export const RULESET_VERSION = "catan-base-2020__5-6-paired-2022_v1";

export interface PlayerState {
  readonly id: PlayerId;
  readonly name: string;
  readonly seat: number;
  readonly hand: ResourceBundle;
  readonly pieces: PlayerPieceSupply;
  readonly playerTurnSequence: number;
  readonly developmentCards: readonly OwnedDevelopmentCard[];
  readonly playedKnights: number;
  readonly developmentCardPlayedThisTurn: boolean;
}

export interface SetupPhase {
  readonly kind: "setup";
  readonly round: "forward" | "reverse";
  readonly step: "settlement" | "road";
  readonly seat: number;
  readonly pendingSettlementVertexId?: VertexId;
}

export interface PlayerOnePreRollPhase {
  readonly kind: "player1-pre-roll";
}

export interface PlayerOneActionsPhase {
  readonly kind: "player1-actions";
}

export interface PlayerTwoActionsPhase {
  readonly kind: "player2-actions";
}

export interface DiscardingPhase {
  readonly kind: "discarding";
  readonly rollerId: PlayerId;
  readonly requiredByPlayer: Readonly<Record<PlayerId, number>>;
  readonly submittedPlayerIds: readonly PlayerId[];
}

export interface RobberMovePhase {
  readonly kind: "robber-move";
  readonly activePlayerId: PlayerId;
  readonly cause: "rolled-seven" | "knight";
  readonly returnPhase: PlayerOnePreRollPhase | PlayerOneActionsPhase | PlayerTwoActionsPhase;
}

export interface RobberStealPhase {
  readonly kind: "robber-steal";
  readonly activePlayerId: PlayerId;
  readonly eligibleTargetIds: readonly PlayerId[];
  readonly cause: "rolled-seven" | "knight";
  readonly returnPhase: PlayerOnePreRollPhase | PlayerOneActionsPhase | PlayerTwoActionsPhase;
}

export type DevelopmentReturnPhase =
  | PlayerOnePreRollPhase
  | PlayerOneActionsPhase
  | PlayerTwoActionsPhase;

export interface RoadBuildingPhase {
  readonly kind: "road-building";
  readonly activePlayerId: PlayerId;
  readonly remainingRoads: 1 | 2;
  readonly returnPhase: DevelopmentReturnPhase;
}

export interface YearOfPlentyPhase {
  readonly kind: "year-of-plenty";
  readonly activePlayerId: PlayerId;
  readonly requiredCards: 1 | 2;
  readonly returnPhase: DevelopmentReturnPhase;
}

export interface MonopolyPhase {
  readonly kind: "monopoly";
  readonly activePlayerId: PlayerId;
  readonly returnPhase: DevelopmentReturnPhase;
}

export interface GameOverPhase {
  readonly kind: "game-over";
  readonly winnerId: PlayerId;
}

export type GamePhase =
  | SetupPhase
  | PlayerOnePreRollPhase
  | PlayerOneActionsPhase
  | PlayerTwoActionsPhase
  | DiscardingPhase
  | RobberMovePhase
  | RobberStealPhase
  | RoadBuildingPhase
  | YearOfPlentyPhase
  | MonopolyPhase
  | GameOverPhase;

export interface GameState {
  readonly id: string;
  readonly rulesetVersion: typeof RULESET_VERSION;
  readonly version: number;
  readonly eventSequence: number;
  readonly layout: BoardLayout;
  readonly ports: readonly PortPlacement[];
  readonly occupancy: BoardOccupancy;
  readonly bank: ResourceBundle;
  readonly players: ReadonlyMap<PlayerId, PlayerState>;
  readonly playerOrder: readonly PlayerId[];
  readonly startingPlayerSeat: number;
  readonly player1Seat: number;
  readonly pairedTurn: number;
  readonly phase: GamePhase;
  readonly lastDiceRoll: number | null;
  readonly developmentDeck: readonly DevelopmentCardDefinition[];
  readonly resolvedDevelopmentCards: readonly ResolvedDevelopmentCard[];
  readonly longestRoadHolderId: PlayerId | null;
  readonly largestArmyHolderId: PlayerId | null;
}

export interface NewGamePlayer {
  readonly id: PlayerId;
  readonly name: string;
}

export interface CreateGameInput {
  readonly id: string;
  readonly seed: string;
  readonly players: readonly NewGamePlayer[];
  readonly startingPlayerSeat: number;
  readonly layout?: BoardLayout;
  readonly ports?: readonly PortPlacement[];
  readonly developmentDeck?: readonly DevelopmentCardDefinition[];
}

export function createGame(input: CreateGameInput): GameState {
  if (input.players.length < 5 || input.players.length > 6) {
    throw new RangeError("The extended paired-player game requires 5 or 6 players");
  }
  if (!Number.isSafeInteger(input.startingPlayerSeat)
    || input.startingPlayerSeat < 0
    || input.startingPlayerSeat >= input.players.length) {
    throw new RangeError("Starting player seat is outside the player order");
  }
  const ids = new Set(input.players.map((player) => player.id));
  if (ids.size !== input.players.length || [...ids].some((id) => id.length === 0)) {
    throw new Error("Player IDs must be non-empty and unique");
  }

  const players = new Map<PlayerId, PlayerState>();
  input.players.forEach((player, seat) => {
    players.set(player.id, {
      id: player.id,
      name: player.name,
      seat,
      hand: createResourceBundle(),
      pieces: { roads: 15, settlements: 5, cities: 4 },
      playerTurnSequence: 0,
      developmentCards: [],
      playedKnights: 0,
      developmentCardPlayedThisTurn: false,
    });
  });

  return {
    id: input.id,
    rulesetVersion: RULESET_VERSION,
    version: 0,
    eventSequence: 0,
    layout: input.layout ?? createVariableBoardLayout(input.seed),
    ports: input.ports ?? [],
    occupancy: createEmptyOccupancy(),
    bank: standardBankSupply(),
    players,
    playerOrder: input.players.map((player) => player.id),
    startingPlayerSeat: input.startingPlayerSeat,
    player1Seat: input.startingPlayerSeat,
    pairedTurn: 0,
    phase: {
      kind: "setup",
      round: "forward",
      step: "settlement",
      seat: input.startingPlayerSeat,
    },
    lastDiceRoll: null,
    developmentDeck: input.developmentDeck ?? createDevelopmentDeck(input.seed),
    resolvedDevelopmentCards: [],
    longestRoadHolderId: null,
    largestArmyHolderId: null,
  };
}

export function playerIdAtSeat(state: GameState, seat: number): PlayerId {
  const normalizedSeat = ((seat % state.playerOrder.length) + state.playerOrder.length)
    % state.playerOrder.length;
  const playerId = state.playerOrder[normalizedSeat];
  if (!playerId) throw new Error(`No player at seat ${normalizedSeat}`);
  return playerId;
}

export function playerOneId(state: GameState): PlayerId {
  return playerIdAtSeat(state, state.player1Seat);
}

export function playerTwoSeat(state: GameState): number {
  return (state.player1Seat + 3) % state.playerOrder.length;
}

export function playerTwoId(state: GameState): PlayerId {
  return playerIdAtSeat(state, playerTwoSeat(state));
}

export function activePlayerId(state: GameState): PlayerId | null {
  if (state.phase.kind === "setup") return playerIdAtSeat(state, state.phase.seat);
  if (state.phase.kind === "player1-pre-roll" || state.phase.kind === "player1-actions") {
    return playerOneId(state);
  }
  if (state.phase.kind === "player2-actions") return playerTwoId(state);
  if (state.phase.kind === "discarding") return null;
  if (state.phase.kind === "robber-move" || state.phase.kind === "robber-steal") {
    return state.phase.activePlayerId;
  }
  if (state.phase.kind === "road-building"
    || state.phase.kind === "year-of-plenty"
    || state.phase.kind === "monopoly") {
    return state.phase.activePlayerId;
  }
  return null;
}

export function emptyStartingResources(): ResourceBundle {
  return emptyResourceBundle();
}
