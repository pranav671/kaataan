# Session 10 Implementation: Host Player Removal

Date: 2026-08-01

Status: Implemented

## Objective

Allow the room host to remove unwanted players safely before the game begins.

## Completed work

### Protocol

Added:

- Client message: `room.kick`
- Server message: `session.kicked`

The request identifies the target player through their server-issued player ID. The server notification gives every live connection for the removed session an immediate reason for returning to the entry screen.

### Authoritative server behavior

Added `RoomManager.kickMember()` with the following rules:

- The room must still be in the lobby.
- Only the current host may remove a player.
- The host cannot remove themselves; they must use Leave room instead.
- The target must still be a member of the room.
- Remaining player seats are compacted after removal.
- The updated room is written to persistent storage.
- The removed reconnect token becomes invalid immediately.

The WebSocket server finds every socket belonging to the removed player, sends `session.kicked`, and removes its room binding. The socket may then create or join another room without reconnecting.

Remaining members receive the updated lobby snapshot immediately.

### Browser client behavior

On `session.kicked`, the multiplayer client:

- Clears the stored reconnect credentials.
- Clears the room and event snapshots.
- Returns to the create/join screen.
- Displays “The host removed you from this room.”

Reloading does not attempt to resume the removed seat.

### Lobby interface

Hosts now see a Remove control beside every other occupied lobby seat.

Removal uses a two-step inline confirmation:

1. Select Remove beneath the player's status.
2. Choose Cancel or the destructive Remove confirmation.

Non-hosts never receive the control. It is absent from the active game because the server locks removal after game start.

## Tests added

- Protocol parsing for `room.kick`
- Host-only authorization
- Host self-removal rejection
- Seat compaction
- Removed reconnect-token rejection
- WebSocket notification and room rebroadcast
- Reuse of the unbound socket after removal
- Playwright host-removal journey
- Browser credential clearing after removal and reload

## Verification

Completed successfully:

- Full TypeScript checking
- 64 game-engine tests
- 2 protocol tests
- 4 web model/hydration tests
- 9 room-manager tests
- Production web build

The WebSocket integration and new Playwright scenario are implemented, but their final local execution was blocked by the environment's approval-usage limit for localhost/browser processes. They are included in the normal verification command:

```bash
pnpm verify
```

## Main files updated

```text
packages/protocol/src/schema.ts
packages/protocol/src/dto.ts
packages/protocol/src/tests/schema.test.ts
apps/game-server/src/roomManager.ts
apps/game-server/src/server.ts
apps/game-server/src/tests/roomManager.test.ts
apps/game-server/src/tests/server.integration.test.ts
apps/web/src/multiplayer/client.ts
apps/web/src/components/LobbyScreen.tsx
apps/web/src/styles.css
tests/e2e/multiplayer.spec.ts
```
