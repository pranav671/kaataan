# Session 3 Implementation: Roll 7 and the Robber

Date: 2026-08-01

Status: Complete

## Objective

Complete the mandatory roll-7 workflow that Session 2 intentionally left blocked. The authoritative engine can now collect every required private discard, move the robber, calculate legal victims, perform a server-random steal, and return Player 1 to the action phase.

This session also establishes viewer-specific projections for the two secret parts of the workflow: discard choices and stolen resource types.

## Files added

- `packages/game-engine/src/robber.ts`
- `packages/game-engine/src/robberProjection.ts`
- `packages/game-engine/src/tests/robber.test.ts`
- `session_3_implementation.md`

## Files extended

- `packages/game-engine/src/gameState.ts`
- `packages/game-engine/src/commands.ts`
- `packages/game-engine/src/events.ts`
- `packages/game-engine/src/invariants.ts`
- `packages/game-engine/src/index.ts`
- `packages/game-engine/src/tests/gameFlow.test.ts`

## Completed work

### 1. Complete roll-7 phase machine

The old `resolve-seven` placeholder has been replaced by explicit phases:

```text
ROLL_DICE = 7
  -> discarding, when at least one player holds more than 7 cards
  -> robber-move
  -> robber-steal, when at least one opponent is eligible
  -> player1-actions
```

When nobody owes a discard, the state moves directly from the dice event to `robber-move`.

When the selected robber hex has no eligible opponent, the state moves directly from `robber-move` to Player 1 actions without requiring a target command.

Every intermediate phase blocks unrelated commands and subturn completion.

### 2. Mandatory discard calculation

Implemented:

- Hands of 7 or fewer discard nothing.
- Hands of 8 or more discard `floor(handSize / 2)`.
- Only resource cards are counted.
- Requirements are snapshotted when 7 is rolled.
- Only affected players can submit.
- Affected players may submit in any order.
- Every selection must contain the exact required number of cards.
- Every selected card must exist in the authoritative hand.
- Duplicate submissions are rejected.
- Robber movement remains locked until every required player has submitted.
- Discarded cards return atomically to the bank.

The requirement record uses a null-prototype object so unusual but valid player IDs such as `__proto__` cannot alter object behavior or disappear from the requirement list.

### 3. Private discard submissions

Added command:

```text
SUBMIT_DISCARD(resources)
```

The authoritative event contains the resource bundle so replay can reconstruct the game. This event is private data and must not be broadcast directly.

The viewer projection exposes:

- Discarding player ID
- Total number of discarded cards
- Resource types only when the viewer is the player who discarded

Unrelated players and public spectators receive no discarded resource types.

### 4. Mandatory robber movement

Added command:

```text
MOVE_ROBBER(hexId)
```

Validation includes:

- Correct phase
- Active Player 1 actor
- Destination is a real terrain hex
- Destination differs from the current robber hex

Both deserts and productive terrain are legal destinations. The `ROBBER_MOVED` event updates the authoritative `BoardLayout.robberHexId`, so the existing production implementation immediately blocks the new hex.

Robber phases carry a `cause` and `returnPhase`. A rolled 7 uses cause `rolled-seven` and returns to Player 1 actions. This structure is intentionally reusable by a future Knight command, which will use cause `knight`, skip discards, and return to the phase where the card was played.

### 5. Eligible steal targets

Implemented target discovery from the six vertices surrounding the new robber hex.

A target is eligible when:

- They own an adjacent settlement or city.
- They are not the active player.
- They are a real player in the game.

Additional behavior:

- Multiple adjacent buildings from the same opponent produce one target entry.
- Targets are returned in stable seat order.
- An opponent with zero resource cards remains eligible.
- Unknown and non-adjacent targets are rejected.
- If no opponent is eligible, target selection is skipped.

### 6. Server-random stealing

Added command:

```text
STEAL_FROM_PLAYER(targetPlayerId)
```

For a non-empty target hand, the engine requires a server-owned `randomInteger(maxExclusive)` provider. It does not accept a resource choice or random index from the client.

The hand is treated as a flat sequence of resource cards. An index in `[0, handSize)` maps through the resource counts, which makes each individual card equally selectable when the injected provider is uniform.

The engine validates that the provider returns an integer inside the requested range. Missing or invalid randomness rejects the command without mutation.

