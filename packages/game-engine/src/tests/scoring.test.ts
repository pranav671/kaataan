import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BUILD_COSTS,
  addResources,
  assertGameStateInvariants,
  createEmptyOccupancy,
  createExtendedBoardTopology,
  createGame,
  createGameOverView,
  createResourceBundle,
  handleCommand,
  longestRoadLength,
  playerScore,
  projectScoringEvent,
  reduceEvents,
  resolveLargestArmyHolder,
  resolveLongestRoadHolder,
  subtractResources,
} from "../index.ts";
import type {
  BoardOccupancy,
  BoardTopology,
  EdgeId,
  GameCommand,
  GameState,
  PlayerId,
  VertexId,
} from "../index.ts";

function findSimplePath(
  topology: BoardTopology,
  edgeCount: number,
): { readonly edges: readonly EdgeId[]; readonly vertices: readonly VertexId[] } {
  function visit(
    vertexId: VertexId,
    edges: readonly EdgeId[],
    vertices: readonly VertexId[],
  ): { readonly edges: readonly EdgeId[]; readonly vertices: readonly VertexId[] } | null {
    if (edges.length === edgeCount) return { edges, vertices };
    const vertex = topology.vertices.get(vertexId);
    if (!vertex) return null;
    for (const edgeId of vertex.adjacentEdgeIds) {
      if (edges.includes(edgeId)) continue;
      const edge = topology.edges.get(edgeId)!;
      const next = edge.vertexIds[0] === vertexId ? edge.vertexIds[1] : edge.vertexIds[0];
      if (vertices.includes(next)) continue;
      const result = visit(next, [...edges, edgeId], [...vertices, next]);
      if (result) return result;
    }
    return null;
  }
  for (const vertexId of topology.vertexIds) {
    const result = visit(vertexId, [], [vertexId]);
    if (result) return result;
  }
  throw new Error(`Could not find path of ${edgeCount} edges`);
}

function occupancyWithRoads(
  edges: readonly EdgeId[],
  playerId = "p0",
): BoardOccupancy {
  return {
    ...createEmptyOccupancy(),
    roadsByEdge: new Map(edges.map((edgeId) => [edgeId, { playerId }])),
  };
}

function actionState(): GameState {
  const state = createGame({
    id: "scoring-test",
    seed: "scoring-test",
    startingPlayerSeat: 0,
    players: Array.from({ length: 5 }, (_, index) => ({
      id: `p${index}`,
      name: `Player ${index}`,
    })),
  });
  const players = new Map(state.players);
  players.set("p0", { ...players.get("p0")!, playerTurnSequence: 1 });
  return {
    ...state,
    players,
    pairedTurn: 1,
    phase: { kind: "player1-actions" },
  };
}

function withStructures(
  state: GameState,
  playerId: PlayerId,
  cities: number,
  settlements: number,
): GameState {
  const buildingsByVertex = new Map(state.occupancy.buildingsByVertex);
  for (const [vertexId, building] of buildingsByVertex) {
    if (building.playerId === playerId) buildingsByVertex.delete(vertexId);
  }
  const free = state.layout.topology.vertexIds.filter((vertexId) =>
    !buildingsByVertex.has(vertexId));
  let index = 0;
  for (; index < cities; index += 1) {
    buildingsByVertex.set(free[index]!, { playerId, kind: "city" });
  }
  for (let count = 0; count < settlements; count += 1, index += 1) {
    buildingsByVertex.set(free[index]!, { playerId, kind: "settlement" });
  }
  const player = state.players.get(playerId)!;
  const players = new Map(state.players);
  players.set(playerId, {
    ...player,
    pieces: {
      ...player.pieces,
      cities: 4 - cities,
      settlements: 5 - settlements,
    },
  });
  return {
    ...state,
    players,
    occupancy: { ...state.occupancy, buildingsByVertex },
  };
}

