import {
  playerScore,
  projectDevelopmentEventForViewer,
  projectRobberEventForViewer,
  projectScoringEvent,
  totalResources,
  type GameEvent,
  type GameState,
  type PlayerId,
  type ResourceBundle,
} from "@kaataan/game-engine";
import type { GameSnapshot, ProjectedGameEvent } from "@kaataan/protocol";

export function projectGameForViewer(state: GameState, viewerId: PlayerId): GameSnapshot {
  const topology = state.layout.topology;
  return {
    id: state.id,
    version: state.version,
    eventSequence: state.eventSequence,
    rulesetVersion: state.rulesetVersion,
    phase: state.phase,
    playerOrder: state.playerOrder,
    startingPlayerSeat: state.startingPlayerSeat,
    player1Seat: state.player1Seat,
    pairedTurn: state.pairedTurn,
    lastDiceRoll: state.lastDiceRoll,
    robberHexId: state.layout.robberHexId,
    topology: {
      hexes: state.layout.topology.hexIds.map((id) => {
        const hex = topology.hexes.get(id);
        const tile = state.layout.tiles.get(id);
        if (!hex || !tile) throw new Error(`Missing hex view data for ${id}`);
        return {
          id,
          position: hex.position,
          vertexIds: hex.vertexIds,
          edgeIds: hex.edgeIds,
          terrain: tile.terrain,
          token: tile.token,
        };
      }),
      vertices: topology.vertexIds.map((id) => {
        const vertex = topology.vertices.get(id);
        if (!vertex) throw new Error(`Missing vertex ${id}`);
        return {
          id,
          position: vertex.position,
          adjacentHexIds: vertex.adjacentHexIds,
          adjacentEdgeIds: vertex.adjacentEdgeIds,
          neighboringVertexIds: vertex.neighboringVertexIds,
        };
      }),
      edges: topology.edgeIds.map((id) => {
        const edge = topology.edges.get(id);
        if (!edge) throw new Error(`Missing edge ${id}`);
        return { id, vertexIds: edge.vertexIds, adjacentHexIds: edge.adjacentHexIds };
      }),
    },
    ports: state.ports,
    buildings: [...state.occupancy.buildingsByVertex.entries()].map(([vertexId, building]) => ({
      vertexId,
      ...building,
    })),
    roads: [...state.occupancy.roadsByEdge.entries()].map(([edgeId, road]) => ({
      edgeId,
      playerId: road.playerId,
    })),
    players: state.playerOrder.map((playerId) => {
      const player = state.players.get(playerId);
      if (!player) throw new Error(`Missing player ${playerId}`);
      const ownView = playerId === viewerId;
      return {
        id: player.id,
        name: player.name,
        seat: player.seat,
        pieces: player.pieces,
        resourceCardCount: totalResources(player.hand),
        developmentCardCount: player.developmentCards.length,
        publicScore: playerScore(state, playerId).publicScore,
        playedKnights: player.playedKnights,
        playerTurnSequence: player.playerTurnSequence,
        developmentCardPlayedThisTurn: player.developmentCardPlayedThisTurn,
        hand: ownView ? player.hand : null,
        developmentCards: ownView ? player.developmentCards : null,
      };
    }),
    bank: state.bank,
    developmentDeckCount: state.developmentDeck.length,
    longestRoadHolderId: state.longestRoadHolderId,
    largestArmyHolderId: state.largestArmyHolderId,
  };
}

function resourceCount(bundle: ResourceBundle): number {
  return totalResources(bundle);
}

