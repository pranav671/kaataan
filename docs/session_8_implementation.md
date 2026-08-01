# Session 8 Implementation: End-to-End Multiplayer Client

Date: 2026-08-01

Status: Complete

## Objective

Replace the Session 6 local-only browser adapter with the authoritative multiplayer system from Session 7, while preserving the interactive SVG board and polished table interface.

This session delivers the first complete browser journey:

1. Open the website.
2. Create a private room or join with an invite code.
3. Choose and edit a profile name and player color.
4. Ready up in a synchronized five-or-six-player lobby.
5. Let the host launch the game.
6. Play through the authoritative WebSocket server.
7. Reload or reconnect without losing the seat or private hand.

## Completed work

### 1. Browser WebSocket transport

Added `apps/web/src/multiplayer/client.ts`.

The client owns:

- WebSocket connection establishment
- Typed client message dispatch
- Typed server message handling
- Connection states: idle, connecting, connected, reconnecting, and offline
- Exponential reconnect attempts capped at eight seconds
- Room snapshots and projected event history
- Human-readable server error delivery
- Request and command correlation IDs

It exposes focused methods for room creation, joining, profile updates, readiness, game start, game commands, domestic trade offers, trade responses, leaving, and disconnecting.

### 2. Persistent reconnectable sessions

Added browser storage for the reconnect credentials issued by the server.

Credentials are stored under a versioned local-storage key and contain only:

- Room code
- Player ID
- Reconnect token

On the next page load, the app automatically sends `session.resume`. A dedicated restoring screen prevents the player from accidentally creating another session before the existing seat is recovered.

Invalid or expired credentials are removed after a server rejection, returning the user to the welcome screen.

### 3. Create and join experience

Added `WelcomeScreen.tsx` with a responsive, production-style landing experience.

The screen includes:

- Create-room and join-room modes
- Invite-code normalization
- Profile-name validation
- Six selectable player colors
- Live game-server connection feedback
- Disabled and pending submission states
- Inline server errors
- Invite URLs through `?room=CODE`, which automatically open join mode
- Mobile and tablet layouts

### 4. Synchronized multiplayer lobby

Added `LobbyScreen.tsx`.

The lobby displays:

- Private invite code and copyable invite link
- Five/six-player seat grid
- Empty seats
- Host badge
- Viewer badge
- Ready, not-ready, and offline presence
- Current ready count
- Profile name and color editor
- Colors already taken by other members as disabled
- Ready/unready control
- Host-only start control
- Exact start blockers when the room is not launchable
- Leave-room control

The host start button activates only when at least five players are seated, every player is ready, every player is connected, and the browser is online.

### 5. Authoritative snapshot hydration

Added `apps/web/src/multiplayer/hydrate.ts`.

The server sends serializable arrays and privacy-projected player views. The SVG and game presentation layers use the engine's map-based `GameState`. The hydrator reconstructs:

- Hex, vertex, and edge maps
- Hex adjacency derived from shared edges
- Logical render topology and coordinates
- Terrain tiles and number tokens
- Robber location
- Port placements
- Road and building occupancy maps
- Player piece supplies
- Viewer-private resource hand
- Viewer-private development cards
- Public opponent resource-card counts
- Public scores, awards, turn markers, phase, bank, and deck count

Opponent card identities remain unavailable. Synthetic count-only bundles exist solely so existing public-card-count presentation components can render totals without receiving private data.

### 6. Online game table

Added `OnlineGameTable.tsx`, which stitches the Session 6 visual table to the Session 7 server.

Key behavior:

- Every game action sends `game.command` with the latest expected version.
- The server remains the only authority that mutates game state.
- Board targets glow only for the viewer when the viewer may act.
- Other players see a clear “Waiting for [name]” state.
- Mandatory discards are independently actionable by each affected viewer.
- The viewer always sees their own resource and development-card hand, even while another player acts.
- Bank/port trades are dispatched as authoritative engine commands.
- Player profile colors are used consistently by the rail, roads, settlements, and cities.
- Server-projected events are converted into safe human-readable activity messages.
- Stale, illegal, and offline command errors surface as temporary table notifications.
- Connection status remains visible during play.
- Invite link and leave-table controls remain available.
- The existing victory reveal and game-over experience now operate on server snapshots.

### 7. Consent-based domestic trade UI

