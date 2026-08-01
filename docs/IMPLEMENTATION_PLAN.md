# Kaataan: Full-Stack Multiplayer Game Plan

## 1. Product definition

Kaataan will be a browser-based, server-authoritative implementation of the 5–6-player CATAN ruleset described in `CATAN_EXTENDED.pdf`.

The intended flow is:

1. A player opens the site and chooses a display name.
2. They create a private room and receive a short invite code and shareable URL.
3. Up to six total players join, choose available colors, and mark themselves ready.
4. The host selects supported game options and starts the game.
5. The server creates the board, runs setup, validates every action, and synchronizes all clients.
6. Disconnected players can return to the same seat and private hand.
7. The game ends when an eligible player reaches 10 victory points on their own player-turn.

The initial supported table should be **5 or 6 total players** because that is the supplied extension's scope. “Host plus 5 friends” is six total players. Supporting seven total players would require a different ruleset and board.

### Non-goals for the first release

- Computer-controlled players
- Public matchmaking and ranking
- Spectators
- Voice/video chat
- Multiple expansions mixed together
- Native mobile applications
- A level editor or arbitrary board shapes

These can be added after the rules engine and multiplayer protocol are stable.

## 2. Rules authority and locked specification

The version-one rules are locked by two supplied official sources:

1. `docs/CATAN_ORIGINAL.pdf` - 2020 fifth-edition English base Game Rules & Almanac.
2. `docs/CATAN_EXTENDED.pdf` - 2022 revision of the 5–6 Player Extension using paired-player rules.

The extension takes precedence wherever it changes the base game, specifically the larger board and supply, 5–6-player setup, combined trade/build action windows, and paired-player turn. The base Almanac governs every mechanic the extension leaves unchanged.

The normative, implementation-ready rule decisions are maintained in [`docs/rules/RULES_SPECIFICATION.md`](rules/RULES_SPECIFICATION.md). Each rule includes its source page and expected engine behavior. Code and tests should reference stable rule IDs from that document.

The extension specifies:

- A 30-terrain-hex board using all base and extension terrain hexes
- 28 numbered tokens, with deserts skipped during token placement
- Two deserts, with the robber initially placed on either one
- 11 harbors when randomized
- Per-player inventories of 5 settlements, 4 cities, and 15 roads
- An enlarged resource-card and development-card supply
- The normal resource-production, trade, and build phases
- A paired-player turn replacing the older “special building phase”
- Player 2 sitting third to the left of Player 1
- Player 1 rolling and trading with players or the supply
- Player 2 trading only with the supply, while still being able to build and play one eligible Knight/progress card
- Both markers moving one seat left after the paired turn
- Winning at 10 or more points on an eligible part of the turn, with Player 1 taking precedence before Player 2 acts

The base Almanac resolves the previously identified gaps:

- Exact build prices and piece limits
- Settlement distance, road connectivity, and city upgrades
- Dice production and per-resource bank-shortage handling
- Rolling 7, discarding, moving the robber, and random stealing
- Domestic and maritime trade restrictions and harbor rates
- Development-card composition, effects, secrecy, and play timing
- Longest Road and Largest Army qualification, transfer, interruption, and ties
- Public and hidden victory points and win timing
- Two-round initial setup and starting-resource distribution

No core rule is now intentionally left to developer memory. Any behavior not stated by either source must be recorded as an `IMPLEMENTATION` decision in the rules specification before it is coded.

## 3. Recommended architecture

Use a TypeScript monorepo so browser UI, server, protocol, and rules types stay synchronized.

```text
apps/
  web/                 React/Next.js browser application
  game-server/         Node.js HTTP + WebSocket authoritative server
packages/
  game-engine/         Pure rules, topology, reducers, validation, scoring
  protocol/            Commands, events, schemas, public/private DTOs
  ui/                  Shared UI components and design tokens
  config/              TypeScript, lint, formatting, and test presets
  test-fixtures/        Deterministic boards, hands, and game transcripts
docs/
  rules/               Rules decision table and source references
  architecture/        Protocol and state diagrams
```

Recommended initial stack:

