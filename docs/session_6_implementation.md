# Session 6 Implementation: Interactive SVG Game Client

Date: 2026-08-01

Status: Complete

## Objective

Create the first browser application for Kaataan: a clean, responsive player interface centered on an interactive SVG board, connected to the authoritative game engine built in Sessions 1–5.

This session intentionally uses a deterministic local table transport. It proves the complete engine-to-interface boundary before WebSocket room state replaces the local dispatcher.

## Package added

```text
apps/web/
  index.html
  package.json
  tsconfig.json
  vite.config.ts
  src/
    App.tsx
    main.tsx
    styles.css
    components/
      ActionDock.tsx
      GameOverDialog.tsx
      Icon.tsx
      PhasePrompt.tsx
      PlayerRail.tsx
      ResourceHand.tsx
      SidePanel.tsx
      SvgBoard.tsx
      TradeDialog.tsx
    game/
      localSession.ts
      presentation.ts
      presentation.test.ts
```

The root workspace scripts now include:

```text
pnpm dev
pnpm build
pnpm typecheck
pnpm test
```

## Completed work

### 1. React and Vite browser client

Added a standalone `@kaataan/web` workspace package using React, TypeScript, and Vite.

The client imports `@kaataan/game-engine` directly through the pnpm workspace. It does not duplicate graph rules, build prices, scoring, turn order, resource production, trading validation, or development-card behavior.

Production assets are emitted to `apps/web/dist` with a single optimized JavaScript bundle and stylesheet.

### 2. Renderer-independent presentation boundary

`game/presentation.ts` converts authoritative `GameState` into UI concerns:

- Current actionable player
- Human-readable phase and turn labels
- Player colors by canonical seat
- Legal target IDs for vertices, edges, and hexes
- Build affordability
- Resource labels and design metadata
- Public scores and paired-player roles
- Privacy-safe game activity descriptions

The SVG component receives `LegalTargets` and does not decide whether a move is legal itself. Target derivation calls the engine's `checkRoadPlacement`, `checkSettlementPlacement`, and `checkCityPlacement` functions.

This keeps a future WebSocket client, replay viewer, or alternate renderer on the same state-to-view contract.

### 3. Thirty-tile interactive SVG board

Implemented `SvgBoard` on the canonical 30-hex, 80-vertex, 109-edge topology.

The renderer uses the engine's exact topology positions and IDs. It includes:

- Thirty terrain hexes
- Terrain-specific vector motifs for forest, hills, pasture, fields, mountains, and desert
- Correct number tokens with red emphasis for 6 and 8
- Probability pips beneath number values
- Current robber marker
- Eleven deterministic ports with generic or resource-specific markers
- Player-colored roads
- Player-colored settlements and cities
- Water texture and compass treatment
- Keyboard-focusable legal targets
- Accessible labels for productive tiles, occupied roads, buildings, ports, and legal placement targets

Unoccupied, non-actionable graph nodes remain visually inspectable by pointer but are removed from the keyboard and screen-reader action sequence.

### 4. Unified legal-target interaction

All board commands use the same interaction loop:

1. Derive the active player and phase.
2. Derive legal target IDs from the engine.
3. Render those IDs with a warm animated glow.
4. Show a concise instruction and legal-location count.
5. Convert a selected ID into the corresponding engine command.
6. Render the returned state and events.

Covered board actions:

- Initial settlement placement
- Initial road placement connected to the new settlement
- Paid roads
- Paid settlements
- City upgrades
- Free Road Building roads
- Robber movement
- Non-command inspection of tiles, roads, and vertices

Illegal board locations never dispatch commands.

### 5. SVG pan and zoom

The board owns a small SVG camera rather than importing a geometry or canvas library.

Implemented:

- Pointer-driven water-background panning
- Mouse-wheel zoom
- Zoom-in and zoom-out buttons
- Fit-to-board reset
- Zoom clamping between useful limits
- Camera calculations using the responsive SVG view box
- Touch-safe `touch-action` handling

The board remains renderer-native SVG with DOM targets and does not depend on Konva or Phaser.

### 6. Player rail and paired-turn status

The player rail renders all six seats with:

- Player name and color
- Public victory points
- Resource-card count only, not opponent hand composition
- Roads and buildings on the board
- Player 1 and Player 2 markers
- Active-player treatment
- Longest Road and Largest Army badges
- Current paired-turn count

The mobile version turns the vertical rail into a horizontally scrollable table strip.

### 7. Private resource hand

The active local player's hand shows:

- Brick
- Lumber
- Wool
- Grain
- Ore
- Development-card count

Each resource has a distinct vector/CSS treatment and an exact count. Opponents expose only their total resource-card count.

### 8. Action dock

The action dock changes with the game phase.

Pre-roll:

- Prominent Roll Dice action

Action phase:

- Build Road
- Build Settlement
- Upgrade City
- Trade
- Buy Development Card
- End the current subturn

Build buttons display their actual engine price and disable when the current player cannot pay. Selecting a build action updates the board's legal targets.

### 9. Trading interface

Implemented a modal trade surface connected to real trade commands.

Maritime trading includes:

- Select resource to give
- Select a different resource to receive
- Live best-rate display using owned ports
- 4:1 bank, 3:1 generic port, and 2:1 specialized port behavior
- Resource and bank availability checks
- Disabled confirmation when the trade cannot succeed

Domestic trading includes:

