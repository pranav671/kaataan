import { randomUUID } from "node:crypto";
import { createServer, type Server as HttpServer } from "node:http";

import type { GameCommand, GameEvent } from "@kaataan/game-engine";
import { parseClientMessage, type ServerMessage } from "@kaataan/protocol";
import { WebSocket, WebSocketServer } from "ws";

import { RoomError } from "./errors.ts";
import { projectEventsForViewer } from "./projection.ts";
import { RoomManager } from "./roomManager.ts";

interface SocketSession {
  readonly roomCode: string;
  readonly playerId: string;
}

interface RateWindow {
  startedAt: number;
  count: number;
}

export interface KaataanServer {
  readonly httpServer: HttpServer;
  readonly rooms: RoomManager;
  readonly sockets: WebSocketServer;
  listen(port?: number, host?: string): Promise<{ readonly port: number; readonly host: string }>;
  close(): Promise<void>;
}

export interface CreateServerOptions {
  readonly rooms?: RoomManager;
  readonly heartbeatIntervalMs?: number;
  readonly maxMessagesPerWindow?: number;
  readonly rateWindowMs?: number;
}

function send(socket: WebSocket, message: ServerMessage): void {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

function requestIdOf(input: unknown): string {
  if (input && typeof input === "object") {
    const value = (input as { readonly requestId?: unknown; readonly commandId?: unknown }).requestId
      ?? (input as { readonly commandId?: unknown }).commandId;
    if (typeof value === "string" && value.length <= 100) return value;
  }
  return "unknown";
}

export function createKaataanServer(options: CreateServerOptions = {}): KaataanServer {
  const rooms = options.rooms ?? new RoomManager();
  const socketSessions = new Map<WebSocket, SocketSession>();
  const connectionIds = new Map<WebSocket, string>();
  const rateWindows = new Map<WebSocket, RateWindow>();
  const alive = new Map<WebSocket, boolean>();
  const maxMessages = options.maxMessagesPerWindow ?? 80;
  const rateWindowMs = options.rateWindowMs ?? 10_000;

  const httpServer = createServer((request, response) => {
    response.setHeader("content-type", "application/json; charset=utf-8");
    response.setHeader("access-control-allow-origin", "*");
    if (request.method === "GET" && request.url === "/health") {
      response.writeHead(200);
      response.end(JSON.stringify({ ok: true, service: "kaataan-game-server" }));
      return;
    }
    response.writeHead(404);
    response.end(JSON.stringify({ error: "not_found" }));
  });
  const sockets = new WebSocketServer({ server: httpServer, path: "/socket", maxPayload: 32 * 1024 });

  function bind(socket: WebSocket, session: SocketSession): void {
    socketSessions.set(socket, session);
  }

  function requireUnbound(socket: WebSocket): void {
    if (socketSessions.has(socket)) {
      throw new RoomError("SESSION_ALREADY_BOUND", "This connection already belongs to a player session");
    }
  }

  function broadcastRoom(roomCode: string, events?: readonly GameEvent[]): void {
    for (const [socket, session] of socketSessions) {
      if (session.roomCode !== roomCode || socket.readyState !== WebSocket.OPEN) continue;
      try {
        const snapshot = rooms.snapshotFor(roomCode, session.playerId);
        if (events) {
          send(socket, {
            type: "game.update",
            snapshot,
            events: projectEventsForViewer(events, session.playerId),
          });
        } else {
          send(socket, { type: "room.snapshot", snapshot });
        }
      } catch {
        socketSessions.delete(socket);
      }
    }
  }

  function checkRate(socket: WebSocket): boolean {
    const now = Date.now();
    const current = rateWindows.get(socket);
    if (!current || now - current.startedAt >= rateWindowMs) {
      rateWindows.set(socket, { startedAt: now, count: 1 });
      return true;
    }
    current.count += 1;
    return current.count <= maxMessages;
  }

  sockets.on("connection", (socket) => {
    const connectionId = randomUUID();
    connectionIds.set(socket, connectionId);
    alive.set(socket, true);
    socket.on("pong", () => alive.set(socket, true));

    socket.on("message", (data, isBinary) => {
      let raw: unknown;
      try {
        if (isBinary) throw new RoomError("BINARY_UNSUPPORTED", "Only JSON text messages are supported");
        if (!checkRate(socket)) throw new RoomError("RATE_LIMITED", "Too many messages; wait before trying again");
        raw = JSON.parse(data.toString()) as unknown;
        const message = parseClientMessage(raw);
        if (message.type === "ping") {
          send(socket, { type: "pong", timestamp: message.timestamp });
          return;
        }

        if (message.type === "room.create") {
          requireUnbound(socket);
          const result = rooms.createRoom(message.profile, connectionId);
          bind(socket, { roomCode: result.credentials.roomCode, playerId: result.credentials.playerId });
          send(socket, { type: "session.created", requestId: message.requestId, session: result.credentials, snapshot: result.snapshot });
          broadcastRoom(result.credentials.roomCode);
          return;
        }
        if (message.type === "room.join") {
          requireUnbound(socket);
          const result = rooms.joinRoom({ code: message.code, profile: message.profile }, connectionId);
          bind(socket, { roomCode: result.credentials.roomCode, playerId: result.credentials.playerId });
          send(socket, { type: "session.created", requestId: message.requestId, session: result.credentials, snapshot: result.snapshot });
          broadcastRoom(result.credentials.roomCode);
          return;
        }
        if (message.type === "session.resume") {
          requireUnbound(socket);
          const snapshot = rooms.resumeSession(message, connectionId);
          bind(socket, { roomCode: snapshot.code, playerId: message.playerId });
          send(socket, { type: "session.resumed", requestId: message.requestId, snapshot });
          broadcastRoom(snapshot.code);
          return;
        }

        const session = socketSessions.get(socket);
        if (!session) throw new RoomError("SESSION_REQUIRED", "Create, join, or resume a room first");
        if (message.type === "room.update_profile") {
          rooms.updateProfile(session.roomCode, session.playerId, message.profile);
          broadcastRoom(session.roomCode);
          return;
        }
        if (message.type === "room.set_ready") {
          rooms.setReady(session.roomCode, session.playerId, message.ready);
          broadcastRoom(session.roomCode);
          return;
        }
        if (message.type === "room.start") {
          rooms.startGame(session.roomCode, session.playerId);
          broadcastRoom(session.roomCode);
          return;
        }
        if (message.type === "room.leave") {
          const roomCode = session.roomCode;
          const deleted = rooms.leaveRoom(roomCode, session.playerId);
          socketSessions.delete(socket);
          if (!deleted) broadcastRoom(roomCode);
          return;
        }
        if (message.type === "room.kick") {
          rooms.kickMember(session.roomCode, session.playerId, message.playerId);
          for (const [targetSocket, targetSession] of socketSessions) {
            if (targetSession.roomCode !== session.roomCode || targetSession.playerId !== message.playerId) continue;
            send(targetSocket, { type: "session.kicked", roomCode: session.roomCode, message: "The host removed you from this room" });
            socketSessions.delete(targetSocket);
          }
          broadcastRoom(session.roomCode);
          return;
        }
        if (message.type === "trade.offer") {
          rooms.offerDomesticTrade(session.roomCode, session.playerId, message);
          broadcastRoom(session.roomCode);
          return;
        }
        if (message.type === "trade.accept") {
          const result = rooms.acceptDomesticTrade(
            session.roomCode,
            session.playerId,
            message.offerId,
            message.requestId,
          );
          broadcastRoom(result.roomCode, result.events);
          return;
        }
        if (message.type === "trade.counter") {
          rooms.counterDomesticTrade(session.roomCode, session.playerId, message);
          broadcastRoom(session.roomCode);
          return;
        }
        if (message.type === "trade.reject") {
          rooms.rejectDomesticTrade(session.roomCode, session.playerId, message.offerId);
          broadcastRoom(session.roomCode);
          return;
        }
        if (message.type === "trade.cancel") {
          rooms.cancelDomesticTrade(session.roomCode, session.playerId, message.offerId);
          broadcastRoom(session.roomCode);
          return;
        }
        if (message.type === "game.command") {
          const result = rooms.handleGameCommand(session.roomCode, session.playerId, {
            commandId: message.commandId,
            expectedVersion: message.expectedVersion,
            command: message.command as GameCommand,
          });
          broadcastRoom(result.roomCode, result.events);
        }
      } catch (error) {
        const requestId = requestIdOf(raw);
        if (error instanceof RoomError) {
          send(socket, { type: "request.error", requestId, code: error.code, message: error.message });
        } else {
          send(socket, { type: "request.error", requestId, code: "INVALID_MESSAGE", message: "The message did not match the protocol" });
        }
      }
    });

    socket.on("close", () => {
      const id = connectionIds.get(socket);
      socketSessions.delete(socket);
      connectionIds.delete(socket);
      rateWindows.delete(socket);
      alive.delete(socket);
      if (id) for (const roomCode of rooms.disconnect(id)) broadcastRoom(roomCode);
    });
  });

  const heartbeat = setInterval(() => {
    for (const socket of sockets.clients) {
      if (alive.get(socket) === false) {
        socket.terminate();
        continue;
      }
      alive.set(socket, false);
      socket.ping();
    }
  }, options.heartbeatIntervalMs ?? 30_000);
  heartbeat.unref();

  return {
    httpServer,
    rooms,
    sockets,
    listen(port = 4180, host = "127.0.0.1") {
      return new Promise((resolve, reject) => {
        const onError = (error: Error) => reject(error);
        httpServer.once("error", onError);
        httpServer.listen(port, host, () => {
          httpServer.off("error", onError);
          const address = httpServer.address();
          if (!address || typeof address === "string") return reject(new Error("Server address unavailable"));
          resolve({ port: address.port, host });
        });
      });
    },
    close() {
      clearInterval(heartbeat);
      for (const socket of sockets.clients) socket.terminate();
      return new Promise((resolve, reject) => {
        sockets.close(() => httpServer.close((error) => error ? reject(error) : resolve()));
      });
    },
  };
}
