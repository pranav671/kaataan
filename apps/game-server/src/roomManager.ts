import { randomBytes, randomInt, randomUUID, timingSafeEqual } from "node:crypto";

import {
  createGame,
  createVariableBoardLayout,
  createVariablePortPlacements,
  handleCommand,
  containsResources,
  playerIdAtSeat,
  RESOURCE_TYPES,
  totalResources,
  type GameCommand,
  type GameEvent,
  type GameState,
  type ResourceBundle,
} from "@kaataan/game-engine";
import type {
  PlayerColor,
  PlayerSessionCredentials,
  RoomMemberView,
  RoomSnapshot,
} from "@kaataan/protocol";

import { RoomError, requireRoom } from "./errors.ts";
import {
  deserializeGameState,
  serializeGameState,
  type PersistedRoom,
  type RoomPersistence,
} from "./persistence.ts";
import { projectGameForViewer } from "./projection.ts";

export interface RoomProfile {
  readonly name: string;
  readonly color: PlayerColor;
}

interface RoomMember {
  name: string;
  color: PlayerColor;
  readonly id: string;
  seat: number;
  readonly reconnectToken: string;
  readonly connectionIds: Set<string>;
  isReady: boolean;
}

interface RoomRecord {
  readonly code: string;
  readonly createdAt: number;
  hostId: string;
  readonly members: Map<string, RoomMember>;
  status: "lobby" | "playing" | "finished";
  game: GameState | null;
  readonly tradeOffers: Map<string, DomesticTradeOffer>;
}

interface DomesticTradeOffer {
  readonly id: string;
  readonly actorId: string;
  readonly partnerId: string;
  readonly proposedById: string;
  readonly actorGives: ResourceBundle;
  readonly partnerGives: ResourceBundle;
  readonly gameVersion: number;
  readonly createdAt: number;
}

export interface RoomManagerOptions {
  readonly createId?: () => string;
  readonly createToken?: () => string;
  readonly createCode?: () => string;
  readonly createSeed?: () => string;
  readonly randomInteger?: (maxExclusive: number) => number;
  readonly now?: () => number;
  readonly persistence?: RoomPersistence;
}

export interface SessionResult {
  readonly credentials: PlayerSessionCredentials;
  readonly snapshot: RoomSnapshot;
}

export interface GameCommandResult {
  readonly roomCode: string;
  readonly state: GameState;
  readonly events: readonly GameEvent[];
}

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function secureCode(): string {
  let result = "";
  for (let index = 0; index < 6; index += 1) result += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return result;
}

function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

export class RoomManager {
  private readonly rooms = new Map<string, RoomRecord>();
  private readonly createId: () => string;
  private readonly createToken: () => string;
  private readonly createCode: () => string;
  private readonly createSeed: () => string;
  private readonly integer: (maxExclusive: number) => number;
  private readonly now: () => number;
  private readonly persistence: RoomPersistence | undefined;

  constructor(options: RoomManagerOptions = {}) {
    this.createId = options.createId ?? randomUUID;
    this.createToken = options.createToken ?? (() => randomBytes(32).toString("base64url"));
    this.createCode = options.createCode ?? secureCode;
    this.createSeed = options.createSeed ?? (() => randomBytes(24).toString("hex"));
    this.integer = options.randomInteger ?? ((maximum) => randomInt(maximum));
    this.now = options.now ?? Date.now;
    this.persistence = options.persistence;
    for (const stored of this.persistence?.load() ?? []) this.restoreRoom(stored);
  }

  createRoom(profile: RoomProfile, connectionId: string): SessionResult {
    const code = this.uniqueCode();
    const member = this.createMember(profile, 0, connectionId);
    const room: RoomRecord = {
      code,
      createdAt: this.now(),
      hostId: member.id,
      members: new Map([[member.id, member]]),
      status: "lobby",
      game: null,
      tradeOffers: new Map(),
    };
    this.rooms.set(code, room);
    this.persist();
    return { credentials: this.credentials(room, member), snapshot: this.snapshotFor(code, member.id) };
  }

