import { emptyResourceBundle } from "./resources.ts";
import { RESOURCE_TYPES, TERRAIN_TO_RESOURCE } from "./types.ts";
import type {
  BoardLayout,
  BoardOccupancy,
  PlayerId,
  ResourceBundle,
  ResourceType,
} from "./types.ts";

export interface ProductionResult {
  readonly payouts: ReadonlyMap<PlayerId, ResourceBundle>;
  readonly demandByResource: Readonly<Record<ResourceType, number>>;
  readonly shortages: ReadonlySet<ResourceType>;
}

export function calculateProduction(
  layout: BoardLayout,
  occupancy: BoardOccupancy,
  roll: number,
  bank: ResourceBundle,
): ProductionResult {
  if (!Number.isSafeInteger(roll) || roll < 2 || roll > 12 || roll === 7) {
    throw new RangeError("Production roll must be an integer from 2 through 12, excluding 7");
  }

  const demands = new Map<ResourceType, Map<PlayerId, number>>();
  for (const resource of RESOURCE_TYPES) demands.set(resource, new Map());

  for (const tile of layout.tiles.values()) {
    if (tile.id === layout.robberHexId || tile.token?.value !== roll || tile.terrain === "desert") {
      continue;
    }
    const resource = TERRAIN_TO_RESOURCE[tile.terrain];
    const hex = layout.topology.hexes.get(tile.id);
    if (!hex) throw new Error(`Topology missing tile ${tile.id}`);
    for (const vertexId of hex.vertexIds) {
      const building = occupancy.buildingsByVertex.get(vertexId);
      if (!building) continue;
      const amount = building.kind === "city" ? 2 : 1;
      const byPlayer = demands.get(resource) as Map<PlayerId, number>;
      byPlayer.set(building.playerId, (byPlayer.get(building.playerId) ?? 0) + amount);
    }
  }

  const payouts = new Map<PlayerId, Record<ResourceType, number>>();
  const demandByResource = emptyResourceBundle();
  const shortages = new Set<ResourceType>();

  for (const resource of RESOURCE_TYPES) {
    const byPlayer = demands.get(resource) as Map<PlayerId, number>;
    const totalDemand = [...byPlayer.values()].reduce((total, amount) => total + amount, 0);
    demandByResource[resource] = totalDemand;
    const available = bank[resource];
    if (available < totalDemand) shortages.add(resource);

    if (available >= totalDemand) {
      for (const [playerId, amount] of byPlayer) {
        const payout = payouts.get(playerId) ?? emptyResourceBundle();
        payout[resource] = amount;
        payouts.set(playerId, payout);
      }
    } else if (byPlayer.size === 1) {
      const [entry] = byPlayer;
      if (entry) {
        const [playerId, amount] = entry;
        const payout = payouts.get(playerId) ?? emptyResourceBundle();
        payout[resource] = Math.min(available, amount);
        payouts.set(playerId, payout);
      }
    }
  }

  return { payouts, demandByResource, shortages };
}
