import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  checkRoadPlacement,
  checkSettlementPlacement,
  createResourceBundle,
  playerIdAtSeat,
  type GameCommand,
  type GameState,
} from "@kaataan/game-engine";
import type { PlayerColor } from "@kaataan/protocol";

import { RoomError } from "../errors.ts";
import { projectEventsForViewer } from "../projection.ts";
import { JsonFileRoomPersistence } from "../persistence.ts";
import { RoomManager } from "../roomManager.ts";

const COLORS: readonly PlayerColor[] = ["teal", "coral", "gold", "blue", "plum", "umber"];

function deterministicManager(extra: ConstructorParameters<typeof RoomManager>[0] = {}) {
  let id = 0;
  let token = 0;
  let code = 0;
  return new RoomManager({
    createId: () => `player-${++id}`,
    createToken: () => `reconnect-token-${++token}-secure`,
    createCode: () => `ROOM${++code}`,
    createSeed: () => "authoritative-secret-seed",
    randomInteger: () => 0,
    now: () => 1000,
    ...extra,
  });
}

function createTable(manager = deterministicManager(), count = 5) {
  const host = manager.createRoom({ name: "Player 1", color: COLORS[0]! }, "connection-1");
  const sessions = [host];
  for (let index = 1; index < count; index += 1) {
    sessions.push(manager.joinRoom({
      code: host.credentials.roomCode,
      profile: { name: `Player ${index + 1}`, color: COLORS[index]! },
    }, `connection-${index + 1}`));
  }
  return { manager, code: host.credentials.roomCode, sessions };
}

function expectRoomError(action: () => unknown, code: string): void {
  assert.throws(action, (error) => error instanceof RoomError && error.code === code);
}

function completeSetup(
  manager: RoomManager,
  code: string,
  initial: GameState,
): { readonly state: GameState; readonly lastEvents: ReturnType<typeof manager.handleGameCommand>["events"] } {
  let state = initial;
  let lastEvents: ReturnType<typeof manager.handleGameCommand>["events"] = [];
  while (state.phase.kind === "setup") {
    const actorId = playerIdAtSeat(state, state.phase.seat);
    let command: GameCommand;
    if (state.phase.step === "settlement") {
      const player = state.players.get(actorId)!;
      const vertexId = state.layout.topology.vertexIds.find((candidate) =>
        checkSettlementPlacement(state.layout.topology, state.occupancy, actorId, candidate, {
          setup: true,
          pieces: player.pieces,
        }).legal);
      assert.ok(vertexId);
      command = { type: "PLACE_INITIAL_SETTLEMENT", vertexId };
    } else {
      const player = state.players.get(actorId)!;
      const pendingVertexId = state.phase.pendingSettlementVertexId;
      assert.ok(pendingVertexId);
      const edgeId = state.layout.topology.edgeIds.find((candidate) =>
        checkRoadPlacement(state.layout.topology, state.occupancy, actorId, candidate, {
          pieces: player.pieces,
          setupSettlementVertexId: pendingVertexId,
        }).legal);
      assert.ok(edgeId);
      command = { type: "PLACE_INITIAL_ROAD", edgeId };
    }
    const result = manager.handleGameCommand(code, actorId, {
      commandId: `setup-${state.version + 1}`,
      expectedVersion: state.version,
      command,
    });
    state = result.state;
    lastEvents = result.events;
  }
  return { state, lastEvents };
}

