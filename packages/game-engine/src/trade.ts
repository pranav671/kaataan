import {
  addResources,
  containsResources,
  createResourceBundle,
  emptyResourceBundle,
  subtractResources,
  totalResources,
} from "./resources.ts";
import { RESOURCE_TYPES } from "./types.ts";
import type {
  BoardOccupancy,
  BoardTopology,
  EdgeId,
  PlayerId,
  PortKind,
  PortPlacement,
  ResourceBundle,
  ResourceType,
} from "./types.ts";

export type TradeValidationCode =
  | "VALID"
  | "SAME_PLAYER"
  | "EMPTY_SIDE"
  | "OVERLAPPING_RESOURCE_TYPES"
  | "PLAYER_RESOURCES_MISSING"
  | "PARTNER_RESOURCES_MISSING"
  | "INVALID_UNITS"
  | "SAME_RESOURCE"
  | "BANK_RESOURCE_MISSING";

export interface TradeValidation {
  readonly valid: boolean;
  readonly code: TradeValidationCode;
}

const VALID: TradeValidation = { valid: true, code: "VALID" };

function invalid(code: Exclude<TradeValidationCode, "VALID">): TradeValidation {
  return { valid: false, code };
}

export function createPortPlacement(
  topology: BoardTopology,
  input: { readonly id: string; readonly edgeId: EdgeId; readonly kind: PortKind },
): PortPlacement {
  const edge = topology.edges.get(input.edgeId);
  if (!edge) throw new Error(`Unknown port edge: ${input.edgeId}`);
  if (edge.adjacentHexIds.length !== 1) {
    throw new Error(`Port edge must be coastal: ${input.edgeId}`);
  }
  return {
    id: input.id,
    edgeId: input.edgeId,
    vertexIds: edge.vertexIds,
    kind: input.kind,
  };
}

export function getOwnedPortKinds(
  ports: readonly PortPlacement[],
  occupancy: BoardOccupancy,
  playerId: PlayerId,
): ReadonlySet<PortKind> {
  const result = new Set<PortKind>();
  for (const port of ports) {
    const ownsEndpoint = port.vertexIds.some((vertexId) =>
      occupancy.buildingsByVertex.get(vertexId)?.playerId === playerId,
    );
    if (ownsEndpoint) result.add(port.kind);
  }
  return result;
}

export function bestMaritimeTradeRate(
  ownedPorts: ReadonlySet<PortKind>,
  giveResource: ResourceType,
): 2 | 3 | 4 {
  if (ownedPorts.has(giveResource)) return 2;
  if (ownedPorts.has("generic")) return 3;
  return 4;
}

export function validateDomesticTrade(input: {
  readonly playerId: PlayerId;
  readonly partnerId: PlayerId;
  readonly playerHand: ResourceBundle;
  readonly partnerHand: ResourceBundle;
  readonly playerGives: ResourceBundle;
  readonly partnerGives: ResourceBundle;
}): TradeValidation {
  if (input.playerId === input.partnerId) return invalid("SAME_PLAYER");
  if (totalResources(input.playerGives) === 0 || totalResources(input.partnerGives) === 0) {
    return invalid("EMPTY_SIDE");
  }
  const overlap = RESOURCE_TYPES.some((resource) =>
    input.playerGives[resource] > 0 && input.partnerGives[resource] > 0,
  );
  if (overlap) return invalid("OVERLAPPING_RESOURCE_TYPES");
  if (!containsResources(input.playerHand, input.playerGives)) {
    return invalid("PLAYER_RESOURCES_MISSING");
  }
  if (!containsResources(input.partnerHand, input.partnerGives)) {
    return invalid("PARTNER_RESOURCES_MISSING");
  }
  return VALID;
}

export function executeDomesticTrade(input: {
  readonly playerId: PlayerId;
  readonly partnerId: PlayerId;
  readonly playerHand: ResourceBundle;
  readonly partnerHand: ResourceBundle;
  readonly playerGives: ResourceBundle;
  readonly partnerGives: ResourceBundle;
}): { readonly playerHand: ResourceBundle; readonly partnerHand: ResourceBundle } {
  const validation = validateDomesticTrade(input);
  if (!validation.valid) throw new Error(`Invalid domestic trade: ${validation.code}`);
  return {
    playerHand: addResources(
      subtractResources(input.playerHand, input.playerGives),
      input.partnerGives,
    ),
    partnerHand: addResources(
      subtractResources(input.partnerHand, input.partnerGives),
      input.playerGives,
    ),
  };
}

export function validateMaritimeTrade(input: {
  readonly hand: ResourceBundle;
  readonly bank: ResourceBundle;
  readonly ownedPorts: ReadonlySet<PortKind>;
  readonly giveResource: ResourceType;
  readonly receiveResource: ResourceType;
  readonly units?: number;
}): TradeValidation {
  const units = input.units ?? 1;
  if (!Number.isSafeInteger(units) || units <= 0) return invalid("INVALID_UNITS");
  if (input.giveResource === input.receiveResource) return invalid("SAME_RESOURCE");
  const rate = bestMaritimeTradeRate(input.ownedPorts, input.giveResource);
  if (input.hand[input.giveResource] < rate * units) {
    return invalid("PLAYER_RESOURCES_MISSING");
  }
  if (input.bank[input.receiveResource] < units) return invalid("BANK_RESOURCE_MISSING");
  return VALID;
}

export function executeMaritimeTrade(input: {
  readonly hand: ResourceBundle;
  readonly bank: ResourceBundle;
  readonly ownedPorts: ReadonlySet<PortKind>;
  readonly giveResource: ResourceType;
  readonly receiveResource: ResourceType;
  readonly units?: number;
}): { readonly hand: ResourceBundle; readonly bank: ResourceBundle; readonly rate: 2 | 3 | 4 } {
  const validation = validateMaritimeTrade(input);
  if (!validation.valid) throw new Error(`Invalid maritime trade: ${validation.code}`);
  const units = input.units ?? 1;
  const rate = bestMaritimeTradeRate(input.ownedPorts, input.giveResource);
  const payment = emptyResourceBundle();
  payment[input.giveResource] = rate * units;
  const receipt = emptyResourceBundle();
  receipt[input.receiveResource] = units;

  return {
    hand: addResources(subtractResources(input.hand, payment), receipt),
    bank: addResources(subtractResources(input.bank, receipt), payment),
    rate,
  };
}

export function standardBankSupply(): ResourceBundle {
  return createResourceBundle({ brick: 24, lumber: 24, wool: 24, grain: 24, ore: 24 });
}
