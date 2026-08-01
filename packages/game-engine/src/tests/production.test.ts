import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createVariableBoardLayout } from "../boardSetup.ts";
import { calculateProduction } from "../production.ts";
import { createResourceBundle } from "../resources.ts";
import { standardBankSupply } from "../trade.ts";
import { TERRAIN_TO_RESOURCE } from "../types.ts";
import type {
  BoardLayout,
  BoardOccupancy,
  HexTile,
  NumberToken,
  ProductiveTerrain,
} from "../types.ts";

function producingTile(
  layout: BoardLayout,
): HexTile & { readonly terrain: ProductiveTerrain; readonly token: NumberToken } {
  const tile = [...layout.tiles.values()].find((candidate) =>
    candidate.token !== null && candidate.id !== layout.robberHexId && candidate.terrain !== "desert",
  );
  assert.ok(tile && tile.token && tile.terrain !== "desert");
  return tile as HexTile & { readonly terrain: ProductiveTerrain; readonly token: NumberToken };
}

describe("resource production", () => {
  it("pays one for a settlement and two for a city", () => {
    const layout = createVariableBoardLayout("production-normal");
    const tile = producingTile(layout);
    const hex = layout.topology.hexes.get(tile.id);
    assert.ok(hex);
    const occupancy: BoardOccupancy = {
      buildingsByVertex: new Map([
        [hex.vertexIds[0], { playerId: "blue", kind: "settlement" }],
        [hex.vertexIds[2], { playerId: "blue", kind: "city" }],
      ]),
      roadsByEdge: new Map(),
    };
    const result = calculateProduction(layout, occupancy, tile.token.value, standardBankSupply());
    const resource = TERRAIN_TO_RESOURCE[tile.terrain];
    assert.equal(result.payouts.get("blue")?.[resource], 3);
  });

  it("pays nobody when a shortage affects multiple players", () => {
    const layout = createVariableBoardLayout("production-shortage-multi");
    const tile = producingTile(layout);
    const hex = layout.topology.hexes.get(tile.id);
    assert.ok(hex);
    const resource = TERRAIN_TO_RESOURCE[tile.terrain];
    const occupancy: BoardOccupancy = {
      buildingsByVertex: new Map([
        [hex.vertexIds[0], { playerId: "blue", kind: "settlement" }],
        [hex.vertexIds[2], { playerId: "red", kind: "settlement" }],
      ]),
      roadsByEdge: new Map(),
    };
    const result = calculateProduction(
      layout,
      occupancy,
      tile.token.value,
      createResourceBundle({ [resource]: 1 }),
    );
    assert.equal(result.payouts.get("blue")?.[resource] ?? 0, 0);
    assert.equal(result.payouts.get("red")?.[resource] ?? 0, 0);
    assert.ok(result.shortages.has(resource));
  });

  it("pays all remaining cards when a shortage affects one player", () => {
    const layout = createVariableBoardLayout("production-shortage-one");
    const tile = producingTile(layout);
    const hex = layout.topology.hexes.get(tile.id);
    assert.ok(hex);
    const resource = TERRAIN_TO_RESOURCE[tile.terrain];
    const occupancy: BoardOccupancy = {
      buildingsByVertex: new Map([
        [hex.vertexIds[0], { playerId: "blue", kind: "city" }],
      ]),
      roadsByEdge: new Map(),
    };
    const result = calculateProduction(
      layout,
      occupancy,
      tile.token.value,
      createResourceBundle({ [resource]: 1 }),
    );
    assert.equal(result.payouts.get("blue")?.[resource], 1);
    assert.ok(result.shortages.has(resource));
  });

  it("blocks all production from the robber hex", () => {
    const original = createVariableBoardLayout("production-robber");
    const tile = producingTile(original);
    const layout: BoardLayout = { ...original, robberHexId: tile.id };
    const hex = layout.topology.hexes.get(tile.id);
    assert.ok(hex);
    const occupancy: BoardOccupancy = {
      buildingsByVertex: new Map([
        [hex.vertexIds[0], { playerId: "blue", kind: "city" }],
      ]),
      roadsByEdge: new Map(),
    };
    const result = calculateProduction(layout, occupancy, tile.token.value, standardBankSupply());
    assert.equal(result.payouts.size, 0);
  });
});
