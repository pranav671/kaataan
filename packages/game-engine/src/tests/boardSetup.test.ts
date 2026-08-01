import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  EXTENDED_NUMBER_TOKENS,
  EXTENDED_TERRAIN_INVENTORY,
  createVariableBoardLayout,
  extendedSpiralHexIds,
} from "../boardSetup.ts";

describe("variable extended board setup", () => {
  it("contains the official terrain and number-token inventory", () => {
    assert.equal(EXTENDED_TERRAIN_INVENTORY.length, 30);
    assert.deepEqual(
      Object.fromEntries(
        [...new Set(EXTENDED_TERRAIN_INVENTORY)].map((terrain) => [
          terrain,
          EXTENDED_TERRAIN_INVENTORY.filter((value) => value === terrain).length,
        ]),
      ),
      { forest: 6, hills: 5, pasture: 6, fields: 6, mountains: 5, desert: 2 },
    );

    assert.equal(EXTENDED_NUMBER_TOKENS.length, 28);
    const counts = new Map<number, number>();
    for (const token of EXTENDED_NUMBER_TOKENS) {
      counts.set(token.value, (counts.get(token.value) ?? 0) + 1);
    }
    assert.equal(counts.get(2), 2);
    assert.equal(counts.get(12), 2);
    for (const value of [3, 4, 5, 6, 8, 9, 10, 11]) assert.equal(counts.get(value), 3);
  });

  it("traverses every board coordinate exactly once", () => {
    const ids = extendedSpiralHexIds();
    assert.equal(ids.length, 30);
    assert.equal(new Set(ids).size, 30);
  });

  it("skips both deserts and starts the robber on a desert", () => {
    const layout = createVariableBoardLayout("desert-check");
    const deserts = [...layout.tiles.values()].filter((tile) => tile.terrain === "desert");
    assert.equal(deserts.length, 2);
    assert.ok(deserts.every((tile) => tile.token === null));
    assert.equal([...layout.tiles.values()].filter((tile) => tile.token !== null).length, 28);
    assert.equal(layout.tiles.get(layout.robberHexId)?.terrain, "desert");
  });

  it("is deterministic for a seed and varies between seeds", () => {
    const first = createVariableBoardLayout("same-seed");
    const second = createVariableBoardLayout("same-seed");
    const different = createVariableBoardLayout("different-seed");
    const signature = (layout: typeof first) => [...layout.tiles.values()]
      .map((tile) => `${tile.id}:${tile.terrain}:${tile.token?.label ?? "-"}`)
      .join("|");

    assert.equal(signature(first), signature(second));
    assert.equal(first.robberHexId, second.robberHexId);
    assert.notEqual(signature(first), signature(different));
  });

  it("assigns each official token exactly once in spiral order", () => {
    const layout = createVariableBoardLayout("token-check");
    const labels = extendedSpiralHexIds()
      .map((id) => layout.tiles.get(id)?.token?.label)
      .filter((label) => label !== undefined);
    assert.deepEqual(labels, EXTENDED_NUMBER_TOKENS.map((token) => token.label));
  });
});
