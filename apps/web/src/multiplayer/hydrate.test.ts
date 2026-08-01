import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { totalResources } from "@kaataan/game-engine";
import type { GameSnapshot } from "@kaataan/protocol";

import { createLocalGame } from "../game/localSession.ts";
import { hydrateGameSnapshot } from "./hydrate.ts";

describe("multiplayer snapshot hydration", () => {
  it("rebuilds maps and preserves private versus public card counts", () => {
    const source = createLocalGame();
    const viewerId = source.playerOrder[0]!;
    const snapshot: GameSnapshot = {
      id: source.id, version: source.version, eventSequence: source.eventSequence, rulesetVersion: source.rulesetVersion,
      phase: source.phase, playerOrder: source.playerOrder, startingPlayerSeat: source.startingPlayerSeat,
      player1Seat: source.player1Seat, pairedTurn: source.pairedTurn, lastDiceRoll: source.lastDiceRoll,
      robberHexId: source.layout.robberHexId,
      topology: {
        hexes: source.layout.topology.hexIds.map((id) => { const hex = source.layout.topology.hexes.get(id)!; const tile = source.layout.tiles.get(id)!; return { id, position: hex.position, vertexIds: hex.vertexIds, edgeIds: hex.edgeIds, terrain: tile.terrain, token: tile.token }; }),
        vertices: source.layout.topology.vertexIds.map((id) => { const vertex = source.layout.topology.vertices.get(id)!; return { id, position: vertex.position, adjacentHexIds: vertex.adjacentHexIds, adjacentEdgeIds: vertex.adjacentEdgeIds, neighboringVertexIds: vertex.neighboringVertexIds }; }),
        edges: source.layout.topology.edgeIds.map((id) => { const edge = source.layout.topology.edges.get(id)!; return { id, vertexIds: edge.vertexIds, adjacentHexIds: edge.adjacentHexIds }; }),
      },
      ports: source.ports,
      buildings: [], roads: [], bank: source.bank, developmentDeckCount: source.developmentDeck.length,
      longestRoadHolderId: null, largestArmyHolderId: null,
      players: source.playerOrder.map((id, index) => { const player = source.players.get(id)!; return { id, name: player.name, seat: player.seat, pieces: player.pieces, resourceCardCount: index === 0 ? 2 : 4, developmentCardCount: 0, publicScore: 0, playedKnights: 0, playerTurnSequence: player.playerTurnSequence, developmentCardPlayedThisTurn: false, hand: index === 0 ? { brick: 1, lumber: 1, wool: 0, grain: 0, ore: 0 } : null, developmentCards: index === 0 ? [] : null }; }),
    };

    const state = hydrateGameSnapshot(snapshot);
    assert.equal(state.layout.topology.hexes.size, 30);
    assert.equal(state.layout.topology.vertices.size, 80);
    assert.equal(state.layout.topology.edges.size, 109);
    assert.deepEqual(state.players.get(viewerId)?.hand, snapshot.players[0]?.hand);
    assert.equal(totalResources(state.players.get(source.playerOrder[1]!)!.hand), 4);
    assert.equal(state.layout.robberHexId, snapshot.robberHexId);
  });
});
