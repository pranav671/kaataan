# Session 4 Implementation: Development Cards

Date: 2026-08-01

Status: Complete

## Objective

Implement the official 34-card extended development deck, private purchases, card timing restrictions, Knight integration, and all three progress-card effects.

This session deliberately stops before Victory Point card revelation, Largest Army, Longest Road, total scoring, and victory. The state now contains everything those systems need: stable card instances, played Knights, resolved progress cards, roads placed by Road Building, and hidden Victory Point cards.

## Files added

- `packages/game-engine/src/development.ts`
- `packages/game-engine/src/developmentProjection.ts`
- `packages/game-engine/src/tests/development.test.ts`
- `session_4_implementation.md`

## Files extended

- `packages/game-engine/src/gameState.ts`
- `packages/game-engine/src/commands.ts`
- `packages/game-engine/src/events.ts`
- `packages/game-engine/src/invariants.ts`
- `packages/game-engine/src/index.ts`

## Completed work

### 1. Official extended development deck

Implemented the complete 34-card inventory:

| Card | Count |
| --- | ---: |
| Knight | 20 |
| Road Building | 3 |
| Year of Plenty | 3 |
| Monopoly | 3 |
| Victory Point | 5 |

Every card receives a stable ID such as `dev:1` and keeps that identity as it moves from deck to private hand to resolved-card history.

`createDevelopmentDeck(seed)` deterministically shuffles the complete inventory. The same seed produces the same order for replay and debugging; a different seed produces a different order.

The multiplayer server must generate and protect the game seed. Clients never choose or shuffle the deck.

### 2. Development-card state

`GameState` now contains:

- The ordered, server-private development deck
- A permanent resolved-card ledger

Each `PlayerState` now contains:

- Private owned development-card instances
- Public played-Knight count
- A per-player-turn card-play flag
- The existing monotonic player-turn sequence

Owned cards record `purchasedPlayerTurn`. Resolved cards record their owner and `playedPlayerTurn`.

The resolved ledger preserves replay and the exact 34-card conservation invariant after progress cards leave a player's hand.

### 3. Atomic purchases

Added command:

```text
BUY_DEVELOPMENT_CARD
```

Purchase validation requires:

- Active Player 1 or Player 2 action phase
- Full ore, wool, and grain cost
- At least one card in the deck

An accepted purchase atomically:

1. Transfers the complete cost to the bank.
2. Draws exactly the top server-owned card.
3. Removes it from the deck.
4. Adds it to the buyer's private hand.
5. Records the buyer's current individual player-turn sequence.

An empty deck or insufficient resources rejects without payment or state mutation.

### 4. Purchase secrecy

`projectDevelopmentEventForViewer()` redacts purchased card identity from every viewer except the buyer.

Public purchase information includes:

- Buyer
- Public resource payment
- The fact that one card was purchased

The buyer additionally receives the stable card ID, type, and purchase-turn metadata.

Played Knights and progress cards become public when played. Their purchase-turn metadata is removed from public event views.

The deck order remains authoritative server state and is never exposed through this projection.

### 5. Timing and play limits

Added command:

```text
PLAY_DEVELOPMENT_CARD(cardId)
```

Knight and progress cards may be played:

- By Player 1 before rolling
- By Player 1 during Player 1 actions
- By Player 2 during Player 2 actions

Enforced restrictions:

- Actor must own the card.
- Card must be Knight or a progress card.
- Card cannot have been bought during the current individual player-turn.
- Only one Knight or progress card may be played per individual player-turn.
- Player 2 has no pre-roll phase.
- Pending card effects block unrelated commands until resolved.

`PLAYER_TURN_STARTED` resets the play-limit flag and increments the individual sequence. Player 1 and Player 2 therefore have independent timing windows inside the paired turn.

Victory Point cards are not consumed by this command. Attempts return `VICTORY_REVEAL_REQUIRES_WIN`; the next scoring slice will reveal them only when doing so establishes a legal victory.

### 6. Knight

Playing a Knight now:

- Removes it from the private hand
- Adds it permanently to the resolved ledger
- Increments public played-Knight count
- Consumes the player's one Knight/progress play for that player-turn
- Opens the existing robber-move phase with cause `knight`
- Never triggers discards
- Returns to the exact phase where it was played after movement and any steal

A pre-roll Knight returns to Player 1 pre-roll, so the mandatory dice roll still follows. An action-phase Knight returns to that player's action window.

Largest Army is not awarded yet; played-Knight counts are ready for the award reducer.

### 7. Road Building

Added pending phase and command:

```text
road-building
PLACE_FREE_ROAD(edgeId)
```

Behavior:

- Grants up to two sequential roads
- Charges no resource cards
- Consumes physical road pieces
- Applies normal edge occupancy, ownership, connection, and blocking rules
- Allows the first road to make the second road legal
- Returns to the phase where the card was played

No-deadlock behavior:

- If no road pieces or legal placements exist when played, the effect completes immediately.
- If only one road can be placed, the effect completes after that road.
- After each placement, the engine checks the hypothetical updated network before deciding whether another placement is possible.

Roads created here are ordinary board roads and will participate in the next Longest Road calculation.

### 8. Year of Plenty

