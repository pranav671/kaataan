# Session 1 Implementation: Headless Game-Logic Foundation

Date: 2026-08-01

Status: Complete

## Session objective

Establish the first runnable engineering slice of Kaataan by implementing the graph and economic-rule foundations that both the SVG client and authoritative multiplayer server will consume.

This session intentionally stops before the full game state machine. It implements stable board identities, geometry, deterministic variable setup, production, building-location validation, port ownership, maritime trades, and domestic trades.

## Completed work

### 1. TypeScript workspace

Created a pnpm workspace with an initial `@kaataan/game-engine` package.

Files:

- `package.json`
- `pnpm-workspace.yaml`
- `pnpm-lock.yaml`
- `tsconfig.base.json`
- `packages/game-engine/package.json`
- `packages/game-engine/tsconfig.json`

Tooling installed:

- TypeScript 7.0.2
- Node type definitions
- Node's built-in test runner for runtime tests

Available commands:

```bash
pnpm typecheck
pnpm test
```

The test command currently uses Node's TypeScript type-stripping mode. TypeScript validation is still performed separately by `pnpm typecheck`.

### 2. Shared domain types

Implemented serializable/shared concepts in `packages/game-engine/src/types.ts`:

- Stable `HexId`, `VertexId`, and `EdgeId` types
- Axial hex coordinates
- Logical and rendered positions
- Hex, vertex, and edge topology
- Terrain and resource types
- Official number-token labels and values
- Board layouts and occupancy
- Roads, settlements, and cities
- Resource bundles
- Ports and port kinds
- Player piece supplies

Stable IDs use these formats:

```text
Hex:    h:<q>:<r>
Vertex: v:<lattice-x>:<lattice-y>
Edge:   e:<sorted-vertex-id>|<sorted-vertex-id>
```

These IDs must remain the contract between the engine, SVG renderer, commands, events, persistence, and WebSocket protocol.

### 3. Canonical 30-hex topology

Implemented `createExtendedBoardTopology()` in `packages/game-engine/src/topology.ts`.

The topology uses axial coordinates constrained to the official extended-board row shape:

```text
3, 4, 5, 6, 5, 4, 3
```

Generated and verified:

- 30 hexes
- 80 unique vertices
- 109 unique edges

Each hex contains:

- Six canonical vertex IDs
- Six canonical edge IDs
- Neighboring hex IDs
- A normalized render position

Each vertex contains:

- Integer lattice coordinates
- Normalized SVG position
- Adjacent hexes
- Adjacent edges
- Neighboring vertices

Each edge contains:

- Two sorted endpoint IDs
- One adjacent hex when coastal
- Two adjacent hexes when inland

#### Geometry approach

Game identity never depends on floating-point coordinates. Shared corners are deduplicated on an integer lattice. Floating-point positions are derived only for rendering:

```text
renderX = latticeX * sqrt(3) / 2
renderY = latticeY / 2
```

The SVG client can multiply these normalized positions by its chosen hex radius.

### 4. Deterministic variable board setup

Implemented in `packages/game-engine/src/boardSetup.ts`:

- Official 30-tile terrain inventory
- Official 28-token label/value mapping
- Official outside-to-inside counterclockwise spiral
- Desert skipping without consuming a number token
- Seeded deterministic terrain shuffle
- Seeded selection of the robber's starting desert
- Validation that exactly 30 tiles and 28 number tokens are consumed

The same seed always reconstructs the same terrain, number placement, and robber location. This is required for persistence, replay, debugging, and later verifiable server RNG.

Implemented terrain totals:

| Terrain | Count |
| --- | ---: |
| Forest | 6 |
| Hills | 5 |
| Pasture | 6 |
| Fields | 6 |
| Mountains | 5 |
| Desert | 2 |

### 5. Resource utilities and official costs

Implemented in `packages/game-engine/src/resources.ts`:

- Validated resource-bundle construction
- Bundle totals
- Availability checks
- Pure addition and subtraction
- Negative-resource prevention
- Official road, settlement, city, and development-card costs

No function mutates a supplied resource bundle.

### 6. Building-location validation

Implemented pure validators in `packages/game-engine/src/building.ts`:

- `checkRoadPlacement()`
- `checkSettlementPlacement()`
- `checkCityPlacement()`
- `createEmptyOccupancy()`

Covered behavior:

- Unknown edge/vertex rejection
- One road per edge
- One building per vertex
- Piece-supply availability
- Setup settlement placement without road connectivity
- Normal settlement road connectivity
- Distance Rule enforcement
- Setup road adjacency to the settlement just placed
- Road extension from the player's roads/buildings
- Opponent buildings blocking road continuity
- City upgrades only on the player's own settlement

Validators return stable machine-readable legality codes rather than UI strings.

Resource payment and board mutation are not performed inside these validators. They will be applied atomically by the future command reducer.

### 7. Ports and maritime trade

Implemented in `packages/game-engine/src/trade.ts`:

- Port placement restricted to coastal edges
- Port ownership through a settlement or city on either endpoint
- Best-rate calculation:
  - Matching specific port: 2:1
  - Generic port: 3:1
  - No applicable port: 4:1