export function projectEventForViewer(
  event: GameEvent,
  viewerId: PlayerId,
): ProjectedGameEvent | null {
  if (event.type === "COMMAND_ACCEPTED") return null;
  if (event.type === "DEVELOPMENT_CARD_PURCHASED") {
    return projectDevelopmentEventForViewer(event, viewerId) as ProjectedGameEvent;
  }
  if (event.type === "DEVELOPMENT_CARD_PLAYED") {
    return projectDevelopmentEventForViewer(event, viewerId) as ProjectedGameEvent;
  }
  if (event.type === "YEAR_OF_PLENTY_RESOLVED") {
    return projectDevelopmentEventForViewer(event, viewerId) as ProjectedGameEvent;
  }
  if (event.type === "MONOPOLY_RESOLVED") {
    return projectDevelopmentEventForViewer(event, viewerId) as ProjectedGameEvent;
  }
  if (event.type === "RESOURCES_DISCARDED") {
    return projectRobberEventForViewer(event, viewerId) as ProjectedGameEvent;
  }
  if (event.type === "ROBBER_MOVED") {
    return projectRobberEventForViewer(event, viewerId) as ProjectedGameEvent;
  }
  if (event.type === "RESOURCE_STOLEN") {
    return projectRobberEventForViewer(event, viewerId) as ProjectedGameEvent;
  }
  if (event.type === "VICTORY_POINT_CARDS_REVEALED"
    || event.type === "LONGEST_ROAD_HOLDER_CHANGED"
    || event.type === "LARGEST_ARMY_HOLDER_CHANGED"
    || event.type === "GAME_WON") {
    return projectScoringEvent(event) as ProjectedGameEvent;
  }
  if (event.type === "STARTING_RESOURCES_GRANTED") {
    return {
      sequence: event.sequence,
      type: event.type,
      playerId: event.playerId,
      count: resourceCount(event.resources),
      privateResources: viewerId === event.playerId ? event.resources : null,
    };
  }
  if (event.type === "PRODUCTION_DISTRIBUTED") {
    return {
      sequence: event.sequence,
      type: event.type,
      counts: Object.fromEntries(Object.entries(event.payouts).map(([id, bundle]) => [id, resourceCount(bundle)])),
      privatePayout: event.payouts[viewerId] ?? null,
    };
  }
  if (event.type === "MARITIME_TRADE_COMPLETED") {
    return {
      sequence: event.sequence,
      type: event.type,
      playerId: event.playerId,
      privateHand: viewerId === event.playerId ? event.hand : null,
    };
  }
  if (event.type === "DOMESTIC_TRADE_COMPLETED") {
    return {
      sequence: event.sequence,
      type: event.type,
      playerId: event.playerId,
      partnerId: event.partnerId,
      privateHand: viewerId === event.playerId
        ? event.playerHand
        : viewerId === event.partnerId ? event.partnerHand : null,
    };
  }
  if (event.type === "ROAD_BUILT") {
    return { sequence: event.sequence, type: event.type, playerId: event.playerId, edgeId: event.edgeId };
  }
  if (event.type === "SETTLEMENT_BUILT" || event.type === "INITIAL_SETTLEMENT_PLACED") {
    return { sequence: event.sequence, type: event.type, playerId: event.playerId, vertexId: event.vertexId };
  }
  if (event.type === "CITY_BUILT") {
    return { sequence: event.sequence, type: event.type, playerId: event.playerId, vertexId: event.vertexId };
  }
  if (event.type === "INITIAL_ROAD_PLACED") {
    return { sequence: event.sequence, type: event.type, playerId: event.playerId, edgeId: event.edgeId };
  }
  if (event.type === "DICE_ROLLED") {
    return { sequence: event.sequence, type: event.type, playerId: event.playerId, total: event.total };
  }
  if (event.type === "PLAYER_TURN_STARTED") {
    return { sequence: event.sequence, type: event.type, playerId: event.playerId };
  }
  if (event.type === "PAIRED_TURN_ADVANCED") {
    return { sequence: event.sequence, type: event.type, player1Seat: event.player1Seat, pairedTurn: event.pairedTurn };
  }
  return { sequence: event.sequence, type: event.type, phase: event.phase };
}

export function projectEventsForViewer(
  events: readonly GameEvent[],
  viewerId: PlayerId,
): readonly ProjectedGameEvent[] {
  return events.flatMap((event) => {
    const view = projectEventForViewer(event, viewerId);
    return view ? [view] : [];
  });
}
