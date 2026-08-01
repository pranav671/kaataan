import { RESOURCE_TYPES } from "./types.ts";
import type { ResourceBundle, ResourceType } from "./types.ts";

export function emptyResourceBundle(): Record<ResourceType, number> {
  return { brick: 0, lumber: 0, wool: 0, grain: 0, ore: 0 };
}

export function createResourceBundle(
  values: Partial<Record<ResourceType, number>> = {},
): ResourceBundle {
  const bundle = emptyResourceBundle();
  for (const resource of RESOURCE_TYPES) {
    const value = values[resource] ?? 0;
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new RangeError(`Invalid ${resource} count: ${value}`);
    }
    bundle[resource] = value;
  }
  return bundle;
}

export function totalResources(bundle: ResourceBundle): number {
  return RESOURCE_TYPES.reduce((total, resource) => total + bundle[resource], 0);
}

export function containsResources(
  available: ResourceBundle,
  required: ResourceBundle,
): boolean {
  return RESOURCE_TYPES.every((resource) => available[resource] >= required[resource]);
}

export function addResources(
  left: ResourceBundle,
  right: ResourceBundle,
): ResourceBundle {
  const result = emptyResourceBundle();
  for (const resource of RESOURCE_TYPES) {
    result[resource] = left[resource] + right[resource];
  }
  return result;
}

export function subtractResources(
  available: ResourceBundle,
  cost: ResourceBundle,
): ResourceBundle {
  if (!containsResources(available, cost)) {
    throw new RangeError("Resource bundle cannot cover the requested cost");
  }
  const result = emptyResourceBundle();
  for (const resource of RESOURCE_TYPES) {
    result[resource] = available[resource] - cost[resource];
  }
  return result;
}

export const BUILD_COSTS = {
  road: createResourceBundle({ brick: 1, lumber: 1 }),
  settlement: createResourceBundle({ brick: 1, lumber: 1, wool: 1, grain: 1 }),
  city: createResourceBundle({ ore: 3, grain: 2 }),
  developmentCard: createResourceBundle({ ore: 1, wool: 1, grain: 1 }),
} as const;
