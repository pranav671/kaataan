import type {
  DevelopmentCardType,
  GamePhase,
  NumberToken,
  PlayerPieceSupply,
  PortKind,
  ResourceBundle,
  TerrainType,
} from "@kaataan/game-engine";

import type { PlayerColor } from "./schema.ts";

export type RoomStatus = "lobby" | "playing" | "finished";

export interface TurnTimerSettings {
  readonly setupSeconds: number;
  readonly rollSeconds: number;
  readonly actionSeconds: number;
  readonly robberSeconds: number;
  readonly discardSeconds: number;
}

export interface RoomMemberView {
  readonly id: string;
  readonly name: string;
  readonly color: PlayerColor;
  readonly seat: number;
  readonly isHost: boolean;
  readonly isReady: boolean;
  readonly isConnected: boolean;
}

export interface RoomSnapshot {
  readonly code: string;
  readonly status: RoomStatus;
  readonly hostId: string;
  readonly viewerId: string;
  readonly members: readonly RoomMemberView[];
  readonly tradeOffers: readonly DomesticTradeOfferView[];
  readonly timerSettings: TurnTimerSettings;
  readonly turnDeadlineAt: number | null;
  readonly activity: readonly ProjectedGameEvent[];
  readonly endedReason: "host-ended-offline" | null;
  readonly diceStatistics: DiceStatisticsView;
  readonly game: GameSnapshot | null;
}

export interface DiceStatisticsView {
  readonly totalRolls: number;
  readonly outcomes: readonly {
    readonly total: number;
    readonly count: number;
    readonly percentage: number;
  }[];
}

export interface DomesticTradeOfferView {
  readonly id: string;
  readonly actorId: string;
  readonly actorGives: ResourceBundle;
  readonly partnerGives: ResourceBundle;
  readonly responses: readonly DomesticTradeResponseView[];
  readonly gameVersion: number;
  readonly createdAt: number;
}

export interface DomesticTradeResponseView {
  readonly playerId: string;
  readonly status: "accepted" | "declined" | "countered";
  readonly actorGives?: ResourceBundle;
  readonly partnerGives?: ResourceBundle;
  readonly updatedAt: number;
}

export interface PlayerSessionCredentials {
  readonly roomCode: string;
  readonly playerId: string;
  readonly reconnectToken: string;
}

export interface HexView {
  readonly id: string;
  readonly position: { readonly x: number; readonly y: number };
  readonly vertexIds: readonly string[];
  readonly edgeIds: readonly string[];
  readonly terrain: TerrainType;
  readonly token: NumberToken | null;
}

export interface VertexView {
  readonly id: string;
  readonly position: { readonly x: number; readonly y: number };
  readonly adjacentHexIds: readonly string[];
  readonly adjacentEdgeIds: readonly string[];
  readonly neighboringVertexIds: readonly string[];
}

export interface EdgeView {
  readonly id: string;
  readonly vertexIds: readonly string[];
  readonly adjacentHexIds: readonly string[];
}

export interface PlayerGameView {
  readonly id: string;
  readonly name: string;
  readonly seat: number;
  readonly pieces: PlayerPieceSupply;
  readonly resourceCardCount: number;
  readonly developmentCardCount: number;
  readonly publicScore: number;
  readonly victoryPointCardCount?: number | null;
  readonly playedKnights: number;
  readonly playedDevelopmentCardCount?: number;
  readonly playerTurnSequence: number;
  readonly developmentCardPlayedThisTurn: boolean;
  readonly hand: ResourceBundle | null;
  readonly developmentCards: readonly {
    readonly id: string;
    readonly type: DevelopmentCardType;
    readonly purchasedPlayerTurn: number;
  }[] | null;
}

export interface GameSnapshot {
  readonly id: string;
  readonly version: number;
  readonly eventSequence: number;
  readonly rulesetVersion: string;
  readonly phase: GamePhase;
  readonly playerOrder: readonly string[];
  readonly startingPlayerSeat: number;
  readonly player1Seat: number;
  readonly pairedTurn: number;
  readonly lastDiceRoll: number | null;
  readonly robberHexId: string;
  readonly topology: {
    readonly hexes: readonly HexView[];
    readonly vertices: readonly VertexView[];
    readonly edges: readonly EdgeView[];
  };
  readonly ports: readonly {
    readonly id: string;
    readonly edgeId: string;
    readonly vertexIds: readonly string[];
    readonly kind: PortKind;
  }[];
  readonly buildings: readonly {
    readonly vertexId: string;
    readonly playerId: string;
    readonly kind: "settlement" | "city";
  }[];
  readonly roads: readonly { readonly edgeId: string; readonly playerId: string }[];
  readonly players: readonly PlayerGameView[];
  readonly bank: ResourceBundle;
  readonly developmentDeckCount: number;
  readonly longestRoadHolderId: string | null;
  readonly largestArmyHolderId: string | null;
}

export type ProjectedGameEvent = Readonly<Record<string, unknown>> & {
  readonly sequence: number;
  readonly type: string;
};

export type ServerMessage =
  | { readonly type: "session.created"; readonly requestId: string; readonly session: PlayerSessionCredentials; readonly snapshot: RoomSnapshot }
  | { readonly type: "session.resumed"; readonly requestId: string; readonly snapshot: RoomSnapshot }
  | { readonly type: "session.kicked"; readonly roomCode: string; readonly message: string }
  | { readonly type: "room.snapshot"; readonly snapshot: RoomSnapshot }
  | { readonly type: "game.update"; readonly snapshot: RoomSnapshot; readonly events: readonly ProjectedGameEvent[] }
  | { readonly type: "request.error"; readonly requestId: string; readonly code: string; readonly message: string }
  | { readonly type: "pong"; readonly timestamp: number };