- Partner selection
- Resource offered
- Resource requested
- Direct engine validation and atomic command execution

Player 2's paired action window disables domestic trading, because Player 2 may only trade with the supply.

The future multiplayer session must replace direct domestic execution with an offer/accept protocol while retaining this visual composition surface.

### 10. Development cards and special phases

The UI renders private development cards and connects playable cards to engine commands.

Covered prompts:

- Knight robber move and target selection
- Road Building legal road placement
- Year of Plenty resource counters
- Monopoly resource selection
- Mandatory discard counters
- Legal Victory Point revelation when the selected cards establish a win

Cards bought during the current player-turn and cards blocked by the one-card limit are disabled.

### 11. Activity, board inspection, and awards

The right-side information area contains:

- Current actionable player
- Current phase
- Last dice total
- Board inspection detail
- Reverse-chronological game activity
- Longest Road holder
- Largest Army holder

Command-acceptance and raw phase-change events are omitted from the human activity feed. Domain events use player names and plain-language descriptions.

### 12. Game-over experience

Implemented the visual game-over dialog on top of Session 5's privacy-safe `createGameOverView()`.

It renders:

- Winner
- Public winning score
- Winner-first ranking
- Settlements and cities
- Longest-road lengths
- Longest Road holder
- Largest Army holder
- New-game action

The dialog does not reveal hidden Victory Point cards.

### 13. Deterministic local table adapter

`game/localSession.ts` creates a seeded six-player table and dispatches commands through `handleCommand()`.

The local adapter provides:

- Stable demo players and colors
- Stable board seed
- Deterministic eleven-port placement on coastal edges
- Deterministic dice and steal randomness
- Error conversion for non-destructive UI feedback
- A Quick Setup command runner

Quick Setup performs all 24 opening commands through the engine:

- 12 settlement placements
- 12 connected road placements
- Forward and reverse setup order
- Starting-resource grants
- Transition to Player 1 pre-roll

It does not mutate occupancy or skip invariants.

### 14. Responsive design and interaction feedback

The interface has dedicated layouts for:

- Three-column desktop tables
- Two-column medium laptop/tablet tables
- Single-column mobile tables
- Compact 390-pixel phone screens

UX behavior includes:

- Visible focus states
- Touch-sized board hit areas
- Disabled-state explanations through surrounding status text
- Toast feedback for command rejections and local utilities
- Reduced-motion support
- No horizontal document overflow at 390 pixels
- Board-local scrolling and camera controls

### 15. Visual language

The design uses a restrained tabletop aesthetic:

- Warm paper and cream surfaces
- Deep ocean teal
- Muted, recognizable terrain colors
- Gold for legal moves and awards
- Seat-specific player colors
- Serif display typography paired with compact system UI typography
- Subtle borders and shadows instead of heavy game chrome

All terrain, resource, icon, piece, water, and port visuals are code-native SVG/CSS, so the application has no image-loading dependency.

## Automated verification

```text
pnpm typecheck
Result: passed for game-engine and web

pnpm test
Engine: 63 passed
Web presentation: 3 passed
Total: 66 passed
Failures: 0

pnpm build
Result: passed
JavaScript: approximately 267 kB / 81 kB gzip
CSS: approximately 25 kB / 6 kB gzip
```

New web regression tests verify:

- All 80 vertices are legal on the empty setup board.
- Quick Setup completes through engine commands and reaches pre-roll after version 24.
- Initial-road targets are restricted to edges adjacent to the just-placed settlement.

## Browser verification

The application was exercised in the local browser at desktop and 390 × 844 mobile dimensions.

Verified:

- Desktop hierarchy and board fit
- Quick Setup transition and all visible pieces
- Roll Dice transition into Player 1 actions
- Production reflected in the private hand
- Trade dialog layout and live 4:1 rate
- Disabled unaffordable actions
- SVG zoom modifies the view box
- Mobile table rail and board layout
- Mobile document width equals the 390-pixel viewport
- No browser console errors or warnings

## Running the application

From the repository root:

```bash
pnpm install
pnpm dev
```

Open:

```text
http://127.0.0.1:4173/
```

Use **Quick setup** to reach the first dice roll immediately, or place every opening settlement and road manually using the glowing board targets.

## Current boundary

This is a complete local visual shell, not yet a networked room.

The following values are demonstration data and must be supplied by the future room server:

- Room name and invite code
- Player identity and profile
- Seat/color assignment
- Presence
- Seed and port layout
- Dice and steal randomness
- Private player projection
- Event history

The browser currently has the full local `GameState` so it can simulate all seats. A production multiplayer browser must receive a viewer-specific projection and must never receive other players' private development cards or resource composition.

## Recommended next session

Build the multiplayer room and synchronization layer.

Recommended order:

1. Add shared protocol schemas for room commands, game commands, public events, and player-private projections.
2. Add a Node WebSocket server with server-owned `GameState`, randomness, version validation, and serialized per-room command handling.
3. Add create-room, join-code, display-name, color, ready, and host-start flows.
4. Add reconnect tokens, presence, snapshot recovery, and event catch-up.
5. Replace `dispatchLocal()` with a client transport while preserving the current presentation and SVG components.
6. Replace direct domestic trades with offer, accept, reject, cancel, and expiry messages.
7. Add multi-client browser tests proving private data isolation and synchronized board updates.

The UI-to-engine boundary created in this session is designed so this replacement affects transport and room screens rather than the board renderer or game controls.
