import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseClientMessage } from "../index.ts";

describe("multiplayer protocol schemas", () => {
  it("normalizes a valid room profile and game command", () => {
    const create = parseClientMessage({ type: "room.create", requestId: "req-1", profile: { name: "  Maya  ", color: "teal" } });
    assert.equal(create.type, "room.create");
    assert.equal(create.profile.name, "Maya");
    const command = parseClientMessage({ type: "game.command", commandId: "cmd-1", expectedVersion: 4, command: { type: "ROLL_DICE" } });
    assert.equal(command.type, "game.command");
    const counter = parseClientMessage({ type: "trade.counter", requestId: "counter-1", expectedVersion: 4, offerId: "offer-1", actorGives: { brick: 2, lumber: 0, wool: 0, grain: 0, ore: 0 }, partnerGives: { brick: 0, lumber: 1, wool: 1, grain: 0, ore: 0 } });
    assert.equal(counter.type, "trade.counter");
    const kick = parseClientMessage({ type: "room.kick", requestId: "kick-1", playerId: "player-2" });
    assert.equal(kick.type, "room.kick");
  });

  it("rejects malformed, oversized, and unknown messages", () => {
    assert.throws(() => parseClientMessage({ type: "room.create", requestId: "x", profile: { name: "M", color: "teal" } }));
    assert.throws(() => parseClientMessage({ type: "game.command", commandId: "x", expectedVersion: -1, command: { type: "ROLL_DICE" } }));
    assert.throws(() => parseClientMessage({ type: "room.delete", requestId: "x" }));
    assert.throws(() => parseClientMessage({ type: "ROLL_DICE", extra: true }));
    assert.throws(() => parseClientMessage({ type: "trade.counter", requestId: "counter-1", expectedVersion: 4, offerId: "offer-1", actorGives: { brick: 25, lumber: 0, wool: 0, grain: 0, ore: 0 }, partnerGives: { brick: 0, lumber: 1, wool: 0, grain: 0, ore: 0 } }));
  });
});