  joinRoom(input: { readonly code: string; readonly profile: RoomProfile }, connectionId: string): SessionResult {
    const room = this.getRoom(input.code);
    requireRoom(room.status === "lobby", "ROOM_ALREADY_STARTED", "This table has already started");
    requireRoom(room.members.size < 6, "ROOM_FULL", "This table already has six players");
    this.validateProfileAvailable(room, input.profile);
    const usedSeats = new Set([...room.members.values()].map((member) => member.seat));
    const seat = Array.from({ length: 6 }, (_, index) => index).find((candidate) => !usedSeats.has(candidate));
    if (seat === undefined) throw new RoomError("ROOM_FULL", "No seat is available");
    const member = this.createMember(input.profile, seat, connectionId);
    room.members.set(member.id, member);
    this.persist();
    return { credentials: this.credentials(room, member), snapshot: this.snapshotFor(room.code, member.id) };
  }

  resumeSession(input: {
    readonly roomCode: string;
    readonly playerId: string;
    readonly reconnectToken: string;
  }, connectionId: string): RoomSnapshot {
    const room = this.getRoom(input.roomCode);
    const member = room.members.get(input.playerId);
    requireRoom(member, "SESSION_NOT_FOUND", "That player session no longer exists");
    const expectedToken = Buffer.from(member.reconnectToken);
    const providedToken = Buffer.from(input.reconnectToken);
    requireRoom(
      expectedToken.length === providedToken.length
        && timingSafeEqual(expectedToken, providedToken),
      "INVALID_RECONNECT_TOKEN",
      "The reconnect credential is invalid",
    );
    member.connectionIds.add(connectionId);
    return this.snapshotFor(room.code, member.id);
  }

  updateProfile(roomCode: string, playerId: string, profile: RoomProfile): void {
    const room = this.getRoom(roomCode);
    requireRoom(room.status === "lobby", "ROOM_ALREADY_STARTED", "Profiles are locked after the game starts");
    const member = this.getMember(room, playerId);
    this.validateProfileAvailable(room, profile, playerId);
    member.name = profile.name;
    member.color = profile.color;
    this.persist();
  }

  setReady(roomCode: string, playerId: string, ready: boolean): void {
    const room = this.getRoom(roomCode);
    requireRoom(room.status === "lobby", "ROOM_ALREADY_STARTED", "Readiness is locked after the game starts");
    this.getMember(room, playerId).isReady = ready;
    this.persist();
  }

  startGame(roomCode: string, playerId: string): GameState {
    const room = this.getRoom(roomCode);
    requireRoom(room.status === "lobby", "ROOM_ALREADY_STARTED", "This game has already started");
    requireRoom(room.hostId === playerId, "HOST_ONLY", "Only the host can start the game");
    requireRoom(room.members.size >= 5 && room.members.size <= 6, "PLAYER_COUNT", "Five or six players are required");
    requireRoom([...room.members.values()].every((member) => member.isReady), "PLAYERS_NOT_READY", "Every player must be ready");
    requireRoom([...room.members.values()].every((member) => member.connectionIds.size > 0), "PLAYERS_OFFLINE", "Every player must be connected");
    const ordered = [...room.members.values()].sort((left, right) => left.seat - right.seat);
    const seed = this.createSeed();
    const layout = createVariableBoardLayout(seed);
    room.game = createGame({
      id: `game-${room.code}-${this.createId()}`,
      seed,
      players: ordered.map((member) => ({ id: member.id, name: member.name })),
      startingPlayerSeat: this.integer(ordered.length),
      layout,
      ports: createVariablePortPlacements(layout.topology, seed),
    });
    room.status = "playing";
    this.persist();
    return room.game;
  }

  handleGameCommand(
    roomCode: string,
    playerId: string,
    input: { readonly commandId: string; readonly expectedVersion: number; readonly command: GameCommand },
  ): GameCommandResult {
    const room = this.getRoom(roomCode);
    requireRoom(room.status === "playing", "GAME_NOT_ACTIVE", "This room does not have an active game");
    requireRoom(room.members.has(playerId), "NOT_A_MEMBER", "You are not seated at this table");
    if (!room.game) throw new RoomError("GAME_NOT_ACTIVE", "The game state is unavailable");
    if (input.command.type === "DOMESTIC_TRADE") {
      throw new RoomError("TRADE_ACCEPTANCE_REQUIRED", "Domestic trades require the other player to accept an offer");
    }
    return this.executeGameCommand(room, playerId, input);
  }

