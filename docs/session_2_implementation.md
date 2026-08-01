# Session 2 Implementation: Authoritative State and Paired Turns

Date: 2026-08-01

Status: Complete

## Objective

Turn the Session 1 rule primitives into an authoritative, command-driven game aggregate that executes the complete initial-placement sequence and ordinary paired-player turns.

Clients now submit intentions with an expected state version. The engine validates each intention, emits sequenced domain events, reduces them into a new state, and rejects illegal commands without changing state.

Roll 7 enters an explicit blocking phase. Discards, robber movement, stealing, development cards, awards, and victory remain for the next game-logic slice.

## Files added

- `packages/game-engine/src/gameState.ts`
- `packages/game-engine/src/commands.ts`
- `packages/game-engine/src/events.ts`
- `packages/game-engine/src/invariants.ts`
- `packages/game-engine/src/tests/gameFlow.test.ts`
- `session_2_implementation.md`

All new engine modules are exported from `packages/game-engine/src/index.ts`.

## Completed work

### 1. Authoritative game aggregate

`GameState` now contains:

- Game ID and fixed ruleset version
- Optimistic-concurrency version
- Monotonic event sequence
- Board layout, topology, ports, and occupancy
- Bank resources
- Players and canonical seat order
- Starting-player and current Player 1 seats
- Paired-turn number
- Explicit phase
- Last dice total

`PlayerState` contains the stable ID, display name, seat, private resource hand, remaining pieces, and a per-player turn sequence needed for future development-card timing.

`createGame()` accepts five or six unique players and a preselected starting seat. It creates a seeded variable board, 24 cards of each resource, empty occupancy, and supplies of 15 roads, 5 settlements, and 4 cities per player.

The starting-player dice contest remains game-start orchestration; its winning seat is passed to `createGame()`.

### 2. Explicit phases

Implemented:

- Forward setup settlement and road phases
- Reverse setup settlement and road phases
- Player 1 pre-roll
- Player 1 actions
- Player 2 actions
- Resolve seven
- Game over type for later victory handling

The setup road phase stores the exact preceding settlement vertex. A player therefore cannot attach the free road to an older settlement or unrelated network.

`resolve-seven` blocks further turn actions until future robber commands resolve it.

### 3. Five- and six-player snake setup

The setup machine now:

1. Starts at any seat and wraps around the seat array.
2. Visits every player forward for one legal settlement and adjacent road.
3. Starts the reverse round with the final forward player.
4. Visits every player in reverse for their second settlement and adjacent road.
5. Enforces occupancy, piece supply, and the Distance Rule.
6. Charges no resources for setup pieces.
7. Grants resources immediately after each second settlement.
8. Takes those resources from the bank.
9. Starts paired turn 1 with the original starting player.

Starting resources are derived from every productive hex adjacent to the second settlement. Desert adjacency grants nothing.

Verified totals are 10 settlements and roads for five players, or 12 settlements and roads for six players.

### 4. Paired-player turns

Implemented the ordinary flow:

```text
Player 1 pre-roll
  -> authoritative dice roll
  -> production
  -> Player 1 actions
  -> Player 2 actions
  -> advance both markers
  -> next Player 1 pre-roll
```

Player 2 is `(player1Seat + 3) mod playerCount`.

Ending Player 2's subturn advances Player 1 by one seat, increments the paired-turn number, clears the dice result, starts the new Player 1's individual player-turn sequence, and returns to pre-roll.

Player 1 and Player 2 receive separate player-turn sequence increments.

### 5. Server-owned dice

`ROLL_DICE` accepts no result from the command. The handler requires a `CommandContext` dice provider returning two integers from 1 through 6.

There is deliberately no `Math.random()` fallback. The future server must inject cryptographically secure, auditable randomness.

Non-7 totals calculate and atomically apply Session 1 production. A 7 performs no production and enters `resolve-seven`.

### 6. Commands and rejection contract

The command envelope contains `commandId`, `expectedVersion`, `actorId`, and the command.

Implemented commands:

- `PLACE_INITIAL_SETTLEMENT`
- `PLACE_INITIAL_ROAD`
- `ROLL_DICE`
- `BUILD_ROAD`
- `BUILD_SETTLEMENT`
- `BUILD_CITY`
- `MARITIME_TRADE`
- `DOMESTIC_TRADE`
- `END_SUBTURN`

Stable rejection categories:

- `STALE_VERSION`
- `UNKNOWN_PLAYER`
- `NOT_YOUR_TURN`
- `WRONG_PHASE`
- `ILLEGAL_PLACEMENT`
- `INSUFFICIENT_RESOURCES`
- `INVALID_TRADE`
- `INVALID_DICE_RESULT`

