import { addResources, createResourceBundle, subtractResources } from "./resources.ts";
import type { GamePhase, GameState, PlayerState } from "./gameState.ts";
import type { OwnedDevelopmentCard } from "./development.ts";
import type {
  EdgeId,
  PlayerId,
  ResourceBundle,
  ResourceType,
  HexId,
  VertexId,
} from "./types.ts";

interface EventBase {
  readonly sequence: number;
}

export type GameEvent =
  | (EventBase & {
    readonly type: "INITIAL_SETTLEMENT_PLACED";
    readonly playerId: PlayerId;
    readonly vertexId: VertexId;
  })
  | (EventBase & {
    readonly type: "INITIAL_ROAD_PLACED";
    readonly playerId: PlayerId;
    readonly edgeId: EdgeId;
  })
  | (EventBase & {
    readonly type: "STARTING_RESOURCES_GRANTED";
    readonly playerId: PlayerId;
    readonly resources: ResourceBundle;
  })
  | (EventBase & {
    readonly type: "ROAD_BUILT";
    readonly playerId: PlayerId;
    readonly edgeId: EdgeId;
    readonly payment: ResourceBundle;
  })
  | (EventBase & {
    readonly type: "SETTLEMENT_BUILT";
    readonly playerId: PlayerId;
    readonly vertexId: VertexId;
    readonly payment: ResourceBundle;
  })
  | (EventBase & {
    readonly type: "CITY_BUILT";
    readonly playerId: PlayerId;
    readonly vertexId: VertexId;
    readonly payment: ResourceBundle;
  })
  | (EventBase & {
    readonly type: "DICE_ROLLED";
    readonly playerId: PlayerId;
    readonly total: number;
  })
  | (EventBase & {
    readonly type: "DEVELOPMENT_CARD_PURCHASED";
    readonly playerId: PlayerId;
    readonly card: OwnedDevelopmentCard;
    readonly payment: ResourceBundle;
  })
  | (EventBase & {
    readonly type: "DEVELOPMENT_CARD_PLAYED";
    readonly playerId: PlayerId;
    readonly card: OwnedDevelopmentCard;
  })
  | (EventBase & {
    readonly type: "YEAR_OF_PLENTY_RESOLVED";
    readonly playerId: PlayerId;
    readonly resources: ResourceBundle;
  })
  | (EventBase & {
    readonly type: "MONOPOLY_RESOLVED";
    readonly playerId: PlayerId;
    readonly resource: ResourceType;
    readonly takenByPlayer: Readonly<Record<PlayerId, number>>;
  })
  | (EventBase & {
    readonly type: "VICTORY_POINT_CARDS_REVEALED";
    readonly playerId: PlayerId;
    readonly cards: readonly OwnedDevelopmentCard[];
  })
  | (EventBase & {
    readonly type: "LONGEST_ROAD_HOLDER_CHANGED";
    readonly previousHolderId: PlayerId | null;
    readonly holderId: PlayerId | null;
  })
  | (EventBase & {
    readonly type: "LARGEST_ARMY_HOLDER_CHANGED";
    readonly previousHolderId: PlayerId | null;
    readonly holderId: PlayerId | null;
  })
  | (EventBase & {
    readonly type: "GAME_WON";
    readonly winnerId: PlayerId;
    readonly publicScore: number;
    readonly authoritativeScore: number;
  })
  | (EventBase & {
    readonly type: "PRODUCTION_DISTRIBUTED";
    readonly payouts: Readonly<Record<PlayerId, ResourceBundle>>;
  })
  | (EventBase & {
    readonly type: "RESOURCES_DISCARDED";
    readonly playerId: PlayerId;
    readonly resources: ResourceBundle;
  })
  | (EventBase & {
    readonly type: "ROBBER_MOVED";
    readonly playerId: PlayerId;
    readonly fromHexId: HexId;
    readonly toHexId: HexId;
    readonly cause: "rolled-seven" | "knight";
  })
  | (EventBase & {
    readonly type: "RESOURCE_STOLEN";
    readonly playerId: PlayerId;
    readonly targetPlayerId: PlayerId;
    readonly resource: ResourceType | null;
  })
  | (EventBase & {
    readonly type: "MARITIME_TRADE_COMPLETED";
    readonly playerId: PlayerId;
    readonly hand: ResourceBundle;
    readonly bank: ResourceBundle;
  })
  | (EventBase & {
    readonly type: "DOMESTIC_TRADE_COMPLETED";
    readonly playerId: PlayerId;
    readonly partnerId: PlayerId;
    readonly playerHand: ResourceBundle;
    readonly partnerHand: ResourceBundle;
  })
  | (EventBase & {
    readonly type: "PLAYER_TURN_STARTED";
    readonly playerId: PlayerId;
  })
  | (EventBase & {
    readonly type: "PAIRED_TURN_ADVANCED";
    readonly player1Seat: number;
    readonly pairedTurn: number;
  })
  | (EventBase & {
    readonly type: "PHASE_CHANGED";
    readonly phase: GamePhase;
  })
  | (EventBase & {
    readonly type: "COMMAND_ACCEPTED";
    readonly commandId: string;
  });

