import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BUILD_COSTS,
  addResources,
  assertGameStateInvariants,
  checkRoadPlacement,
  checkSettlementPlacement,
  createGame,
  createResourceBundle,
  eligibleRobberTargets,
  handleCommand,
  playerIdAtSeat,
  playerOneId,
  playerTwoId,
  projectRobberEventForViewer,
  reduceEvents,
  subtractResources,
  totalResources,
} from "../index.ts";
import type {
  CommandContext,
  GameCommand,
  GameState,
  PlayerId,
  ResourceBundle,
} from "../index.ts";

const TEST_PLAYERS = Array.from({ length: 6 }, (_, seat) => ({
  id: `player-${seat}`,
  name: `Player ${seat}`,
}));

function newGame(startingPlayerSeat = 2, playerCount = 5): GameState {
  return createGame({
    id: "test-game",
    seed: "game-flow-seed",
    players: TEST_PLAYERS.slice(0, playerCount),
    startingPlayerSeat,
  });
}

function dispatch(
  state: GameState,
  actorId: PlayerId,
  command: GameCommand,
  context?: CommandContext,
): GameState {
  const result = handleCommand(state, {
    commandId: `command-${state.version + 1}`,
    expectedVersion: state.version,
    actorId,
    command,
  }, context);
  if (!result.accepted) {
    assert.fail(`${result.code}${result.detail ? `: ${result.detail}` : ""}`);
  }
  assert.deepEqual(reduceEvents(state, result.events), result.state);
  assert.equal(result.state.version, state.version + 1);
  assertGameStateInvariants(result.state);
  return result.state;
}

function completeSetup(input = newGame()): {
  readonly state: GameState;
  readonly settlementOrder: readonly PlayerId[];
} {
  let state = input;
  const settlementOrder: PlayerId[] = [];

  while (state.phase.kind === "setup") {
    const actorId = playerIdAtSeat(state, state.phase.seat);
    if (state.phase.step === "settlement") {
      const actor = state.players.get(actorId);
      assert.ok(actor);
      const vertexId = state.layout.topology.vertexIds.find((candidate) =>
        checkSettlementPlacement(
          state.layout.topology,
          state.occupancy,
          actorId,
          candidate,
          { setup: true, pieces: actor.pieces },
        ).legal,
      );
      assert.ok(vertexId);
      settlementOrder.push(actorId);
      state = dispatch(state, actorId, { type: "PLACE_INITIAL_SETTLEMENT", vertexId });
    } else {
      const settlementVertexId = state.phase.pendingSettlementVertexId;
      assert.ok(settlementVertexId);
      const edgeId = state.layout.topology.vertices.get(settlementVertexId)?.adjacentEdgeIds.find(
        (candidate) => !state.occupancy.roadsByEdge.has(candidate),
      );
      assert.ok(edgeId);
      state = dispatch(state, actorId, { type: "PLACE_INITIAL_ROAD", edgeId });
    }
  }

  return { state, settlementOrder };
}

function fundPlayer(
  state: GameState,
  playerId: PlayerId,
  resources: ResourceBundle,
): GameState {
  const player = state.players.get(playerId);
  assert.ok(player);
  const players = new Map(state.players);
  players.set(playerId, { ...player, hand: addResources(player.hand, resources) });
  return { ...state, players, bank: subtractResources(state.bank, resources) };
}

function clearPlayerHand(state: GameState, playerId: PlayerId): GameState {
  const player = state.players.get(playerId);
  assert.ok(player);
  const players = new Map(state.players);
  players.set(playerId, { ...player, hand: createResourceBundle() });
  return { ...state, players, bank: addResources(state.bank, player.hand) };
}

function diceForTotal(total: number): readonly [number, number] {
  return total <= 7 ? [1, total - 1] : [6, total - 6];
}