  offerDomesticTrade(roomCode: string, playerId: string, input: {
    readonly expectedVersion: number;
    readonly partnerId: string;
    readonly actorGives: ResourceBundle;
    readonly partnerGives: ResourceBundle;
  }): DomesticTradeOffer {
    const room = this.getRoom(roomCode);
    requireRoom(room.status === "playing" && room.game, "GAME_NOT_ACTIVE", "This room does not have an active game");
    const game = room.game;
    requireRoom(game.version === input.expectedVersion, "STALE_VERSION", "The game changed before this offer was created");
    requireRoom(game.phase.kind === "player1-actions", "WRONG_PHASE", "Domestic trades are available only during Player 1 actions");
    const activeId = playerIdAtSeat(game, game.player1Seat);
    requireRoom(activeId === playerId, "NOT_YOUR_TURN", "Only the active Player 1 can propose a domestic trade");
    const actor = game.players.get(playerId);
    const partner = game.players.get(input.partnerId);
    requireRoom(actor && partner, "UNKNOWN_PLAYER", "The selected trade partner is unavailable");
    this.validateProposal(input.actorGives, input.partnerGives);
    requireRoom(containsResources(actor.hand, input.actorGives), "INSUFFICIENT_RESOURCES", "You no longer have the resources offered");
    requireRoom(room.tradeOffers.size < 10, "TOO_MANY_OFFERS", "Resolve an existing offer before creating another");
    for (const [offerId, offer] of room.tradeOffers) {
      if (offer.actorId === playerId) room.tradeOffers.delete(offerId);
    }
    const offer: DomesticTradeOffer = {
      id: this.createId(),
      actorId: playerId,
      partnerId: input.partnerId,
      proposedById: playerId,
      actorGives: input.actorGives,
      partnerGives: input.partnerGives,
      gameVersion: game.version,
      createdAt: this.now(),
    };
    room.tradeOffers.set(offer.id, offer);
    this.persist();
    return offer;
  }

  counterDomesticTrade(roomCode: string, playerId: string, input: {
    readonly expectedVersion: number;
    readonly offerId: string;
    readonly actorGives: ResourceBundle;
    readonly partnerGives: ResourceBundle;
  }): DomesticTradeOffer {
    const room = this.getRoom(roomCode);
    requireRoom(room.status === "playing" && room.game, "GAME_NOT_ACTIVE", "This room does not have an active game");
    const existing = room.tradeOffers.get(input.offerId);
    requireRoom(existing, "OFFER_NOT_FOUND", "This trade offer is no longer available");
    requireRoom(existing.gameVersion === input.expectedVersion && room.game.version === input.expectedVersion, "OFFER_STALE", "The game changed after this offer was made");
    const recipientId = existing.proposedById === existing.actorId ? existing.partnerId : existing.actorId;
    requireRoom(playerId === recipientId, "NOT_TRADE_RECIPIENT", "Only the recipient can counter this offer");
    this.validateProposal(input.actorGives, input.partnerGives);
    const promised = playerId === existing.actorId ? input.actorGives : input.partnerGives;
    requireRoom(containsResources(room.game.players.get(playerId)!.hand, promised), "INSUFFICIENT_RESOURCES", "You no longer have the resources offered");
    const counter: DomesticTradeOffer = {
      ...existing,
      id: this.createId(),
      proposedById: playerId,
      actorGives: input.actorGives,
      partnerGives: input.partnerGives,
      createdAt: this.now(),
    };
    room.tradeOffers.delete(existing.id);
    room.tradeOffers.set(counter.id, counter);
    this.persist();
    return counter;
  }

  acceptDomesticTrade(roomCode: string, playerId: string, offerId: string, commandId: string): GameCommandResult {
    const room = this.getRoom(roomCode);
    requireRoom(room.status === "playing" && room.game, "GAME_NOT_ACTIVE", "This room does not have an active game");
    const offer = room.tradeOffers.get(offerId);
    requireRoom(offer, "OFFER_NOT_FOUND", "This trade offer is no longer available");
    const recipientId = offer.proposedById === offer.actorId ? offer.partnerId : offer.actorId;
    requireRoom(recipientId === playerId, "NOT_TRADE_RECIPIENT", "Only the recipient can accept this offer");
    requireRoom(offer.gameVersion === room.game.version, "OFFER_STALE", "The game changed after this offer was made");
    return this.executeGameCommand(room, offer.actorId, {
      commandId,
      expectedVersion: offer.gameVersion,
      command: {
        type: "DOMESTIC_TRADE",
        partnerId: offer.partnerId,
        actorGives: offer.actorGives,
        partnerGives: offer.partnerGives,
      },
    });
  }

