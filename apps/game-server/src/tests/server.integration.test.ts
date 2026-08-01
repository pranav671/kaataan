import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { PlayerColor, PlayerSessionCredentials, ServerMessage } from "@kaataan/protocol";
import { WebSocket } from "ws";

import { createKaataanServer } from "../server.ts";

class TestClient {
  readonly socket: WebSocket;
  private readonly queue: ServerMessage[] = [];
  private readonly waiters: (() => void)[] = [];

  private constructor(socket: WebSocket) {
    this.socket = socket;
    socket.on("message", (data) => {
      this.queue.push(JSON.parse(data.toString()) as ServerMessage);
      for (const wake of this.waiters.splice(0)) wake();
    });
  }

  static connect(url: string): Promise<TestClient> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(url);
      socket.once("open", () => resolve(new TestClient(socket)));
      socket.once("error", reject);
    });
  }

  send(message: unknown): void {
    this.socket.send(JSON.stringify(message));
  }

  async waitFor<T extends ServerMessage>(predicate: (message: ServerMessage) => message is T): Promise<T> {
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline) {
      const index = this.queue.findIndex(predicate);
      if (index >= 0) return this.queue.splice(index, 1)[0] as T;
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          const waiterIndex = this.waiters.indexOf(resolve);
          if (waiterIndex >= 0) this.waiters.splice(waiterIndex, 1);
          reject(new Error("Timed out waiting for WebSocket message"));
        }, Math.max(1, deadline - Date.now()));
        this.waiters.push(() => {
          clearTimeout(timeout);
          resolve();
        });
      });
    }
    throw new Error("Timed out waiting for matching WebSocket message");
  }

  close(): Promise<void> {
    if (this.socket.readyState === WebSocket.CLOSED) return Promise.resolve();
    return new Promise((resolve) => {
      this.socket.once("close", () => resolve());
      this.socket.close();
    });
  }
}

const COLORS: readonly PlayerColor[] = ["teal", "coral", "gold", "blue", "plum"];