function fundToHandSize(state: GameState, playerId: PlayerId, size: number): GameState {
  const player = state.players.get(playerId);
  assert.ok(player);
  const missing = size - totalResources(player.hand);
  assert.ok(missing >= 0);
  return fundPlayer(state, playerId, createResourceBundle({ brick: missing }));
}

function takeCards(hand: ResourceBundle, count: number): ResourceBundle {
  const result = { ...createResourceBundle() };
  let remaining = count;
  for (const resource of ["brick", "lumber", "wool", "grain", "ore"] as const) {
    const amount = Math.min(hand[resource], remaining);
    result[resource] = amount;
    remaining -= amount;
  }
  assert.equal(remaining, 0);
  return result;
}

describe("authoritative game flow", () => {
  it("runs complete forward/reverse setup from a non-zero starting seat", () => {
    const { state, settlementOrder } = completeSetup();

    assert.deepEqual(settlementOrder, [
      "player-2", "player-3", "player-4", "player-0", "player-1",
      "player-1", "player-0", "player-4", "player-3", "player-2",
    ]);
    assert.equal(state.phase.kind, "player1-pre-roll");
    assert.equal(state.pairedTurn, 1);
    assert.equal(playerOneId(state), "player-2");
    assert.equal(playerTwoId(state), "player-0");
    assert.equal(state.occupancy.buildingsByVertex.size, 10);
    assert.equal(state.occupancy.roadsByEdge.size, 10);
    for (const player of state.players.values()) {
      assert.deepEqual(player.pieces, { roads: 13, settlements: 3, cities: 4 });
    }
    assert.equal(state.players.get("player-2")?.playerTurnSequence, 1);
  });

  it("runs the six-player snake order across the seat boundary", () => {
    const { state, settlementOrder } = completeSetup(newGame(4, 6));
    assert.deepEqual(settlementOrder, [
      "player-4", "player-5", "player-0", "player-1", "player-2", "player-3",
      "player-3", "player-2", "player-1", "player-0", "player-5", "player-4",
    ]);
    assert.equal(playerOneId(state), "player-4");
    assert.equal(playerTwoId(state), "player-1");
    assert.equal(state.occupancy.buildingsByVertex.size, 12);
    assert.equal(state.occupancy.roadsByEdge.size, 12);
  });

  it("rejects illegal setup actions atomically", () => {
    const state = newGame();
    const wrongActor = handleCommand(state, {
      commandId: "wrong-actor",
      expectedVersion: state.version,
      actorId: "player-3",
      command: { type: "PLACE_INITIAL_SETTLEMENT", vertexId: state.layout.topology.vertexIds[0]! },
    });
    assert.equal(wrongActor.accepted, false);
    assert.equal(wrongActor.code, "NOT_YOUR_TURN");
    assert.equal(wrongActor.state, state);
    assert.equal(wrongActor.events.length, 0);

    const vertexId = state.layout.topology.vertexIds[0]!;
    const afterSettlement = dispatch(
      state,
      "player-2",
      { type: "PLACE_INITIAL_SETTLEMENT", vertexId },
    );
    const distantEdge = afterSettlement.layout.topology.edgeIds.find((edgeId) =>
      !afterSettlement.layout.topology.edges.get(edgeId)?.vertexIds.includes(vertexId),
    );
    assert.ok(distantEdge);
    const illegalRoad = handleCommand(afterSettlement, {
      commandId: "distant-road",
      expectedVersion: afterSettlement.version,
      actorId: "player-2",
      command: { type: "PLACE_INITIAL_ROAD", edgeId: distantEdge },
    });
    assert.equal(illegalRoad.accepted, false);
    assert.equal(illegalRoad.code, "ILLEGAL_PLACEMENT");
    assert.equal(illegalRoad.state, afterSettlement);
  });

  it("rolls, produces, opens Player 2, then advances both paired markers", () => {
    let { state } = completeSetup();
    const productiveTile = [...state.layout.tiles.values()].find((tile) =>
      tile.token && tile.id !== state.layout.robberHexId
      && state.layout.topology.hexes.get(tile.id)?.vertexIds.some((vertexId) =>
        state.occupancy.buildingsByVertex.has(vertexId),
      ),
    );
    assert.ok(productiveTile?.token);
    const dice = diceForTotal(productiveTile.token.value);
    state = dispatch(state, playerOneId(state), { type: "ROLL_DICE" }, { rollDice: () => dice });
    assert.equal(state.phase.kind, "player1-actions");
    assert.equal(state.lastDiceRoll, productiveTile.token.value);

    const player2Id = playerTwoId(state);
    state = dispatch(state, playerOneId(state), { type: "END_SUBTURN" });
    assert.equal(state.phase.kind, "player2-actions");
    assert.equal(state.players.get(player2Id)?.playerTurnSequence, 1);

    state = dispatch(state, player2Id, { type: "END_SUBTURN" });
    assert.equal(state.phase.kind, "player1-pre-roll");
    assert.equal(state.pairedTurn, 2);
    assert.equal(state.player1Seat, 3);
    assert.equal(playerOneId(state), "player-3");
    assert.equal(state.players.get("player-3")?.playerTurnSequence, 1);
    assert.equal(state.lastDiceRoll, null);
  });

  it("moves directly from roll 7 to a mandatory robber move when nobody discards", () => {
    let { state } = completeSetup();
    const rollerId = playerOneId(state);
    state = dispatch(state, rollerId, { type: "ROLL_DICE" }, { rollDice: () => [3, 4] });
    assert.deepEqual(state.phase, {
      kind: "robber-move",
      activePlayerId: rollerId,
      cause: "rolled-seven",
      returnPhase: { kind: "player1-actions" },
    });

    const endAttempt = handleCommand(state, {
      commandId: "cannot-skip-seven",
      expectedVersion: state.version,
      actorId: rollerId,
      command: { type: "END_SUBTURN" },
    });
    assert.equal(endAttempt.accepted, false);
    assert.equal(endAttempt.code, "WRONG_PHASE");
  });

  it("collects every required discard privately before allowing the robber move", () => {
    let { state } = completeSetup();
    state = fundToHandSize(state, "player-0", 8);
    state = fundToHandSize(state, "player-1", 9);
    assertGameStateInvariants(state);
    const rollerId = playerOneId(state);
    state = dispatch(state, rollerId, { type: "ROLL_DICE" }, { rollDice: () => [3, 4] });
    assert.equal(state.phase.kind, "discarding");
    if (state.phase.kind !== "discarding") return;
    assert.equal(state.phase.requiredByPlayer["player-0"], 4);
    assert.equal(state.phase.requiredByPlayer["player-1"], 4);

    const invalid = handleCommand(state, {
      commandId: "invalid-discard",
      expectedVersion: state.version,
      actorId: "player-0",
      command: { type: "SUBMIT_DISCARD", resources: createResourceBundle({ brick: 3 }) },
    });
    assert.equal(invalid.accepted, false);
    assert.equal(invalid.code, "INVALID_DISCARD");
    assert.equal(invalid.state, state);

    const firstCards = takeCards(state.players.get("player-1")!.hand, 4);
    state = dispatch(state, "player-1", { type: "SUBMIT_DISCARD", resources: firstCards });
    assert.equal(state.phase.kind, "discarding");

    const duplicate = handleCommand(state, {
      commandId: "duplicate-discard",
      expectedVersion: state.version,
      actorId: "player-1",
      command: { type: "SUBMIT_DISCARD", resources: firstCards },
    });
    assert.equal(duplicate.accepted, false);
    assert.equal(duplicate.code, "INVALID_DISCARD");

    const secondCards = takeCards(state.players.get("player-0")!.hand, 4);
    state = dispatch(state, "player-0", { type: "SUBMIT_DISCARD", resources: secondCards });
    assert.equal(state.phase.kind, "robber-move");
    assert.equal(totalResources(state.players.get("player-0")!.hand), 4);
    assert.equal(totalResources(state.players.get("player-1")!.hand), 5);
  });

  it("moves the robber, validates unique targets, and steals with server randomness", () => {
    let { state } = completeSetup();
    const rollerId = playerOneId(state);
    const destination = state.layout.topology.hexIds.find((hexId) =>
      hexId !== state.layout.robberHexId
      && eligibleRobberTargets(state, hexId, rollerId).length > 0,
    );
    assert.ok(destination);
    const targetId = eligibleRobberTargets(state, destination, rollerId)[0];
    assert.ok(targetId);
    if (totalResources(state.players.get(targetId)!.hand) === 0) {
      state = fundPlayer(state, targetId, createResourceBundle({ ore: 1 }));
    }
    state = dispatch(state, rollerId, { type: "ROLL_DICE" }, { rollDice: () => [3, 4] });

    const sameHex = handleCommand(state, {
      commandId: "same-robber-hex",
      expectedVersion: state.version,
      actorId: rollerId,
      command: { type: "MOVE_ROBBER", hexId: state.layout.robberHexId },
    });
    assert.equal(sameHex.accepted, false);
    assert.equal(sameHex.code, "INVALID_ROBBER_HEX");

    state = dispatch(state, rollerId, { type: "MOVE_ROBBER", hexId: destination });
    assert.equal(state.layout.robberHexId, destination);
    assert.equal(state.phase.kind, "robber-steal");
    if (state.phase.kind !== "robber-steal") return;
    const eligibleTargetIds = state.phase.eligibleTargetIds;
    assert.deepEqual(
      new Set(eligibleTargetIds).size,
      eligibleTargetIds.length,
    );

    const ineligibleId = state.playerOrder.find((playerId) =>
      playerId !== rollerId && !eligibleTargetIds.includes(playerId),
    );
    if (ineligibleId) {
      const invalidTarget = handleCommand(state, {
        commandId: "invalid-target",
        expectedVersion: state.version,
        actorId: rollerId,
        command: { type: "STEAL_FROM_PLAYER", targetPlayerId: ineligibleId },
      });
      assert.equal(invalidTarget.accepted, false);
      assert.equal(invalidTarget.code, "INVALID_STEAL_TARGET");
    }

    const missingRandomness = handleCommand(state, {
      commandId: "missing-randomness",
      expectedVersion: state.version,
      actorId: rollerId,
      command: { type: "STEAL_FROM_PLAYER", targetPlayerId: targetId },
    });
    assert.equal(missingRandomness.accepted, false);
    assert.equal(missingRandomness.code, "INVALID_RANDOM_RESULT");

    const targetSizeBefore = totalResources(state.players.get(targetId)!.hand);
    const result = handleCommand(state, {
      commandId: "random-steal",
      expectedVersion: state.version,
      actorId: rollerId,
      command: { type: "STEAL_FROM_PLAYER", targetPlayerId: targetId },
    }, { randomInteger: (maxExclusive) => maxExclusive - 1 });
    assert.equal(result.accepted, true);
    if (!result.accepted) return;
    assert.deepEqual(reduceEvents(state, result.events), result.state);
    const stolenEvent = result.events.find((event) => event.type === "RESOURCE_STOLEN");
    assert.ok(stolenEvent && stolenEvent.type === "RESOURCE_STOLEN");
    assert.notEqual(stolenEvent.resource, null);
    state = result.state;
    assert.equal(state.phase.kind, "player1-actions");
    assert.equal(totalResources(state.players.get(targetId)!.hand), targetSizeBefore - 1);
    assertGameStateInvariants(state);
  });

  it("allows an eligible empty-hand target and records that nothing was stolen", () => {
    let { state } = completeSetup();
    const rollerId = playerOneId(state);
    const destination = state.layout.topology.hexIds.find((hexId) =>
      hexId !== state.layout.robberHexId
      && eligibleRobberTargets(state, hexId, rollerId).length > 0,
    );
    assert.ok(destination);
    const targetId = eligibleRobberTargets(state, destination, rollerId)[0];
    assert.ok(targetId);
    state = clearPlayerHand(state, targetId);
    assertGameStateInvariants(state);
    state = dispatch(state, rollerId, { type: "ROLL_DICE" }, { rollDice: () => [3, 4] });
    state = dispatch(state, rollerId, { type: "MOVE_ROBBER", hexId: destination });
    assert.equal(state.phase.kind, "robber-steal");

    const result = handleCommand(state, {
      commandId: "empty-target",
      expectedVersion: state.version,
      actorId: rollerId,
      command: { type: "STEAL_FROM_PLAYER", targetPlayerId: targetId },
    });
    assert.equal(result.accepted, true);
    if (!result.accepted) return;
    const stolenEvent = result.events.find((event) => event.type === "RESOURCE_STOLEN");
    assert.ok(stolenEvent && stolenEvent.type === "RESOURCE_STOLEN");
    assert.equal(stolenEvent.resource, null);
    assert.equal(result.state.phase.kind, "player1-actions");
    assertGameStateInvariants(result.state);
  });

  it("redacts discard choices and stolen resource types from unrelated viewers", () => {
    const discard = {
      sequence: 10,
      type: "RESOURCES_DISCARDED" as const,
      playerId: "player-0",
      resources: createResourceBundle({ brick: 2, wool: 2 }),
    };
    assert.equal(projectRobberEventForViewer(discard).privateResources, null);
    assert.deepEqual(
      projectRobberEventForViewer(discard, "player-0").privateResources,
      discard.resources,
    );
    assert.equal(projectRobberEventForViewer(discard, "player-2").count, 4);

    const stolen = {
      sequence: 11,
      type: "RESOURCE_STOLEN" as const,
      playerId: "player-0",
      targetPlayerId: "player-1",
      resource: "ore" as const,
    };
    assert.equal(projectRobberEventForViewer(stolen, "player-3").privateResource, null);
    assert.equal(projectRobberEventForViewer(stolen, "player-0").privateResource, "ore");
    assert.equal(projectRobberEventForViewer(stolen, "player-1").privateResource, "ore");
    assert.equal(projectRobberEventForViewer(stolen).count, 1);
  });

  it("atomically pays for a road, settlement, and city", () => {
    let { state } = completeSetup();
    const actorId = playerOneId(state);
    state = dispatch(state, actorId, { type: "ROLL_DICE" }, { rollDice: () => [1, 1] });
    state = fundPlayer(state, actorId, BUILD_COSTS.road);
    assertGameStateInvariants(state);
    const actor = state.players.get(actorId);
    assert.ok(actor);
    const edgeId = state.layout.topology.edgeIds.find((candidate) =>
      checkRoadPlacement(
        state.layout.topology,
        state.occupancy,
        actorId,
        candidate,
        { pieces: actor.pieces },
      ).legal,
    );
    assert.ok(edgeId);
    const roadsBefore = actor.pieces.roads;
    state = dispatch(state, actorId, { type: "BUILD_ROAD", edgeId });
    assert.equal(state.occupancy.roadsByEdge.get(edgeId)?.playerId, actorId);
    assert.equal(state.players.get(actorId)?.pieces.roads, roadsBefore - 1);

    let settlementVertexId: (typeof state.layout.topology.vertexIds)[number] | undefined;
    for (let extension = 0; extension < 4 && !settlementVertexId; extension += 1) {
      const currentActor = state.players.get(actorId);
      assert.ok(currentActor);
      settlementVertexId = state.layout.topology.vertexIds.find((candidate) =>
        checkSettlementPlacement(
          state.layout.topology,
          state.occupancy,
          actorId,
          candidate,
          { pieces: currentActor.pieces },
        ).legal,
      );
      if (!settlementVertexId) {
        const extensionEdgeId = state.layout.topology.edgeIds.find((candidate) =>
          checkRoadPlacement(
            state.layout.topology,
            state.occupancy,
            actorId,
            candidate,
            { pieces: currentActor.pieces },
          ).legal,
        );
        assert.ok(extensionEdgeId);
        state = fundPlayer(state, actorId, BUILD_COSTS.road);
        state = dispatch(state, actorId, { type: "BUILD_ROAD", edgeId: extensionEdgeId });
      }
    }
    assert.ok(settlementVertexId);
    state = fundPlayer(state, actorId, BUILD_COSTS.settlement);
    state = dispatch(state, actorId, {
      type: "BUILD_SETTLEMENT",
      vertexId: settlementVertexId,
    });
    assert.equal(state.occupancy.buildingsByVertex.get(settlementVertexId)?.kind, "settlement");

    const settlementsBeforeUpgrade = state.players.get(actorId)?.pieces.settlements;
    const citiesBeforeUpgrade = state.players.get(actorId)?.pieces.cities;
    state = fundPlayer(state, actorId, BUILD_COSTS.city);
    state = dispatch(state, actorId, { type: "BUILD_CITY", vertexId: settlementVertexId });
    assert.equal(state.occupancy.buildingsByVertex.get(settlementVertexId)?.kind, "city");
    assert.equal(state.players.get(actorId)?.pieces.settlements, settlementsBeforeUpgrade! + 1);
    assert.equal(state.players.get(actorId)?.pieces.cities, citiesBeforeUpgrade! - 1);
  });

  it("enforces Player 1 domestic trading and permits Player 2 maritime trading", () => {
    let { state } = completeSetup();
    const player1Id = playerOneId(state);
    const partnerId = playerIdAtSeat(state, state.player1Seat + 1);
    state = dispatch(state, player1Id, { type: "ROLL_DICE" }, { rollDice: () => [1, 1] });
    state = fundPlayer(state, player1Id, createResourceBundle({ brick: 1 }));
    state = fundPlayer(state, partnerId, createResourceBundle({ wool: 1 }));
    state = dispatch(state, player1Id, {
      type: "DOMESTIC_TRADE",
      partnerId,
      actorGives: createResourceBundle({ brick: 1 }),
      partnerGives: createResourceBundle({ wool: 1 }),
    });
    assert.ok((state.players.get(player1Id)?.hand.wool ?? 0) >= 1);

    const player2Id = playerTwoId(state);
    state = dispatch(state, player1Id, { type: "END_SUBTURN" });
    const domesticAttempt = handleCommand(state, {
      commandId: "player2-domestic",
      expectedVersion: state.version,
      actorId: player2Id,
      command: {
        type: "DOMESTIC_TRADE",
        partnerId,
        actorGives: createResourceBundle({ brick: 1 }),
        partnerGives: createResourceBundle({ wool: 1 }),
      },
    });
    assert.equal(domesticAttempt.accepted, false);
    assert.equal(domesticAttempt.code, "WRONG_PHASE");
    assert.equal(domesticAttempt.state, state);

    state = fundPlayer(state, player2Id, createResourceBundle({ lumber: 4 }));
    state = dispatch(state, player2Id, {
      type: "MARITIME_TRADE",
      give: "lumber",
      receive: "ore",
    });
    assert.ok((state.players.get(player2Id)?.hand.ore ?? 0) >= 1);
  });

  it("rejects stale commands without emitting events", () => {
    const { state } = completeSetup();
    const result = handleCommand(state, {
      commandId: "stale",
      expectedVersion: state.version - 1,
      actorId: playerOneId(state),
      command: { type: "ROLL_DICE" },
    });
    assert.equal(result.accepted, false);
    assert.equal(result.code, "STALE_VERSION");
    assert.equal(result.state, state);
    assert.deepEqual(result.events, []);
  });
});