  rejectDomesticTrade(roomCode: string, playerId: string, offerId: string): void {
    const room = this.getRoom(roomCode);
    const offer = room.tradeOffers.get(offerId);
    requireRoom(offer, "OFFER_NOT_FOUND", "This trade offer is no longer available");
    const recipientId = offer.proposedById === offer.actorId ? offer.partnerId : offer.actorId;
    requireRoom(recipientId === playerId, "NOT_TRADE_RECIPIENT", "Only the recipient can reject this offer");
    room.tradeOffers.delete(offerId);
    this.persist();
  }

  cancelDomesticTrade(roomCode: string, playerId: string, offerId: string): void {
    const room = this.getRoom(roomCode);
    const offer = room.tradeOffers.get(offerId);
    requireRoom(offer, "OFFER_NOT_FOUND", "This trade offer is no longer available");
    requireRoom(offer.proposedById === playerId, "NOT_TRADE_PROPOSER", "Only the proposing player can cancel this offer");
    room.tradeOffers.delete(offerId);
    this.persist();
  }

  private executeGameCommand(
    room: RoomRecord,
    playerId: string,
    input: { readonly commandId: string; readonly expectedVersion: number; readonly command: GameCommand },
  ): GameCommandResult {
    if (!room.game) throw new RoomError("GAME_NOT_ACTIVE", "The game state is unavailable");
    const result = handleCommand(room.game, {
      actorId: playerId,
      commandId: input.commandId,
      expectedVersion: input.expectedVersion,
      command: input.command,
    }, {
      rollDice: () => [this.integer(6) + 1, this.integer(6) + 1],
      randomInteger: (maximum) => this.integer(maximum),
    });
    if (!result.accepted) throw new RoomError(result.code, result.detail ?? "The game command was rejected");
    room.game = result.state;
    room.tradeOffers.clear();
    if (room.game.phase.kind === "game-over") room.status = "finished";
    this.persist();
    return { roomCode: room.code, state: room.game, events: result.events };
  }

  leaveRoom(roomCode: string, playerId: string): boolean {
    const room = this.getRoom(roomCode);
    requireRoom(room.status !== "playing", "GAME_IN_PROGRESS", "A seated player cannot leave an active game");
    requireRoom(room.members.delete(playerId), "NOT_A_MEMBER", "You are not in this room");
    if (room.members.size === 0) {
      this.rooms.delete(room.code);
      this.persist();
      return true;
    }
    if (room.hostId === playerId) {
      room.hostId = [...room.members.values()].sort((left, right) => left.seat - right.seat)[0]!.id;
    }
    [...room.members.values()]
      .sort((left, right) => left.seat - right.seat)
      .forEach((member, seat) => { member.seat = seat; });
    this.persist();
    return false;
  }

  kickMember(roomCode: string, hostId: string, targetPlayerId: string): void {
    const room = this.getRoom(roomCode);
    requireRoom(room.status === "lobby", "ROOM_ALREADY_STARTED", "Players cannot be removed after the game starts");
    requireRoom(room.hostId === hostId, "HOST_ONLY", "Only the host can remove a player");
    requireRoom(targetPlayerId !== hostId, "HOST_CANNOT_KICK_SELF", "Use Leave room to give up the host seat");
    requireRoom(room.members.delete(targetPlayerId), "NOT_A_MEMBER", "That player is no longer in this room");
    [...room.members.values()]
      .sort((left, right) => left.seat - right.seat)
      .forEach((member, seat) => { member.seat = seat; });
    this.persist();
  }

  disconnect(connectionId: string): string[] {
    const affected: string[] = [];
    for (const room of this.rooms.values()) {
      let changed = false;
      for (const member of room.members.values()) {
        if (member.connectionIds.delete(connectionId)) changed = true;
      }
      if (changed) affected.push(room.code);
    }
    return affected;
  }