The selected card transfers atomically from victim to active player. No bank balance changes.

If the selected eligible opponent has an empty resource hand:

- No randomness provider is required.
- The event records a null resource.
- No card moves.
- The flow still completes normally.

### 7. Robber events

Added replayable events:

- `RESOURCES_DISCARDED`
- `ROBBER_MOVED`
- `RESOURCE_STOLEN`

The reducer applies bank returns, player-hand subtraction, robber position changes, and player-to-player card transfers. All events remain monotonically sequenced and reproduce the accepted next state when replayed.

### 8. Privacy projections

`projectRobberEventForViewer()` creates safe views for robber-related events.

Discard projection:

- Public: player and total count
- Discarding player: exact resource bundle
- Other players: no resource types

Steal projection:

- Public: thief, victim, and whether zero or one card moved
- Thief and victim: stolen resource type
- Other players: no resource type

Robber movement is fully public.

The raw authoritative events remain server-internal. The future WebSocket server must use projections rather than publishing engine events directly.

This projection module covers robber events only. A complete public/private game projection for hands, trades, development cards, snapshots, and reconnects remains future work.

### 9. Extended invariants

Post-command invariant checks now also validate:

- Every discard requirement belongs to a player and is a positive safe integer.
- Submitted discard player IDs are unique.
- Every submitted player actually owes a discard.
- Robber phases reference a real active player.
- Steal target lists contain no duplicates.
- Steal targets are real opponents, never the active player.
- Roads and buildings belong to real players.

Existing resource conservation verifies that discards return to the bank and steals only move cards between hands.

## New command rejection behavior

Added categories:

- `INVALID_DISCARD`
- `INVALID_ROBBER_HEX`
- `INVALID_STEAL_TARGET`
- `INVALID_RANDOM_RESULT`

Detailed reasons distinguish wrong discard counts, absent cards, duplicate/unrequired submissions, current or unknown hexes, missing randomness, and out-of-range random results.

All rejected commands remain atomic: original state, no events, no version increment.

## Verification

```text
pnpm typecheck
Result: passed with zero errors

pnpm test
Suites: 7 passed
Tests: 42 passed
Failures: 0
```

New coverage includes:

- Exact discard thresholds for hand sizes 7, 8, 9, and 10
- Multiple affected players submitting in different orders
- Wrong-size and duplicate discard rejection
- Robber movement locked until every discard completes
- Direct robber movement when nobody discards
- Same-hex movement rejection
- Unique adjacent target discovery
- Active-player exclusion
- Invalid target rejection
- Missing random-provider rejection
- Weighted hand-index mapping
- Atomic resource transfer
- Eligible empty-hand victim
- Prototype-like player IDs
- Discard and steal privacy for every viewer class
- Event replay and resource conservation throughout the flow

## Rules completed

- `RULE-ROBBER-001`
- `RULE-ROBBER-002`
- `RULE-ROBBER-003`
- `RULE-ROBBER-004`
- `RULE-ROBBER-005`
- `IMPLEMENTATION-INFO-004` for discard and steal events

The shared robber movement structure prepares `RULE-ROBBER-006`, but Knight cards are not implemented yet.

## Not implemented yet

- Development deck and card purchase
- Knight card command and played-Knight count
- Road Building
- Year of Plenty
- Monopoly
- One Knight/progress-card-per-player-turn rule
- Same-turn development-card restriction
- Longest Road and Largest Army
- Victory-point cards, scoring, and victory timing
- Full public/private state snapshots
- Non-robber event projections
- Snapshot JSON codecs and persisted event schema
- Duplicate command-id idempotency storage
- Exact port fixture and beginner board
- Rooms, WebSockets, reconnection, and SVG UI

## Recommended Session 4

Implement the development-card system as the next cohesive game-logic slice:

1. Create and deterministically shuffle the 34-card extended deck.
2. Add private card instances to player state.
3. Implement atomic development-card purchase and empty-deck rejection.
4. Enforce same-player-turn purchase restrictions.
5. Enforce one Knight/progress card per individual player-turn.
6. Connect Knight to the robber phases without discards.
7. Implement Road Building, Year of Plenty, and Monopoly pending decisions.
8. Implement victory-point card reveal eligibility.
9. Add private/public development-card projections and replay tests.

Awards and final scoring should follow immediately after development cards because Knight affects Largest Army and roads affect Longest Road.
