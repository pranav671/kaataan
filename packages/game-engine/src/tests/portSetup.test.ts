import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { EXTENDED_PORT_INVENTORY, createExtendedBoardTopology, createVariablePortPlacements } from "../index.ts";

describe("extended port setup", () => {
  it("places the complete deterministic inventory on unique coastal edges", () => {
    const topology = createExtendedBoardTopology();
    const ports = createVariablePortPlacements(topology, "port-seed");
    assert.equal(ports.length, 11);
    assert.equal(new Set(ports.map((port) => port.edgeId)).size, 11);
    assert.deepEqual(
      [...ports.map((port) => port.kind)].sort(),
      [...EXTENDED_PORT_INVENTORY].sort(),
    );
    for (const port of ports) {
      assert.equal(topology.edges.get(port.edgeId)?.adjacentHexIds.length, 1);
    }
    assert.deepEqual(ports, createVariablePortPlacements(topology, "port-seed"));
    assert.notDeepEqual(ports, createVariablePortPlacements(topology, "another-seed"));
  });
});
