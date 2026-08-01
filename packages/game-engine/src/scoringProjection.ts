import type { GameEvent } from "./events.ts";
import type { PlayerId } from "./types.ts";

export type AuthoritativeScoringEvent = Extract<GameEvent, {
  readonly type:
    | "VICTORY_POINT_CARDS_REVEALED"
    | "LONGEST_ROAD_HOLDER_CHANGED"
    | "LARGEST_ARMY_HOLDER_CHANGED"
    | "GAME_WON";
}>;

export type ScoringEventView =
  | {
    readonly sequence: number;
    readonly type: "VICTORY_POINT_CARDS_REVEALED";
    readonly playerId: PlayerId;
    readonly cards: readonly { readonly id: string; readonly type: "victory-point" }[];
  }
  | {
    readonly sequence: number;
    readonly type: "LONGEST_ROAD_HOLDER_CHANGED" | "LARGEST_ARMY_HOLDER_CHANGED";
    readonly previousHolderId: PlayerId | null;
    readonly holderId: PlayerId | null;
  }
  | {
    readonly sequence: number;
    readonly type: "GAME_WON";
    readonly winnerId: PlayerId;
    readonly publicScore: number;
  };

export function projectScoringEvent(event: AuthoritativeScoringEvent): ScoringEventView {
  if (event.type === "VICTORY_POINT_CARDS_REVEALED") {
    return {
      sequence: event.sequence,
      type: event.type,
      playerId: event.playerId,
      cards: event.cards.map((card) => ({ id: card.id, type: "victory-point" })),
    };
  }
  if (event.type === "GAME_WON") {
    return {
      sequence: event.sequence,
      type: event.type,
      winnerId: event.winnerId,
      publicScore: event.publicScore,
    };
  }
  return {
    sequence: event.sequence,
    type: event.type,
    previousHolderId: event.previousHolderId,
    holderId: event.holderId,
  };
}
