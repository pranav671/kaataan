# Session 7 Implementation: Multiplayer Rooms and Authoritative WebSockets

Date: 2026-08-01

Status: Complete

## Objective

Build the multiplayer authority beneath the visual game client:

- Private invite-code rooms
- Five or six reconnectable player seats
- Editable lobby profiles and colors
- Readiness and host-controlled start
- Server-owned game state and randomness
- Runtime-validated WebSocket messages
- Viewer-specific snapshots and event redaction
- Consent-based domestic trading
- Presence, heartbeat, and reconnect recovery

This session establishes the protocol and server. The Session 6 browser still uses its deterministic local adapter; replacing that adapter and adding the lobby screens is the next stitching session.

## Packages added

```text
packages/protocol/
  package.json
  tsconfig.json
  src/
    dto.ts
    index.ts
    schema.ts
    tests/
      schema.test.ts

apps/game-server/
  package.json
  tsconfig.json
  src/
    errors.ts
    index.ts
    projection.ts
    roomManager.ts
    server.ts
    tests/
      roomManager.test.ts
      server.integration.test.ts
```

## Engine additions

```text
packages/game-engine/src/portSetup.ts
packages/game-engine/src/tests/portSetup.test.ts
```

## Completed work

### 1. Shared runtime-validated protocol

Added `@kaataan/protocol`, shared by the browser and game server.

Zod schemas validate every inbound WebSocket message before it reaches room or game state. Schemas are strict, so unexpected properties and unknown message types are rejected.

Covered room messages:

- `room.create`
- `room.join`
- `session.resume`
- `room.update_profile`
- `room.set_ready`
- `room.start`
- `room.leave`

Covered trade messages:

- `trade.offer`
- `trade.accept`
- `trade.reject`
- `trade.cancel`

Covered game and transport messages:

- `game.command`
- `ping`

Every game command has a runtime schema, including resource bundles and canonical vertex, edge, hex, and development-card IDs.

Validation includes:

- Bounded request IDs
- Two-to-twenty-four-character display names
- Six supported player colors
- Non-negative resource counts
- Non-negative expected versions
- Positive maritime trade units
- Required Victory Point card selections
- Exact object shapes

### 2. Typed server responses

The shared protocol defines:

- `session.created`
- `session.resumed`
- `room.snapshot`
- `game.update`
- `request.error`
- `pong`

Session creation is the only response that returns a reconnect token. Later snapshots never contain bearer credentials.

Every failure uses a stable error code, request correlation ID, and safe human-readable message.

### 3. Room lifecycle

Implemented an in-memory `RoomManager` with isolated room records.

A room stores:

- Normalized invite code
- Creation time
- Host ID
- Lobby, playing, or finished status
- Five or six member seats
- Presence connections
- Authoritative `GameState`
- Pending domestic trade offers

Creating a room:

- Generates a cryptographically random invite code by default
- Creates the host player session
- Assigns seat zero
- Generates a high-entropy reconnect token

Joining a room:

- Accepts case-insensitive invite codes
- Rejects unknown rooms
- Rejects rooms that already started
- Rejects a seventh player
- Rejects duplicate colors
- Rejects duplicate names case-insensitively
- Fills the next available seat

Leaving a lobby:

- Removes the player
- Transfers host ownership to the earliest remaining seat
- Compacts remaining seats to canonical order
- Deletes an empty room

Players cannot leave and destroy a seat after an active game begins. They become disconnected and can resume instead.

### 4. Lobby profiles and readiness

Before start, members can update:

- Display name
- Player color
- Ready state

Profiles lock once the game begins.

Starting requires:

- The requesting player is the host
- Room is still in the lobby
- Exactly five or six members
- Every member is ready
- Every member is currently connected

This prevents a host from starting into a missing player's setup turn.

### 5. Reconnectable player sessions

Each seat receives:

- Room code
- Player ID
- 256-bit reconnect token

Resume validation uses a constant-time token comparison after length validation.

Presence tracks connection IDs rather than a single boolean. This allows multiple live connections for the same session without one tab closing and incorrectly marking the seat offline.

On disconnect:

- The connection is removed
- Room presence is rebroadcast
- The player, seat, hand, and game state remain intact

On resume:

