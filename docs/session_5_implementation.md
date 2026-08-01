# Session 5 Implementation: Awards, Victory, and Game Over

Date: 2026-08-01

Status: Complete

## Objective

Complete the headless scoring endgame: Longest Road, Largest Army, public and authoritative scores, legal Victory Point revelation, paired-player victory timing, immediate game termination, and a privacy-safe game-over view model for the future web screen.

There is still no browser application in the repository. This session delivers the authoritative state and exact data contract a later React/SVG game-over screen will render.

## Files added

- `packages/game-engine/src/scoring.ts`
- `packages/game-engine/src/scoringProjection.ts`
- `packages/game-engine/src/gameOverView.ts`
- `packages/game-engine/src/tests/scoring.test.ts`
- `session_5_implementation.md`

## Files extended

- `packages/game-engine/src/gameState.ts`
- `packages/game-engine/src/commands.ts`
- `packages/game-engine/src/events.ts`
- `packages/game-engine/src/invariants.ts`
- `packages/game-engine/src/index.ts`
- `packages/game-engine/src/tests/development.test.ts`

## Completed work

### 1. Longest Road graph search

Implemented `longestRoadLength()` as an edge-simple trail search over the canonical board graph.

The search enforces:

- Only roads owned by the evaluated player participate.
- A physical edge may be counted at most once in a candidate trail.
- A trail may start or end at any vertex.
- Loops may be traversed, but cannot reuse their closing edge.
- At a branch, one continuation is selected; branches are not summed.
- The player's own buildings do not interrupt the trail.
- An opponent settlement or city terminates traversal through its vertex.
- A road may end at an opponent building but cannot continue through it.

The search starts from every incident vertex and evaluates every legal unused-edge continuation. A player owns at most 15 roads, keeping the exhaustive trail search bounded for this board.

### 2. Longest Road award

`GameState` now stores `longestRoadHolderId`.

Award resolution implements:

- No award below five roads.
- Initial award only to a sole qualifying leader.
- Current holder retains the award when tied for the maximum.
- A unique strictly longer challenger takes the award.
- If the holder is no longer among the leaders and multiple players tie, the award is set aside.
- An unheld tied maximum remains unawarded.
- A later sole qualifying leader receives an unheld award.

Longest Road is recalculated in the centralized accepted-command pass. This covers:

- Paid roads
- Road Building roads
- New settlements that split an opponent's route
- Any replayed event sequence producing the same board state

The holder receives two public victory points.

### 3. Largest Army award

`GameState` now stores `largestArmyHolderId`.

Implemented:

- Minimum qualification of three played Knights
- Initial award to the sole qualifying leader
- Existing holder retains on a tie
- Transfer only to a player with a strictly greater played-Knight count
- Two public victory points for the holder

Largest Army is intentionally recalculated after the Knight's robber movement and steal finish, not when the card initially enters the pending robber phase.

Played-Knight state from Session 4 is the authoritative input.

### 4. Central derived award pass

Award calculation now occurs inside the accepted-command pipeline:

1. Sequence and preview the command's domain events.
2. Recalculate road lengths and Longest Road.
3. Recalculate Largest Army when a Knight is not still resolving.
4. Preview award events.
5. Check the eligible player for victory.
6. Append game-over when applicable.
7. Append the single command-acceptance/version event.
8. Replay the complete final event list into the returned state.

This keeps award behavior out of individual command branches and prevents paid builds, free roads, settlement splits, and development cards from drifting into different scoring rules.

### 5. Score calculation

Implemented `playerScore()` with a full breakdown:

| Source | Points |
| --- | ---: |
| Settlement | 1 |
| City | 2 |
| Longest Road | 2 |
| Largest Army | 2 |
| Revealed Victory Point card | 1 |

The returned score distinguishes:

- Building points
- Longest Road points
- Largest Army points
- Revealed Victory Point cards
- Hidden Victory Point cards
- Public score
- Authoritative score including hidden cards

Hidden Victory Point cards never appear in the public score.

### 6. Victory Point revelation

Added command:

```text
REVEAL_VICTORY_POINTS(cardIds)
```

Validation requires:

- The actor is in their own normal player-turn phase.
- At least one unique card ID is supplied.
- Every supplied card is an owned Victory Point card.
- Public score plus the selected cards reaches at least 10.

Victory Point cards may be revealed during the same player-turn they were purchased. They do not consume the Knight/progress-card limit.

An accepted reveal:

- Removes selected cards from the private hand.
- Adds them to the public resolved-card ledger.
- Raises public score.
- Immediately triggers victory when the resulting public score is at least 10.

Reveals that do not establish a win are rejected without exposing card ownership.

### 7. Immediate victory timing

The command pipeline checks public victory after every accepted command at the active player's eligible boundary.

Covered behavior:

