import { totalResources } from "./resources.ts";
import type { GameEvent } from "./events.ts";
import type {
  HexId,
  PlayerId,
  ResourceBundle,
  ResourceType,
} from "./types.ts";

export type AuthoritativeRobberEvent = Extract<GameEvent, {
  readonly type: "RESOURCES_DISCARDED" | "ROBBER_MOVED" | "RESOURCE_STOLEN";
}>;

type DiscardEvent = Extract<AuthoritativeRobberEvent, { readonly type: "RESOURCES_DISCARDED" }>;
type RobberMovedEvent = Extract<AuthoritativeRobberEvent, { readonly type: "ROBBER_MOVED" }>;
type StolenEvent = Extract<AuthoritativeRobberEvent, { readonly type: "RESOURCE_STOLEN" }>;

export type RobberEventView =
  | {
    readonly sequence: number;
    readonly type: "RESOURCES_DISCARDED";
    readonly playerId: PlayerId;
    readonly count: number;
    readonly privateResources: ResourceBundle | null;
  }
  | {
    readonly sequence: number;
    readonly type: "ROBBER_MOVED";
    readonly playerId: PlayerId;
    readonly fromHexId: HexId;
    readonly toHexId: HexId;
    readonly cause: "rolled-seven" | "knight";
  }
  | {
    readonly sequence: number;
    readonly type: "RESOURCE_STOLEN";
    readonly playerId: PlayerId;
    readonly targetPlayerId: PlayerId;
    readonly count: 0 | 1;
    readonly privateResource: ResourceType | null;
  };

export function projectRobberEventForViewer(
  event: DiscardEvent,
  viewerId?: PlayerId,
): Extract<RobberEventView, { readonly type: "RESOURCES_DISCARDED" }>;
export function projectRobberEventForViewer(
  event: RobberMovedEvent,
  viewerId?: PlayerId,
): Extract<RobberEventView, { readonly type: "ROBBER_MOVED" }>;
export function projectRobberEventForViewer(
  event: StolenEvent,
  viewerId?: PlayerId,
): Extract<RobberEventView, { readonly type: "RESOURCE_STOLEN" }>;
export function projectRobberEventForViewer(
  event: AuthoritativeRobberEvent,
  viewerId?: PlayerId,
): RobberEventView {
  if (event.type === "RESOURCES_DISCARDED") {
    return {
      sequence: event.sequence,
      type: event.type,
      playerId: event.playerId,
      count: totalResources(event.resources),
      privateResources: viewerId === event.playerId ? event.resources : null,
    };
  }
  if (event.type === "ROBBER_MOVED") {
    return {
      sequence: event.sequence,
      type: event.type,
      playerId: event.playerId,
      fromHexId: event.fromHexId,
      toHexId: event.toHexId,
      cause: event.cause,
    };
  }
  return {
    sequence: event.sequence,
    type: event.type,
    playerId: event.playerId,
    targetPlayerId: event.targetPlayerId,
    count: event.resource === null ? 0 : 1,
    privateResource:
      viewerId === event.playerId || viewerId === event.targetPlayerId
        ? event.resource
        : null,
  };
}