describe("WebSocket multiplayer gateway", () => {
  it("creates a room, synchronizes five clients, protects turns, and resumes a session", async () => {
    const server = createKaataanServer({ heartbeatIntervalMs: 60_000 });
    const address = await server.listen(0);
    const baseUrl = `http://${address.host}:${address.port}`;
    const socketUrl = `ws://${address.host}:${address.port}/socket`;
    const clients: TestClient[] = [];
    try {
      const health = await fetch(`${baseUrl}/health`);
      assert.equal(health.status, 200);
      assert.deepEqual(await health.json(), { ok: true, service: "kaataan-game-server" });

      const host = await TestClient.connect(socketUrl);
      clients.push(host);
      host.send({ type: "room.create", requestId: "create", profile: { name: "Player 1", color: COLORS[0] } });
      const created = await host.waitFor((message): message is Extract<ServerMessage, { type: "session.created" }> => message.type === "session.created");
      const sessions: PlayerSessionCredentials[] = [created.session];

      for (let index = 1; index < 5; index += 1) {
        const client = await TestClient.connect(socketUrl);
        clients.push(client);
        client.send({ type: "room.join", requestId: `join-${index}`, code: created.session.roomCode.toLowerCase(), profile: { name: `Player ${index + 1}`, color: COLORS[index] } });
        const joined = await client.waitFor((message): message is Extract<ServerMessage, { type: "session.created" }> => message.type === "session.created");
        sessions.push(joined.session);
      }

      clients.forEach((client, index) => client.send({ type: "room.set_ready", requestId: `ready-${index}`, ready: true }));
      await host.waitFor((message): message is Extract<ServerMessage, { type: "room.snapshot" }> =>
        message.type === "room.snapshot" && message.snapshot.members.length === 5
          && message.snapshot.members.every((member) => member.isReady));
      host.send({ type: "room.start", requestId: "start" });
      const started = await host.waitFor((message): message is Extract<ServerMessage, { type: "room.snapshot" }> =>
        message.type === "room.snapshot" && message.snapshot.status === "playing");
      assert.ok(started.snapshot.game);
      assert.equal(started.snapshot.game.ports.length, 11);
      assert.equal(started.snapshot.game.players.find((player) => player.id === created.session.playerId)?.hand !== null, true);
      assert.equal(started.snapshot.game.players.filter((player) => player.id !== created.session.playerId).every((player) => player.hand === null && player.developmentCards === null), true);

      const activeSeat = started.snapshot.game.phase.kind === "setup" ? started.snapshot.game.phase.seat : -1;
      const activeId = started.snapshot.game.playerOrder[activeSeat];
      const wrongIndex = sessions.findIndex((session) => session.playerId !== activeId);
      const wrongClient = clients[wrongIndex]!;
      wrongClient.send({
        type: "game.command",
        commandId: "wrong-turn",
        expectedVersion: started.snapshot.game.version,
        command: { type: "PLACE_INITIAL_SETTLEMENT", vertexId: started.snapshot.game.topology.vertices[0]!.id },
      });
      const rejected = await wrongClient.waitFor((message): message is Extract<ServerMessage, { type: "request.error" }> =>
        message.type === "request.error" && message.requestId === "wrong-turn");
      assert.equal(rejected.code, "NOT_YOUR_TURN");

      await clients[1]!.close();
      const offline = await host.waitFor((message): message is Extract<ServerMessage, { type: "room.snapshot" }> =>
        message.type === "room.snapshot" && message.snapshot.members.some((member) => member.id === sessions[1]!.playerId && !member.isConnected));
      assert.ok(offline);
      const resumedClient = await TestClient.connect(socketUrl);
      clients[1] = resumedClient;
      resumedClient.send({ type: "session.resume", requestId: "resume", ...sessions[1] });
      const resumed = await resumedClient.waitFor((message): message is Extract<ServerMessage, { type: "session.resumed" }> => message.type === "session.resumed");
      assert.equal(resumed.snapshot.viewerId, sessions[1]!.playerId);
      assert.equal(resumed.snapshot.game?.players.find((player) => player.id === sessions[1]!.playerId)?.hand !== null, true);

      const stranger = await TestClient.connect(socketUrl);
      clients.push(stranger);
      stranger.send({ type: "room.create", requestId: "bad", profile: { name: "X", color: "teal" }, unexpected: true });
      const invalid = await stranger.waitFor((message): message is Extract<ServerMessage, { type: "request.error" }> => message.type === "request.error");
      assert.equal(invalid.code, "INVALID_MESSAGE");
    } finally {
      await Promise.all(clients.map((client) => client.close()));
      await server.close();
    }
  });

  it("notifies a kicked lobby player, clears their binding, and keeps the room synchronized", async () => {
    const server = createKaataanServer({ heartbeatIntervalMs: 60_000 });
    const address = await server.listen(0);
    const socketUrl = `ws://${address.host}:${address.port}/socket`;
    const clients: TestClient[] = [];
    try {
      const host = await TestClient.connect(socketUrl);
      const guest = await TestClient.connect(socketUrl);
      clients.push(host, guest);
      host.send({ type: "room.create", requestId: "create-kick-room", profile: { name: "Host", color: "teal" } });
      const created = await host.waitFor((message): message is Extract<ServerMessage, { type: "session.created" }> => message.type === "session.created");
      guest.send({ type: "room.join", requestId: "join-kick-room", code: created.session.roomCode, profile: { name: "Guest", color: "coral" } });
      const joined = await guest.waitFor((message): message is Extract<ServerMessage, { type: "session.created" }> => message.type === "session.created");

      guest.send({ type: "room.kick", requestId: "guest-kick", playerId: created.session.playerId });
      const forbidden = await guest.waitFor((message): message is Extract<ServerMessage, { type: "request.error" }> => message.type === "request.error" && message.requestId === "guest-kick");
      assert.equal(forbidden.code, "HOST_ONLY");

      host.send({ type: "room.kick", requestId: "host-kick", playerId: joined.session.playerId });
      const kicked = await guest.waitFor((message): message is Extract<ServerMessage, { type: "session.kicked" }> => message.type === "session.kicked");
      assert.equal(kicked.roomCode, created.session.roomCode);
      const remaining = await host.waitFor((message): message is Extract<ServerMessage, { type: "room.snapshot" }> => message.type === "room.snapshot" && message.snapshot.members.length === 1);
      assert.equal(remaining.snapshot.members[0]?.id, created.session.playerId);

      guest.send({ type: "room.create", requestId: "create-after-kick", profile: { name: "New Host", color: "blue" } });
      const rebound = await guest.waitFor((message): message is Extract<ServerMessage, { type: "session.created" }> => message.type === "session.created" && message.requestId === "create-after-kick");
      assert.notEqual(rebound.session.roomCode, created.session.roomCode);
    } finally {
      await Promise.all(clients.map((client) => client.close()));
      await server.close();
    }
  });
});