Extended `TradeDialog.tsx` and added `TradeOfferBanner.tsx`.

Player-to-player trading now follows the server's consent protocol:

1. Player 1 chooses a partner and proposed one-for-one exchange.
2. The browser sends `trade.offer` rather than directly executing `DOMESTIC_TRADE`.
3. The offer appears live for both participants.
4. The target may accept or decline.
5. The proposing player may cancel while waiting.
6. Only server acceptance executes the atomic engine trade.

The dialog no longer attempts to inspect an opponent's private hand when deciding whether an online offer can be sent. The authoritative server validates actual availability when the partner accepts.

### 8. Responsive interface polish

Expanded `styles.css` for:

- Split-screen welcome page
- Lobby seat and host-control layouts
- Connection and presence badges
- Profile/color controls
- Restore/reconnect state
- Domestic trade offer banner
- Tablet lobby stacking
- Mobile single-column lobby and trade controls
- Reduced-motion compatibility

The existing SVG game board remains responsive, pannable, zoomable, keyboard accessible for legal targets, and inspectable while the viewer waits.

### 9. Protocol and lifecycle corrections

The public game snapshot now includes `startingPlayerSeat`, allowing the browser to fully reconstruct the engine state.

Finished rooms may now be left cleanly. Active games still preserve disconnected seats for reconnection.

The web package now depends explicitly on `@kaataan/protocol`, and its test command includes multiplayer tests.

## Verification

### Automated checks

All completed successfully:

```text
pnpm typecheck
pnpm build
pnpm test
```

Regression result:

```text
77 tests passed
0 tests failed
```

The count includes:

- 64 game-engine tests
- 2 protocol-schema tests
- 7 room/server/WebSocket tests
- 4 web presentation and hydration tests

The new hydration test verifies the canonical 30-hex, 80-vertex, 109-edge graph reconstruction and private/public card-count behavior.

### Browser end-to-end verification

The application was tested through the visible browser interface against the real local WebSocket server.

Verified flow:

- Welcome screen connects to the server.
- Host creates a room.
- Host readiness updates live.
- Four separate WebSocket clients join the room with unique names and colors.
- All five seats and readiness states synchronize in the host browser.
- Host start control becomes enabled.
- Host launches the authoritative game.
- The interactive SVG board renders the server-generated island.
- The correct randomly selected starting player is shown.
- The host correctly sees a waiting state when another player acts.
- Reloading the page resumes the exact room, player identity, private hand, and game state.

Welcome, lobby, and active-game layouts were visually inspected at desktop size.

## Main files added

```text
apps/web/src/multiplayer/
  client.ts
  hydrate.ts
  hydrate.test.ts
  presentation.ts

apps/web/src/components/
  LobbyScreen.tsx
  OnlineGameTable.tsx
  TradeOfferBanner.tsx
  WelcomeScreen.tsx
```

## Main files updated

```text
apps/web/package.json
apps/web/src/App.tsx
apps/web/src/components/PlayerRail.tsx
apps/web/src/components/SidePanel.tsx
apps/web/src/components/SvgBoard.tsx
apps/web/src/components/TradeDialog.tsx
apps/web/src/styles.css
apps/game-server/src/projection.ts
apps/game-server/src/roomManager.ts
packages/protocol/src/dto.ts
pnpm-lock.yaml
```

## Current architecture

```text
React room/lobby/game UI
        |
MultiplayerClient + stored reconnect session
        |
Validated WebSocket protocol
        |
Authoritative RoomManager and GameState
        |
Viewer-specific snapshots and projected events
        |
Snapshot hydrator
        |
Interactive SVG board and player interface
```

## Logical next session

The strongest next chunk is multiplayer hardening and complete-play UX:

1. Add an in-game rules/reference drawer and explicit phase help.
2. Improve domestic trades from one-for-one selection to arbitrary resource bundles and counteroffers.
3. Add room/game persistence outside process memory so server restarts preserve games.
4. Add production deployment configuration for the web app and WebSocket server.
5. Add automated browser tests for create, join, reconnect, and a complete setup round.
6. Add spectator-safe diagnostics and structured server logging.
7. Add accessibility QA for mobile board interaction, focus trapping, and live phase announcements.

At the end of Session 8, Kaataan is playable as a real room-based multiplayer website from entry screen through authoritative game launch and reconnection.