- Web: Next.js, React, TypeScript, Tailwind CSS or CSS Modules
- Board: React-rendered SVG, backed by renderer-independent board geometry
- Server: Node.js with Fastify and Socket.IO (or native WebSocket plus a typed protocol)
- Runtime validation: Zod schemas shared by client and server
- Database: PostgreSQL with Prisma or Drizzle
- Ephemeral presence/scaling: Redis when deploying more than one game-server instance
- Testing: Vitest, Testing Library, Playwright, and property-based tests with fast-check
- Observability: structured logs, error tracking, and basic metrics
- Packaging: pnpm workspaces and Turborepo

### Renderer decision: use SVG for version one

The 5–6-player board has only 30 tiles, 80 unique vertices, and 109 unique edges. SVG can render this comfortably while providing native hit targets, hover/focus states, CSS styling, accessible labels, and straightforward automated testing. Pan and zoom can be implemented by changing the SVG view box or using a transform wrapper.

The board is mostly static. A typical action changes one road, one building, the robber, a small set of highlights, or an animation overlay. React does not need to redraw a continuously moving world at 60 frames per second. Terrain art can still be raster images clipped by SVG hexagons, while roads, buildings, ports, tokens, highlights, and hit areas remain vector elements.

Use browser Pointer Events for mouse, pen, and touch. Implement pan/zoom as a small board-camera utility that owns `{ x, y, scale }`, converts screen coordinates to board coordinates, clamps scale and bounds, and updates one SVG `<g>` transform. No third-party geometry library is required for the first version; the axial-coordinate and topology utilities should be project-owned, deterministic, and comprehensively tested.

### SVG, Konva, and Phaser 3 comparison

| Criterion | React SVG | React Konva | Phaser 3 |
| --- | --- | --- | --- |
| Rendering model | Browser DOM/vector graphics | Retained object model over Canvas 2D | Full WebGL/Canvas game framework |
| Fit for 30 tiles and roughly 200 interactive locations | Excellent | Excellent but unnecessary headroom | Excellent but substantially more machinery |
| React integration | Native JSX and React events | Official `react-konva` bindings | Official templates, but React and Phaser communicate across a bridge/event bus |
| Shape hit testing | Native SVG pointer events; add wider invisible hit strokes/circles | Built-in hit-graph canvas and shape events | Built-in interactive Game Objects and unified input system |
| Pan and zoom | Small transform/view-box controller | Stage drag/scale or custom camera logic | Built-in 2D cameras, bounds, pan, and zoom |
| Animation | CSS/Web Animations or a small tween helper | Built-in tweens and canvas redraws | Full update loop, tweens, particles, sprites, cameras, audio, loaders |
| Accessibility | Best option: elements can have labels, focus, and DOM relationships | Canvas needs a parallel accessible DOM representation | Canvas needs a parallel accessible DOM representation |
| Browser automation | Direct stable selectors for hex, vertex, and edge IDs | Coordinate/adapter testing plus Konva-node tests | Coordinate/scene-adapter testing plus Phaser-object tests |
| Visual scalability | More than sufficient at this board size | Better for thousands of canvas shapes | Best when many sprites/effects move every frame |
| Architectural cost | Lowest | Moderate additional rendering abstraction | Highest: scene lifecycle and React/Phaser state synchronization |
| Recommendation | **Use now** | Keep as the first canvas migration candidate | Use only after a deliberate shift toward a sprite-heavy game client |

Konva is a good library: it supplies layers, shape objects, event bubbling, drag/drop, animations, caching, and a hidden hit canvas, with official React bindings. Its main benefit here would be convenient canvas interaction, not required performance. Its main costs are losing semantic DOM elements for board locations, building an accessibility mirror, and making browser tests less direct.

Phaser 3 supplies much more than a renderer: scenes, display lists, a frame update loop, asset loading, input, cameras, tweens, sound, sprites, particles, and optional physics. Those systems are useful for an arcade-style or highly animated game. For Kaataan they would coexist with React, which would still be preferable for the lobby, player panels, cards, dialogs, trades, forms, and responsive layout. Maintaining the Phaser scene plus the React/server state bridge would add complexity without improving rules correctness or ordinary board interaction.

Official references used for this decision:

