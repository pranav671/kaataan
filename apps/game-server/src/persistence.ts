import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";

import type {
  EdgeId,
  EdgeTopology,
  GamePhase,
  GameState,
  HexId,
  HexTile,
  HexTopology,
  PlayerState,
  PortPlacement,
  ResourceBundle,
  ResolvedDevelopmentCard,
  DevelopmentCardDefinition,
  VertexId,
  VertexTopology,
} from "@kaataan/game-engine";
import type { PlayerColor } from "@kaataan/protocol";

export const PERSISTENCE_FORMAT_VERSION = 1;

export interface PersistedMember {
  readonly id: string;
  readonly name: string;
  readonly color: PlayerColor;
  readonly seat: number;
  readonly reconnectToken: string;
  readonly isReady: boolean;
}

export interface PersistedTradeOffer {
  readonly id: string;
  readonly actorId: string;
  readonly partnerId: string;
  readonly proposedById: string;
  readonly actorGives: ResourceBundle;
  readonly partnerGives: ResourceBundle;
  readonly gameVersion: number;
  readonly createdAt: number;
}

export interface PersistedGameState {
  readonly id: string;
  readonly rulesetVersion: GameState["rulesetVersion"];
  readonly version: number;
  readonly eventSequence: number;
  readonly layout: {
    readonly topology: {
      readonly hexes: readonly HexTopology[];
      readonly vertices: readonly VertexTopology[];
      readonly edges: readonly EdgeTopology[];
      readonly hexIds: readonly HexId[];
      readonly vertexIds: readonly VertexId[];
      readonly edgeIds: readonly EdgeId[];
    };
    readonly tiles: readonly HexTile[];
    readonly robberHexId: HexId;
    readonly seed: string;
  };
  readonly ports: readonly PortPlacement[];
  readonly occupancy: {
    readonly buildingsByVertex: readonly [VertexId, { readonly playerId: string; readonly kind: "settlement" | "city" }][];
    readonly roadsByEdge: readonly [EdgeId, { readonly playerId: string }][];
  };
  readonly bank: ResourceBundle;
  readonly players: readonly PlayerState[];
  readonly playerOrder: readonly string[];
  readonly startingPlayerSeat: number;
  readonly player1Seat: number;
  readonly pairedTurn: number;
  readonly phase: GamePhase;
  readonly lastDiceRoll: number | null;
  readonly developmentDeck: readonly DevelopmentCardDefinition[];
  readonly resolvedDevelopmentCards: readonly ResolvedDevelopmentCard[];
  readonly longestRoadHolderId: string | null;
  readonly largestArmyHolderId: string | null;
}

export interface PersistedRoom {
  readonly code: string;
  readonly createdAt: number;
  readonly hostId: string;
  readonly members: readonly PersistedMember[];
  readonly status: "lobby" | "playing" | "finished";
  readonly game: PersistedGameState | null;
  readonly tradeOffers: readonly PersistedTradeOffer[];
  readonly turnDeadlineAt?: number | null;
  readonly deadlineKey?: string | null;
}

interface PersistenceDocument {
  readonly formatVersion: typeof PERSISTENCE_FORMAT_VERSION;
  readonly savedAt: string;
  readonly rooms: readonly PersistedRoom[];
}

export interface RoomPersistence {
  load(): readonly PersistedRoom[];
  save(rooms: readonly PersistedRoom[]): void;
}

export function serializeGameState(state: GameState): PersistedGameState {
  return {
    id: state.id,
    rulesetVersion: state.rulesetVersion,
    version: state.version,
    eventSequence: state.eventSequence,
    layout: {
      topology: {
        hexes: [...state.layout.topology.hexes.values()],
        vertices: [...state.layout.topology.vertices.values()],
        edges: [...state.layout.topology.edges.values()],
        hexIds: state.layout.topology.hexIds,
        vertexIds: state.layout.topology.vertexIds,
        edgeIds: state.layout.topology.edgeIds,
      },
      tiles: [...state.layout.tiles.values()],
      robberHexId: state.layout.robberHexId,
      seed: state.layout.seed,
    },
    ports: state.ports,
    occupancy: {
      buildingsByVertex: [...state.occupancy.buildingsByVertex.entries()],
      roadsByEdge: [...state.occupancy.roadsByEdge.entries()],
    },
    bank: state.bank,
    players: [...state.players.values()],
    playerOrder: state.playerOrder,
    startingPlayerSeat: state.startingPlayerSeat,
    player1Seat: state.player1Seat,
    pairedTurn: state.pairedTurn,
    phase: state.phase,
    lastDiceRoll: state.lastDiceRoll,
    developmentDeck: state.developmentDeck,
    resolvedDevelopmentCards: state.resolvedDevelopmentCards,
    longestRoadHolderId: state.longestRoadHolderId,
    largestArmyHolderId: state.largestArmyHolderId,
  };
}

export function deserializeGameState(value: PersistedGameState): GameState {
  return {
    ...value,
    layout: {
      ...value.layout,
      topology: {
        ...value.layout.topology,
        hexes: new Map(value.layout.topology.hexes.map((item) => [item.id, item])),
        vertices: new Map(value.layout.topology.vertices.map((item) => [item.id, item])),
        edges: new Map(value.layout.topology.edges.map((item) => [item.id, item])),
      },
      tiles: new Map(value.layout.tiles.map((item) => [item.id, item])),
    },
    occupancy: {
      buildingsByVertex: new Map(value.occupancy.buildingsByVertex),
      roadsByEdge: new Map(value.occupancy.roadsByEdge),
    },
    players: new Map(value.players.map((player) => [player.id, player])),
  };
}

export class JsonFileRoomPersistence implements RoomPersistence {
  readonly filePath: string;

  constructor(filePath: string) { this.filePath = filePath; }

  load(): readonly PersistedRoom[] {
    if (!existsSync(this.filePath)) return [];
    const document = JSON.parse(readFileSync(this.filePath, "utf8")) as Partial<PersistenceDocument>;
    if (document.formatVersion !== PERSISTENCE_FORMAT_VERSION || !Array.isArray(document.rooms)) {
      throw new Error(`Unsupported Kaataan persistence document in ${this.filePath}`);
    }
    return document.rooms;
  }

  save(rooms: readonly PersistedRoom[]): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.${randomUUID()}.tmp`;
    const document: PersistenceDocument = { formatVersion: PERSISTENCE_FORMAT_VERSION, savedAt: new Date().toISOString(), rooms };
    writeFileSync(temporaryPath, `${JSON.stringify(document)}\n`, { encoding: "utf8", mode: 0o600 });
    renameSync(temporaryPath, this.filePath);
    chmodSync(this.filePath, 0o600);
  }
}
