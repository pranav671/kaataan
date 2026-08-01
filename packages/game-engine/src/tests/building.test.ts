import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  checkCityPlacement,
  checkRoadPlacement,
  checkSettlementPlacement,
  createEmptyOccupancy,
} from "../building.ts";
import { BUILD_COSTS, createResourceBundle } from "../resources.ts";
import { createExtendedBoardTopology } from "../topology.ts";
import type { BoardOccupancy, EdgeId, VertexId } from "../types.ts";

const PIECES = { roads: 15, settlements: 5, cities: 4 } as const;

function withOccupancy(
  buildings: BoardOccupancy["buildingsByVertex"] = new Map(),
  roads: BoardOccupancy["roadsByEdge"] = new Map(),
): BoardOccupancy {
  return { buildingsByVertex: buildings, roadsByEdge: roads };
}

describe("building legality", () => {
  it("uses the official building costs", () => {
    assert.deepEqual(BUILD_COSTS.road, createResourceBundle({ brick: 1, lumber: 1 }));
    assert.deepEqual(
      BUILD_COSTS.settlement,
      createResourceBundle({ brick: 1, lumber: 1, wool: 1, grain: 1 }),
    );
    assert.deepEqual(BUILD_COSTS.city, createResourceBundle({ ore: 3, grain: 2 }));
    assert.deepEqual(
      BUILD_COSTS.developmentCard,
      createResourceBundle({ ore: 1, wool: 1, grain: 1 }),
    );
  });

  it("allows a setup settlement without a road but enforces distance", () => {
    const topology = createExtendedBoardTopology();
    const hex = topology.hexes.values().next().value;
    assert.ok(hex);
    const [occupied, neighbor, , far] = hex.vertexIds;
    const occupancy = withOccupancy(new Map([
      [occupied, { playerId: "red", kind: "settlement" }],
    ]));

    assert.deepEqual(
      checkSettlementPlacement(topology, createEmptyOccupancy(), "blue", far, { setup: true }),
      { legal: true, code: "LEGAL" },
    );
    assert.deepEqual(
      checkSettlementPlacement(topology, occupancy, "blue", neighbor, { setup: true }),
      { legal: false, code: "DISTANCE_RULE" },
    );
  });

  it("requires the player's road for a normal settlement", () => {
    const topology = createExtendedBoardTopology();
    const vertex = topology.vertices.values().next().value;
    assert.ok(vertex);
    assert.equal(
      checkSettlementPlacement(topology, createEmptyOccupancy(), "blue", vertex.id).code,
      "NOT_CONNECTED",
    );

    const occupancy = withOccupancy(
      new Map(),
      new Map([[vertex.adjacentEdgeIds[0] as EdgeId, { playerId: "blue" }]]),
    );
    assert.equal(checkSettlementPlacement(topology, occupancy, "blue", vertex.id).code, "LEGAL");
  });

  it("allows roads from own buildings and blocks continuity through opponents", () => {
    const topology = createExtendedBoardTopology();
    const vertex = [...topology.vertices.values()].find((candidate) => candidate.adjacentEdgeIds.length >= 3);
    assert.ok(vertex);
    const [existingEdgeId, targetEdgeId] = vertex.adjacentEdgeIds as readonly EdgeId[];
    assert.ok(existingEdgeId && targetEdgeId);

    const ownBuilding = withOccupancy(new Map([
      [vertex.id, { playerId: "blue", kind: "settlement" }],
    ]));
    assert.equal(checkRoadPlacement(topology, ownBuilding, "blue", targetEdgeId).code, "LEGAL");

    const blocked = withOccupancy(
      new Map([[vertex.id, { playerId: "red", kind: "settlement" }]]),
      new Map([[existingEdgeId, { playerId: "blue" }]]),
    );
    assert.equal(checkRoadPlacement(topology, blocked, "blue", targetEdgeId).code, "NOT_CONNECTED");
  });

  it("requires setup roads to touch the just-placed settlement", () => {
    const topology = createExtendedBoardTopology();
    const edge = topology.edges.values().next().value;
    assert.ok(edge);
    const adjacent = edge.vertexIds[0];
    const unrelated = topology.vertexIds.find((id) => !edge.vertexIds.includes(id));
    assert.ok(unrelated);
    assert.equal(
      checkRoadPlacement(topology, createEmptyOccupancy(), "blue", edge.id, {
        setupSettlementVertexId: adjacent,
      }).code,
      "LEGAL",
    );
    assert.equal(
      checkRoadPlacement(topology, createEmptyOccupancy(), "blue", edge.id, {
        setupSettlementVertexId: unrelated,
      }).code,
      "SETUP_ROAD_NOT_ADJACENT",
    );
  });

  it("only upgrades the player's own settlement and respects city supply", () => {
    const topology = createExtendedBoardTopology();
    const vertexId = topology.vertexIds[0] as VertexId;
    const occupancy = withOccupancy(new Map([
      [vertexId, { playerId: "blue", kind: "settlement" }],
    ]));
    assert.equal(checkCityPlacement(topology, occupancy, "blue", vertexId, PIECES).code, "LEGAL");
    assert.equal(
      checkCityPlacement(topology, occupancy, "red", vertexId, PIECES).code,
      "NOT_OWN_SETTLEMENT",
    );
    assert.equal(
      checkCityPlacement(topology, occupancy, "blue", vertexId, { ...PIECES, cities: 0 }).code,
      "NO_PIECE_AVAILABLE",
    );
  });
});