describe("multiplayer room manager", () => {
  it("creates, joins, updates, and transfers a lobby host", () => {
    const { manager, code, sessions } = createTable(undefined, 2);
    assert.equal(manager.snapshotFor(code, sessions[0]!.credentials.playerId).members.length, 2);
    expectRoomError(() => manager.joinRoom({ code, profile: { name: "Different", color: "coral" } }, "duplicate-color"), "COLOR_TAKEN");
    expectRoomError(() => manager.joinRoom({ code, profile: { name: "player 2", color: "gold" } }, "duplicate-name"), "NAME_TAKEN");
    manager.updateProfile(code, sessions[1]!.credentials.playerId, { name: "Renamed", color: "blue" });
    assert.equal(manager.snapshotFor(code, sessions[0]!.credentials.playerId).members[1]?.name, "Renamed");
    assert.equal(manager.leaveRoom(code, sessions[0]!.credentials.playerId), false);
    assert.equal(manager.snapshotFor(code, sessions[1]!.credentials.playerId).hostId, sessions[1]!.credentials.playerId);
  });

  it("allows only the lobby host to remove another player and compacts seats", () => {
    const { manager, code, sessions } = createTable(undefined, 3);
    const hostId = sessions[0]!.credentials.playerId;
    const secondId = sessions[1]!.credentials.playerId;
    const thirdId = sessions[2]!.credentials.playerId;
    expectRoomError(() => manager.kickMember(code, secondId, thirdId), "HOST_ONLY");
    expectRoomError(() => manager.kickMember(code, hostId, hostId), "HOST_CANNOT_KICK_SELF");
    manager.kickMember(code, hostId, secondId);
    const snapshot = manager.snapshotFor(code, hostId);
    assert.equal(snapshot.members.length, 2);
    assert.equal(snapshot.members.some((member) => member.id === secondId), false);
    assert.equal(snapshot.members.find((member) => member.id === thirdId)?.seat, 1);
    expectRoomError(() => manager.resumeSession(sessions[1]!.credentials, "removed-player"), "SESSION_NOT_FOUND");
  });

  it("requires the host, valid player count, readiness, and presence to start", () => {
    const { manager, code, sessions } = createTable();
    expectRoomError(() => manager.startGame(code, sessions[1]!.credentials.playerId), "HOST_ONLY");
    expectRoomError(() => manager.startGame(code, sessions[0]!.credentials.playerId), "PLAYERS_NOT_READY");
    for (const session of sessions) manager.setReady(code, session.credentials.playerId, true);
    manager.disconnect("connection-5");
    expectRoomError(() => manager.startGame(code, sessions[0]!.credentials.playerId), "PLAYERS_OFFLINE");
    manager.resumeSession(sessions[4]!.credentials, "connection-5b");
    const state = manager.startGame(code, sessions[0]!.credentials.playerId);
    assert.equal(state.players.size, 5);
    assert.equal(state.ports.length, 11);
    assert.equal(manager.snapshotFor(code, sessions[0]!.credentials.playerId).status, "playing");
  });

  it("resumes securely and reports live presence without exposing credentials", () => {
    const { manager, code, sessions } = createTable(undefined, 2);
    const second = sessions[1]!;
    manager.disconnect("connection-2");
    assert.equal(manager.snapshotFor(code, sessions[0]!.credentials.playerId).members[1]?.isConnected, false);
    expectRoomError(() => manager.resumeSession({ ...second.credentials, reconnectToken: "wrong-token-that-is-long" }, "attacker"), "INVALID_RECONNECT_TOKEN");
    const resumed = manager.resumeSession(second.credentials, "connection-2b");
    assert.equal(resumed.members[1]?.isConnected, true);
    const serialized = JSON.stringify(resumed);
    assert.equal(serialized.includes(second.credentials.reconnectToken), false);
    assert.equal(serialized.includes("authoritative-secret-seed"), false);
  });

  it("runs commands authoritatively and projects private setup resources per viewer", () => {
    const { manager, code, sessions } = createTable();
    for (const session of sessions) manager.setReady(code, session.credentials.playerId, true);
    const started = manager.startGame(code, sessions[0]!.credentials.playerId);
    const completed = completeSetup(manager, code, started);
    assert.equal(completed.state.version, 20);
    const hostId = sessions[0]!.credentials.playerId;
    const secondId = sessions[1]!.credentials.playerId;
    const hostSnapshot = manager.snapshotFor(code, hostId).game!;
    const secondSnapshot = manager.snapshotFor(code, secondId).game!;
    assert.ok(hostSnapshot.players.find((player) => player.id === hostId)?.hand);
    assert.equal(hostSnapshot.players.find((player) => player.id === secondId)?.hand, null);
    assert.ok(secondSnapshot.players.find((player) => player.id === secondId)?.hand);
    assert.equal(secondSnapshot.players.find((player) => player.id === hostId)?.hand, null);
    assert.equal(hostSnapshot.players.every((player) => player.developmentCards === null || player.id === hostId), true);
    assert.equal(JSON.stringify(hostSnapshot).includes("authoritative-secret-seed"), false);

    const grants = completed.lastEvents.filter((event) => event.type === "STARTING_RESOURCES_GRANTED");
    assert.equal(grants.length, 0, "the final setup command is a road; grants occurred on settlement commands");
    const staleActor = playerIdAtSeat(completed.state, completed.state.player1Seat);
    expectRoomError(() => manager.handleGameCommand(code, staleActor, {
      commandId: "stale",
      expectedVersion: 0,
      command: { type: "ROLL_DICE" },
    }), "STALE_VERSION");
  });

  it("redacts production, discard, stolen-card, and development purchase secrets", () => {
    const owner = "player-1";
    const other = "player-2";
    const bundle = { brick: 1, lumber: 0, wool: 0, grain: 0, ore: 0 } as const;
    const events = [
      { sequence: 1, type: "STARTING_RESOURCES_GRANTED", playerId: owner, resources: bundle },
      { sequence: 2, type: "RESOURCES_DISCARDED", playerId: owner, resources: bundle },
      { sequence: 3, type: "RESOURCE_STOLEN", playerId: owner, targetPlayerId: other, resource: "brick" },
      { sequence: 4, type: "DEVELOPMENT_CARD_PURCHASED", playerId: owner, card: { id: "dev:1", type: "knight", purchasedPlayerTurn: 1 }, payment: bundle },
    ] as const;
    const ownerView = projectEventsForViewer(events, owner);
    const otherView = projectEventsForViewer(events, other);
    assert.deepEqual(ownerView[0]?.privateResources, bundle);
    assert.equal(otherView[0]?.privateResources, null);
    assert.deepEqual(ownerView[1]?.privateResources, bundle);
    assert.equal(otherView[1]?.privateResources, null);
    assert.equal(ownerView[2]?.privateResource, "brick");
    assert.equal(otherView[2]?.privateResource, "brick", "the victim also learns the stolen resource");
    assert.equal((ownerView[3]?.privateCard as { type?: string } | null)?.type, "knight");
    assert.equal(otherView[3]?.privateCard, null);
  });

  it("requires explicit partner acceptance for domestic trades", () => {
    const { manager, code, sessions } = createTable();
    for (const session of sessions) manager.setReady(code, session.credentials.playerId, true);
    let state = completeSetup(manager, code, manager.startGame(code, sessions[0]!.credentials.playerId)).state;
    const actorId = playerIdAtSeat(state, state.player1Seat);
    state = manager.handleGameCommand(code, actorId, {
      commandId: "roll-before-trade",
      expectedVersion: state.version,
      command: { type: "ROLL_DICE" },
    }).state;
    assert.equal(state.phase.kind, "player1-actions");
    const actor = state.players.get(actorId)!;
    const actorResource = (["brick", "lumber", "wool", "grain", "ore"] as const)
      .find((resource) => actor.hand[resource] > 0);
    assert.ok(actorResource);
    const partner = [...state.players.values()].find((candidate) => candidate.id !== actorId
      && (["brick", "lumber", "wool", "grain", "ore"] as const)
        .some((resource) => resource !== actorResource && candidate.hand[resource] > 0));
    assert.ok(partner);
    const partnerResource = (["brick", "lumber", "wool", "grain", "ore"] as const)
      .find((resource) => resource !== actorResource && partner.hand[resource] > 0);
    assert.ok(partnerResource);
    const actorGives = createResourceBundle({ [actorResource]: 1 });
    const partnerGives = createResourceBundle({ [partnerResource]: 1 });

    expectRoomError(() => manager.handleGameCommand(code, actorId, {
      commandId: "bypass-consent",
      expectedVersion: state.version,
      command: { type: "DOMESTIC_TRADE", partnerId: partner.id, actorGives, partnerGives },
    }), "TRADE_ACCEPTANCE_REQUIRED");
    const offer = manager.offerDomesticTrade(code, actorId, {
      expectedVersion: state.version,
      partnerId: partner.id,
      actorGives,
      partnerGives,
    });
    assert.equal(manager.snapshotFor(code, actorId).tradeOffers.length, 1);
    const unrelated = [...state.players.keys()].find((id) => id !== actorId && id !== partner.id)!;
    expectRoomError(() => manager.acceptDomesticTrade(code, unrelated, offer.id, "hijack"), "NOT_TRADE_RECIPIENT");
    const traded = manager.acceptDomesticTrade(code, partner.id, offer.id, "accepted-trade");
    assert.equal(traded.state.version, state.version + 1);
    assert.equal(traded.state.players.get(actorId)?.hand[actorResource], actor.hand[actorResource] - 1);
    assert.equal(traded.state.players.get(actorId)?.hand[partnerResource], actor.hand[partnerResource] + 1);
    assert.equal(manager.snapshotFor(code, actorId).tradeOffers.length, 0);
  });

  it("supports private-hand-safe multi-card proposals and negotiated counteroffers", () => {
    const { manager, code, sessions } = createTable();
    for (const session of sessions) manager.setReady(code, session.credentials.playerId, true);
    let state = completeSetup(manager, code, manager.startGame(code, sessions[0]!.credentials.playerId)).state;
    const actorId = playerIdAtSeat(state, state.player1Seat);
    state = manager.handleGameCommand(code, actorId, { commandId: "roll-for-counter", expectedVersion: state.version, command: { type: "ROLL_DICE" } }).state;
    const actor = state.players.get(actorId)!;
    const actorResource = (["brick", "lumber", "wool", "grain", "ore"] as const).find((resource) => actor.hand[resource] > 0)!;
    const partner = [...state.players.values()].find((candidate) => candidate.id !== actorId
      && (["brick", "lumber", "wool", "grain", "ore"] as const).some((resource) => resource !== actorResource && candidate.hand[resource] > 0))!;
    const partnerResource = (["brick", "lumber", "wool", "grain", "ore"] as const).find((resource) => resource !== actorResource && partner.hand[resource] > 0)!;
    const original = manager.offerDomesticTrade(code, actorId, {
      expectedVersion: state.version,
      partnerId: partner.id,
      actorGives: createResourceBundle({ [actorResource]: 1 }),
      partnerGives: createResourceBundle({ [partnerResource]: partner.hand[partnerResource] + 10 }),
    });
    assert.ok(original, "creating an offer must not reveal whether the recipient owns the requested cards");
    const counter = manager.counterDomesticTrade(code, partner.id, {
      expectedVersion: state.version,
      offerId: original.id,
      actorGives: createResourceBundle({ [actorResource]: 1 }),
      partnerGives: createResourceBundle({ [partnerResource]: 1 }),
    });
    assert.equal(counter.proposedById, partner.id);
    assert.equal(manager.snapshotFor(code, actorId).tradeOffers[0]?.id, counter.id);
    const result = manager.acceptDomesticTrade(code, actorId, counter.id, "accept-counter");
    assert.equal(result.state.version, state.version + 1);
  });

  it("persists rooms atomically and restores an active map-based game after restart", () => {
    const directory = mkdtempSync(join(tmpdir(), "kaataan-persistence-"));
    try {
      const filePath = join(directory, "rooms.json");
      const persistence = new JsonFileRoomPersistence(filePath);
      const first = deterministicManager({ persistence });
      const { code, sessions } = createTable(first);
      for (const session of sessions) first.setReady(code, session.credentials.playerId, true);
      const started = first.startGame(code, sessions[0]!.credentials.playerId);
      assert.equal(started.layout.topology.hexes.size, 30);

      const restored = deterministicManager({ persistence });
      const beforeResume = restored.snapshotFor(code, sessions[0]!.credentials.playerId);
      assert.equal(beforeResume.status, "playing");
      assert.equal(beforeResume.members.every((member) => !member.isConnected), true);
      const resumed = restored.resumeSession(sessions[0]!.credentials, "after-restart");
      assert.equal(resumed.members[0]?.isConnected, true);
      assert.equal(resumed.game?.topology.hexes.length, 30);
      assert.equal(resumed.game?.topology.vertices.length, 80);
      assert.equal(resumed.game?.topology.edges.length, 109);
      assert.equal(JSON.stringify(resumed).includes("authoritative-secret-seed"), false);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