- A score-changing Player 1 action can end the game immediately.
- A score-changing Player 2 action can end the game immediately.
- A player who gained enough public points outside their turn wins when their next player-turn begins.
- Player 1 is checked before Player 2's action window opens.
- If both could qualify at that boundary, Player 1 wins and Player 2 never acts.
- A Knight does not produce an award or victory until its robber effect finishes.
- Road Building can award Longest Road after a free road placement.
- A city upgrade from 9 to 10 ends the game in the same command.

Hidden VP cards do not silently auto-win. The player must legally reveal enough of them during their own player-turn.

### 8. Game-over state

Added replayable `GAME_WON` behavior.

An accepted win changes the explicit phase to:

```text
game-over(winnerId)
```

Afterward every game command is rejected with `GAME_ALREADY_OVER`.

No later trade, build, roll, subturn, robber action, or development-card effect can be accepted.

The winner remains stable in replay because it is recorded in the event stream.

### 9. Game-over screen view model

Implemented `createGameOverView()` for a finished game.

It returns:

- Winner ID
- Longest Road holder
- Largest Army holder
- Player rows in canonical seat order
- Winner-first rank
- Public final score
- Settlement and city counts
- Played Knight count
- Calculated longest-road length
- Publicly revealed Victory Point card count

The shared view deliberately does not reveal unrevealed VP cards or use them in displayed final scores. Even after game over, hidden cards remain private unless a future explicit postgame reveal action publishes them.

This is the data model for the requested game-over screen. The visual React component will be created when the web/SVG UI package exists.

### 10. Public scoring projections

Implemented privacy-safe projections for:

- Victory Point revelations
- Longest Road holder changes
- Largest Army holder changes
- Game won

The public `GAME_WON` view exposes the winner and public winning score. It omits the authoritative score because that value could reveal additional hidden VP cards.

The authoritative server event may retain the authoritative score for auditing but must not be broadcast directly.

### 11. New events

- `VICTORY_POINT_CARDS_REVEALED`
- `LONGEST_ROAD_HOLDER_CHANGED`
- `LARGEST_ARMY_HOLDER_CHANGED`
- `GAME_WON`

All participate in monotonic sequencing and deterministic replay.

### 12. Extended invariants

Post-command validation now verifies:

- Longest Road holder is consistent with current roads and tie rules.
- Largest Army holder is consistent with played Knights when no Knight is pending.
- Game-over winner exists.
- Game-over winner has at least 10 public points.
- Revealed VP cards remain within the 34-card inventory.
- Played-Knight totals still match resolved Knight cards.
- Existing resource, piece, robber, and development-card conservation remains intact.

## Verification

```text
pnpm typecheck
Result: passed with zero errors

pnpm test
Suites: 10 passed
Tests: 63 passed
Failures: 0
```

New regression coverage includes:

- Five-edge simple road
- Six-edge closed loop without edge reuse
- Three-arm branch selecting only two arms
- Opponent settlement splitting a route
- Longest Road holder retention on a tie
- Unheld Longest Road tie
- Strict Longest Road transfer
- Initial Longest Road award through accepted commands
- Initial Largest Army award
- Largest Army holder tie retention
- Strict Largest Army transfer
- Same-turn VP card reveal
- Hidden authoritative score versus public score
- Non-winning reveal rejection
- City upgrade causing immediate victory
- Player 1 priority before Player 2
- Winner-first game-over data
- Hidden VP protection in game-over data and public victory events
- Rejection of every postgame command
- Event replay and all invariants

## Rules completed

- `RULE-LR-001`
- `RULE-LR-002`
- `RULE-LR-003`
- `RULE-LA-001`
- `RULE-LA-002`
- Remaining Largest Army portion of `RULE-DEV-004`
- `RULE-DEV-008`
- `RULE-VP-001`
- `RULE-VP-002`
- `RULE-VP-003`
- `RULE-VP-004`
- Scoring-related portions of `RULE-INFO-002`
- `RULE-INV-007`

## Not implemented yet

- Optional postgame revelation by losing players
- Full public/private live game snapshots
- General event projection for every non-scoring action
- JSON snapshot and event codecs for map-backed state
- Duplicate command-ID idempotency persistence
- Exact standard port placement fixture
- Beginner board fixture
- Room creation and membership
- WebSocket server and reconnection
- SVG board and interaction UI
- Rendered game-over screen

## Recommended next session

The core headless rules engine can now execute the principal game flow through victory. The next logical step is an SVG interaction sandbox before multiplayer infrastructure:

1. Create a React web application and shared engine adapter.
2. Render all 30 terrain hexes using normalized topology positions.
3. Render number tokens, robber, roads, settlements, and cities.
4. Add wide invisible SVG hit targets for vertices and edges.
5. Highlight legal setup and build locations from engine validators.
6. Drive a local hot-seat game through real commands.
7. Render hands, phases, actions, pending discard/robber/card choices, awards, and history.
8. Render the game-over view model from this session.

After local command-driven UI interaction is stable, add room persistence and WebSockets around the same command/event API.