- [Konva overview](https://konvajs.org/docs/) and [React integration](https://konvajs.org/docs/react/index.html)
- [Konva architecture and hit graph](https://konvajs.org/docs/overview.html)
- [Phaser overview](https://docs.phaser.io/) and [Scene model](https://docs.phaser.io/phaser/concepts/scenes)
- [Phaser input](https://docs.phaser.io/phaser/concepts/input) and [camera system](https://docs.phaser.io/phaser/concepts/cameras)
- [MDN canvas accessibility guidance](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/canvas)

### Keep the renderer replaceable

The rules engine and topology package must never import React, SVG, Konva, or Phaser. Add a narrow UI boundary:

```ts
interface BoardViewport {
  center: { x: number; y: number };
  scale: number;
}

interface BoardRenderModel {
  hexes: readonly RenderHex[];
  vertices: readonly RenderVertex[];
  edges: readonly RenderEdge[];
  legalTargets: ReadonlySet<HexId | VertexId | EdgeId>;
  selection: HexId | VertexId | EdgeId | null;
}

interface BoardInteractionHandlers {
  onHexSelect(id: HexId): void;
  onVertexSelect(id: VertexId): void;
  onEdgeSelect(id: EdgeId): void;
  onViewportChange(viewport: BoardViewport): void;
}
```

`SvgBoard` consumes this render model now. A future `KonvaBoard` can consume the same model and handlers without changing game commands, graph IDs, validation, or server state.

Reconsider Konva only if profiling on target mobile devices demonstrates an actual SVG bottleneck, or if the visual design grows to thousands of independently animated shapes, frequent full-board effects, or canvas-specific filters. Reconsider Phaser only if the product direction changes to a continuously animated game world with sprite sheets, particles, audio choreography, scene transitions, or physics. Migration must be triggered by measured needs, not by the fact that the product is called a game.

## 4. Board topology and graph model

The board must be modeled as topology, not inferred from screen pixels.

### Core topology types

```ts
type HexId = string;
type VertexId = string;
type EdgeId = string;

interface HexTile {
  id: HexId;
  coordinate: { q: number; r: number }; // axial hex coordinate
  terrain: "forest" | "hills" | "pasture" | "fields" | "mountains" | "desert";
  token: 2 | 3 | 4 | 5 | 6 | 8 | 9 | 10 | 11 | 12 | null;
  vertexIds: readonly [VertexId, VertexId, VertexId, VertexId, VertexId, VertexId];
  edgeIds: readonly [EdgeId, EdgeId, EdgeId, EdgeId, EdgeId, EdgeId];
}

interface Vertex {
  id: VertexId;
  position: { x: number; y: number }; // renderer coordinate only
  adjacentHexIds: readonly HexId[];   // length 1, 2, or 3
  adjacentEdgeIds: readonly EdgeId[];
  neighboringVertexIds: readonly VertexId[];
  portId: string | null;
}

interface Edge {
  id: EdgeId;
  vertexIds: readonly [VertexId, VertexId];
  adjacentHexIds: readonly HexId[];   // length 1 on coast, 2 inland
  portId: string | null;
}

interface Port {
  id: string;
  edgeId: EdgeId;
  vertexIds: readonly [VertexId, VertexId];
  trade: { give: 3; resource: null } | { give: 2; resource: ResourceType };
}
```

### Generation method

1. Represent each hex center with an axial coordinate `(q, r)`.
2. Use the fixed extended-board shape with row lengths `3, 4, 5, 6, 5, 4, 3`.
3. Generate six logical corners for each hex using an integer corner lattice, not floating-point equality.
4. Canonicalize shared corners into one `VertexId`.
5. Canonicalize an edge by the sorted pair of its endpoint vertex IDs.
6. Populate adjacency in both directions.
7. Attach each harbor to one coastal edge and therefore to exactly two vertices.
8. Assign terrain and tokens separately from topology so fixed and randomized setups share the same graph.
9. Persist a board-layout version with every game so later generator changes cannot corrupt replays.

An alternative safe implementation is to generate the topology once, verify it, and save a versioned JSON template. Runtime games clone the template and randomize only terrain, numbers, and ports.

### Topology invariants to test

- Exactly 30 hexes, 80 unique vertices, and 109 unique edges
- Every hex has six distinct vertices and six distinct edges
- Every edge has exactly two endpoints
- Every vertex touches one, two, or three hexes
- Every inland edge touches two hexes; every coastal edge touches one
- Every neighboring-vertex relationship has exactly one matching edge
- A harbor edge is coastal and exposes the harbor to both endpoints
- No port is accessible from a non-endpoint vertex
- Occupancy permits at most one building per vertex and one road per edge

### Occupancy is separate from topology

```ts
interface BoardOccupancy {
  buildingsByVertex: Record<VertexId, {
    playerId: string;
    kind: "settlement" | "city";
  }>;
  roadsByEdge: Record<EdgeId, { playerId: string }>;
  robberHexId: HexId;
}
```

This separation makes legal-move calculation, board rendering, replay, and testing much simpler.

## 5. Domain model and engine design

Use serializable domain objects plus pure rule functions rather than stateful class instances. Classes are appropriate for infrastructure services, but immutable state and reducers are safer for replay, reconnects, tests, and server scaling.

### Principal entities

- `Room`: invite code, host, members, room settings, presence, status
- `Member`: stable session identity, display name, avatar/profile choices
- `Game`: ruleset version, board, players, bank, deck, awards, turn, phase, version
- `PlayerState`: seat, color, pieces remaining, resource hand, development cards, army size, points
- `BankState`: resource counts and development-card deck
- `TradeOffer`: proposer, recipients, offered/requested resources, lifecycle
- `TurnState`: active markers, dice result, current phase, pending mandatory choices
- `GameEvent`: immutable record of an accepted action and its public/private result

### Resource and development cards

```ts
type ResourceType = "brick" | "lumber" | "wool" | "grain" | "ore";
type ResourceHand = Record<ResourceType, number>;

type DevelopmentCardType =
  | "knight"
  | "road_building"
  | "year_of_plenty"
  | "monopoly"
  | "victory_point";

interface OwnedDevelopmentCard {
  id: string;
  type: DevelopmentCardType;
  purchasedPlayerTurn: number;
  played: boolean;
}
```

The server owns the shuffled deck order. Other clients receive only a player's resource-card count, unplayed development-card count, played cards, public army size, and public score. They must never receive another player's hand or the remaining deck order.

### Commands, reducers, and events

Clients send intentions, never state mutations:

```ts
type GameCommand =
  | { type: "ROLL_DICE" }
  | { type: "PLACE_INITIAL_SETTLEMENT"; vertexId: VertexId }
  | { type: "PLACE_INITIAL_ROAD"; edgeId: EdgeId }
  | { type: "BUILD_SETTLEMENT"; vertexId: VertexId }
  | { type: "BUILD_CITY"; vertexId: VertexId }
  | { type: "BUILD_ROAD"; edgeId: EdgeId }
  | { type: "BUY_DEVELOPMENT_CARD" }
  | { type: "PLAY_DEVELOPMENT_CARD"; cardId: string; choice: unknown }
  | { type: "SUBMIT_DISCARD"; cards: ResourceHand }
  | { type: "MOVE_ROBBER"; hexId: HexId }
  | { type: "STEAL_FROM_PLAYER"; targetPlayerId: string }
  | { type: "CREATE_TRADE_OFFER"; give: ResourceHand; receive: ResourceHand; recipients: string[] }
  | { type: "ACCEPT_TRADE_OFFER"; offerId: string }
  | { type: "MARITIME_TRADE"; give: ResourceType; receive: ResourceType; count: number }
  | { type: "END_SUBTURN" };
```

For each command, the engine should:

1. Validate actor identity and expected game version.
2. Validate that the command is allowed in the current phase.
3. Compute legal choices from authoritative state.
4. Validate costs, connectivity, inventory, and card timing.
5. Produce immutable domain events.
6. Reduce events into the new state.
7. Recalculate awards and victory eligibility.
8. Persist the transaction atomically.
9. Publish a redacted public update and private per-player updates.

Rejected actions return a stable machine-readable code such as `NOT_YOUR_TURN`, `WRONG_PHASE`, `INSUFFICIENT_RESOURCES`, or `ILLEGAL_VERTEX`, plus a user-readable message.

## 6. Game state machine

Use an explicit finite state machine. Avoid scattered boolean flags such as `hasRolled`, `mustMoveRobber`, and `isBuildingRoadCard` without a governing phase.

```text
LOBBY
  -> SETUP_SELECT_START_PLAYER
  -> SETUP_FORWARD: settlement then adjacent road for seats 1..N
  -> SETUP_REVERSE: settlement then adjacent road for seats N..1
  -> TURN_PLAYER_1_PRE_ROLL: optionally play 1 eligible Knight/progress card, then roll
      -> RESOLVE_DISCARDS (if 7)
      -> MOVE_ROBBER
      -> SELECT_STEAL_TARGET
      -> TURN_PLAYER_1_ACTIONS
  -> TURN_PLAYER_2_ACTIONS
  -> ADVANCE_PAIRED_MARKERS
  -> TURN_PLAYER_1_PRE_ROLL
  -> GAME_OVER
```

Nested pending decisions are also explicit:

- `DISCARDING`: all affected players submit simultaneously; individual selections stay private
- `ROBBER_MOVE`: active Player 1 chooses a non-current hex
- `ROBBER_STEAL`: active Player 1 chooses among eligible adjacent opponents
- `ROAD_BUILDING`: player places up to two legal free roads sequentially
- `YEAR_OF_PLENTY`: player selects up to two available bank resources
- `MONOPOLY`: player selects one resource

`TURN_PLAYER_1_PRE_ROLL` must still end in a mandatory dice roll. If Player 1 plays an eligible Knight or progress card before rolling, fully resolve that card and then return to the pre-roll phase with Knight/progress-card play disabled for that player's turn. Player 2 has no pre-roll phase and may play an eligible Knight/progress card only during their action window. Victory Point cards use their reveal-to-win exception.

### Paired-player implementation

- `player1Seat` is the rolling player.
- `player2Seat = (player1Seat + 3) mod playerCount`.
- Player 1 resolves production/7 and may then trade with players and bank, build, and play one eligible Knight/progress card if none was played before the roll.
- Player 2 acts only after Player 1 ends their player-turn; Player 2 may trade with the bank, build, and play one eligible Knight/progress card.
- Victory Point cards follow their separate reveal-to-win exception and do not consume the Knight/progress limit.
- Each player-turn has its own `developmentCardPlayedThisPlayerTurn` flag.
- After Player 2 finishes, both logical markers and the dice advance one seat left by incrementing `player1Seat`.
- Check Player 1's victory before allowing Player 2 to begin. Check Player 2 during their own eligible subturn.

## 7. Rules-engine modules

Split the engine by rule concern:

```text
game-engine/src/
  board/topology.ts
  board/generator.ts
  board/legal-builds.ts
  setup/setup-machine.ts
  production/production.ts
  robber/robber.ts
  building/costs.ts
  building/build.ts
  trading/domestic.ts
  trading/maritime.ts
  development/deck.ts
  development/effects.ts
  awards/longest-road.ts
  awards/largest-army.ts
  scoring/scoring.ts
  turn/turn-machine.ts
  commands/validate.ts
  events/reducer.ts
  visibility/project-state.ts
```

### Critical rule algorithms

#### Settlement legality

- Vertex is empty.
- Every neighboring vertex is empty (distance rule).
- During normal play, at least one adjacent edge contains the player's road.
- During initial setup, road connectivity is not required.
- Player has a settlement piece available and can pay the cost when applicable.

#### City legality

- Target vertex contains that player's settlement.
- Player has a city piece and can pay the cost.
- Return the replaced settlement piece to the player's inventory.

#### Road legality

- Edge is empty.
- At least one endpoint connects to the player's existing road or building.
- An opponent building on a vertex blocks continuity through that vertex.
- During setup, the road must touch the settlement just placed.
- Free roads from development cards do not consume resources but do consume pieces.

#### Production

- Find every non-robbed hex matching the dice total.
- For each adjacent settlement, request one matching resource; for each city, request two.
- Resolve the exact bank-shortage behavior from the base rulebook.
- Produce public totals without exposing private card types unless the rules/UI intentionally reveal them.

#### Maritime trade

- Determine the player's best rate for the resource being given: matching 2:1 port, otherwise generic 3:1 port, otherwise 4:1.
- A player owns a port by owning a settlement or city on either endpoint of its harbor edge.
- Validate both the player's cards and bank availability atomically.

#### Longest Road

Compute the longest non-repeating-edge trail in the player's road subgraph. Vertices occupied by opponents terminate traversal. Because the graph is small, a depth-first search from every eligible endpoint/junction is sufficient. Recompute after every road or building placement, since an opponent settlement may split an existing route. Apply minimum-length, transfer, and tie rules from the pinned base rules edition.

#### Largest Army

Track played Knight cards, not owned cards. Recompute after a Knight resolves and apply the minimum and tie rules from the pinned base edition.

## 8. Room, identity, and lobby system

### Identity

Start without mandatory accounts:

- On first visit, issue a signed, secure, HTTP-only session cookie.
- Store a stable member/session ID server-side.
- Let the player edit display name and optional avatar before or within a lobby.
- Use an opaque reconnect token so refreshes recover the same seat and private hand.
- Add account login later if cross-device history is required.

Never use a display name, invite code, or socket ID as authorization.

### Room lifecycle

```text
OPEN -> IN_GAME -> COMPLETED -> EXPIRED
```

Room behavior:

- Create a high-entropy, human-readable invite code and a URL containing it.
- Codes are case-insensitive and exclude ambiguous characters.
- Joining requires both the code and an authenticated anonymous session.
- Limit the room to six seated players.
- Allow unseated lobby presence only if spectators/waitlists are explicitly added.
- Host chooses allowed settings and can remove a member before the game starts.
- Players choose unique colors and mark ready.
- Start is enabled only at 5–6 players, with unique colors and every non-host player ready.
- If the host disconnects in the lobby, transfer host status deterministically after a grace period.
- Once the game starts, seats and colors are locked.
- A disconnected player's seat is reserved for reconnection.

### Lobby settings for version one

- Fixed beginner layout or randomized experienced layout
- Fixed or randomized harbors
- Five or six total players
- Optional turn timer, disabled by default
- Private game only

Do not expose settings that the engine cannot fully validate.

## 9. Multiplayer protocol and consistency

### Server-authoritative model

The client may highlight or predict legal moves for responsiveness, but the server is the only authority. Never accept a client-supplied dice result, shuffled deck, resource balance, score, or “legal” flag.

### Message envelope

```ts
interface CommandEnvelope<T> {
  commandId: string;       // idempotency key
  roomId: string;
  gameId: string;
  expectedVersion: number;
  payload: T;
}

interface ServerUpdate<T> {
  gameVersion: number;
  eventSequence: number;
  payload: T;
}
```

- Every accepted transaction increments `gameVersion`.
- Duplicate `commandId` values return the prior result rather than executing twice.
- Stale commands are rejected with a state refresh.
- Every event has a monotonic sequence number.
- Socket reconnect requests events after the client's last sequence; if unavailable, server sends a fresh snapshot.

### Public and private projections

Maintain separate DTOs:

- `PublicGameView`: board, buildings, roads, turn/phase, public scores, card counts, played cards, awards, public log
- `PrivatePlayerView`: own resource hand, own development-card identities, private discard/choice status, actionable legal choices

Generate projections on the server. Do not send full state and rely on the browser to hide fields.

### Trade protocol

Domestic trade should be a durable offer workflow rather than free-form card dragging:

1. Player 1 proposes `give` and `receive`, optionally selecting recipients.
2. Recipients may accept, reject, or counter while the offer remains valid.
3. The proposer selects an acceptance if more than one exists, or configure first-accept-wins.
4. Server revalidates both hands, phase, and participants at execution time.
5. Offers expire when the subturn ends or relevant hand state changes.

Player 2 cannot create or accept domestic trades under the paired-player rules.

## 10. Persistence model

Suggested relational tables:

```text
members
  id, display_name, avatar_key, created_at

sessions
  id, member_id, token_hash, expires_at, last_seen_at

rooms
  id, invite_code_hash, host_member_id, status, settings_json, created_at, expires_at

room_members
  room_id, member_id, seat, color, ready, joined_at, disconnected_at

games
  id, room_id, ruleset_version, board_version, state_version,
  public_snapshot_json, secret_snapshot_encrypted, status, started_at, completed_at

game_events
  game_id, sequence, command_id, actor_member_id, event_type,
  public_payload_json, secret_payload_encrypted, created_at
```

For the first deploy, a single PostgreSQL database is enough. Add Redis for socket presence, pub/sub, short-lived room locks, and rate limits when horizontally scaling.

Persist accepted commands/events and the new snapshot in one database transaction. Never log private hands, session tokens, or unredacted secret state in application logs.

### Resume and replay

- Snapshot every accepted command initially; optimize to periodic snapshots plus events later.
- On server restart, load the latest snapshot and resume the room.
- On reconnect, authenticate the session before returning private state.
- Maintain a redacted event log suitable for the in-game history panel.
- A future replay viewer can consume the same public event stream.

## 11. UI and interaction plan

### Screens

#### Landing/profile

- Game title and short explanation
- Editable display name and avatar
- “Create room” and “Join room” actions
- Invite-code input
- Resume-current-game card when applicable

#### Lobby

- Invite code and copy/share link
- Seated player list, presence, name, color, ready state
- Host settings and start control
- Clear validation explaining why the game cannot start
- Leave room and host controls

#### Game table

- Central zoomable SVG board
- Player status rail in seat order, clearly marking Player 1 and Player 2
- Own-hand resource tray and development-card tray
- Contextual action bar for roll, trade, build, card play, and end subturn
- Bank/supply summary
- Dice and phase/status banner
- Trade panel
- Event history and lightweight text chat (chat can be postponed)
- Reconnect/offline banner and action-pending feedback

#### End game

- Winner and score breakdown
- Hidden victory-point reveal if rules require it
- Awards and game statistics
- Rematch button that creates a fresh lobby with the same members/settings

### Board interaction

- Render terrain tiles first, then tokens and robber, then roads, buildings, ports, and interaction overlays.
- During a build action, show only legal vertices or edges as large invisible/semivisible hit targets.
- Hover/focus previews the piece and cost; click/tap opens a concise confirmation when the action spends resources.
- Use stable `VertexId` and `EdgeId` values in DOM data attributes and messages.
- Support mouse, touch, and keyboard focus.
- Provide pan, zoom, reset view, and fit-to-board.
- Do not make the user click the mathematically thin road line; use a wider transparent hit stroke.
- On small screens, use a full-screen board with bottom sheets for hand, trade, and history.

### Visual state conventions

- Never use color alone to distinguish players; combine color with shape, initials, or patterns.
- Clearly distinguish selectable, selected, occupied, blocked, and unavailable locations.
- Animate accepted actions briefly; snap back and show the server reason for rejected actions.
- Keep opponent card identities hidden while showing counts.
- Display the current phase in plain language, for example: “Maya must discard 4 cards” or “Player 2 may trade with the bank, build, or play a card.”

## 12. Security, abuse prevention, and fairness

- Validate every HTTP and WebSocket message with shared schemas.
- Authorize room membership and actor seat on every command.
- Rate-limit room creation, code guesses, join attempts, chat, and commands.
- Use cryptographically secure random room codes and RNG for dice/deck shuffling.
- Do not expose RNG seeds, secret deck order, hands, or steal results to unauthorized clients.
- Sanitize display names and chat; enforce length and character limits.
- Apply CSRF/origin protections to cookie-authenticated HTTP and socket handshakes.
- Encrypt secret game snapshots at rest or isolate private state with strict database access.
- Add an action audit trail using redacted events.
- Use content-security policy, secure cookies, TLS, and dependency scanning.
- Decide abandonment policy explicitly; do not let another user claim a disconnected seat using only the invite code.

For stronger verifiability later, commit to a server RNG seed hash at game start and reveal the seed after game completion, while ensuring it cannot expose hidden future draws during play.

## 13. Test strategy

### Unit and property tests

- Board topology counts and bidirectional adjacency
- Deterministic random board generation from seeds
- Settlement distance and connectivity
- City replacement/inventory behavior
- Road connectivity and opponent-building interruption
- Longest Road over branches, loops, forks, and ties
- Port ownership and best maritime rate
- Production around shared vertices and robber blocking
- Discard counts and resource conservation
- Each development-card effect and timing restriction
- Paired-player permissions and marker rotation for five and six players
- Victory timing for Player 1 and Player 2
- Resource/card/piece conservation after arbitrary valid action sequences

Property-based tests should generate many valid board occupancies and assert invariants such as nonnegative supplies, unique occupancy, and replay determinism.

### Protocol and server integration tests

- Two clients racing to build on the same edge or vertex
- Duplicate command delivery
- Stale-version command rejection
- Disconnect/reconnect during every mandatory phase
- Server restart and game recovery
- Private state never appearing in other players' payloads
- Trade invalidation when hands or phases change
- Host disconnect and lobby migration

### End-to-end browser tests

- Create room, copy code, and join from 5–6 isolated browser contexts
- Edit profile and choose unique colors
- Complete snake setup
- Roll, produce, trade, build, play cards, and end both paired subturns
- Resolve a 7 with simultaneous discards, robber move, and steal
- Finish a deterministic game and show the correct winner
- Refresh one player and recover the exact private hand
- Exercise desktop and narrow mobile layouts

### Rules regression fixtures

Represent tricky scenarios as compact JSON fixtures containing initial state, command, expected events, and final state. Add a fixture for every bug fixed in production.

## 14. Observability and operations

Track:

- Active rooms and games
- Join/start success rates
- Socket reconnects and failed resumes
- Command rejection counts by reason
- Command latency and persistence latency
- Games completed versus abandoned
- Server errors tagged with room/game IDs but no secret state

Add an internal read-only game inspector that shows public state, state version, phase, connection presence, and redacted recent events. Administrative tools must not reveal hands by default.

Deployment stages:

1. Local Docker Compose for PostgreSQL and Redis
2. Staging with synthetic six-browser games
3. Invite-only production alpha
4. Rules and reconnect hardening
5. Broader release

## 15. Delivery milestones

### Milestone 0: rules lock and product decisions

- Maintain the locked rule decision table with source page, interpretation, and automated test ID.
- Confirm exactly five or six total players.
- Decide whether the first release uses fixed beginner layout, random layout, or both.
- Decide disconnect, timeout, rematch, and abandonment policy.
- Confirm rights to use the CATAN name, artwork, card text, and trade dress; otherwise use original branding and assets.

Exit: no core mechanic is defined only by developer memory.

### Milestone 1: repository and protocol foundation

- Scaffold monorepo, linting, formatting, tests, CI, and local services.
- Define shared IDs, schemas, errors, command envelopes, and projections.
- Add deterministic RNG abstraction.

Exit: web and server exchange a validated versioned message.

### Milestone 2: board topology and renderer

- Generate/version the 30-hex graph.
- Verify the 30/80/109 counts and all topology invariants.
- Render tiles, ports, numbers, vertices, edges, and pan/zoom in SVG.
- Add legal-target overlays and responsive interaction.

Exit: a test page can select any stable hex, vertex, or edge by ID.

### Milestone 3: pure offline rules engine

- Implement setup, production, robber, building, bank trades, development cards, awards, and scoring.
- Implement the paired-player state machine.
- Build deterministic transcript tests covering a complete game.

Exit: an entire game can be executed headlessly with no browser or network.

### Milestone 4: rooms and lobby

- Anonymous sessions, editable profile, room creation, invite code, join, seat/color, ready, host settings, and start.
- Add expiry, rate limiting, and reconnection identity.

Exit: six independent browser contexts can form and start a valid room.

### Milestone 5: authoritative live game

- Connect commands to the engine.
- Persist snapshots/events atomically.
- Implement public/private projections, idempotency, versions, reconnect, and resume.

Exit: six clients stay consistent through setup, refreshes, and server restart.

### Milestone 6: complete game UI

- Hand, supply, turn banner, action bar, build mode, robber/discards, development cards, trades, history, awards, and game-over view.
- Add mobile layout, keyboard support, and reduced-motion support.

Exit: players can complete a game without developer tools or manual state edits.

### Milestone 7: hardening and alpha

- Concurrency, privacy, security, load, reconnect, and rules audits.
- Run structured playtests and capture every disputed rule as a fixture.
- Add metrics, backups, alerts, and admin diagnostics.

Exit: invite-only real games complete reliably and can recover from ordinary disconnections.

## 16. Recommended implementation order within each feature

For every mechanic, build the vertical slice in this order:

1. Write the rule decision and examples.
2. Define the command/event/schema.
3. Implement pure validation and reducer logic.
4. Add unit and regression tests.
5. Add server command handling and projections.
6. Add UI legal-target display and action submission.
7. Add multi-client and reconnect tests.

This prevents the UI from becoming the accidental source of truth and makes every rule independently testable.

## 17. Definition of done for version one

Version one is complete when:

- Five or six players can create/join a private room and edit profiles.
- Invite codes and reconnect identity are secure and reliable.
- Both supported setup modes create valid 30-hex boards.
- Every base and 5–6-player rule in the pinned specification is enforced server-side.
- Private cards and secret deck information never leak to other clients.
- The paired-player turn works for an entire game, including victory timing.
- All build, trade, robber, development-card, award, and scoring paths are tested.
- A game survives browser refresh and game-server restart.
- Desktop and mobile browser users can interact with every legal target.
- Accessibility, security, observability, and operational checks pass.
- The project has confirmed permission to use all published branding and visual assets, or has replaced them with original assets.
