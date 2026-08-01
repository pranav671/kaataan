import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createEmptyOccupancy } from "../building.ts";
import { createResourceBundle, totalResources } from "../resources.ts";
import { createExtendedBoardTopology } from "../topology.ts";
import {
  bestMaritimeTradeRate,
  createPortPlacement,
  executeDomesticTrade,
  executeMaritimeTrade,
  getOwnedPortKinds,
  standardBankSupply,
  validateDomesticTrade,
  validateMaritimeTrade,
} from "../trade.ts";
import type { BoardOccupancy, PortPlacement } from "../types.ts";

describe("trade rules", () => {
  it("attaches ports only to coastal graph edges", () => {
    const topology = createExtendedBoardTopology();
    const coastal = [...topology.edges.values()].find((edge) => edge.adjacentHexIds.length === 1);
    const inland = [...topology.edges.values()].find((edge) => edge.adjacentHexIds.length === 2);
    assert.ok(coastal && inland);
    const port = createPortPlacement(topology, {
      id: "generic-port",
      edgeId: coastal.id,
      kind: "generic",
    });
    assert.deepEqual(port.vertexIds, coastal.vertexIds);
    assert.throws(() => createPortPlacement(topology, {
      id: "invalid-port",
      edgeId: inland.id,
      kind: "ore",
    }), /must be coastal/);
  });

  it("selects the best maritime rate for the resource given", () => {
    assert.equal(bestMaritimeTradeRate(new Set(), "ore"), 4);
    assert.equal(bestMaritimeTradeRate(new Set(["generic"]), "ore"), 3);
    assert.equal(bestMaritimeTradeRate(new Set(["generic", "ore"]), "ore"), 2);
    assert.equal(bestMaritimeTradeRate(new Set(["wool"]), "ore"), 4);
  });

  it("derives port ownership from either endpoint building", () => {
    const topology = createExtendedBoardTopology();
    const edge = topology.edges.values().next().value;
    assert.ok(edge);
    const ports: PortPlacement[] = [{
      id: "ore-port",
      edgeId: edge.id,
      vertexIds: edge.vertexIds,
      kind: "ore",
    }];
    const occupancy: BoardOccupancy = {
      ...createEmptyOccupancy(),
      buildingsByVertex: new Map([
        [edge.vertexIds[1], { playerId: "blue", kind: "city" }],
      ]),
    };
    assert.deepEqual([...getOwnedPortKinds(ports, occupancy, "blue")], ["ore"]);
    assert.equal(getOwnedPortKinds(ports, occupancy, "red").size, 0);
  });

  it("validates and atomically executes a domestic trade", () => {
    const input = {
      playerId: "blue",
      partnerId: "red",
      playerHand: createResourceBundle({ ore: 2, lumber: 1 }),
      partnerHand: createResourceBundle({ brick: 2, wool: 1 }),
      playerGives: createResourceBundle({ ore: 1, lumber: 1 }),
      partnerGives: createResourceBundle({ brick: 1 }),
    };
    assert.deepEqual(validateDomesticTrade(input), { valid: true, code: "VALID" });
    const result = executeDomesticTrade(input);
    assert.deepEqual(result.playerHand, createResourceBundle({ ore: 1, brick: 1 }));
    assert.deepEqual(result.partnerHand, createResourceBundle({ brick: 1, wool: 1, ore: 1, lumber: 1 }));
    assert.equal(
      totalResources(result.playerHand) + totalResources(result.partnerHand),
      totalResources(input.playerHand) + totalResources(input.partnerHand),
    );
  });

  it("rejects gifts, overlapping resources, and unavailable cards", () => {
    const base = {
      playerId: "blue",
      partnerId: "red",
      playerHand: createResourceBundle({ ore: 1 }),
      partnerHand: createResourceBundle({ brick: 1, ore: 1 }),
    };
    assert.equal(validateDomesticTrade({
      ...base,
      playerGives: createResourceBundle({ ore: 1 }),
      partnerGives: createResourceBundle(),
    }).code, "EMPTY_SIDE");
    assert.equal(validateDomesticTrade({
      ...base,
      playerGives: createResourceBundle({ ore: 1 }),
      partnerGives: createResourceBundle({ ore: 1 }),
    }).code, "OVERLAPPING_RESOURCE_TYPES");
    assert.equal(validateDomesticTrade({
      ...base,
      playerGives: createResourceBundle({ ore: 2 }),
      partnerGives: createResourceBundle({ brick: 1 }),
    }).code, "PLAYER_RESOURCES_MISSING");
  });

  it("executes maritime trades at port rate and conserves resources", () => {
    const hand = createResourceBundle({ ore: 4 });
    const bank = standardBankSupply();
    const result = executeMaritimeTrade({
      hand,
      bank,
      ownedPorts: new Set(["ore"]),
      giveResource: "ore",
      receiveResource: "grain",
      units: 2,
    });
    assert.equal(result.rate, 2);
    assert.deepEqual(result.hand, createResourceBundle({ grain: 2 }));
    assert.equal(result.bank.ore, 28);
    assert.equal(result.bank.grain, 22);
    assert.equal(totalResources(result.hand) + totalResources(result.bank), 120 + 4);
  });

  it("rejects same-resource, underfunded, and unavailable-bank trades", () => {
    const hand = createResourceBundle({ ore: 4 });
    const bank = standardBankSupply();
    assert.equal(validateMaritimeTrade({
      hand,
      bank,
      ownedPorts: new Set(),
      giveResource: "ore",
      receiveResource: "ore",
    }).code, "SAME_RESOURCE");
    assert.equal(validateMaritimeTrade({
      hand: createResourceBundle({ ore: 3 }),
      bank,
      ownedPorts: new Set(),
      giveResource: "ore",
      receiveResource: "grain",
    }).code, "PLAYER_RESOURCES_MISSING");
    assert.equal(validateMaritimeTrade({
      hand,
      bank: createResourceBundle(),
      ownedPorts: new Set(),
      giveResource: "ore",
      receiveResource: "grain",
    }).code, "BANK_RESOURCE_MISSING");
  });
});