function grantVictoryPoint(state: GameState, playerId: PlayerId): {
  readonly state: GameState;
  readonly cardId: `dev:${number}`;
} {
  const index = state.developmentDeck.findIndex((card) => card.type === "victory-point");
  const card = state.developmentDeck[index]!;
  const player = state.players.get(playerId)!;
  const players = new Map(state.players);
  players.set(playerId, {
    ...player,
    developmentCards: [
      ...player.developmentCards,
      { ...card, purchasedPlayerTurn: player.playerTurnSequence },
    ],
  });
  return {
    cardId: card.id,
    state: {
      ...state,
      players,
      developmentDeck: state.developmentDeck.filter((_, cardIndex) => cardIndex !== index),
    },
  };
}

function fundCity(state: GameState, playerId: PlayerId): GameState {
  const player = state.players.get(playerId)!;
  const players = new Map(state.players);
  players.set(playerId, {
    ...player,
    hand: addResources(player.hand, BUILD_COSTS.city),
  });
  return { ...state, players, bank: subtractResources(state.bank, BUILD_COSTS.city) };
}

function accepted(state: GameState, actorId: PlayerId, command: GameCommand): GameState {
  const result = handleCommand(state, {
    commandId: `score-${state.version + 1}`,
    expectedVersion: state.version,
    actorId,
    command,
  });
  if (!result.accepted) assert.fail(`${result.code}: ${result.detail ?? ""}`);
  assert.deepEqual(reduceEvents(state, result.events), result.state);
  assertGameStateInvariants(result.state);
  return result.state;
}

describe("longest road", () => {
  const topology = createExtendedBoardTopology();

  it("counts a simple trail and never reuses an edge in a loop", () => {
    const path = findSimplePath(topology, 5);
    assert.equal(longestRoadLength(topology, occupancyWithRoads(path.edges), "p0"), 5);
    const loop = topology.hexes.values().next().value?.edgeIds;
    assert.ok(loop);
    assert.equal(longestRoadLength(topology, occupancyWithRoads(loop), "p0"), 6);
  });

  it("chooses two arms at a branch instead of summing all three", () => {
    const center = [...topology.vertices.values()].find((vertex) =>
      vertex.adjacentEdgeIds.length === 3);
    assert.ok(center);
    assert.equal(
      longestRoadLength(topology, occupancyWithRoads(center.adjacentEdgeIds), "p0"),
      2,
    );
  });

  it("stops continuity at an opponent building", () => {
    const path = findSimplePath(topology, 5);
    const occupancy = occupancyWithRoads(path.edges);
    const buildingsByVertex = new Map(occupancy.buildingsByVertex);
    buildingsByVertex.set(path.vertices[2]!, { playerId: "p1", kind: "settlement" });
    assert.equal(
      longestRoadLength(topology, { ...occupancy, buildingsByVertex }, "p0"),
      3,
    );
  });

  it("preserves a holder on a qualifying tie and removes an unheld tie", () => {
    const lengths = new Map<PlayerId, number>([["p0", 6], ["p1", 6], ["p2", 4]]);
    assert.equal(resolveLongestRoadHolder(["p0", "p1", "p2"], lengths, "p0"), "p0");
    assert.equal(resolveLongestRoadHolder(["p0", "p1", "p2"], lengths, null), null);
    lengths.set("p1", 7);
    assert.equal(resolveLongestRoadHolder(["p0", "p1", "p2"], lengths, "p0"), "p1");
  });
});

