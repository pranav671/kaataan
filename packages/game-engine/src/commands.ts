import {
  checkCityPlacement,
  checkRoadPlacement,
  checkSettlementPlacement,
} from "./building.ts";
import { reduceEvents, sequenceEvents } from "./events.ts";
import type { GameEvent, UnsequencedGameEvent } from "./events.ts";
import type { DevelopmentCardId } from "./development.ts";
import {
  activePlayerId,
  playerIdAtSeat,
  playerOneId,
  playerTwoId,
} from "./gameState.ts";
import type { GamePhase, GameState } from "./gameState.ts";
import { assertGameStateInvariants } from "./invariants.ts";
import { calculateProduction } from "./production.ts";
import {
  longestRoadLengths,
  playerScore,
  resolveLargestArmyHolder,
  resolveLongestRoadHolder,
} from "./scoring.ts";
import {
  eligibleRobberTargets,
  requiredDiscardsByPlayer,
  resourceAtHandIndex,
} from "./robber.ts";
import {
  BUILD_COSTS,
  containsResources,
  emptyResourceBundle,
  totalResources,
} from "./resources.ts";
import {
  executeDomesticTrade,
  executeMaritimeTrade,
  getOwnedPortKinds,
  validateDomesticTrade,
  validateMaritimeTrade,
} from "./trade.ts";
import { TERRAIN_TO_RESOURCE } from "./types.ts";
import type {
  EdgeId,
  HexId,
  HexTile,
  PlayerId,
  ResourceBundle,
  ResourceType,
  VertexId,
} from "./types.ts";

export type GameCommand =
  | { readonly type: "PLACE_INITIAL_SETTLEMENT"; readonly vertexId: VertexId }
  | { readonly type: "PLACE_INITIAL_ROAD"; readonly edgeId: EdgeId }
  | { readonly type: "ROLL_DICE" }
  | { readonly type: "SUBMIT_DISCARD"; readonly resources: ResourceBundle }
  | { readonly type: "MOVE_ROBBER"; readonly hexId: HexId }
  | { readonly type: "STEAL_FROM_PLAYER"; readonly targetPlayerId: PlayerId }
  | { readonly type: "BUILD_ROAD"; readonly edgeId: EdgeId }
  | { readonly type: "BUILD_SETTLEMENT"; readonly vertexId: VertexId }
  | { readonly type: "BUILD_CITY"; readonly vertexId: VertexId }
  | { readonly type: "BUY_DEVELOPMENT_CARD" }
  | { readonly type: "PLAY_DEVELOPMENT_CARD"; readonly cardId: DevelopmentCardId }
  | { readonly type: "PLACE_FREE_ROAD"; readonly edgeId: EdgeId }
  | { readonly type: "TAKE_YEAR_OF_PLENTY"; readonly resources: ResourceBundle }
  | { readonly type: "CHOOSE_MONOPOLY_RESOURCE"; readonly resource: ResourceType }
  | {
    readonly type: "REVEAL_VICTORY_POINTS";
    readonly cardIds: readonly DevelopmentCardId[];
  }
  | {
    readonly type: "MARITIME_TRADE";
    readonly give: ResourceType;
    readonly receive: ResourceType;
    readonly units?: number;
  }
  | {
    readonly type: "DOMESTIC_TRADE";
    readonly partnerId: PlayerId;
    readonly actorGives: ResourceBundle;
    readonly partnerGives: ResourceBundle;
  }
  | { readonly type: "END_SUBTURN" };

export interface GameCommandEnvelope {
  readonly commandId: string;
  readonly expectedVersion: number;
  readonly actorId: PlayerId;
  readonly command: GameCommand;
}

export type CommandRejectionCode =
  | "STALE_VERSION"
  | "UNKNOWN_PLAYER"
  | "NOT_YOUR_TURN"
  | "WRONG_PHASE"
  | "ILLEGAL_PLACEMENT"
  | "INSUFFICIENT_RESOURCES"
  | "INVALID_TRADE"
  | "INVALID_DICE_RESULT"
  | "INVALID_DISCARD"
  | "INVALID_ROBBER_HEX"
  | "INVALID_STEAL_TARGET"
  | "INVALID_RANDOM_RESULT"
  | "DEVELOPMENT_DECK_EMPTY"
  | "INVALID_DEVELOPMENT_CARD"
  | "DEVELOPMENT_CARD_LIMIT"
  | "DEVELOPMENT_CARD_BOUGHT_THIS_TURN"
  | "INVALID_DEVELOPMENT_CHOICE"
  | "VICTORY_REVEAL_NOT_WINNING"
  | "GAME_ALREADY_OVER";