- The bearer token restores the exact player ID
- The connection is attached to the existing seat
- A fresh viewer-specific snapshot is returned
- Presence is rebroadcast to the table

A socket already bound to one player session cannot create, join, or resume as another seat.

### 6. Server-authoritative game start

The server owns all game creation inputs:

- Secret random board seed
- Random starting seat
- Terrain assignment
- Number token assignment
- Development deck order
- Port placement

The seed and development deck are never sent to clients.

The game is created through the existing engine's `createGame()` function and retains all invariants, versioning, and event replay behavior from Sessions 1–5.

### 7. Extended port generator

Added `createVariablePortPlacements()` to the engine.

It:

- Finds all coastal graph edges
- Orders them around the island perimeter
- Selects eleven distributed unique edges
- Uses the official extended inventory of six generic and five specialized ports
- Shuffles port kinds deterministically from the private game seed
- Creates ports through the existing coastal-edge validator

The result is deterministic for replay while remaining unpredictable before the server publishes the board.

### 8. Server-owned command execution

Only the game server calls `handleCommand()` in multiplayer.

Each client command is wrapped with:

- Authenticated actor ID from the socket session
- Client command ID
- Client expected version
- Runtime-validated command body

The server supplies:

- Cryptographically secure dice values
- Cryptographically secure steal indices

Clients cannot choose their player ID, dice, random resource, board seed, or development deck.

Engine rejections are returned as stable protocol errors, including:

- Stale version
- Wrong turn
- Wrong phase
- Illegal placement
- Insufficient resources
- Invalid trade
- Invalid robber target
- Game already over

Accepted commands update one room synchronously and broadcast the resulting version to that room only.

### 9. Domestic trade consent protocol

Direct multiplayer `DOMESTIC_TRADE` commands are blocked with `TRADE_ACCEPTANCE_REQUIRED`.

Instead, Player 1 creates a trade offer containing:

- Named partner
- Cards offered
- Cards requested
- Current game version

Offer creation validates:

- Player 1 action phase
- Initiator is the active Player 1
- Partner exists and differs from actor
- Both hands can currently fund the terms
- Neither side is empty
- Offered and requested resource types do not overlap
- Game version has not changed

The named partner can accept or reject. Only the initiator can cancel.

Acceptance:

- Revalidates the offer against the unchanged game version
- Executes the engine's atomic domestic trade as the original actor
- Advances game version once
- Broadcasts private updated hands only to their owners

Every accepted game command clears pending offers. This prevents accepting stale terms after a build, roll, card play, subturn transition, or other resource-changing action.

### 10. Viewer-specific game snapshots

The authoritative `GameState` is never JSON serialized to a socket.

`projectGameForViewer()` creates a dedicated DTO containing public data:

- Game and event versions
- Current phase and paired-turn positions
- Renderable topology arrays
- Terrain and number tokens
- Ports
- Roads and buildings
- Robber location
- Public bank supply
- Development deck count
- Public scores
- Piece supplies
- Played Knight counts
- Longest Road and Largest Army holders
- Every player's total resource and development-card count

Only the viewing player receives:

- Exact resource hand
- Exact owned development cards
- Card purchase-turn metadata required for legal UI states

Every opponent's exact hand and development-card list is `null`, while public card counts remain available to the interface.

The snapshot deliberately omits:

- Board/deck seed
- Development deck contents or order
- Reconnect tokens
- Hidden opponent Victory Point cards
- Opponent resource composition

### 11. Viewer-specific event projections

Authoritative events are projected independently for each recipient.

Protected event data includes:

- Starting resources: exact bundle only for recipient player
- Production: exact bundle only for recipient player, counts for others
- Discards: exact bundle only for discarding player
- Robber steal: resource type only for thief and victim
- Development purchase: card identity only for purchaser
- Maritime trade: resulting hand only for actor
- Domestic trade: resulting hand only for each participating owner
- Game win: public score only, never authoritative hidden-card total

Command-acceptance bookkeeping events are omitted from broadcasts.

Public board, dice, phase, played development card, award, and building events retain the fields needed for animations and activity text.

### 12. WebSocket gateway

Added a WebSocket gateway at:

```text
/socket
```

Gateway behavior includes:

