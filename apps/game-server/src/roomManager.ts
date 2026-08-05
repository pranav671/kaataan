import { randomBytes, randomInt, randomUUID, timingSafeEqual } from "node:crypto";

import {
  activePlayerId,
  checkRoadPlacement,
  checkSettlementPlacement,
  createResourceBundle,
  createGame,
  createVariableBoardLayout,
  createVariablePortPlacements,
  handleCommand,
  containsResources,
  RESOURCE_TYPES,
  totalResources,
  type GameCommand,
  type GameEvent,
  type GameState,
  type PlayerId,
  type ResourceBundle,
  type ResourceType,
} from "@kaataan/game-engine";
import type {
  PlayerColor,
  PlayerSessionCredentials,
  RoomMemberView,
  RoomSnapshot,
  TurnTimerSettings,
} from "@kaataan/protocol";

import { RoomError, requireRoom } from "./errors.ts";
import {
  deserializeGameState,
  serializeGameState,
  type PersistedRoom,
  type RoomPersistence,
} from "./persistence.ts";
import { projectEventsForViewer, projectGameForViewer } from "./projection.ts";

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
  timerSettings: TurnTimerSettings;
  gameEvents: GameEvent[];
  endedReason: "host-ended-offline" | null;
  turnDeadlineAt: number | null;
  deadlineKey: string | null;
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
export const DEFAULT_TURN_TIMER_SETTINGS: TurnTimerSettings = {
  setupSeconds: 120,
  rollSeconds: 60,
  actionSeconds: 60,
  robberSeconds: 60,
  discardSeconds: 60,
};

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
      timerSettings: DEFAULT_TURN_TIMER_SETTINGS,
      gameEvents: [],
      endedReason: null,
      turnDeadlineAt: null,
      deadlineKey: null,
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
    this.ensureConnectedHost(room);
    this.persist();
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

  updateTimerSettings(roomCode: string, playerId: string, settings: TurnTimerSettings): void {
    const room = this.getRoom(roomCode);
    requireRoom(room.status === "lobby", "ROOM_ALREADY_STARTED", "Turn timers are locked after the game starts");
    requireRoom(room.hostId === playerId, "HOST_ONLY", "Only the host can configure turn timers");
    requireRoom(Object.values(settings).every((seconds) => Number.isSafeInteger(seconds) && seconds >= 15 && seconds <= 600), "INVALID_TIMER_SETTINGS", "Every turn timer must be between 15 and 600 seconds");
    room.timerSettings = { ...settings };
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
    room.gameEvents = [];
    room.endedReason = null;
    this.refreshDeadline(room, true);
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
    requireRoom(game.phase.kind === "player1-actions" || game.phase.kind === "player2-actions", "WRONG_PHASE", "Domestic trades are available during either active player's actions");
    const activeId = activePlayerId(game);
    requireRoom(activeId === playerId, "NOT_YOUR_TURN", "Only the active player can propose a domestic trade");
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

  expireTurns(): readonly GameCommandResult[] {
    const results: GameCommandResult[] = [];
    const now = this.now();
    for (const room of this.rooms.values()) {
      if (room.status !== "playing" || !room.game || room.turnDeadlineAt === null) continue;
      if (room.turnDeadlineAt > now && !this.offlineAutoCommandDue(room)) continue;
      for (let guard = 0; guard < 4 && room.turnDeadlineAt !== null && (room.turnDeadlineAt <= now || this.offlineAutoCommandDue(room)); guard += 1) {
        const timedCommand = this.commandForExpiredTurn(room.game);
        if (!timedCommand) {
          this.refreshDeadline(room, true);
          break;
        }
        results.push(this.executeGameCommand(room, timedCommand.playerId, {
          commandId: `timeout-${now}-${room.game.version}`,
          expectedVersion: room.game.version,
          command: timedCommand.command,
        }));
      }
    }
    return results;
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
    room.gameEvents.push(...result.events);
    room.tradeOffers.clear();
    if (room.game.phase.kind === "game-over") room.status = "finished";
    this.refreshDeadline(room);
    this.persist();
    return { roomCode: room.code, state: room.game, events: result.events };
  }

  endGameForOfflinePlayers(roomCode: string, playerId: string): void {
    const room = this.getRoom(roomCode);
    requireRoom(room.status === "playing", "GAME_NOT_ACTIVE", "This room does not have an active game");
    requireRoom(room.hostId === playerId, "HOST_ONLY", "Only the host can end the game");
    const offlineCount = [...room.members.values()].filter((member) => member.connectionIds.size === 0).length;
    requireRoom(offlineCount > 2, "NOT_ENOUGH_OFFLINE", "At least three players must be offline before ending the game");
    room.status = "finished";
    room.endedReason = "host-ended-offline";
    room.tradeOffers.clear();
    this.refreshDeadline(room, true);
    this.persist();
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
      if (changed) {
        this.ensureConnectedHost(room);
        affected.push(room.code);
      }
    }
    if (affected.length > 0) this.persist();
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
      timerSettings: room.timerSettings,
      turnDeadlineAt: room.turnDeadlineAt,
      activity: projectEventsForViewer(room.gameEvents, viewerId),
      endedReason: room.endedReason,
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
      timerSettings: stored.timerSettings ?? DEFAULT_TURN_TIMER_SETTINGS,
      gameEvents: [...(stored.gameEvents ?? [])],
      endedReason: stored.endedReason ?? null,
      turnDeadlineAt: stored.turnDeadlineAt ?? null,
      deadlineKey: stored.deadlineKey ?? null,
    });
    const room = this.rooms.get(normalizeCode(stored.code));
    if (room?.status === "playing") this.refreshDeadline(room, room.turnDeadlineAt === null);
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
      timerSettings: room.timerSettings,
      gameEvents: room.gameEvents,
      endedReason: room.endedReason,
      turnDeadlineAt: room.turnDeadlineAt,
      deadlineKey: room.deadlineKey,
    }));
    this.persistence.save(rooms);
  }

  private getRoom(code: string): RoomRecord {
    const room = this.rooms.get(normalizeCode(code));
    if (!room) throw new RoomError("ROOM_NOT_FOUND", "No room exists for that invite code");
    return room;
  }

  private deadlineKeyFor(state: GameState): string | null {
    const phase = state.phase;
    if (phase.kind === "game-over") return null;
    if (phase.kind === "setup") return `setup:${phase.round}:${phase.seat}`;
    if (phase.kind === "discarding") {
      const playerId = Object.keys(phase.requiredByPlayer).find((id) => !phase.submittedPlayerIds.includes(id));
      return playerId ? `discard:${state.pairedTurn}:${playerId}` : null;
    }
    const playerId = activePlayerId(state);
    return playerId ? `turn:${state.pairedTurn}:${phase.kind}:${playerId}` : null;
  }

  private refreshDeadline(room: RoomRecord, force = false): void {
    if (!room.game || room.status !== "playing") {
      room.deadlineKey = null;
      room.turnDeadlineAt = null;
      return;
    }
    const key = this.deadlineKeyFor(room.game);
    if (key === null) {
      room.deadlineKey = null;
      room.turnDeadlineAt = null;
      return;
    }
    if (!force && key === room.deadlineKey && room.turnDeadlineAt !== null) return;
    room.deadlineKey = key;
    room.turnDeadlineAt = this.now() + this.deadlineSeconds(room.game, room.timerSettings) * 1_000;
  }

  private deadlineSeconds(state: GameState, settings: TurnTimerSettings): number {
    const phase = state.phase;
    if (phase.kind === "setup") return settings.setupSeconds;
    if (phase.kind === "player1-pre-roll") return settings.rollSeconds;
    if (phase.kind === "discarding") return settings.discardSeconds;
    if (phase.kind === "robber-move" || phase.kind === "robber-steal") return settings.robberSeconds;
    return settings.actionSeconds;
  }

  private offlineAutoCommandDue(room: RoomRecord): boolean {
    if (!room.game || (room.game.phase.kind !== "player1-pre-roll" && room.game.phase.kind !== "player1-actions" && room.game.phase.kind !== "player2-actions")) return false;
    const playerId = activePlayerId(room.game);
    return Boolean(playerId && room.members.get(playerId)?.connectionIds.size === 0);
  }

  private ensureConnectedHost(room: RoomRecord): void {
    const host = room.members.get(room.hostId);
    if (host && host.connectionIds.size > 0) return;
    const connected = [...room.members.values()].filter((member) => member.connectionIds.size > 0);
    if (connected.length === 0) return;
    const hostSeat = host?.seat ?? -1;
    const seatSpan = Math.max(...[...room.members.values()].map((member) => member.seat)) + 1;
    connected.sort((left, right) => {
      const leftDistance = (left.seat - hostSeat + seatSpan) % seatSpan;
      const rightDistance = (right.seat - hostSeat + seatSpan) % seatSpan;
      return leftDistance - rightDistance;
    });
    room.hostId = connected[0]!.id;
  }

  private commandForExpiredTurn(state: GameState): { readonly playerId: PlayerId; readonly command: GameCommand } | null {
    const phase = state.phase;
    if (phase.kind === "setup") {
      const playerId = activePlayerId(state);
      if (!playerId) return null;
      const player = state.players.get(playerId);
      if (!player) return null;
      if (phase.step === "settlement") {
        const vertexId = state.layout.topology.vertexIds.find((candidate) => checkSettlementPlacement(
          state.layout.topology,
          state.occupancy,
          playerId,
          candidate,
          { setup: true, pieces: player.pieces },
        ).legal);
        return vertexId ? { playerId, command: { type: "PLACE_INITIAL_SETTLEMENT", vertexId } } : null;
      }
      if (!phase.pendingSettlementVertexId) return null;
      const pendingSettlementVertexId = phase.pendingSettlementVertexId;
      const edgeId = state.layout.topology.edgeIds.find((candidate) => checkRoadPlacement(
        state.layout.topology,
        state.occupancy,
        playerId,
        candidate,
        { pieces: player.pieces, setupSettlementVertexId: pendingSettlementVertexId },
      ).legal);
      return edgeId ? { playerId, command: { type: "PLACE_INITIAL_ROAD", edgeId } } : null;
    }
    if (phase.kind === "discarding") {
      const playerId = Object.keys(phase.requiredByPlayer).find((id) => !phase.submittedPlayerIds.includes(id));
      if (!playerId) return null;
      const required = phase.requiredByPlayer[playerId] ?? 0;
      const hand = state.players.get(playerId)?.hand;
      if (!hand) return null;
      const resources = { ...createResourceBundle() } as Record<ResourceType, number>;
      let remaining = required;
      for (const resource of RESOURCE_TYPES) {
        const amount = Math.min(hand[resource], remaining);
        resources[resource] = amount;
        remaining -= amount;
      }
      return { playerId, command: { type: "SUBMIT_DISCARD", resources } };
    }
    const playerId = activePlayerId(state);
    if (!playerId) return null;
    if (phase.kind === "player1-pre-roll") return { playerId, command: { type: "ROLL_DICE" } };
    if (phase.kind === "player1-actions" || phase.kind === "player2-actions") return { playerId, command: { type: "END_SUBTURN" } };
    if (phase.kind === "robber-move") {
      const hexId = state.layout.topology.hexIds.find((id) => id !== state.layout.robberHexId);
      return hexId ? { playerId, command: { type: "MOVE_ROBBER", hexId } } : null;
    }
    if (phase.kind === "robber-steal") {
      const targetPlayerId = phase.eligibleTargetIds[0];
      return targetPlayerId ? { playerId, command: { type: "STEAL_FROM_PLAYER", targetPlayerId } } : null;
    }
    if (phase.kind === "road-building") {
      const player = state.players.get(playerId);
      const edgeId = player && state.layout.topology.edgeIds.find((candidate) => checkRoadPlacement(
        state.layout.topology,
        state.occupancy,
        playerId,
        candidate,
        { pieces: player.pieces },
      ).legal);
      return edgeId ? { playerId, command: { type: "PLACE_FREE_ROAD", edgeId } } : null;
    }
    if (phase.kind === "year-of-plenty") {
      const resources = { ...createResourceBundle() } as Record<ResourceType, number>;
      let remaining = phase.requiredCards;
      for (const resource of RESOURCE_TYPES) {
        const amount = Math.min(state.bank[resource], remaining);
        resources[resource] = amount;
        remaining -= amount;
      }
      return { playerId, command: { type: "TAKE_YEAR_OF_PLENTY", resources } };
    }
    if (phase.kind === "monopoly") {
      const resource = RESOURCE_TYPES.reduce((best, candidate) => {
        const count = [...state.players.values()].reduce((total, player) => total + (player.id === playerId ? 0 : player.hand[candidate]), 0);
        const bestCount = [...state.players.values()].reduce((total, player) => total + (player.id === playerId ? 0 : player.hand[best]), 0);
        return count > bestCount ? candidate : best;
      }, RESOURCE_TYPES[0] as ResourceType);
      return { playerId, command: { type: "CHOOSE_MONOPOLY_RESOURCE", resource } };
    }
    return null;
  }

  private getMember(room: RoomRecord, playerId: string): RoomMember {
    const member = room.members.get(playerId);
    if (!member) throw new RoomError("NOT_A_MEMBER", "You are not seated in this room");
    return member;
  }
}