export interface RejectedCommand {
  readonly accepted: false;
  readonly code: CommandRejectionCode;
  readonly detail?: string;
  readonly state: GameState;
  readonly events: readonly [];
}

export interface AcceptedCommand {
  readonly accepted: true;
  readonly state: GameState;
  readonly events: readonly GameEvent[];
}

export type CommandResult = AcceptedCommand | RejectedCommand;

export interface CommandContext {
  readonly rollDice?: () => readonly [number, number];
  readonly randomInteger?: (maxExclusive: number) => number;
}

function reject(
  state: GameState,
  code: CommandRejectionCode,
  detail?: string,
): RejectedCommand {
  return detail === undefined
    ? { accepted: false, code, state, events: [] }
    : { accepted: false, code, detail, state, events: [] };
}

function accept(
  state: GameState,
  commandId: string,
  domainEvents: readonly UnsequencedGameEvent[],
): AcceptedCommand {
  const previewEvents = sequenceEvents(state, domainEvents);
  let preview = reduceEvents(state, previewEvents);
  const derivedEvents: UnsequencedGameEvent[] = [];

  const lengths = longestRoadLengths(preview);
  const longestRoadHolderId = resolveLongestRoadHolder(
    preview.playerOrder,
    lengths,
    preview.longestRoadHolderId,
  );
  if (longestRoadHolderId !== preview.longestRoadHolderId) {
    derivedEvents.push({
      type: "LONGEST_ROAD_HOLDER_CHANGED",
      previousHolderId: preview.longestRoadHolderId,
      holderId: longestRoadHolderId,
    });
  }

  const knightStillResolving = (preview.phase.kind === "robber-move"
    || preview.phase.kind === "robber-steal")
    && preview.phase.cause === "knight";
  if (!knightStillResolving) {
    const largestArmyHolderId = resolveLargestArmyHolder(preview, preview.largestArmyHolderId);
    if (largestArmyHolderId !== preview.largestArmyHolderId) {
      derivedEvents.push({
        type: "LARGEST_ARMY_HOLDER_CHANGED",
        previousHolderId: preview.largestArmyHolderId,
        holderId: largestArmyHolderId,
      });
    }
  }

  if (derivedEvents.length > 0) {
    preview = reduceEvents(preview, sequenceEvents(preview, derivedEvents));
  }

  if (!knightStillResolving && preview.phase.kind !== "game-over") {
    const openingPlayerTwo = state.phase.kind === "player1-actions"
      && preview.phase.kind === "player2-actions";
    const activeId = activePlayerId(preview);
    const eligiblePlayerIds = openingPlayerTwo
      ? [playerOneId(state), ...(activeId ? [activeId] : [])]
      : activeId ? [activeId] : [];
    for (const eligiblePlayerId of eligiblePlayerIds) {
      const score = playerScore(preview, eligiblePlayerId);
      if (score.publicScore >= 10) {
        derivedEvents.push({
          type: "GAME_WON",
          winnerId: eligiblePlayerId,
          publicScore: score.publicScore,
          authoritativeScore: score.authoritativeScore,
        });
        break;
      }
    }
  }

  const events = sequenceEvents(state, [
    ...domainEvents,
    ...derivedEvents,
    { type: "COMMAND_ACCEPTED", commandId },
  ]);
  const nextState = reduceEvents(state, events);
  assertGameStateInvariants(nextState);
  return { accepted: true, events, state: nextState };
}

function isActionPhase(phase: GamePhase): boolean {
  return phase.kind === "player1-actions" || phase.kind === "player2-actions";
}

function isDevelopmentPlayPhase(
  phase: GamePhase,
): phase is Extract<GamePhase, {
  readonly kind: "player1-pre-roll" | "player1-actions" | "player2-actions";
}> {
  return phase.kind === "player1-pre-roll" || isActionPhase(phase);
}