  snapshotFor(roomCode: string, viewerId: string): RoomSnapshot {
    const room = this.getRoom(roomCode);
    this.getMember(room, viewerId);
    return {
      code: room.code,
      status: room.status,
      hostId: room.hostId,
      viewerId,
      members: [...room.members.values()]
        .sort((left, right) => left.seat - right.seat)
        .map((member): RoomMemberView => ({
          id: member.id,
          name: member.name,
          color: member.color,
          seat: member.seat,
          isHost: member.id === room.hostId,
          isReady: member.isReady,
          isConnected: member.connectionIds.size > 0,
        })),
      tradeOffers: [...room.tradeOffers.values()].map((offer) => ({ ...offer })),
      game: room.game ? projectGameForViewer(room.game, viewerId) : null,
    };
  }

  connectedMembers(roomCode: string): readonly string[] {
    const room = this.rooms.get(normalizeCode(roomCode));
    if (!room) return [];
    return [...room.members.values()].filter((member) => member.connectionIds.size > 0).map((member) => member.id);
  }

  roomExists(roomCode: string): boolean {
    return this.rooms.has(normalizeCode(roomCode));
  }

  private uniqueCode(): string {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const candidate = normalizeCode(this.createCode());
      if (/^[A-Z2-9]{4,12}$/.test(candidate) && !this.rooms.has(candidate)) return candidate;
    }
    throw new RoomError("CODE_EXHAUSTED", "Could not allocate a unique room code");
  }

  private createMember(profile: RoomProfile, seat: number, connectionId: string): RoomMember {
    return {
      id: this.createId(),
      name: profile.name,
      color: profile.color,
      seat,
      reconnectToken: this.createToken(),
      connectionIds: new Set([connectionId]),
      isReady: false,
    };
  }

  private credentials(room: RoomRecord, member: RoomMember): PlayerSessionCredentials {
    return { roomCode: room.code, playerId: member.id, reconnectToken: member.reconnectToken };
  }

  private validateProfileAvailable(room: RoomRecord, profile: RoomProfile, exceptId?: string): void {
    const others = [...room.members.values()].filter((member) => member.id !== exceptId);
    requireRoom(!others.some((member) => member.color === profile.color), "COLOR_TAKEN", "That color is already taken");
    requireRoom(!others.some((member) => member.name.toLocaleLowerCase() === profile.name.toLocaleLowerCase()), "NAME_TAKEN", "That display name is already in this room");
  }

  private validateProposal(actorGives: ResourceBundle, partnerGives: ResourceBundle): void {
    requireRoom(totalResources(actorGives) > 0 && totalResources(partnerGives) > 0, "EMPTY_TRADE_SIDE", "Both players must exchange at least one card");
    requireRoom(!RESOURCE_TYPES.some((resource) => actorGives[resource] > 0 && partnerGives[resource] > 0), "OVERLAPPING_TRADE", "The same resource cannot be offered on both sides");
  }

  private restoreRoom(stored: PersistedRoom): void {
    const members = new Map(stored.members.map((member) => [member.id, { ...member, connectionIds: new Set<string>() }]));
    this.rooms.set(normalizeCode(stored.code), {
      code: normalizeCode(stored.code),
      createdAt: stored.createdAt,
      hostId: stored.hostId,
      members,
      status: stored.status,
      game: stored.game ? deserializeGameState(stored.game) : null,
      tradeOffers: new Map(stored.tradeOffers.map((offer) => [offer.id, { ...offer }])),
    });
  }

  private persist(): void {
    if (!this.persistence) return;
    const rooms: PersistedRoom[] = [...this.rooms.values()].map((room) => ({
      code: room.code,
      createdAt: room.createdAt,
      hostId: room.hostId,
      members: [...room.members.values()].map((member) => ({
        id: member.id,
        name: member.name,
        color: member.color,
        seat: member.seat,
        reconnectToken: member.reconnectToken,
        isReady: member.isReady,
      })),
      status: room.status,
      game: room.game ? serializeGameState(room.game) : null,
      tradeOffers: [...room.tradeOffers.values()].map((offer) => ({ ...offer })),
    }));
    this.persistence.save(rooms);
  }

  private getRoom(code: string): RoomRecord {
    const room = this.rooms.get(normalizeCode(code));
    if (!room) throw new RoomError("ROOM_NOT_FOUND", "No room exists for that invite code");
    return room;
  }

  private getMember(room: RoomRecord, playerId: string): RoomMember {
    const member = room.members.get(playerId);
    if (!member) throw new RoomError("NOT_A_MEMBER", "You are not seated in this room");
    return member;
  }
}