Added pending phase and command:

```text
year-of-plenty
TAKE_YEAR_OF_PLENTY(resources)
```

Behavior:

- Normally requires exactly two selected cards.
- The two cards may have the same or different resource types.
- Every selected card must currently exist in the bank.
- Selected cards transfer atomically from bank to player.
- Choices and transfer are public table information.
- The effect returns to the phase where it was played.

No-deadlock behavior:

- If only one total resource card remains in the bank, exactly one is required.
- If the bank is empty, playing the card resolves immediately without opening a pending phase.

### 9. Monopoly

Added pending phase and command:

```text
monopoly
CHOOSE_MONOPOLY_RESOURCE(resource)
```

Resolution:

- Reads every opponent's authoritative hand.
- Transfers every card of the named resource to the active player.
- Leaves the bank unchanged.
- Includes players holding zero of that resource without error.
- Publishes the named resource and per-player transfer counts.
- Returns to the phase where the card was played.

The transfer event is deterministic and replayable.

### 10. Events and reducer

Added authoritative events:

- `DEVELOPMENT_CARD_PURCHASED`
- `DEVELOPMENT_CARD_PLAYED`
- `YEAR_OF_PLENTY_RESOLVED`
- `MONOPOLY_RESOLVED`

Road Building reuses the ordinary `ROAD_BUILT` event with a zero resource payment, preserving one board-road reducer path.

The reducer verifies that a purchase event matches the actual top card and that a played-card event references an owned card.

All card effects remain compatible with command replay, event sequencing, optimistic versions, and post-command invariants.

### 11. Development-card invariants

Every accepted command now verifies:

- Exactly 34 cards exist across deck, private hands, and resolved history.
- All 34 stable card IDs are unique.
- Type totals remain 20/3/3/3/5.
- Every resolved card belongs to a real player.
- Victory Point cards cannot enter the current resolved progress/Knight ledger.
- Each player's stored played-Knight count equals their resolved Knight count.
- Every pending development phase references a real active player.
- Existing resource and piece conservation still holds after every effect.

### 12. New rejection categories

- `DEVELOPMENT_DECK_EMPTY`
- `INVALID_DEVELOPMENT_CARD`
- `DEVELOPMENT_CARD_LIMIT`
- `DEVELOPMENT_CARD_BOUGHT_THIS_TURN`
- `INVALID_DEVELOPMENT_CHOICE`

Rejected card commands return the original state, emit no events, and increment neither version nor event sequence.

## Verification

```text
pnpm typecheck
Result: passed with zero errors

pnpm test
Suites: 8 passed
Tests: 53 passed
Failures: 0
```

New tests cover:

- Exact 34-card inventory and stable IDs
- Deterministic and seed-varying shuffle
- Private top-card purchase
- Public purchase payment
- Same-turn play rejection
- Empty-deck rejection
- Pre-roll Knight and mandatory return to pre-roll
- Knight without discards
- Played-Knight tracking
- One-card-per-player-turn enforcement
- Two sequential free roads
- Zero-road no-deadlock resolution
- Two identical Year of Plenty resources
- Invalid Year of Plenty selection
- One-card bank no-deadlock resolution
- Complete Monopoly transfer from every opponent
- Player 2 progress-card play
- Victory Point card preservation
- Event replay and all conservation invariants

## Rules completed or prepared

- `RULE-COMP-004`
- `RULE-DEV-001`
- `RULE-DEV-002`
- `RULE-DEV-003`
- `RULE-DEV-004`, excluding Largest Army recalculation
- `RULE-DEV-005` and `IMPLEMENTATION-DEV-005A`
- `RULE-DEV-006` and `IMPLEMENTATION-DEV-006A`
- `RULE-DEV-007`
- Purchase/secrecy portion of `RULE-INFO-002`
- `RULE-INV-003`

`RULE-DEV-008` remains for the scoring/victory slice.

## Not implemented yet

- Victory Point card reveal-to-win command
- Longest Road route search, ties, and award transfer
- Largest Army qualification and transfer
- Public and authoritative score calculation
- Own-turn victory eligibility
- Player 1 priority before Player 2 acts
- Immediate game-over transition
- Complete public/private state snapshots
- General event projections outside robber and development events
- Snapshot codecs, persistence, and command-id deduplication
- Exact port fixture and beginner board
- Rooms, WebSockets, reconnection, and SVG UI

## Recommended Session 5

Implement awards, scoring, and victory as one cohesive slice:

1. Compute each player's longest edge-simple road trail with opponent-building breaks.
2. Implement Longest Road qualification, ties, retention, transfer, and removal.
3. Implement Largest Army from played-Knight counts.
4. Calculate public structural score and authoritative score including hidden Victory Point cards.
5. Implement legal Victory Point reveal-to-win behavior.
6. Check victory at each required Player 1 and Player 2 timing boundary.
7. End the game immediately and prevent every later command.
8. Add award and score events plus public/private projections.
9. Add regression fixtures for branches, loops, blocked roads, ties, paired-player priority, and hidden points.

After this slice, the headless engine will support the principal rules needed to execute a complete game. The following division can then focus on JSON codecs and the SVG interaction sandbox before introducing WebSockets.
