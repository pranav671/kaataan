# Session 9 Implementation: Multiplayer Hardening and Deployment

Date: 2026-08-01

Status: Complete

## Objective

Harden the complete multiplayer application delivered in Session 8:

- Preserve lobby and active-game state across server restarts.
- Expand domestic trading to arbitrary resource bundles and counteroffers.
- Prevent trade proposals from probing another player's private hand.
- Add repeatable browser-level multiplayer tests.
- Package the website and authoritative server for production deployment.

## Completed work

### 1. Atomic file-backed room persistence

Added `apps/game-server/src/persistence.ts`.

The persistence layer stores a versioned server-only document containing:

- Room code, creation time, status, and host
- Player IDs, names, colors, seats, readiness, and reconnect tokens
- Pending domestic trade negotiation
- Complete authoritative `GameState`

The game serializer preserves all map-based engine structures:

- Hex, vertex, and edge topology maps
- Tile map and private board seed
- Building and road occupancy maps
- Player state map and private hands
- Development deck and owned/resolved development cards
- Bank inventory
- Phase, version, event sequence, paired-turn markers, and dice result
- Ports, robber position, Longest Road, and Largest Army

Writes are durable snapshots rather than append-only events. Every mutation writes a temporary file in the destination directory and atomically renames it over the active document. The resulting file is restricted to mode `0600`.

The format includes `formatVersion: 1`; an unsupported document fails startup explicitly rather than silently discarding rooms.

### 2. Restart recovery semantics

`RoomManager` accepts a `RoomPersistence` adapter and restores rooms during construction.

Durable writes occur after:

- Room creation and joining
- Profile and readiness changes
- Game start
- Every accepted game command
- Trade creation, countering, acceptance, rejection, and cancellation
- Lobby/finished-room departures and host transfer

Live connection IDs are intentionally excluded. After restart:

- Every restored player initially appears offline.
- Their seat and private state remain intact.
- Their reconnect token can resume the exact session.
- Presence becomes live only after a real socket reconnects.

The standalone server enables persistence when `KAATAAN_DATA_FILE` is configured. Development remains in-memory by default.

### 3. Multi-card domestic trades

The fixed one-for-one browser trade interaction was replaced with a resource-bundle composer.

Players may now:

- Offer multiple cards of one resource.
- Combine several resource types.
- Request an arbitrary multi-resource bundle.
- Adjust each resource with accessible increment/decrement controls.
- See their own available-card limits while composing.
- Avoid placing the same resource on both sides of a trade.

Bank and port trades retain their focused rate-based selector.

### 4. Counteroffer negotiation

Added the `trade.counter` protocol message and `proposedById` to trade projections.

A domestic negotiation preserves the authoritative Player 1 as `actorId` for engine execution, while `proposedById` records which participant proposed the latest terms. This distinction is essential because a counteroffer from the partner must still execute the final engine command as the active Player 1.

Negotiation flow:

1. Player 1 creates an offer.
2. The recipient can accept, decline, or counter.
3. A counter replaces the earlier offer atomically.
4. The original player can accept, decline, or counter again.
5. The latest proposer may cancel while waiting.
6. Acceptance executes the final terms through the game engine.

Only one current offer exists for the negotiation, so stale buttons cannot accept superseded terms.

### 5. Trade privacy hardening

Offer creation no longer validates the requested cards against the recipient's hidden hand.

Before this change, repeatedly proposing trades could reveal whether an opponent held a specific requested combination based on acceptance or rejection from the server.

The server now validates only:

- Both sides are non-empty.
- The same resource is not exchanged in both directions.
- The proposer owns every card they personally promise.
- Counts are bounded by the protocol.

The recipient's actual hand is checked only when they consciously accept the terms. This preserves hidden-hand privacy during proposal creation.

Protocol resource counts are capped at 24 per type to reject nonsensical oversized inputs.

### 6. Automated browser tests

Added Playwright as a root development dependency with:

```text
playwright.config.ts
tests/e2e/multiplayer.spec.ts
```

The browser test automatically starts isolated web and WebSocket servers on ports 4190 and 4191.

It verifies:

- The browser connects to the game server.
- A host creates a private room.
- Four separate browser contexts follow the invite code.
- Each context joins with a unique name and color.
- The host sees all five synchronized seats.
- Reloading resumes the host's stored player session.
- All five players ready up from independent contexts.
- The host's start control becomes enabled.
- Starting transitions every client to the authoritative game.
- The interactive thirty-tile SVG board is visible.

The test runs headlessly against installed Chrome and retains screenshots/traces on failure.

