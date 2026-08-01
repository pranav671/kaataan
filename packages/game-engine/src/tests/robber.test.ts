import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createGame,
  createResourceBundle,
  eligibleRobberTargets,
  requiredDiscardCount,
  requiredDiscardsByPlayer,
  resourceAtHandIndex,
} from "../index.ts";

describe("robber rules", () => {
  it("requires half rounded down only for hands above seven", () => {
    assert.equal(requiredDiscardCount(createResourceBundle({ brick: 7 })), 0);
    assert.equal(requiredDiscardCount(createResourceBundle({ brick: 8 })), 4);
    assert.equal(requiredDiscardCount(createResourceBundle({ brick: 9 })), 4);
    assert.equal(requiredDiscardCount(createResourceBundle({ brick: 10 })), 5);
  });

  it("returns only affected players, including prototype-like IDs safely", () => {
    const state = createGame({
      id: "robber-test",
      seed: "robber-test",
      startingPlayerSeat: 0,
      players: ["__proto__", "constructor", "p2", "p3", "p4"].map((id) => ({ id, name: id })),
    });
    const players = new Map(state.players);
    players.set("__proto__", {
      ...players.get("__proto__")!,
      hand: createResourceBundle({ wool: 8 }),
    });
    const required = requiredDiscardsByPlayer({ ...state, players });
    assert.equal(required.__proto__, 4);
    assert.deepEqual(Object.keys(required), ["__proto__"]);
  });

  it("maps a random card index across resource counts", () => {
    const hand = createResourceBundle({ brick: 2, wool: 1, ore: 2 });
    assert.equal(resourceAtHandIndex(hand, 0), "brick");
    assert.equal(resourceAtHandIndex(hand, 1), "brick");
    assert.equal(resourceAtHandIndex(hand, 2), "wool");
    assert.equal(resourceAtHandIndex(hand, 3), "ore");
    assert.equal(resourceAtHandIndex(hand, 4), "ore");
    assert.throws(() => resourceAtHandIndex(hand, 5), RangeError);
  });

  it("deduplicates adjacent opponents and excludes the active player", () => {
    const state = createGame({
      id: "targets-test",
      seed: "targets-test",
      startingPlayerSeat: 0,
      players: Array.from({ length: 5 }, (_, index) => ({
        id: `p${index}`,
        name: `P${index}`,
      })),
    });
    const hexId = state.layout.topology.hexIds[0]!;
    const vertices = state.layout.topology.hexes.get(hexId)!.vertexIds;
    const buildingsByVertex = new Map(state.occupancy.buildingsByVertex);
    buildingsByVertex.set(vertices[0], { playerId: "p0", kind: "settlement" });
    buildingsByVertex.set(vertices[1], { playerId: "p1", kind: "settlement" });
    buildingsByVertex.set(vertices[2], { playerId: "p1", kind: "city" });
    buildingsByVertex.set(vertices[3], { playerId: "p3", kind: "settlement" });
    const targets = eligibleRobberTargets(
      { ...state, occupancy: { ...state.occupancy, buildingsByVertex } },
      hexId,
      "p0",
    );
    assert.deepEqual(targets, ["p1", "p3"]);
  });
});
