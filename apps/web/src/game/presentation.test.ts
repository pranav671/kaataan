import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createLocalGame, dispatchLocal, quickSetup } from "./localSession.ts";
import { actionPlayerId, legalTargetsFor, phaseLabel } from "./presentation.ts";

describe("web presentation model", () => {
  it("derives legal settlement targets during setup", () => {
    const state = createLocalGame();
    const actorId = actionPlayerId(state);
    assert.equal(actorId, "maya");
    const targets = legalTargetsFor(state, actorId!, "inspect");
    assert.equal(targets.action, "settlement");
    assert.equal(targets.ids.size, 80);
    assert.match(targets.instruction, /glowing corner/);
  });

  it("quick setup completes using only real engine commands", () => {
    const result = quickSetup(createLocalGame());
    assert.equal(result.error, null);
    assert.equal(result.state.phase.kind, "player1-pre-roll");
    assert.equal(result.state.occupancy.buildingsByVertex.size, 12);
    assert.equal(result.state.occupancy.roadsByEdge.size, 12);
    assert.equal(result.state.version, 24);
    assert.equal(phaseLabel(result.state), "Roll to begin");
  });

  it("changes setup target type after a settlement", () => {
    const state = createLocalGame();
    const first = [...legalTargetsFor(state, "maya", "inspect").ids][0];
    assert.ok(first);
    const result = dispatchLocal(state, "maya", { type: "PLACE_INITIAL_SETTLEMENT", vertexId: first as `v:${number}:${number}` });
    assert.equal(result.error, null);
    const targets = legalTargetsFor(result.state, "maya", "inspect");
    assert.equal(targets.action, "road");
    assert.ok(targets.ids.size >= 2 && targets.ids.size <= 3);
    for (const edgeId of targets.ids) {
      assert.ok(result.state.layout.topology.edges.get(edgeId as `e:${string}|${string}`)?.vertexIds.includes(first as `v:${number}:${number}`));
    }
  });
});