export type UnsequencedGameEvent = GameEvent extends infer Event
  ? Event extends GameEvent ? Omit<Event, "sequence"> : never
  : never;

function updatePlayer(
  state: GameState,
  playerId: PlayerId,
  update: (player: PlayerState) => PlayerState,
): ReadonlyMap<PlayerId, PlayerState> {
  const player = state.players.get(playerId);
  if (!player) throw new Error(`Event references unknown player ${playerId}`);
  const players = new Map(state.players);
  players.set(playerId, update(player));
  return players;
}

function transferPaymentToBank(
  state: GameState,
  playerId: PlayerId,
  payment: ResourceBundle,
): Pick<GameState, "players" | "bank"> {
  return {
    players: updatePlayer(state, playerId, (player) => ({
      ...player,
      hand: subtractResources(player.hand, payment),
    })),
    bank: addResources(state.bank, payment),
  };
}

export function reduceEvent(state: GameState, event: GameEvent): GameState {
  if (event.sequence !== state.eventSequence + 1) {
    throw new Error(`Expected event sequence ${state.eventSequence + 1}, got ${event.sequence}`);
  }
  const base = { ...state, eventSequence: event.sequence };

  switch (event.type) {
    case "INITIAL_SETTLEMENT_PLACED": {
      const buildingsByVertex = new Map(state.occupancy.buildingsByVertex);
      buildingsByVertex.set(event.vertexId, { playerId: event.playerId, kind: "settlement" });
      return {
        ...base,
        occupancy: { ...state.occupancy, buildingsByVertex },
        players: updatePlayer(state, event.playerId, (player) => ({
          ...player,
          pieces: { ...player.pieces, settlements: player.pieces.settlements - 1 },
        })),
      };
    }
    case "INITIAL_ROAD_PLACED": {
      const roadsByEdge = new Map(state.occupancy.roadsByEdge);
      roadsByEdge.set(event.edgeId, { playerId: event.playerId });
      return {
        ...base,
        occupancy: { ...state.occupancy, roadsByEdge },
        players: updatePlayer(state, event.playerId, (player) => ({
          ...player,
          pieces: { ...player.pieces, roads: player.pieces.roads - 1 },
        })),
      };
    }
    case "STARTING_RESOURCES_GRANTED":
      return {
        ...base,
        bank: subtractResources(state.bank, event.resources),
        players: updatePlayer(state, event.playerId, (player) => ({
          ...player,
          hand: addResources(player.hand, event.resources),
        })),
      };
    case "ROAD_BUILT": {
      const paid = transferPaymentToBank(state, event.playerId, event.payment);
      const roadsByEdge = new Map(state.occupancy.roadsByEdge);
      roadsByEdge.set(event.edgeId, { playerId: event.playerId });
      const players = new Map(paid.players);
      const player = players.get(event.playerId) as PlayerState;
      players.set(event.playerId, {
        ...player,
        pieces: { ...player.pieces, roads: player.pieces.roads - 1 },
      });
      return { ...base, ...paid, players, occupancy: { ...state.occupancy, roadsByEdge } };
    }
    case "SETTLEMENT_BUILT": {
      const paid = transferPaymentToBank(state, event.playerId, event.payment);
      const buildingsByVertex = new Map(state.occupancy.buildingsByVertex);
      buildingsByVertex.set(event.vertexId, { playerId: event.playerId, kind: "settlement" });
      const players = new Map(paid.players);
      const player = players.get(event.playerId) as PlayerState;
      players.set(event.playerId, {
        ...player,
        pieces: { ...player.pieces, settlements: player.pieces.settlements - 1 },
      });
      return { ...base, ...paid, players, occupancy: { ...state.occupancy, buildingsByVertex } };
    }
    case "CITY_BUILT": {
      const paid = transferPaymentToBank(state, event.playerId, event.payment);
      const buildingsByVertex = new Map(state.occupancy.buildingsByVertex);
      buildingsByVertex.set(event.vertexId, { playerId: event.playerId, kind: "city" });
      const players = new Map(paid.players);
      const player = players.get(event.playerId) as PlayerState;
      players.set(event.playerId, {
        ...player,
        pieces: {
          ...player.pieces,
          settlements: player.pieces.settlements + 1,
          cities: player.pieces.cities - 1,
        },
      });
      return { ...base, ...paid, players, occupancy: { ...state.occupancy, buildingsByVertex } };
    }
    case "DICE_ROLLED":
      return { ...base, lastDiceRoll: event.total };
    case "DEVELOPMENT_CARD_PURCHASED": {
      const topCard = state.developmentDeck[0];
      if (!topCard || topCard.id !== event.card.id || topCard.type !== event.card.type) {
        throw new Error("Development purchase event does not match the top deck card");
      }
      const paid = transferPaymentToBank(state, event.playerId, event.payment);
      const players = new Map(paid.players);
      const player = players.get(event.playerId) as PlayerState;
      players.set(event.playerId, {
        ...player,
        developmentCards: [...player.developmentCards, event.card],
      });
      return {
        ...base,
        ...paid,
        players,
        developmentDeck: state.developmentDeck.slice(1),
      };
    }
    case "DEVELOPMENT_CARD_PLAYED": {
      const player = state.players.get(event.playerId);
      if (!player || !player.developmentCards.some((card) => card.id === event.card.id)) {
        throw new Error("Development play event references a card outside the player's hand");
      }
      return {
        ...base,
        players: updatePlayer(state, event.playerId, (current) => ({
          ...current,
          developmentCards: current.developmentCards.filter((card) => card.id !== event.card.id),
          playedKnights: current.playedKnights + (event.card.type === "knight" ? 1 : 0),
          developmentCardPlayedThisTurn: true,
        })),
        resolvedDevelopmentCards: [
          ...state.resolvedDevelopmentCards,
          {
            id: event.card.id,
            type: event.card.type,
            playerId: event.playerId,
            playedPlayerTurn: player.playerTurnSequence,
          },
        ],
      };
    }
    case "YEAR_OF_PLENTY_RESOLVED":
      return {
        ...base,
        bank: subtractResources(state.bank, event.resources),
        players: updatePlayer(state, event.playerId, (player) => ({
          ...player,
          hand: addResources(player.hand, event.resources),
        })),
      };
    case "MONOPOLY_RESOLVED": {
      let players = state.players;
      let total = 0;
      for (const [playerId, amount] of Object.entries(event.takenByPlayer)) {
        if (amount <= 0) continue;
        const cards = createResourceBundle({ [event.resource]: amount });
        players = updatePlayer({ ...state, players }, playerId, (player) => ({
          ...player,
          hand: subtractResources(player.hand, cards),
        }));
        total += amount;
      }
      const receipt = createResourceBundle({ [event.resource]: total });
      players = updatePlayer({ ...state, players }, event.playerId, (player) => ({
        ...player,
        hand: addResources(player.hand, receipt),
      }));
      return { ...base, players };
    }
    case "VICTORY_POINT_CARDS_REVEALED": {
      const cardIds = new Set(event.cards.map((card) => card.id));
      return {
        ...base,
        players: updatePlayer(state, event.playerId, (player) => ({
          ...player,
          developmentCards: player.developmentCards.filter((card) => !cardIds.has(card.id)),
        })),
        resolvedDevelopmentCards: [
          ...state.resolvedDevelopmentCards,
          ...event.cards.map((card) => ({
            id: card.id,
            type: card.type,
            playerId: event.playerId,
            playedPlayerTurn: state.players.get(event.playerId)?.playerTurnSequence ?? 0,
          })),
        ],
      };
    }
    case "LONGEST_ROAD_HOLDER_CHANGED":
      return { ...base, longestRoadHolderId: event.holderId };
    case "LARGEST_ARMY_HOLDER_CHANGED":
      return { ...base, largestArmyHolderId: event.holderId };
    case "GAME_WON":
      return { ...base, phase: { kind: "game-over", winnerId: event.winnerId } };
    case "PRODUCTION_DISTRIBUTED": {
      let bank = state.bank;
      let players = state.players;
      for (const [playerId, payout] of Object.entries(event.payouts)) {
        const intermediate = { ...state, bank, players };
        bank = subtractResources(bank, payout);
        players = updatePlayer(intermediate, playerId, (player) => ({
          ...player,
          hand: addResources(player.hand, payout),
        }));
      }
      return { ...base, bank, players };
    }
    case "RESOURCES_DISCARDED":
      return {
        ...base,
        bank: addResources(state.bank, event.resources),
        players: updatePlayer(state, event.playerId, (player) => ({
          ...player,
          hand: subtractResources(player.hand, event.resources),
        })),
      };
    case "ROBBER_MOVED":
      return {
        ...base,
        layout: { ...state.layout, robberHexId: event.toHexId },
      };
    case "RESOURCE_STOLEN": {
      if (event.resource === null) return base;
      const card = createResourceBundle({ [event.resource]: 1 });
      let players = updatePlayer(state, event.targetPlayerId, (player) => ({
        ...player,
        hand: subtractResources(player.hand, card),
      }));
      players = updatePlayer({ ...state, players }, event.playerId, (player) => ({
        ...player,
        hand: addResources(player.hand, card),
      }));
      return { ...base, players };
    }
    case "MARITIME_TRADE_COMPLETED":
      return {
        ...base,
        bank: event.bank,
        players: updatePlayer(state, event.playerId, (player) => ({ ...player, hand: event.hand })),
      };
    case "DOMESTIC_TRADE_COMPLETED": {
      const players = new Map(state.players);
      const player = players.get(event.playerId);
      const partner = players.get(event.partnerId);
      if (!player || !partner) throw new Error("Domestic trade event references unknown player");
      players.set(event.playerId, { ...player, hand: event.playerHand });
      players.set(event.partnerId, { ...partner, hand: event.partnerHand });
      return { ...base, players };
    }
    case "PLAYER_TURN_STARTED":
      return {
        ...base,
        players: updatePlayer(state, event.playerId, (player) => ({
          ...player,
          playerTurnSequence: player.playerTurnSequence + 1,
          developmentCardPlayedThisTurn: false,
        })),
      };
    case "PAIRED_TURN_ADVANCED":
      return {
        ...base,
        player1Seat: event.player1Seat,
        pairedTurn: event.pairedTurn,
        lastDiceRoll: null,
      };
    case "PHASE_CHANGED":
      return { ...base, phase: event.phase };
    case "COMMAND_ACCEPTED":
      return { ...base, version: state.version + 1 };
  }
}

export function sequenceEvents(
  state: GameState,
  events: readonly UnsequencedGameEvent[],
): readonly GameEvent[] {
  return events.map((event, index) => ({
    ...event,
    sequence: state.eventSequence + index + 1,
  }) as GameEvent);
}

export function reduceEvents(state: GameState, events: readonly GameEvent[]): GameState {
  return events.reduce(reduceEvent, state);
}