describe("awards and victory", () => {
  it("applies Longest Road and Largest Army through the command-derived award pass", () => {
    let state = actionState();
    const path = findSimplePath(state.layout.topology, 5);
    const roadsByEdge = new Map(path.edges.map((edgeId) => [edgeId, { playerId: "p0" }]));
    const player = state.players.get("p0")!;
    const knights = state.developmentDeck.filter((card) => card.type === "knight").slice(0, 3);
    const knightIds = new Set(knights.map((card) => card.id));
    const players = new Map(state.players);
    players.set("p0", {
      ...player,
      pieces: { ...player.pieces, roads: 10 },
      playedKnights: 3,
      hand: addResources(player.hand, createResourceBundle({ brick: 4 })),
    });
    state = {
      ...state,
      players,
      bank: subtractResources(state.bank, createResourceBundle({ brick: 4 })),
      occupancy: { ...state.occupancy, roadsByEdge },
      developmentDeck: state.developmentDeck.filter((card) => !knightIds.has(card.id)),
      resolvedDevelopmentCards: knights.map((card) => ({
        ...card,
        playerId: "p0",
        playedPlayerTurn: 1,
      })),
    };
    state = accepted(state, "p0", {
      type: "MARITIME_TRADE",
      give: "brick",
      receive: "ore",
    });
    assert.equal(state.longestRoadHolderId, "p0");
    assert.equal(state.largestArmyHolderId, "p0");
    assert.equal(playerScore(state, "p0").publicScore, 4);
  });

  it("keeps Largest Army on a tie and transfers only to a strict leader", () => {
    let state = actionState();
    let players = new Map(state.players);
    players.set("p0", { ...players.get("p0")!, playedKnights: 3 });
    players.set("p1", { ...players.get("p1")!, playedKnights: 3 });
    state = { ...state, players };
    assert.equal(resolveLargestArmyHolder(state, "p0"), "p0");
    players = new Map(players);
    players.set("p1", { ...players.get("p1")!, playedKnights: 4 });
    assert.equal(resolveLargestArmyHolder({ ...state, players }, "p0"), "p1");
  });

  it("reveals a same-turn Victory Point card only when it establishes a win", () => {
    let state = withStructures(actionState(), "p0", 4, 1);
    const granted = grantVictoryPoint(state, "p0");
    const extra = grantVictoryPoint(granted.state, "p0");
    state = extra.state;
    assert.equal(playerScore(state, "p0").publicScore, 9);
    assert.equal(playerScore(state, "p0").authoritativeScore, 11);
    state = accepted(state, "p0", {
      type: "REVEAL_VICTORY_POINTS",
      cardIds: [granted.cardId],
    });
    assert.deepEqual(state.phase, { kind: "game-over", winnerId: "p0" });
    assert.equal(playerScore(state, "p0").publicScore, 10);
    const view = createGameOverView(state);
    assert.equal(view.winnerId, "p0");
    assert.equal(view.players.find((row) => row.playerId === "p0")?.rank, 1);
    assert.equal(view.players.find((row) => row.playerId === "p0")?.victoryPointCards, 1);
    assert.equal(view.players.find((row) => row.playerId === "p0")?.finalScore, 10);

    const wonEvent = {
      sequence: 100,
      type: "GAME_WON" as const,
      winnerId: "p0",
      publicScore: 10,
      authoritativeScore: 11,
    };
    const publicEvent = projectScoringEvent(wonEvent);
    assert.equal("authoritativeScore" in publicEvent, false);

    const afterGame = handleCommand(state, {
      commandId: "too-late",
      expectedVersion: state.version,
      actorId: "p0",
      command: { type: "END_SUBTURN" },
    });
    assert.equal(afterGame.accepted, false);
    assert.equal(afterGame.code, "GAME_ALREADY_OVER");
  });

  it("rejects a Victory Point reveal that does not reach ten", () => {
    const state = withStructures(actionState(), "p0", 4, 0);
    const granted = grantVictoryPoint(state, "p0");
    const result = handleCommand(granted.state, {
      commandId: "not-winning",
      expectedVersion: granted.state.version,
      actorId: "p0",
      command: { type: "REVEAL_VICTORY_POINTS", cardIds: [granted.cardId] },
    });
    assert.equal(result.accepted, false);
    assert.equal(result.code, "VICTORY_REVEAL_NOT_WINNING");
  });

  it("ends immediately when a city raises the active player to ten public points", () => {
    let state = withStructures(actionState(), "p0", 3, 3);
    const settlement = [...state.occupancy.buildingsByVertex.entries()].find(([, building]) =>
      building.playerId === "p0" && building.kind === "settlement")?.[0];
    assert.ok(settlement);
    state = fundCity(state, "p0");
    state = accepted(state, "p0", { type: "BUILD_CITY", vertexId: settlement });
    assert.deepEqual(state.phase, { kind: "game-over", winnerId: "p0" });
    assert.equal(playerScore(state, "p0").publicScore, 10);
  });

  it("gives Player 1 victory priority before Player 2's window opens", () => {
    let state = withStructures(actionState(), "p0", 4, 2);
    state = withStructures(state, "p3", 4, 2);
    state = accepted(state, "p0", { type: "END_SUBTURN" });
    assert.deepEqual(state.phase, { kind: "game-over", winnerId: "p0" });
  });
});
