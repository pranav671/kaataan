import type { OwnedDevelopmentCard } from "./development.ts";
import type { GameEvent } from "./events.ts";
import type { PlayerId, ResourceBundle, ResourceType } from "./types.ts";

export type AuthoritativeDevelopmentEvent = Extract<GameEvent, {
  readonly type:
    | "DEVELOPMENT_CARD_PURCHASED"
    | "DEVELOPMENT_CARD_PLAYED"
    | "YEAR_OF_PLENTY_RESOLVED"
    | "MONOPOLY_RESOLVED";
}>;

type PurchaseEvent = Extract<AuthoritativeDevelopmentEvent, {
  readonly type: "DEVELOPMENT_CARD_PURCHASED";
}>;
type PlayedEvent = Extract<AuthoritativeDevelopmentEvent, {
  readonly type: "DEVELOPMENT_CARD_PLAYED";
}>;
type PlentyEvent = Extract<AuthoritativeDevelopmentEvent, {
  readonly type: "YEAR_OF_PLENTY_RESOLVED";
}>;
type MonopolyEvent = Extract<AuthoritativeDevelopmentEvent, {
  readonly type: "MONOPOLY_RESOLVED";
}>;

export type DevelopmentEventView =
  | {
    readonly sequence: number;
    readonly type: "DEVELOPMENT_CARD_PURCHASED";
    readonly playerId: PlayerId;
    readonly payment: ResourceBundle;
    readonly privateCard: OwnedDevelopmentCard | null;
  }
  | {
    readonly sequence: number;
    readonly type: "DEVELOPMENT_CARD_PLAYED";
    readonly playerId: PlayerId;
    readonly card: Pick<OwnedDevelopmentCard, "id" | "type">;
  }
  | {
    readonly sequence: number;
    readonly type: "YEAR_OF_PLENTY_RESOLVED";
    readonly playerId: PlayerId;
    readonly resources: ResourceBundle;
  }
  | {
    readonly sequence: number;
    readonly type: "MONOPOLY_RESOLVED";
    readonly playerId: PlayerId;
    readonly resource: ResourceType;
    readonly takenByPlayer: Readonly<Record<PlayerId, number>>;
  };

export function projectDevelopmentEventForViewer(
  event: PurchaseEvent,
  viewerId?: PlayerId,
): Extract<DevelopmentEventView, { readonly type: "DEVELOPMENT_CARD_PURCHASED" }>;
export function projectDevelopmentEventForViewer(
  event: PlayedEvent,
  viewerId?: PlayerId,
): Extract<DevelopmentEventView, { readonly type: "DEVELOPMENT_CARD_PLAYED" }>;
export function projectDevelopmentEventForViewer(
  event: PlentyEvent,
  viewerId?: PlayerId,
): Extract<DevelopmentEventView, { readonly type: "YEAR_OF_PLENTY_RESOLVED" }>;
export function projectDevelopmentEventForViewer(
  event: MonopolyEvent,
  viewerId?: PlayerId,
): Extract<DevelopmentEventView, { readonly type: "MONOPOLY_RESOLVED" }>;
export function projectDevelopmentEventForViewer(
  event: AuthoritativeDevelopmentEvent,
  viewerId?: PlayerId,
): DevelopmentEventView {
  if (event.type === "DEVELOPMENT_CARD_PURCHASED") {
    return {
      sequence: event.sequence,
      type: event.type,
      playerId: event.playerId,
      payment: event.payment,
      privateCard: viewerId === event.playerId ? event.card : null,
    };
  }
  if (event.type === "DEVELOPMENT_CARD_PLAYED") {
    return {
      sequence: event.sequence,
      type: event.type,
      playerId: event.playerId,
      card: { id: event.card.id, type: event.card.type },
    };
  }
  if (event.type === "YEAR_OF_PLENTY_RESOLVED") {
    return {
      sequence: event.sequence,
      type: event.type,
      playerId: event.playerId,
      resources: event.resources,
    };
  }
  return {
    sequence: event.sequence,
    type: event.type,
    playerId: event.playerId,
    resource: event.resource,
    takenByPlayer: event.takenByPlayer,
  };
}
