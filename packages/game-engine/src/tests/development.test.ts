import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BUILD_COSTS,
  DEVELOPMENT_CARD_COUNTS,
  addResources,
  assertGameStateInvariants,
  checkRoadPlacement,
  checkSettlementPlacement,
  createDevelopmentDeck,
  createGame,
  createResourceBundle,
  handleCommand,
  longestRoadLengths,
  playerIdAtSeat,
  playerOneId,
  playerTwoId,
  projectDevelopmentEventForViewer,
  reduceEvents,
  resolveLongestRoadHolder,
  subtractResources,
  totalResources,
} from "../index.ts";
import type {
  CommandContext,
  DevelopmentCardType,
  GameCommand,
  GameState,
  PlayerId,
  ResourceBundle,
} from "../index.ts";

const PLAYERS = Array.from({ length: 5 }, (_, index) => ({
  id: `p${index}`,
  name: `Player ${index}`,
}));

function dispatch(
  state: GameState,
  actorId: PlayerId,
  command: GameCommand,
  context?: CommandContext,
): GameState {
  const result = handleCommand(state, {
    commandId: `dev-command-${state.version + 1}`,
    expectedVersion: state.version,
    actorId,
    command,
  }, context);
  if (!result.accepted) assert.fail(`${result.code}: ${result.detail ?? ""}`);
  assert.deepEqual(reduceEvents(state, result.events), result.state);
  assertGameStateInvariants(result.state);
  return result.state;
}

function completeSetup(): GameState {
  let state = createGame({
    id: "development-test",
    seed: "development-test",
    players: PLAYERS,
    startingPlayerSeat: 0,
  });
  while (state.phase.kind === "setup") {
    const actorId = playerIdAtSeat(state, state.phase.seat);
    if (state.phase.step === "settlement") {
      const player = state.players.get(actorId)!;
      const vertexId = state.layout.topology.vertexIds.find((candidate) =>
        checkSettlementPlacement(
          state.layout.topology,
          state.occupancy,
          actorId,
          candidate,
          { setup: true, pieces: player.pieces },
        ).legal,
      );
      assert.ok(vertexId);
      state = dispatch(state, actorId, { type: "PLACE_INITIAL_SETTLEMENT", vertexId });
    } else {
      const vertexId = state.phase.pendingSettlementVertexId!;
      const edgeId = state.layout.topology.vertices.get(vertexId)!.adjacentEdgeIds.find(
        (candidate) => !state.occupancy.roadsByEdge.has(candidate),
      );
      assert.ok(edgeId);
      state = dispatch(state, actorId, { type: "PLACE_INITIAL_ROAD", edgeId });
    }
  }
  return state;
}

function actionState(): GameState {
  const state = completeSetup();
  return dispatch(
    state,
    playerOneId(state),
    { type: "ROLL_DICE" },
    { rollDice: () => [1, 1] },
  );
}

function fund(
  state: GameState,
  playerId: PlayerId,
  resources: ResourceBundle,
): GameState {
  const player = state.players.get(playerId)!;
  const players = new Map(state.players);
  players.set(playerId, { ...player, hand: addResources(player.hand, resources) });
  return { ...state, players, bank: subtractResources(state.bank, resources) };
}

function grantCard(
  state: GameState,
  playerId: PlayerId,
  type: DevelopmentCardType,
  purchasedPlayerTurn = state.players.get(playerId)!.playerTurnSequence - 1,
): { readonly state: GameState; readonly cardId: `dev:${number}` } {
  const index = state.developmentDeck.findIndex((card) => card.type === type);
  assert.notEqual(index, -1);
  const definition = state.developmentDeck[index]!;
  const developmentDeck = state.developmentDeck.filter((_, cardIndex) => cardIndex !== index);
  const player = state.players.get(playerId)!;
  const players = new Map(state.players);
  players.set(playerId, {
    ...player,
    developmentCards: [
      ...player.developmentCards,
      { ...definition, purchasedPlayerTurn },
    ],
  });
  const next = { ...state, developmentDeck, players };
  assertGameStateInvariants(next);
  return { state: next, cardId: definition.id };
}