New commands:

```bash
pnpm test:e2e
pnpm verify
```

`pnpm verify` runs type checking, all unit/integration tests, browser tests, and the production web build.

### 7. Production container topology

Added:

```text
.dockerignore
compose.yaml
apps/game-server/Dockerfile
apps/web/Dockerfile
apps/web/nginx.conf
DEPLOYMENT.md
```

The production stack contains:

- A Node 24 authoritative game-server container
- A multi-stage React build served by Nginx
- A private Docker network between services
- A named `kaataan-data` volume mounted at `/data`
- Container health checks
- Automatic restart policies
- Only port 8080 exposed publicly by default

Nginx:

- Serves the single-page application.
- Falls back to `index.html` for client routes.
- Proxies `/socket` with WebSocket upgrade headers.
- Proxies `/server-health` to the authoritative service.
- Exposes `/health` for the web container.
- Applies basic content, referrer, and frame security headers.

Production browser builds use a same-origin `/socket` URL. When the public site uses HTTPS, the browser automatically selects `wss://`.

### 8. Deployment and operations guide

`DEPLOYMENT.md` documents:

- Local production startup
- Both health endpoints
- Persistent volume behavior
- Backup and token-security considerations
- Public TLS/reverse-proxy requirements
- Environment variables
- Upgrade procedure
- Single-replica limitation of file persistence
- Horizontal-scaling prerequisites

The persistence document contains reconnect bearer tokens and private game data. It must be backed up and protected like application credentials.

## Verification

### Complete pipeline

```text
pnpm verify
```

Result:

```text
79 unit/integration tests passed
1 automated five-browser multiplayer test passed
0 failures
Type checking passed
Production web build passed
```

### Container verification

Both production images built successfully:

```text
kaataan-game-server:latest
kaataan-web:latest
```

The Compose topology validated and both containers reached healthy state.

Verified endpoints:

```text
GET /health        -> ok
GET /server-health -> {"ok":true,"service":"kaataan-game-server"}
```

### Real restart recovery verification

The production deployment was exercised in the visible browser:

1. Opened the Nginx-served application at `http://127.0.0.1:8080`.
2. Created room `VTUCQR` as `Persistence QA`.
3. Restarted the game-server container.
4. Reloaded the browser.
5. Automatically resumed the same room, host seat, profile, color, and reconnect session.

This validates the complete chain:

```text
Browser local credentials
  -> same-origin Nginx WebSocket proxy
  -> restarted authoritative server
  -> persisted Docker volume
  -> RoomManager restoration
  -> token-authenticated session resume
```

The verification containers were stopped afterward. The named data volume was preserved, matching normal upgrade behavior.

## Primary files added

```text
apps/game-server/src/persistence.ts
playwright.config.ts
tests/e2e/multiplayer.spec.ts
apps/game-server/Dockerfile
apps/web/Dockerfile
apps/web/nginx.conf
compose.yaml
DEPLOYMENT.md
.dockerignore
.gitignore
```

## Primary files updated

```text
apps/game-server/src/index.ts
apps/game-server/src/roomManager.ts
apps/game-server/src/server.ts
apps/game-server/src/tests/roomManager.test.ts
apps/web/src/components/OnlineGameTable.tsx
apps/web/src/components/TradeDialog.tsx
apps/web/src/components/TradeOfferBanner.tsx
apps/web/src/multiplayer/client.ts
apps/web/src/styles.css
packages/protocol/src/dto.ts
packages/protocol/src/schema.ts
packages/protocol/src/tests/schema.test.ts
package.json
pnpm-lock.yaml
```

## Current production architecture

```text
Public HTTPS origin
        |
Nginx static UI + /socket upgrade proxy
        |
Authoritative WebSocket game server
        |
RoomManager
        |
Atomic versioned room snapshot
        |
Persistent encrypted/backed-up volume
```

## Logical next session

The next production-hardening chunk should focus on operational maturity:

1. Add structured logs, metrics, request correlation, and health detail.
2. Add persistence retention for abandoned lobby and completed rooms.
3. Add snapshot backup rotation and corruption recovery from the last valid backup.
4. Add authentication or signed invite controls if rooms must survive link leakage.
5. Expand Playwright coverage through setup placements, trade negotiation UI, reconnect during an active turn, and game-over return flow.
6. Add a shared transactional store and room affinity before attempting horizontal scaling.
7. Add CI to run `pnpm verify` and build both images on every change.

At the end of Session 9, Kaataan supports durable single-server multiplayer deployment, negotiated multi-card trades, repeatable browser validation, and a tested production container stack.