Rejected commands return the original state, emit no events, and increment neither state version nor event sequence. Accepted commands increment state version exactly once.

### 7. Replayable events

Sequenced events cover initial pieces, starting resources, paid builds, dice, production, maritime and domestic trades, player-turn starts, paired-marker advancement, phase changes, and command acceptance.

`reduceEvent()` rejects gaps or out-of-order sequences. Applying an accepted command's events to its previous state reproduces its returned next state. Every flow test verifies this replay property.

### 8. Atomic builds

The Session 1 validators now drive paid commands.

- Roads validate resources, pieces, edge occupancy, and network connection.
- Settlements validate resources, pieces, road connection, occupancy, and distance.
- Cities validate resources, city supply, and ownership of the replaced settlement.
- Costs transfer to the bank in the same event application as placement.
- City upgrades return the settlement piece and consume a city.

No rejected build can partially pay or mutate the board.

### 9. Turn-authorized trades

Maritime trades are available to the active Player 1 or Player 2 and derive the best rate from actual port ownership.

Domestic trades execute only during Player 1's action phase, with Player 1 as a party. Player 2 cannot execute a domestic trade during their action phase.

The current domestic command represents an already accepted exchange. Offers, counteroffers, recipients, expiry, and explicit partner acceptance remain for the multiplayer workflow.

### 10. Invariant enforcement

`assertGameStateInvariants()` runs automatically after every accepted command and verifies:

- Five or six unique players with correct seats
- Player map/order agreement
- Robber on a real tile
- Supplied plus placed roads equals 15 per player
- Supplied plus placed settlements equals 5 per player
- Supplied plus placed cities equals 4 per player
- Bank plus all hands contains exactly 24 of every resource
- Every resource count is a non-negative safe integer

Reducer defects therefore fail immediately instead of silently corrupting the game.

## Verification

```text
pnpm typecheck
Result: passed with zero errors

pnpm test
Suites: 6 passed
Tests: 34 passed
Failures: 0
```

The eight new transcript tests cover five- and six-player snake setup, seat wrapping, starting resources, atomic rejection, event replay, paired turns, roll 7, paid road/settlement/city construction, trade authorization, maritime trading, stale versions, and resource/piece conservation.

## Rules covered

- `RULE-SETUP-005` resource-bank portion
- `RULE-SETUP-007`, `RULE-SETUP-008`
- `RULE-TURN-001`, `RULE-TURN-003`
- Building and trade portions of `RULE-TURN-004`, `RULE-TURN-005`
- `RULE-TURN-006`, `RULE-TURN-007`
- `RULE-PROD-001` through `RULE-PROD-003`, now applied authoritatively
- `RULE-BUILD-001` through `RULE-BUILD-005`, now atomic and paid
- `RULE-TRADE-001` through `RULE-TRADE-006` at accepted-exchange level
- Resource, piece, robber-location, and replay groundwork from the invariant rules

## Not implemented yet

- Starting-player dice contest and tie rerolls
- Discards, robber movement, targets, and random stealing
- Knight-triggered robber movement
- Development deck, purchases, cards, and pending choices
- Longest Road, Largest Army, scores, and victory
- Beginner board and exact official port fixture
- Domestic offer/accept/counteroffer lifecycle
- Duplicate `commandId` idempotency storage
- JSON codecs for map-backed snapshots
- Public/private state and event projections
- Persistence, rooms, WebSockets, and reconnection
- SVG UI

## Important boundaries

1. `expectedVersion` protection works; duplicate `commandId` deduplication still requires persisted server state.
2. `GameState` uses maps. Protocol and persistence code must use explicit codecs, not direct `JSON.stringify()`.
3. Authoritative events are not yet redacted and must not be broadcast directly once private discards and steals exist.
4. A rolled 7 intentionally pauses at `resolve-seven`; it cannot be skipped.
5. Exact harbor placement is absent, so callers must currently supply ports to enable port rates.

## Recommended Session 3

Finish mandatory game logic before SVG or WebSockets:

1. Add explicit simultaneous discard state and private submissions.
2. Implement robber movement, unique adjacent targets, and injected random stealing.
3. Add public/private event projections for discards and steals.
4. Add the 34-card development deck and purchase timing.
5. Implement Knight, Road Building, Year of Plenty, and Monopoly.
6. Implement Longest Road, Largest Army, scoring, and victory timing.
7. Add snapshot codecs and deterministic multi-turn transcript fixtures.

After a complete game can run entirely through commands, build the SVG interaction sandbox against these stable graph IDs and command contracts.
