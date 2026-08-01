import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createExtendedBoardTopology } from "../topology.ts";

describe("extended board topology", () => {
  it("creates the canonical 30/80/109 graph", () => {
    const topology = createExtendedBoardTopology();
    assert.equal(topology.hexes.size, 30);
    assert.equal(topology.vertices.size, 80);
    assert.equal(topology.edges.size, 109);
  });

  it("deduplicates every shared corner and edge", () => {
    const topology = createExtendedBoardTopology();

    for (const hex of topology.hexes.values()) {
      assert.equal(new Set(hex.vertexIds).size, 6);
      assert.equal(new Set(hex.edgeIds).size, 6);
      assert.ok(hex.neighboringHexIds.length >= 2 && hex.neighboringHexIds.length <= 6);
      for (const vertexId of hex.vertexIds) {
        assert.ok(topology.vertices.get(vertexId)?.adjacentHexIds.includes(hex.id));
      }
      for (const edgeId of hex.edgeIds) {
        assert.ok(topology.edges.get(edgeId)?.adjacentHexIds.includes(hex.id));
      }
    }
  });

  it("has valid bidirectional vertex and edge adjacency", () => {
    const topology = createExtendedBoardTopology();

    for (const vertex of topology.vertices.values()) {
      assert.ok(vertex.adjacentHexIds.length >= 1 && vertex.adjacentHexIds.length <= 3);
      assert.equal(vertex.adjacentEdgeIds.length, vertex.neighboringVertexIds.length);
      for (const neighborId of vertex.neighboringVertexIds) {
        const neighbor = topology.vertices.get(neighborId);
        assert.ok(neighbor?.neighboringVertexIds.includes(vertex.id));
        const sharedEdges = vertex.adjacentEdgeIds.filter((edgeId) =>
          topology.edges.get(edgeId)?.vertexIds.includes(neighborId),
        );
        assert.equal(sharedEdges.length, 1);
      }
    }

    for (const edge of topology.edges.values()) {
      assert.equal(edge.vertexIds.length, 2);
      assert.ok(edge.adjacentHexIds.length === 1 || edge.adjacentHexIds.length === 2);
      for (const vertexId of edge.vertexIds) {
        assert.ok(topology.vertices.get(vertexId)?.adjacentEdgeIds.includes(edge.id));
      }
    }
  });

  it("uses stable logical coordinates independent of render scale", () => {
    const first = createExtendedBoardTopology();
    const second = createExtendedBoardTopology();
    assert.deepEqual(first.hexIds, second.hexIds);
    assert.deepEqual(first.vertexIds, second.vertexIds);
    assert.deepEqual(first.edgeIds, second.edgeIds);
  });
});