describe("development cards", () => {
  it("creates the official deterministic 34-card deck", () => {
    const first = createDevelopmentDeck("same-seed");
    const second = createDevelopmentDeck("same-seed");
    assert.deepEqual(first, second);
    assert.equal(first.length, 34);
    assert.equal(new Set(first.map((card) => card.id)).size, 34);
    for (const [type, count] of Object.entries(DEVELOPMENT_CARD_COUNTS)) {
      assert.equal(first.filter((card) => card.type === type).length, count);
    }
    assert.notDeepEqual(first, createDevelopmentDeck("other-seed"));
  });

  it("purchases the private top card atomically and prevents same-turn play", () => {
    let state = actionState();
    const actorId = playerOneId(state);
    const knightIndex = state.developmentDeck.findIndex((card) => card.type === "knight");
    const knight = state.developmentDeck[knightIndex]!;
    state = {
      ...state,
      developmentDeck: [
        knight,
        ...state.developmentDeck.filter((_, index) => index !== knightIndex),
      ],
    };
    state = fund(state, actorId, BUILD_COSTS.developmentCard);
    const result = handleCommand(state, {
      commandId: "buy-card",
      expectedVersion: state.version,
      actorId,
      command: { type: "BUY_DEVELOPMENT_CARD" },
    });
    assert.equal(result.accepted, true);
    if (!result.accepted) return;
    const purchase = result.events.find((event) => event.type === "DEVELOPMENT_CARD_PURCHASED");
    assert.ok(purchase && purchase.type === "DEVELOPMENT_CARD_PURCHASED");
    assert.equal(projectDevelopmentEventForViewer(purchase).privateCard, null);
    assert.equal(projectDevelopmentEventForViewer(purchase, actorId).privateCard?.type, "knight");
    state = result.state;
    assert.equal(state.developmentDeck.length, 33);

    const play = handleCommand(state, {
      commandId: "same-turn-play",
      expectedVersion: state.version,
      actorId,
      command: { type: "PLAY_DEVELOPMENT_CARD", cardId: knight.id },
    });
    assert.equal(play.accepted, false);
    assert.equal(play.code, "DEVELOPMENT_CARD_BOUGHT_THIS_TURN");
  });

  it("plays a pre-roll Knight, moves the robber without discards, and enforces the limit", () => {
    let state = completeSetup();
    const actorId = playerOneId(state);
    const first = grantCard(state, actorId, "knight");
    state = first.state;
    const second = grantCard(state, actorId, "monopoly");
    state = second.state;
    state = dispatch(state, actorId, {
      type: "PLAY_DEVELOPMENT_CARD",
      cardId: first.cardId,
    });
    assert.equal(state.phase.kind, "robber-move");
    assert.equal(state.players.get(actorId)!.playedKnights, 1);
    if (state.phase.kind !== "robber-move") return;
    assert.equal(state.phase.cause, "knight");
    assert.deepEqual(state.phase.returnPhase, { kind: "player1-pre-roll" });

    const destination = state.layout.topology.hexIds.find((hexId) =>
      hexId !== state.layout.robberHexId,
    )!;
    state = dispatch(state, actorId, { type: "MOVE_ROBBER", hexId: destination });
    if (state.phase.kind === "robber-steal") {
      const targetPlayerId = state.phase.eligibleTargetIds[0]!;
      state = dispatch(
        state,
        actorId,
        { type: "STEAL_FROM_PLAYER", targetPlayerId },
        { randomInteger: () => 0 },
      );
    }
    assert.equal(state.phase.kind, "player1-pre-roll");
    const secondPlay = handleCommand(state, {
      commandId: "second-card",
      expectedVersion: state.version,
      actorId,
      command: { type: "PLAY_DEVELOPMENT_CARD", cardId: second.cardId },
    });
    assert.equal(secondPlay.accepted, false);
    assert.equal(secondPlay.code, "DEVELOPMENT_CARD_LIMIT");
  });

  it("places two sequential free roads and returns to the action phase", () => {
    let state = actionState();
    const actorId = playerOneId(state);
    const granted = grantCard(state, actorId, "road-building");
    state = dispatch(granted.state, actorId, {
      type: "PLAY_DEVELOPMENT_CARD",
      cardId: granted.cardId,
    });
    assert.equal(state.phase.kind, "road-building");
    const handBefore = state.players.get(actorId)!.hand;
    const roadsBefore = state.players.get(actorId)!.pieces.roads;
    for (let placement = 0; placement < 2; placement += 1) {
      assert.equal(state.phase.kind, "road-building");
      const player = state.players.get(actorId)!;
      const edgeId = state.layout.topology.edgeIds.find((candidate) =>
        checkRoadPlacement(
          state.layout.topology,
          state.occupancy,
          actorId,
          candidate,
          { pieces: player.pieces },
        ).legal,
      );
      assert.ok(edgeId);
      state = dispatch(state, actorId, { type: "PLACE_FREE_ROAD", edgeId });
    }
    assert.equal(state.phase.kind, "player1-actions");
    assert.deepEqual(state.players.get(actorId)!.hand, handBefore);
    assert.equal(state.players.get(actorId)!.pieces.roads, roadsBefore - 2);
  });

  it("finishes Road Building immediately when no road pieces remain", () => {
    let state = actionState();
    const actorId = playerOneId(state);
    const player = state.players.get(actorId)!;
    const roadsByEdge = new Map(state.occupancy.roadsByEdge);
    const needed = player.pieces.roads;
    const availableEdges = state.layout.topology.edgeIds.filter((edgeId) =>
      !roadsByEdge.has(edgeId),
    ).slice(0, needed);
    assert.equal(availableEdges.length, needed);
    for (const edgeId of availableEdges) roadsByEdge.set(edgeId, { playerId: actorId });
    const players = new Map(state.players);
    players.set(actorId, { ...player, pieces: { ...player.pieces, roads: 0 } });
    state = {
      ...state,
      players,
      occupancy: { ...state.occupancy, roadsByEdge },
    };
    state = {
      ...state,
      longestRoadHolderId: resolveLongestRoadHolder(
        state.playerOrder,
        longestRoadLengths(state),
        state.longestRoadHolderId,
      ),
    };
    const granted = grantCard(state, actorId, "road-building");
    state = dispatch(granted.state, actorId, {
      type: "PLAY_DEVELOPMENT_CARD",
      cardId: granted.cardId,
    });
    assert.equal(state.phase.kind, "player1-actions");
    assert.equal(state.players.get(actorId)!.pieces.roads, 0);
  });

  it("takes two available resources with Year of Plenty", () => {
    let state = actionState();
    const actorId = playerOneId(state);
    const granted = grantCard(state, actorId, "year-of-plenty");
    state = dispatch(granted.state, actorId, {
      type: "PLAY_DEVELOPMENT_CARD",
      cardId: granted.cardId,
    });
    assert.equal(state.phase.kind, "year-of-plenty");
    const handBefore = totalResources(state.players.get(actorId)!.hand);
    const invalid = handleCommand(state, {
      commandId: "one-card-only",
      expectedVersion: state.version,
      actorId,
      command: { type: "TAKE_YEAR_OF_PLENTY", resources: createResourceBundle({ ore: 1 }) },
    });
    assert.equal(invalid.accepted, false);
    assert.equal(invalid.code, "INVALID_DEVELOPMENT_CHOICE");
    state = dispatch(state, actorId, {
      type: "TAKE_YEAR_OF_PLENTY",
      resources: createResourceBundle({ ore: 2 }),
    });
    assert.equal(state.phase.kind, "player1-actions");
    assert.equal(totalResources(state.players.get(actorId)!.hand), handBefore + 2);
  });

  it("takes the sole remaining bank card without deadlocking Year of Plenty", () => {
    let state = actionState();
    const actorId = playerOneId(state);
    const retainedBank = createResourceBundle({ brick: 1 });
    const drained = subtractResources(state.bank, retainedBank);
    const actor = state.players.get(actorId)!;
    const players = new Map(state.players);
    players.set(actorId, { ...actor, hand: addResources(actor.hand, drained) });
    state = { ...state, players, bank: retainedBank };
    const granted = grantCard(state, actorId, "year-of-plenty");
    state = dispatch(granted.state, actorId, {
      type: "PLAY_DEVELOPMENT_CARD",
      cardId: granted.cardId,
    });
    assert.equal(state.phase.kind, "year-of-plenty");
    if (state.phase.kind !== "year-of-plenty") return;
    assert.equal(state.phase.requiredCards, 1);
    state = dispatch(state, actorId, {
      type: "TAKE_YEAR_OF_PLENTY",
      resources: createResourceBundle({ brick: 1 }),
    });
    assert.equal(totalResources(state.bank), 0);
    assert.equal(state.phase.kind, "player1-actions");
  });

  it("transfers every named resource from opponents with Monopoly", () => {
    let state = actionState();
    const actorId = playerOneId(state);
    state = fund(state, "p1", createResourceBundle({ grain: 2 }));
    state = fund(state, "p2", createResourceBundle({ grain: 3 }));
    const granted = grantCard(state, actorId, "monopoly");
    state = dispatch(granted.state, actorId, {
      type: "PLAY_DEVELOPMENT_CARD",
      cardId: granted.cardId,
    });
    const actorGrainBefore = state.players.get(actorId)!.hand.grain;
    const opponentGrain = [...state.players.values()]
      .filter((player) => player.id !== actorId)
      .reduce((total, player) => total + player.hand.grain, 0);
    state = dispatch(state, actorId, {
      type: "CHOOSE_MONOPOLY_RESOURCE",
      resource: "grain",
    });
    for (const player of state.players.values()) {
      if (player.id !== actorId) assert.equal(player.hand.grain, 0);
    }
    assert.equal(state.players.get(actorId)!.hand.grain, actorGrainBefore + opponentGrain);
    assert.equal(state.phase.kind, "player1-actions");
  });

  it("allows Player 2 to play a progress card in their action window", () => {
    let state = actionState();
    const player1Id = playerOneId(state);
    const player2Id = playerTwoId(state);
    state = dispatch(state, player1Id, { type: "END_SUBTURN" });
    assert.equal(state.phase.kind, "player2-actions");
    const granted = grantCard(state, player2Id, "year-of-plenty");
    state = dispatch(granted.state, player2Id, {
      type: "PLAY_DEVELOPMENT_CARD",
      cardId: granted.cardId,
    });
    assert.equal(state.phase.kind, "year-of-plenty");
    state = dispatch(state, player2Id, {
      type: "TAKE_YEAR_OF_PLENTY",
      resources: createResourceBundle({ wool: 1, grain: 1 }),
    });
    assert.equal(state.phase.kind, "player2-actions");
    assert.equal(state.players.get(player2Id)!.developmentCardPlayedThisTurn, true);
  });

  it("rejects purchases when the deck is empty", () => {
    let state = actionState();
    const actorId = playerOneId(state);
    const player = state.players.get(actorId)!;
    const players = new Map(state.players);
    players.set(actorId, {
      ...player,
      developmentCards: [
        ...player.developmentCards,
        ...state.developmentDeck.map((card) => ({
          ...card,
          purchasedPlayerTurn: player.playerTurnSequence,
        })),
      ],
    });
    state = { ...state, players, developmentDeck: [] };
    assertGameStateInvariants(state);
    const result = handleCommand(state, {
      commandId: "empty-deck",
      expectedVersion: state.version,
      actorId,
      command: { type: "BUY_DEVELOPMENT_CARD" },
    });
    assert.equal(result.accepted, false);
    assert.equal(result.code, "DEVELOPMENT_DECK_EMPTY");
  });

  it("keeps Victory Point cards hidden until the scoring layer can reveal a win", () => {
    const state = actionState();
    const actorId = playerOneId(state);
    const granted = grantCard(state, actorId, "victory-point");
    const result = handleCommand(granted.state, {
      commandId: "premature-vp-reveal",
      expectedVersion: granted.state.version,
      actorId,
      command: { type: "PLAY_DEVELOPMENT_CARD", cardId: granted.cardId },
    });
    assert.equal(result.accepted, false);
    assert.equal(result.code, "INVALID_DEVELOPMENT_CARD");
    assert.equal(result.detail, "VICTORY_REVEAL_REQUIRES_WIN");
  });
});