- Text JSON only
- 32 KiB maximum message payload
- Runtime schema validation
- Request correlation
- Per-connection message rate window
- Per-socket session binding
- Room-scoped broadcast fanout
- Personalized snapshot and event projection per recipient
- Ping/pong application messages
- WebSocket heartbeat pings
- Dead connection termination
- Graceful close support

Messages from one room are never broadcast to another room.

### 13. HTTP health endpoint

Added:

```text
GET /health
```

Response:

```json
{
  "ok": true,
  "service": "kaataan-game-server"
}
```

Unknown HTTP paths return a JSON 404.

### 14. Server process lifecycle

The server listens on `127.0.0.1:4180` by default.

Configurable environment variables:

```text
KAATAAN_SERVER_HOST
KAATAAN_SERVER_PORT
```

`SIGINT` and `SIGTERM` close sockets and the HTTP listener gracefully.

Root scripts added:

```text
pnpm dev:server
pnpm start:server
```

### 15. Testability boundaries

The room manager accepts injected generators for:

- Player IDs
- Reconnect tokens
- Invite codes
- Game seed
- Random integers
- Time

Production defaults use `node:crypto`. Tests use deterministic sources without weakening runtime behavior.

## Automated verification

```text
pnpm typecheck
Result: passed for game-engine, protocol, web, and game-server

pnpm test
Engine: 64 passed
Protocol: 2 passed
Web: 3 passed
Game server: 7 passed
Total: 76 passed
Failures: 0

pnpm build
Web production build: passed
```

### New server unit coverage

- Create and join rooms
- Unique color and name enforcement
- Profile changes
- Lobby host transfer
- Start authorization
- Five-player minimum
- Readiness requirements
- Connected-player requirements
- Secure reconnect rejection and success
- Presence changes
- Credential omission from snapshots
- Secret seed omission
- Twenty-command five-player setup
- Stale command rejection
- Viewer-specific hand privacy
- Viewer-specific development-card privacy
- Private starting resources
- Private discards
- Private stolen resources
- Private development purchases
- Domestic trade bypass rejection
- Named-partner-only acceptance
- Atomic accepted trade
- Offer cleanup

### Multi-client integration coverage

One integration test starts a real server on an ephemeral port and opens five independent WebSocket clients.

It verifies:

- HTTP health endpoint
- Host room creation
- Case-insensitive invite-code joining
- Five-member synchronization
- Readiness broadcast
- Host game start
- Eleven published ports
- Owner-only private hand
- Opponent hand redaction
- Out-of-turn command rejection
- Disconnect presence broadcast
- Reconnect with preserved identity and private view
- Malformed message rejection
- Clean socket and server shutdown

## Running the server

Install dependencies:

```bash
pnpm install
```

Start the authoritative server:

```bash
pnpm dev:server
```

Health check:

```text
http://127.0.0.1:4180/health
```

WebSocket endpoint:

```text
ws://127.0.0.1:4180/socket
```

The Session 6 local browser remains available separately with:

```bash
pnpm dev
```

## Current boundary

The multiplayer service is intentionally in-memory in this session.

Consequences:

- Rooms do not survive a server process restart.
- A single process owns all active rooms.
- There is no database-backed event transcript yet.
- Reconnect works across socket/browser interruptions while the server remains alive.
- Horizontal scaling requires room affinity or a shared command/event store.

This is appropriate for validating the end-to-end protocol and local multiplayer behavior. Persistence and distributed deployment should be added after the browser uses this transport and the complete user flow is proven.

## Recommended next session

Stitch the multiplayer service into the visual client.

Recommended scope:

1. Add the browser WebSocket transport with request correlation and automatic reconnect.
2. Store the reconnect credential safely for reload recovery.
3. Build create-room and join-code screens.
4. Build the room lobby with profile editing, color selection, invite copying, presence, ready state, and host start.
5. Hydrate the viewer-specific DTO into the existing renderer-facing state boundary.
6. Replace `dispatchLocal()` with network game commands.
7. Replace the Session 6 direct player-trade submission with offer/accept/reject/cancel UI.
8. Add connection-state, stale-version recovery, and reconnect overlays.
9. Run two-browser and five-client UI tests against the real server.

After that stitching session, a user will be able to create a room in the website, share its invite code, wait for friends, and play the existing SVG game interface through the authoritative WebSocket server.