function hasLegalRoadPlacement(
  state: GameState,
  playerId: PlayerId,
  occupancy = state.occupancy,
  pieces = state.players.get(playerId)?.pieces,
): boolean {
  if (!pieces || pieces.roads <= 0) return false;
  return state.layout.topology.edgeIds.some((edgeId) =>
    checkRoadPlacement(
      state.layout.topology,
      occupancy,
      playerId,
      edgeId,
      { pieces },
    ).legal,
  );
}

function startingResourcesForVertex(state: GameState, vertexId: VertexId): ResourceBundle {
  const result = emptyResourceBundle();
  const vertex = state.layout.topology.vertices.get(vertexId);
  if (!vertex) throw new Error(`Unknown setup vertex ${vertexId}`);
  for (const hexId of vertex.adjacentHexIds) {
    const tile = state.layout.tiles.get(hexId) as HexTile | undefined;
    if (!tile || tile.terrain === "desert") continue;
    result[TERRAIN_TO_RESOURCE[tile.terrain]] += 1;
  }
  return result;
}

function setupPhaseAfterRoad(state: GameState): readonly UnsequencedGameEvent[] {
  if (state.phase.kind !== "setup" || state.phase.step !== "road") {
    throw new Error("Setup road transition requested outside setup road phase");
  }
  const count = state.playerOrder.length;
  const lastForwardSeat = (state.startingPlayerSeat + count - 1) % count;
  if (state.phase.round === "forward") {
    if (state.phase.seat !== lastForwardSeat) {
      return [{
        type: "PHASE_CHANGED",
        phase: {
          kind: "setup",
          round: "forward",
          step: "settlement",
          seat: (state.phase.seat + 1) % count,
        },
      }];
    }
    return [{
      type: "PHASE_CHANGED",
      phase: {
        kind: "setup",
        round: "reverse",
        step: "settlement",
        seat: lastForwardSeat,
      },
    }];
  }

  if (state.phase.seat !== state.startingPlayerSeat) {
    return [{
      type: "PHASE_CHANGED",
      phase: {
        kind: "setup",
        round: "reverse",
        step: "settlement",
        seat: (state.phase.seat - 1 + count) % count,
      },
    }];
  }

  const startingPlayerId = playerIdAtSeat(state, state.startingPlayerSeat);
  return [
    { type: "PAIRED_TURN_ADVANCED", player1Seat: state.startingPlayerSeat, pairedTurn: 1 },
    { type: "PLAYER_TURN_STARTED", playerId: startingPlayerId },
    { type: "PHASE_CHANGED", phase: { kind: "player1-pre-roll" } },
  ];
}

function payoutsToRecord(
  payouts: ReadonlyMap<PlayerId, ResourceBundle>,
): Readonly<Record<PlayerId, ResourceBundle>> {
  return Object.fromEntries(payouts) as Readonly<Record<PlayerId, ResourceBundle>>;
}