- Same-resource exchange rejection
- Player-resource validation
- Bank-output availability validation
- Multiple trade units
- Pure atomic maritime-trade execution
- Resource conservation across the player and bank

The exact 11 official harbor edge placements are not yet encoded. The rules and graph attachment mechanism are complete; the fixed beginner/standard layout fixture must supply the canonical coastal edge IDs in a later session.

### 8. Domestic player trade

Implemented:

- Non-empty resources required on both sides
- Gifts rejected
- Same player rejected
- The same resource type cannot appear on both sides
- Both hands revalidated at execution time
- Pure atomic execution
- Resource conservation between participants

Turn authorization is intentionally not part of this primitive. The future paired-turn command layer must enforce that Player 1 participates in every domestic trade and that Player 2 cannot perform domestic trade during the Player 2 action window.

### 9. Resource production

Implemented `calculateProduction()` in `packages/game-engine/src/production.ts`.

Covered behavior:

- Number-matching productive hexes
- One resource for settlements
- Two resources for cities
- Multiple buildings and hexes accumulating for a player
- Robber blocking the occupied hex
- Per-resource demand totals
- Independent shortage handling for each resource
- Full payment when the bank can cover demand
- No payment when an understocked resource affects multiple players
- Partial payment of all remaining cards when only one player is affected
- Explicit shortage reporting

The function calculates payouts without mutating hands or the bank. Applying payouts will be part of the command/event reducer.

### 10. Public engine exports

`packages/game-engine/src/index.ts` exports the current engine surface from one entry point.

The UI and server should import from `@kaataan/game-engine`, not from internal files once package build/export tooling is finalized.

## Verification completed

### Type checking

```text
pnpm typecheck
Result: passed with zero errors
```

### Automated tests

```text
pnpm test
Suites: 5 passed
Tests: 26 passed
Failures: 0
```

Test files:

- `src/tests/topology.test.ts`
- `src/tests/boardSetup.test.ts`
- `src/tests/building.test.ts`
- `src/tests/trade.test.ts`
- `src/tests/production.test.ts`

The tests cover graph invariants, stable IDs, inventory, deterministic setup, building legality, coastal ports, domestic trades, maritime trades, conservation, normal production, bank shortages, and robber blocking.

## Rules implemented in this session

This slice directly implements or prepares enforcement for:

- `RULE-COMP-002`, `RULE-COMP-003`, `RULE-COMP-005`, `RULE-COMP-006`
- `RULE-SETUP-001`, `RULE-SETUP-003`, `IMPLEMENTATION-SETUP-003A`
- `RULE-PROD-001`, `RULE-PROD-002`, `RULE-PROD-003`
- `RULE-BUILD-001` through `RULE-BUILD-005`
- `RULE-TRADE-001`, `RULE-TRADE-003` through `RULE-TRADE-006`

Paired-turn authorization for `RULE-TRADE-002` remains for the command/state-machine layer.

## Deliberately not implemented yet

- Fixed beginner board and exact official harbor-edge fixture
- Player/game aggregate state
- Initial settlement/road setup state machine
- Player 1 and Player 2 paired-turn state machine
- Command/event/reducer architecture
- Atomic application of builds and production payouts
- Dice rolling and roll-7 orchestration
- Discard selection, robber movement, and stealing
- Development deck and development-card effects
- Longest Road search and award transfer
- Largest Army
- Victory scoring and win timing
- Public/private state projections
- Persistence and replay event format
- SVG UI
- Room/lobby system
- WebSocket protocol and game server

## Known boundaries and risks

1. `BoardTopology` exposes readonly map types, but JavaScript maps are not deeply immutable at runtime. The authoritative reducer must avoid mutating shared topology.
2. Number/terrain setup is complete for variable games, but the beginner-layout fixture needs coordinate-by-coordinate transcription and visual verification against the PDF.
3. Port trading is implemented, but official harbor positions must be mapped to canonical coastal `EdgeId` values.
4. Building validators do not charge resources or mutate pieces. This is intentional; the reducer must validate and apply all related changes atomically.
5. Domestic trade validates economics only. Turn permissions and accepted-offer lifecycle belong to the paired-turn engine.
6. The current test runner prints Node's experimental type-stripping warning. Runtime behavior is tested and TypeScript is independently type-checked.

## Recommended next session

Continue game logic before starting SVG or multiplayer work. The next coherent slice should be the authoritative game state and command reducer.

Recommended order:

1. Define `GameState`, `PlayerState`, bank, deck, awards, and explicit phase types.
2. Implement event types and a pure event reducer.
3. Implement the forward/reverse setup state machine and starting resources.
4. Implement the Player 1 / Player 2 paired-turn state machine.
5. Add commands that atomically apply the building, production, and trade primitives created here.
6. Implement roll 7, private discards, robber movement, target selection, and random stealing.
7. Implement Longest Road, Largest Army, development cards, scoring, and victory.
8. Add deterministic full-game transcript tests.

After the headless engine can execute a complete game transcript, the SVG client can be built against stable commands and render models. The multiplayer server should follow the same command/event contract rather than inventing separate game behavior.