export function handleCommand(
  state: GameState,
  envelope: GameCommandEnvelope,
  context?: CommandContext,
): CommandResult {
  if (envelope.expectedVersion !== state.version) {
    return reject(state, "STALE_VERSION");
  }
  const actor = state.players.get(envelope.actorId);
  if (!actor) return reject(state, "UNKNOWN_PLAYER");

  const command = envelope.command;
  if (state.phase.kind === "game-over") return reject(state, "GAME_ALREADY_OVER");

  if (command.type === "PLACE_INITIAL_SETTLEMENT") {
    if (state.phase.kind !== "setup" || state.phase.step !== "settlement") {
      return reject(state, "WRONG_PHASE");
    }
    if (activePlayerId(state) !== envelope.actorId) return reject(state, "NOT_YOUR_TURN");
    const legality = checkSettlementPlacement(
      state.layout.topology,
      state.occupancy,
      envelope.actorId,
      command.vertexId,
      { setup: true, pieces: actor.pieces },
    );
    if (!legality.legal) return reject(state, "ILLEGAL_PLACEMENT", legality.code);
    const resources = startingResourcesForVertex(state, command.vertexId);
    if (state.phase.round === "reverse" && !containsResources(state.bank, resources)) {
      return reject(state, "INSUFFICIENT_RESOURCES", "BANK_CANNOT_GRANT_STARTING_RESOURCES");
    }
    const events: UnsequencedGameEvent[] = [{
      type: "INITIAL_SETTLEMENT_PLACED",
      playerId: envelope.actorId,
      vertexId: command.vertexId,
    }];
    if (state.phase.round === "reverse") {
      events.push({
        type: "STARTING_RESOURCES_GRANTED",
        playerId: envelope.actorId,
        resources,
      });
    }
    events.push({
      type: "PHASE_CHANGED",
      phase: {
        ...state.phase,
        step: "road",
        pendingSettlementVertexId: command.vertexId,
      },
    });
    return accept(state, envelope.commandId, events);
  }

  if (command.type === "PLACE_INITIAL_ROAD") {
    if (state.phase.kind !== "setup" || state.phase.step !== "road") {
      return reject(state, "WRONG_PHASE");
    }
    if (activePlayerId(state) !== envelope.actorId) return reject(state, "NOT_YOUR_TURN");
    const pendingSettlementVertexId = state.phase.pendingSettlementVertexId;
    if (!pendingSettlementVertexId) {
      throw new Error("Setup road phase is missing its settlement vertex");
    }
    const legality = checkRoadPlacement(
      state.layout.topology,
      state.occupancy,
      envelope.actorId,
      command.edgeId,
      {
        pieces: actor.pieces,
        setupSettlementVertexId: pendingSettlementVertexId,
      },
    );
    if (!legality.legal) return reject(state, "ILLEGAL_PLACEMENT", legality.code);
    return accept(state, envelope.commandId, [
      { type: "INITIAL_ROAD_PLACED", playerId: envelope.actorId, edgeId: command.edgeId },
      ...setupPhaseAfterRoad(state),
    ]);
  }

  if (command.type === "ROLL_DICE") {
    if (state.phase.kind !== "player1-pre-roll") return reject(state, "WRONG_PHASE");
    if (playerOneId(state) !== envelope.actorId) return reject(state, "NOT_YOUR_TURN");
    if (!context?.rollDice) return reject(state, "INVALID_DICE_RESULT", "DICE_PROVIDER_REQUIRED");
    const dice = context.rollDice();
    if (dice.length !== 2 || dice.some((die) => !Number.isSafeInteger(die) || die < 1 || die > 6)) {
      return reject(state, "INVALID_DICE_RESULT");
    }
    const total = dice[0] + dice[1];
    const events: UnsequencedGameEvent[] = [
      { type: "DICE_ROLLED", playerId: envelope.actorId, dice, total },
    ];
    if (total === 7) {
      const requiredByPlayer = requiredDiscardsByPlayer(state);
      events.push({
        type: "PHASE_CHANGED",
        phase: Object.keys(requiredByPlayer).length > 0
          ? {
            kind: "discarding",
            rollerId: envelope.actorId,
            requiredByPlayer,
            submittedPlayerIds: [],
          }
          : {
            kind: "robber-move",
            activePlayerId: envelope.actorId,
            cause: "rolled-seven",
            returnPhase: { kind: "player1-actions" },
          },
      });
    } else {
      const production = calculateProduction(
        state.layout,
        state.occupancy,
        total,
        state.bank,
      );
      events.push(
        { type: "PRODUCTION_DISTRIBUTED", payouts: payoutsToRecord(production.payouts) },
        { type: "PHASE_CHANGED", phase: { kind: "player1-actions" } },
      );
    }
    return accept(state, envelope.commandId, events);
  }

  if (command.type === "SUBMIT_DISCARD") {
    if (state.phase.kind !== "discarding") return reject(state, "WRONG_PHASE");
    const required = state.phase.requiredByPlayer[envelope.actorId];
    if (required === undefined || state.phase.submittedPlayerIds.includes(envelope.actorId)) {
      return reject(state, "INVALID_DISCARD", "PLAYER_DOES_NOT_OW_DISCARD");
    }
    if (totalResources(command.resources) !== required) {
      return reject(state, "INVALID_DISCARD", "WRONG_CARD_COUNT");
    }
    if (!containsResources(actor.hand, command.resources)) {
      return reject(state, "INVALID_DISCARD", "CARDS_NOT_IN_HAND");
    }
    const submittedPlayerIds = [...state.phase.submittedPlayerIds, envelope.actorId];
    const complete = submittedPlayerIds.length === Object.keys(state.phase.requiredByPlayer).length;
    return accept(state, envelope.commandId, [
      {
        type: "RESOURCES_DISCARDED",
        playerId: envelope.actorId,
        resources: command.resources,
      },
      {
        type: "PHASE_CHANGED",
        phase: complete
          ? {
            kind: "robber-move",
            activePlayerId: state.phase.rollerId,
            cause: "rolled-seven",
            returnPhase: { kind: "player1-actions" },
          }
          : { ...state.phase, submittedPlayerIds },
      },
    ]);
  }

  if (command.type === "MOVE_ROBBER") {
    if (state.phase.kind !== "robber-move") return reject(state, "WRONG_PHASE");
    if (state.phase.activePlayerId !== envelope.actorId) return reject(state, "NOT_YOUR_TURN");
    if (!state.layout.topology.hexes.has(command.hexId)) {
      return reject(state, "INVALID_ROBBER_HEX", "UNKNOWN_HEX");
    }
    if (command.hexId === state.layout.robberHexId) {
      return reject(state, "INVALID_ROBBER_HEX", "CURRENT_HEX");
    }
    const targets = eligibleRobberTargets(state, command.hexId, envelope.actorId);
    return accept(state, envelope.commandId, [
      {
        type: "ROBBER_MOVED",
        playerId: envelope.actorId,
        fromHexId: state.layout.robberHexId,
        toHexId: command.hexId,
        cause: state.phase.cause,
      },
      {
        type: "PHASE_CHANGED",
        phase: targets.length === 0
          ? state.phase.returnPhase
          : {
            kind: "robber-steal",
            activePlayerId: envelope.actorId,
            eligibleTargetIds: targets,
            cause: state.phase.cause,
            returnPhase: state.phase.returnPhase,
          },
      },
    ]);
  }

  if (command.type === "STEAL_FROM_PLAYER") {
    if (state.phase.kind !== "robber-steal") return reject(state, "WRONG_PHASE");
    if (state.phase.activePlayerId !== envelope.actorId) return reject(state, "NOT_YOUR_TURN");
    if (!state.phase.eligibleTargetIds.includes(command.targetPlayerId)) {
      return reject(state, "INVALID_STEAL_TARGET");
    }
    const target = state.players.get(command.targetPlayerId);
    if (!target) return reject(state, "UNKNOWN_PLAYER");
    const handSize = totalResources(target.hand);
    let resource: ResourceType | null = null;
    if (handSize > 0) {
      if (!context?.randomInteger) {
        return reject(state, "INVALID_RANDOM_RESULT", "RANDOM_PROVIDER_REQUIRED");
      }
      const index = context.randomInteger(handSize);
      if (!Number.isSafeInteger(index) || index < 0 || index >= handSize) {
        return reject(state, "INVALID_RANDOM_RESULT", "INDEX_OUT_OF_RANGE");
      }
      resource = resourceAtHandIndex(target.hand, index);
    }
    return accept(state, envelope.commandId, [
      {
        type: "RESOURCE_STOLEN",
        playerId: envelope.actorId,
        targetPlayerId: command.targetPlayerId,
        resource,
      },
      { type: "PHASE_CHANGED", phase: state.phase.returnPhase },
    ]);
  }

  if (command.type === "PLACE_FREE_ROAD") {
    if (state.phase.kind !== "road-building") return reject(state, "WRONG_PHASE");
    if (state.phase.activePlayerId !== envelope.actorId) return reject(state, "NOT_YOUR_TURN");
    const legality = checkRoadPlacement(
      state.layout.topology,
      state.occupancy,
      envelope.actorId,
      command.edgeId,
      { pieces: actor.pieces },
    );
    if (!legality.legal) return reject(state, "ILLEGAL_PLACEMENT", legality.code);

    const roadsByEdge = new Map(state.occupancy.roadsByEdge);
    roadsByEdge.set(command.edgeId, { playerId: envelope.actorId });
    const hypotheticalOccupancy = { ...state.occupancy, roadsByEdge };
    const hypotheticalPieces = { ...actor.pieces, roads: actor.pieces.roads - 1 };
    const remaining = state.phase.remainingRoads - 1;
    const canContinue = remaining > 0 && hasLegalRoadPlacement(
      state,
      envelope.actorId,
      hypotheticalOccupancy,
      hypotheticalPieces,
    );
    return accept(state, envelope.commandId, [
      {
        type: "ROAD_BUILT",
        playerId: envelope.actorId,
        edgeId: command.edgeId,
        payment: emptyResourceBundle(),
      },
      {
        type: "PHASE_CHANGED",
        phase: canContinue
          ? { ...state.phase, remainingRoads: 1 }
          : state.phase.returnPhase,
      },
    ]);
  }

  if (command.type === "TAKE_YEAR_OF_PLENTY") {
    if (state.phase.kind !== "year-of-plenty") return reject(state, "WRONG_PHASE");
    if (state.phase.activePlayerId !== envelope.actorId) return reject(state, "NOT_YOUR_TURN");
    if (totalResources(command.resources) !== state.phase.requiredCards) {
      return reject(state, "INVALID_DEVELOPMENT_CHOICE", "WRONG_CARD_COUNT");
    }
    if (!containsResources(state.bank, command.resources)) {
      return reject(state, "INVALID_DEVELOPMENT_CHOICE", "BANK_RESOURCES_MISSING");
    }
    return accept(state, envelope.commandId, [
      {
        type: "YEAR_OF_PLENTY_RESOLVED",
        playerId: envelope.actorId,
        resources: command.resources,
      },
      { type: "PHASE_CHANGED", phase: state.phase.returnPhase },
    ]);
  }

  if (command.type === "CHOOSE_MONOPOLY_RESOURCE") {
    if (state.phase.kind !== "monopoly") return reject(state, "WRONG_PHASE");
    if (state.phase.activePlayerId !== envelope.actorId) return reject(state, "NOT_YOUR_TURN");
    const takenByPlayer = Object.create(null) as Record<PlayerId, number>;
    for (const player of state.players.values()) {
      if (player.id !== envelope.actorId && player.hand[command.resource] > 0) {
        takenByPlayer[player.id] = player.hand[command.resource];
      }
    }
    return accept(state, envelope.commandId, [
      {
        type: "MONOPOLY_RESOLVED",
        playerId: envelope.actorId,
        resource: command.resource,
        takenByPlayer,
      },
      { type: "PHASE_CHANGED", phase: state.phase.returnPhase },
    ]);
  }

  if (command.type === "PLAY_DEVELOPMENT_CARD") {
    if (!isDevelopmentPlayPhase(state.phase)) return reject(state, "WRONG_PHASE");
    if (activePlayerId(state) !== envelope.actorId) return reject(state, "NOT_YOUR_TURN");
    const card = actor.developmentCards.find((candidate) => candidate.id === command.cardId);
    if (!card) return reject(state, "INVALID_DEVELOPMENT_CARD", "CARD_NOT_OWNED");
    if (card.type === "victory-point") {
      return reject(state, "INVALID_DEVELOPMENT_CARD", "VICTORY_REVEAL_REQUIRES_WIN");
    }
    if (actor.developmentCardPlayedThisTurn) {
      return reject(state, "DEVELOPMENT_CARD_LIMIT");
    }
    if (card.purchasedPlayerTurn >= actor.playerTurnSequence) {
      return reject(state, "DEVELOPMENT_CARD_BOUGHT_THIS_TURN");
    }
    const returnPhase = state.phase;
    const events: UnsequencedGameEvent[] = [{
      type: "DEVELOPMENT_CARD_PLAYED",
      playerId: envelope.actorId,
      card,
    }];
    if (card.type === "knight") {
      events.push({
        type: "PHASE_CHANGED",
        phase: {
          kind: "robber-move",
          activePlayerId: envelope.actorId,
          cause: "knight",
          returnPhase,
        },
      });
    } else if (card.type === "road-building") {
      const availableRoads = Math.min(2, actor.pieces.roads) as 0 | 1 | 2;
      if (availableRoads > 0 && hasLegalRoadPlacement(state, envelope.actorId)) {
        const remainingRoads = availableRoads as 1 | 2;
        events.push({
          type: "PHASE_CHANGED",
          phase: {
            kind: "road-building",
            activePlayerId: envelope.actorId,
            remainingRoads,
            returnPhase,
          },
        });
      }
    } else if (card.type === "year-of-plenty") {
      const available = totalResources(state.bank);
      const availableCards = Math.min(2, available) as 0 | 1 | 2;
      if (availableCards > 0) {
        const requiredCards = availableCards as 1 | 2;
        events.push({
          type: "PHASE_CHANGED",
          phase: {
            kind: "year-of-plenty",
            activePlayerId: envelope.actorId,
            requiredCards,
            returnPhase,
          },
        });
      }
    } else if (card.type === "monopoly") {
      events.push({
        type: "PHASE_CHANGED",
        phase: { kind: "monopoly", activePlayerId: envelope.actorId, returnPhase },
      });
    }
    return accept(state, envelope.commandId, events);
  }

  if (command.type === "REVEAL_VICTORY_POINTS") {
    if (!isDevelopmentPlayPhase(state.phase)) return reject(state, "WRONG_PHASE");
    if (activePlayerId(state) !== envelope.actorId) return reject(state, "NOT_YOUR_TURN");
    const uniqueCardIds = new Set(command.cardIds);
    if (command.cardIds.length === 0 || uniqueCardIds.size !== command.cardIds.length) {
      return reject(state, "INVALID_DEVELOPMENT_CARD", "INVALID_VICTORY_POINT_SELECTION");
    }
    const cards = command.cardIds.map((cardId) =>
      actor.developmentCards.find((card) => card.id === cardId));
    if (cards.some((card) => !card || card.type !== "victory-point")) {
      return reject(state, "INVALID_DEVELOPMENT_CARD", "CARD_NOT_OWNED_VICTORY_POINT");
    }
    const score = playerScore(state, envelope.actorId);
    if (score.publicScore + cards.length < 10) {
      return reject(state, "VICTORY_REVEAL_NOT_WINNING");
    }
    return accept(state, envelope.commandId, [{
      type: "VICTORY_POINT_CARDS_REVEALED",
      playerId: envelope.actorId,
      cards: cards.filter((card) => card !== undefined),
    }]);
  }

  if (command.type === "END_SUBTURN") {
    if (state.phase.kind === "player1-actions") {
      if (playerOneId(state) !== envelope.actorId) return reject(state, "NOT_YOUR_TURN");
      const player2Id = playerTwoId(state);
      return accept(state, envelope.commandId, [
        { type: "PLAYER_TURN_STARTED", playerId: player2Id },
        { type: "PHASE_CHANGED", phase: { kind: "player2-actions" } },
      ]);
    }
    if (state.phase.kind === "player2-actions") {
      if (playerTwoId(state) !== envelope.actorId) return reject(state, "NOT_YOUR_TURN");
      const nextPlayer1Seat = (state.player1Seat + 1) % state.playerOrder.length;
      const nextPlayer1Id = playerIdAtSeat(state, nextPlayer1Seat);
      return accept(state, envelope.commandId, [
        {
          type: "PAIRED_TURN_ADVANCED",
          player1Seat: nextPlayer1Seat,
          pairedTurn: state.pairedTurn + 1,
        },
        { type: "PLAYER_TURN_STARTED", playerId: nextPlayer1Id },
        { type: "PHASE_CHANGED", phase: { kind: "player1-pre-roll" } },
      ]);
    }
    return reject(state, "WRONG_PHASE");
  }

  if (!isActionPhase(state.phase)) return reject(state, "WRONG_PHASE");
  if (activePlayerId(state) !== envelope.actorId) return reject(state, "NOT_YOUR_TURN");

  if (command.type === "BUILD_ROAD") {
    if (!containsResources(actor.hand, BUILD_COSTS.road)) {
      return reject(state, "INSUFFICIENT_RESOURCES");
    }
    const legality = checkRoadPlacement(
      state.layout.topology,
      state.occupancy,
      envelope.actorId,
      command.edgeId,
      { pieces: actor.pieces },
    );
    if (!legality.legal) return reject(state, "ILLEGAL_PLACEMENT", legality.code);
    return accept(state, envelope.commandId, [{
      type: "ROAD_BUILT",
      playerId: envelope.actorId,
      edgeId: command.edgeId,
      payment: BUILD_COSTS.road,
    }]);
  }

  if (command.type === "BUILD_SETTLEMENT") {
    if (!containsResources(actor.hand, BUILD_COSTS.settlement)) {
      return reject(state, "INSUFFICIENT_RESOURCES");
    }
    const legality = checkSettlementPlacement(
      state.layout.topology,
      state.occupancy,
      envelope.actorId,
      command.vertexId,
      { pieces: actor.pieces },
    );
    if (!legality.legal) return reject(state, "ILLEGAL_PLACEMENT", legality.code);
    return accept(state, envelope.commandId, [{
      type: "SETTLEMENT_BUILT",
      playerId: envelope.actorId,
      vertexId: command.vertexId,
      payment: BUILD_COSTS.settlement,
    }]);
  }

  if (command.type === "BUILD_CITY") {
    if (!containsResources(actor.hand, BUILD_COSTS.city)) {
      return reject(state, "INSUFFICIENT_RESOURCES");
    }
    const legality = checkCityPlacement(
      state.layout.topology,
      state.occupancy,
      envelope.actorId,
      command.vertexId,
      actor.pieces,
    );
    if (!legality.legal) return reject(state, "ILLEGAL_PLACEMENT", legality.code);
    return accept(state, envelope.commandId, [{
      type: "CITY_BUILT",
      playerId: envelope.actorId,
      vertexId: command.vertexId,
      payment: BUILD_COSTS.city,
    }]);
  }

  if (command.type === "BUY_DEVELOPMENT_CARD") {
    if (state.developmentDeck.length === 0) return reject(state, "DEVELOPMENT_DECK_EMPTY");
    if (!containsResources(actor.hand, BUILD_COSTS.developmentCard)) {
      return reject(state, "INSUFFICIENT_RESOURCES");
    }
    const topCard = state.developmentDeck[0];
    if (!topCard) return reject(state, "DEVELOPMENT_DECK_EMPTY");
    return accept(state, envelope.commandId, [{
      type: "DEVELOPMENT_CARD_PURCHASED",
      playerId: envelope.actorId,
      card: { ...topCard, purchasedPlayerTurn: actor.playerTurnSequence },
      payment: BUILD_COSTS.developmentCard,
    }]);
  }

  if (command.type === "MARITIME_TRADE") {
    const ownedPorts = getOwnedPortKinds(state.ports, state.occupancy, envelope.actorId);
    const validation = validateMaritimeTrade({
      hand: actor.hand,
      bank: state.bank,
      ownedPorts,
      giveResource: command.give,
      receiveResource: command.receive,
      ...(command.units === undefined ? {} : { units: command.units }),
    });
    if (!validation.valid) return reject(state, "INVALID_TRADE", validation.code);
    const trade = executeMaritimeTrade({
      hand: actor.hand,
      bank: state.bank,
      ownedPorts,
      giveResource: command.give,
      receiveResource: command.receive,
      ...(command.units === undefined ? {} : { units: command.units }),
    });
    return accept(state, envelope.commandId, [{
      type: "MARITIME_TRADE_COMPLETED",
      playerId: envelope.actorId,
      hand: trade.hand,
      bank: trade.bank,
    }]);
  }

  if (command.type === "DOMESTIC_TRADE") {
    const partner = state.players.get(command.partnerId);
    if (!partner) return reject(state, "UNKNOWN_PLAYER");
    const validation = validateDomesticTrade({
      playerId: envelope.actorId,
      partnerId: command.partnerId,
      playerHand: actor.hand,
      partnerHand: partner.hand,
      playerGives: command.actorGives,
      partnerGives: command.partnerGives,
    });
    if (!validation.valid) return reject(state, "INVALID_TRADE", validation.code);
    const trade = executeDomesticTrade({
      playerId: envelope.actorId,
      partnerId: command.partnerId,
      playerHand: actor.hand,
      partnerHand: partner.hand,
      playerGives: command.actorGives,
      partnerGives: command.partnerGives,
    });
    return accept(state, envelope.commandId, [{
      type: "DOMESTIC_TRADE_COMPLETED",
      playerId: envelope.actorId,
      partnerId: command.partnerId,
      playerHand: trade.playerHand,
      partnerHand: trade.partnerHand,
    }]);
  }

  return reject(state, "WRONG_PHASE");
}
