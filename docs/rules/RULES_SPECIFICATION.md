# Kaataan Rules Specification

Version: `catan-base-2020__5-6-paired-2022_v1`

Status: Normative for implementation

## 1. Purpose and authority

This document converts the supplied official rulebooks into deterministic requirements for the Kaataan rules engine. Every engine rule, command validator, state transition, and regression test should cite a stable rule ID from this file.

### Source precedence

| Priority | Source | Scope |
| --- | --- | --- |
| 1 | [`docs/CATAN_EXTENDED.pdf`](../CATAN_EXTENDED.pdf) (`EXT`) | Overrides for the 5–6-player board, supply, setup, and paired-player turn |
| 2 | [`docs/CATAN_ORIGINAL.pdf`](../CATAN_ORIGINAL.pdf) (`BASE`) | All base mechanics not changed by the extension |
| 3 | A rule labeled `IMPLEMENTATION` here | Digital behavior needed where neither rulebook specifies an operational detail |

The source set is the 2020 fifth-edition English base Almanac plus the 2022 revision of the 5–6 Player Extension. Later editions, older special-building-phase rules, house rules, tournament variants, and other expansions are out of scope.

### Requirement language

- `RULE`: directly stated by a supplied rulebook or necessarily combined from the two supplied rulebooks.
- `DERIVED`: deterministic consequence of a rule, such as an aggregate component count.
- `IMPLEMENTATION`: a digital operational choice that does not alter strategic outcomes.
- `OPTION`: a rulebook-authorized room setting.

### Previously identified gap closure

| Previous gap | Resolution location |
| --- | --- |
| Build costs and piece limits | RULE-COMP-005, RULE-BUILD-001 through RULE-BUILD-005 |
| Settlement distance and road connectivity | RULE-BUILD-003, RULE-BUILD-004 |
| City upgrades and production | RULE-BUILD-005, RULE-PROD-001 |
| Dice production and bank shortages | RULE-PROD-001 through RULE-PROD-003 |
| Rolling 7, discards, robber, and stealing | RULE-ROBBER-001 through RULE-ROBBER-006 |
| Domestic trade restrictions | RULE-TRADE-001 through RULE-TRADE-003 |
| Maritime trade and harbors | RULE-TRADE-004 through RULE-TRADE-006 |
| Development deck, timing, and effects | RULE-COMP-004, RULE-DEV-001 through RULE-DEV-008 |
| Longest Road calculation and ties | RULE-LR-001 through RULE-LR-003 |
| Largest Army calculation and ties | RULE-LA-001, RULE-LA-002 |
| Victory-point visibility and win timing | RULE-VP-001 through RULE-VP-004, RULE-INFO-002 |
| Setup order and starting resources | RULE-SETUP-001 through RULE-SETUP-008 |

## 2. Game constants and component inventory

### RULE-COMP-001 - Player count

The game supports exactly 5 or 6 seated players. The room host counts as one of those players. Source: EXT pp. 1, 3–7.

### RULE-COMP-002 - Terrain inventory

Use all 19 base terrain hexes plus all 11 extension terrain hexes.

| Terrain | Base | Added | Total |
| --- | ---: | ---: | ---: |
| Forest / lumber | 4 | 2 | 6 |
| Hills / brick | 3 | 2 | 5 |
| Pasture / wool | 4 | 2 | 6 |
| Fields / grain | 4 | 2 | 6 |
| Mountains / ore | 3 | 2 | 5 |
| Desert / nothing | 1 | 1 | 2 |
| Total | 19 | 11 | 30 |

Source: BASE pp. 2–3; EXT pp. 2–4. Type totals are derived from the base board inventory and the extension's stated additions.

### RULE-COMP-003 - Resource supply

The bank contains 24 cards of each resource type, 120 resource cards total.

| Resource | Producing terrain | Build symbol |
| --- | --- | --- |
| Brick | Hills | `brick` |
| Lumber | Forest | `lumber` |
| Wool | Pasture | `wool` |
| Grain | Fields | `grain` |
| Ore | Mountains | `ore` |

The base game supplies 19 of each type and the extension adds 5 of each type. Source: BASE pp. 2–3, 10; EXT pp. 2, 4.

### RULE-COMP-004 - Development deck

The combined development deck has 34 cards:

| Card | Base | Added | Total |
| --- | ---: | ---: | ---: |
| Knight | 14 | 6 | 20 |
| Road Building | 2 | 1 | 3 |
| Year of Plenty | 2 | 1 | 3 |
| Monopoly | 2 | 1 | 3 |
| Victory Point | 5 | 0 | 5 |
| Total | 25 | 9 | 34 |

Source: BASE pp. 2, 5, 7, 10; EXT pp. 2, 4. The breakdown of the nine extension cards is also printed in the [official 5–6 component inventory](https://www.catan.com/sites/default/files/2021-08/catan_5-6_basegame_rules.pdf): 6 Knights and one of each progress card.

### RULE-COMP-005 - Player piece inventory

Each player owns exactly:

- 15 roads
- 5 settlements
- 4 cities

Pieces cannot be built when none of that type remain in the player's supply. A settlement returned during a city upgrade becomes available again. Roads and cities remain on the board for the rest of the game. Source: BASE pp. 3–6, 11–12; EXT p. 4.

### RULE-COMP-006 - Number tokens

Use only the 28 extension number tokens and skip both deserts. Token labels and values are:

```text
A=2, B=5, C=4, D=6, E=3, F=9, G=8,
H=11, I=11, J=10, K=6, L=3, M=8, N=4,
O=8, P=10, Q=11, R=12, S=10, T=5, U=4,
V=9, W=5, X=9, Y=12, ZA=3, ZB=2, ZC=6
```

The resulting value distribution is two each of 2 and 12, and three each of 3, 4, 5, 6, 8, 9, 10, and 11. There is no 7 token. Source: EXT pp. 3–5; official CATAN component mapping in [*Encyclopaedia Catanica*, §17.F.d](https://www.catan.com/sites/default/files/2021-12/encata_vol_1.pdf).

### RULE-COMP-007 - Harbors

The extended board exposes 11 harbor locations:

- Five generic 3:1 harbors
- One 2:1 harbor for brick
- One 2:1 harbor for lumber
- Two 2:1 harbors for wool
- One 2:1 harbor for grain
- One 2:1 harbor for ore

The second wool harbor and fifth generic harbor come from the extension frame. Source: BASE pp. 8–9, 12–13; EXT pp. 2–4.

## 3. Board construction and setup

### RULE-SETUP-001 - Board topology

Use the 30-hex extended island with row lengths `3, 4, 5, 6, 5, 4, 3`. Add the four small sea-frame pieces to the six base frame pieces as shown by the extension. Source: EXT p. 3.

### RULE-SETUP-002 - Beginner setup option

`OPTION`: The host may select the fixed “Starting Set-up for 5–6 New Players.” The engine loads the exact terrain, number, harbor, settlement, road, and starred-resource layout shown on EXT p. 5.

For six players, all six displayed colors are active. For five players:

1. Randomly choose one of the six displayed colors as inactive.
2. Remove that color's roads.
3. Leave its two displayed settlements as neutral inactive blockers.
4. Neutral inactive settlements produce no resources, own no harbors, cannot be robbed, score no points, and cannot be modified.
5. They still occupy their vertices and therefore enforce the Distance Rule.

Every active player receives the resources shown for their starred starting settlement. Source: EXT pp. 4–6.

### RULE-SETUP-003 - Variable terrain setup

`OPTION`: For experienced players:

1. Shuffle all 30 terrain hexes face down.
2. Place them in the frame and turn them face up without changing position.
3. Arrange the 28 extension tokens in label order `A` through `Y`, then `ZA`, `ZB`, `ZC`.
4. Start at any one of the six corner positions and traverse the outside counterclockwise, spiraling toward the center.
5. Skip each desert without consuming a token.
6. Place all 28 tokens number-side up.
7. Place the robber on either desert.

The extension does not authorize independently shuffling the number values for this mode. Source: EXT p. 4–5.

`IMPLEMENTATION-SETUP-003A`: For a variable digital board, use the game's committed RNG to choose one of the two deserts for the robber. Persist the selected hex in the initial game event.

### RULE-SETUP-004 - Harbor randomization option

`OPTION`: Fixed frame harbors are the default. If random harbors are enabled, shuffle all 11 harbor pieces face down and place one over every frame harbor. Source: EXT p. 4.

### RULE-SETUP-005 - Create the supply

Sort the five resource types into face-up bank stacks. Shuffle all 34 development cards into one face-down draw pile. Place Longest Road and Largest Army unowned beside the board. Source: BASE pp. 3, 12; EXT p. 4.

### RULE-SETUP-006 - Choose the starting player

Every player rolls both dice. The highest roller becomes the starting player and initial Player 1. Source: BASE p. 12; EXT p. 6.

`IMPLEMENTATION-SETUP-006A`: If players tie for highest, only tied players reroll until exactly one remains. This is a neutral completion of an unspecified tie procedure.

### RULE-SETUP-007 - Variable initial placement

Setup has two rounds:

1. Round one begins with the starting player and proceeds in turn order. Each player places one settlement on any legal unoccupied vertex, then one road adjacent to that settlement.
2. Round two begins with the last player from round one and proceeds in reverse turn order. Each player places a second legal settlement, then one road adjacent to that second settlement.
3. The second settlement need not connect to the first settlement or road.
4. Immediately after placing the second settlement, the player receives one matching resource for every productive adjacent hex. Deserts give nothing. The robber does not deny setup resources because it begins on a desert.
5. The starting player, who places last in round two, becomes Player 1 for the first paired turn.

The Distance Rule applies to every setup settlement. No resource cost is paid for setup pieces. Source: BASE p. 12; EXT p. 6.

### RULE-SETUP-008 - Paired-player markers

Player 1 is the starting player. Player 2 is the third player after Player 1 in the canonical turn-order direction. If Player 1 has seat index `i`, Player 2 is `(i + 3) mod playerCount`. Source: EXT p. 6.

## 4. Paired-player turn state machine

### RULE-TURN-001 - Paired turn order

Each paired turn contains:

1. Player 1 pre-roll opportunity
2. Player 1 mandatory production roll and complete resolution
3. Player 1 combined trade/build action window
4. Player 2 combined bank-trade/build action window
5. Marker and dice advancement

Player 1 must finish before Player 2 begins. Source: BASE pp. 4, 6–8; EXT pp. 6–8.

### RULE-TURN-002 - Player 1 pre-roll development card

Player 1 may play one eligible Knight or progress development card before rolling, following the base rule that a development card may be played at any time during that player's turn. The card resolves completely, after which Player 1 must still roll. Playing it consumes Player 1's one Knight/progress-card play for that player-turn. Source: BASE p. 7; EXT pp. 6–8 (“as usual”).

Player 2 has no pre-roll opportunity because Player 2 does not control the production phase.

### RULE-TURN-003 - Player 1 production

Player 1 must roll both fair six-sided dice. The sum either produces resources or resolves a 7. The result applies to all players. Source: BASE pp. 4, 8, 10–11; EXT p. 7.

### RULE-TURN-004 - Player 1 action permissions

During Player 1's action window, Player 1 may repeat the following in any order:

- Conduct domestic trades in which Player 1 is a party
- Conduct maritime trades with the bank
- Build roads, settlements, and cities
- Buy development cards
- Play one eligible Knight or progress card if none was played earlier in this player-turn
- Reveal qualifying victory-point cards to win

Source: BASE p. 6 combined trade/build rule; EXT p. 7.

### RULE-TURN-005 - Player 2 action permissions

During Player 2's action window, Player 2 may repeat the following in any order:

- Conduct maritime trades with the bank
- Build roads, settlements, and cities
- Buy development cards
- Play one eligible Knight or progress card
- Reveal qualifying victory-point cards to win

Player 2 cannot initiate, accept, or participate in domestic trade during Player 2's own action window. Source: EXT pp. 7–8.

### RULE-TURN-006 - Marker advancement

After Player 2 ends their window, Player 1 and Player 2 markers each move one seat forward in turn order, and the dice move with Player 1. The new Player 1 starts the next paired turn. Source: EXT p. 7.

### RULE-TURN-007 - Player-turn identity

For development-card purchase timing and victory eligibility, Player 1's portion and Player 2's portion are separate player-turns. Record development purchases against the purchasing player's own monotonically increasing `playerTurnSequence`, not only the enclosing paired-turn number.

## 5. Resource production and the bank

### RULE-PROD-001 - Normal production

For a dice total other than 7:

1. Find every non-desert hex with the rolled number.
2. Ignore any matching hex occupied by the robber.
3. Each adjacent settlement requests one card of that hex's resource.
4. Each adjacent city requests two cards of that hex's resource.
5. A player with buildings on multiple matching hexes receives production from each.

Source: BASE pp. 4–6, 10–11.

### RULE-PROD-002 - Shortage resolution is per resource type

For each resource type independently:

- If the bank can satisfy total demand, pay every entitled player fully.
- If two or more players are entitled to that resource and the bank cannot satisfy all demand, nobody receives that resource.
- If exactly one player is entitled and the bank cannot satisfy their full demand, give that player every remaining card of that resource; unpaid production is lost.
- A shortage of one resource does not affect production of any other resource.

Source: BASE pp. 4, 10.

### RULE-PROD-003 - Resource conservation

Resource cards exist only in player hands or bank stacks. Building/trade payments and discards return to the bank. Production and bank trades remove cards from the bank. Counts may never become negative.

## 6. Rolling 7 and the robber

### RULE-ROBBER-001 - No production on 7

When Player 1 rolls 7, no terrain produces resources. Source: BASE pp. 5, 11.

### RULE-ROBBER-002 - Mandatory discards

Every player holding 8 or more resource cards must discard `floor(handSize / 2)` resource cards of their choice to the bank. Players with 7 or fewer discard nothing. Development cards are not counted or discarded. Source: BASE pp. 5, 11.

The server collects affected players' private discard selections and does not allow robber movement until every required discard is valid and committed.

### RULE-ROBBER-003 - Mandatory move

After discards, Player 1 must move the robber to a different terrain hex. Either desert is a legal destination. The current robber hex is illegal. The robber blocks all production from its new hex until moved again. Source: BASE pp. 5, 8, 11; EXT p. 4.

### RULE-ROBBER-004 - Eligible steal targets

After moving the robber, Player 1 chooses one opponent who:

- Owns at least one settlement or city adjacent to the new robber hex.

Multiple buildings belonging to the same opponent do not create multiple target entries. The active player cannot target themself or a neutral inactive beginner-setup settlement. An adjacent opponent remains a legal choice when they hold zero resource cards; in that case the steal yields nothing. If no adjacent opponent exists, no target is selected. Source: BASE pp. 5, 8, 11.

### RULE-ROBBER-005 - Random private steal

If the chosen opponent has at least one resource card, the server selects one uniformly random card from that hand and transfers it to the active player. Public state reveals the participants and that one card moved, but not its type. The two involved players receive the private card type. If the chosen opponent has no resource cards, the event publicly records that the steal yielded nothing. Source: BASE pp. 5, 8, 11.

### RULE-ROBBER-006 - Knight difference

Playing a Knight causes the robber move and steal from RULE-ROBBER-003 through RULE-ROBBER-005, but never causes the discard procedure. Discards occur only when a 7 is rolled. Source: BASE pp. 5, 8, 11.

## 7. Building

### RULE-BUILD-001 - Costs

| Purchase | Cost |
| --- | --- |
| Road | 1 brick + 1 lumber |
| Settlement | 1 brick + 1 lumber + 1 wool + 1 grain |
| City upgrade | 3 ore + 2 grain |
| Development card | 1 ore + 1 wool + 1 grain |

Pay the complete cost atomically to the bank before placing/drawing. Free setup pieces and Road Building roads are explicit exceptions. Source: BASE pp. 4–6.

### RULE-BUILD-002 - Build frequency

During an allowed action window, a player may build/buy as many times as resources, pieces, legal locations, and deck supply permit. Source: BASE p. 6; EXT p. 7.

### RULE-BUILD-003 - Road legality

A normal road placement is legal only if:

1. The edge/path is empty.
2. The player has a road piece remaining.
3. The player can pay the cost unless the placement is free.
4. At least one endpoint connects to the player's settlement, city, or existing road.
5. If continuity depends on an existing road at an endpoint occupied by an opponent's building, that opponent building blocks the connection through the vertex.

During setup, the placed road must be adjacent to the settlement just placed. Source: BASE pp. 4, 10–12.

### RULE-BUILD-004 - Settlement legality

A normal settlement placement is legal only if:

1. The vertex/intersection is empty.
2. Every neighboring vertex is free of any settlement or city, including the player's own and neutral inactive settlements.
3. At least one incident edge contains the player's road, except during initial setup.
4. The player has a settlement piece and can pay the cost when applicable.

A settlement is worth 1 public VP. Source: BASE pp. 5, 7, 11–12.

### RULE-BUILD-005 - City legality

A city may only replace that player's existing settlement on the same vertex. The player pays the city cost, returns the settlement to supply, and places an available city. A city is worth 2 public VP and produces two resources per adjacent producing hex. Source: BASE pp. 5–6.

### RULE-BUILD-006 - Newly acquired harbor

Because the extension uses a combined trade/build action window, a player may build a settlement on a harbor and use that harbor later in the same action window. Source: BASE p. 6; EXT p. 7.

## 8. Trade

### RULE-TRADE-001 - Resource cards only

Only resource cards may be traded. Development cards, buildings, promises, future actions, and points cannot be transferred by the engine. Source: BASE pp. 7, 14.

### RULE-TRADE-002 - Domestic trade participants

During Player 1's action window, all players may propose or counteroffer, but Player 1 must be one party to every executed domestic trade. Other players cannot trade directly with one another. Player 2 has no domestic-trade privilege in Player 2's own window. Source: BASE pp. 4, 7, 11, 14; EXT pp. 7–8.

### RULE-TRADE-003 - Domestic trade validity

An executed domestic trade must:

- Transfer at least one resource card in each direction
- Be accepted by both participating players
- Use resources both players currently own
- Use disjoint resource-type sets on the two sides; a resource type cannot be exchanged for the same type
- Not be a gift

Trade contents and acceptance are revalidated atomically when executed. Source: BASE pp. 7, 14.

### RULE-TRADE-004 - Maritime base rate

Any active Player 1 or Player 2 may return four identical resource cards to the bank for one available resource card of their choice. No harbor is required. Source: BASE pp. 4, 9; EXT pp. 7–8.

### RULE-TRADE-005 - Harbor ownership and rates

A player owns a harbor benefit if their settlement or city occupies either endpoint of that harbor's coastal edge.

- Generic harbor: 3 identical resources for 1 available resource.
- Specific harbor: 2 of the depicted resource for 1 available resource.
- A specific harbor does not provide 3:1 for other resources.
- Use the best rate the player owns for the resource being given.

Source: BASE pp. 4, 8–9.

### RULE-TRADE-006 - Maritime execution

Each maritime exchange is atomic. The give cards must be identical, the bank must have the requested output card, and the player may execute multiple exchanges during the action window. Source: BASE p. 9.

## 9. Development cards

### RULE-DEV-001 - Purchase and secrecy

To buy a development card, pay the cost and draw the top card from the server-owned shuffled deck. If the deck is empty, purchase is unavailable. Card identity remains private until legally played/revealed. Development cards never return to the deck and cannot be traded. Source: BASE pp. 5, 7.

### RULE-DEV-002 - One Knight/progress card per player-turn

A player may play at most one Knight or progress card during that player's own player-turn. It may be played before Player 1's roll or during that player's action window. Player 2 can play only during Player 2's action window. Source: BASE pp. 5, 7–8; EXT pp. 7–8.

### RULE-DEV-003 - Same-turn restriction

A Knight or progress card cannot be played during the same player-turn in which that player bought it. Record `purchasedPlayerTurn` and require the current sequence to be later. A card bought by a player on their prior paired-player appearance is eligible on their next player-turn. Source: BASE pp. 5, 7.

### RULE-DEV-004 - Knight

Playing a Knight:

1. Places it face up permanently in the player's played area.
2. Increments that player's public played-Knight count.
3. Immediately moves the robber and resolves one eligible random steal.
4. Does not trigger discards.
5. Recalculates Largest Army after resolution.

Source: BASE pp. 5, 8, 11.

### RULE-DEV-005 - Road Building

Playing Road Building removes the card from play and grants two sequential road placements at no resource cost. Each road consumes a piece and must satisfy normal road placement rules; the first placement may make the second legal. Source: BASE pp. 5, 10.

`IMPLEMENTATION-DEV-005A`: If fewer than two road pieces or legal placements remain, place as many as legally possible and forfeit the rest of the effect. The UI must not deadlock waiting for an impossible second placement.

### RULE-DEV-006 - Year of Plenty

Playing Year of Plenty removes the card from play and takes any two available resource cards from the bank. They may be the same or different types and may be used later in the same action window. Source: BASE pp. 5, 10 and card text.

`IMPLEMENTATION-DEV-006A`: Choices must exist in the bank at resolution. If fewer than two total bank cards remain, transfer every legally selected available card and end the effect rather than deadlocking.

### RULE-DEV-007 - Monopoly

Playing Monopoly removes the card from play. The player names one resource type; every other player transfers every card of that type to the active player. The bank is not involved. Source: BASE pp. 5, 10.

### RULE-DEV-008 - Victory Point cards

Victory Point cards remain hidden. A player may reveal any number only during their own player-turn and only when the revealed cards make the player eligible to win. They may be revealed on the same player-turn they were bought, even if the player already played a Knight/progress card. Source: BASE pp. 5, 7, 14; EXT p. 7.

## 10. Longest Road

### RULE-LR-001 - Route length

A player's road length is the maximum continuous trail through that player's road subgraph subject to:

- A physical road edge may be counted at most once in a candidate trail.
- At a branch, a candidate trail chooses a continuation; branches are not summed independently.
- The trail may start and end at any vertices.
- A vertex containing an opponent's settlement or city terminates continuity; roads incident on opposite sides cannot connect through it.
- The player's own buildings do not break continuity.

Compute this as a longest edge-simple trail with blocked opponent vertices. Source: BASE pp. 4, 9, 11.

### RULE-LR-002 - Initial award

The first player to have the sole longest continuous road of at least five edges receives Longest Road and 2 public VP. Source: BASE pp. 4, 9.

### RULE-LR-003 - Transfer and tie handling

After every road or settlement placement, recalculate route lengths:

- A challenger takes the card only by having a strictly longer road than the current holder.
- If the holder remains tied for the longest qualifying road, the holder keeps it.
- If the holder no longer shares the maximum and exactly one other player has the longest qualifying road, transfer it.
- If the holder no longer has the longest and two or more other players tie for the maximum, set the card aside.
- If no player has a road of at least five, set it aside.
- While aside, award it when exactly one player has the longest qualifying road.

An opponent may legally build a settlement on a vertex within another player's road and split that route. Source: BASE p. 9.

## 11. Largest Army

### RULE-LA-001 - Qualification

Only played, face-up Knight cards count. The first player to play three Knights receives Largest Army and 2 public VP. Source: BASE pp. 5, 8.

### RULE-LA-002 - Transfer

A challenger takes Largest Army only when their played-Knight count is strictly greater than the current holder's count. A tie does not transfer it. Source: BASE pp. 5, 8.

## 12. Scoring and victory

### RULE-VP-001 - Point values

| Source | VP |
| --- | ---: |
| Settlement | 1 |
| City | 2 |
| Longest Road | 2 |
| Largest Army | 2 |
| Each Victory Point development card | 1 |

Every player begins with 2 VP from their two setup settlements. Public scores exclude hidden VP cards; the server's authoritative score includes them. Source: BASE pp. 5, 7, 14.

### RULE-VP-002 - Win only on own player-turn

A player wins when they have at least 10 total VP during their own eligible player-turn. Reaching 10 outside one's player-turn does not end the game; eligibility is checked immediately when that player's next player-turn begins. Source: BASE pp. 5, 7, 14.

### RULE-VP-003 - Paired-player priority

Check Player 1 for victory:

- At the start of Player 1's player-turn
- After every Player 1 action that can alter score
- Before opening Player 2's action window

If Player 1 wins, Player 2 never acts. Check Player 2 at the start of Player 2's window and after every score-changing Player 2 action. If both could qualify within the same paired turn, Player 1 has priority because Player 1's portion completes first. Source: EXT p. 7.

### RULE-VP-004 - Game over

Victory ends the game immediately. No remaining actions, trades, effects, or subturns occur. Reveal the winner's VP cards used to establish the winning score. Other players may reveal their hidden VP cards in the postgame view. Source: BASE pp. 5, 7, 14.

## 13. Information visibility

### RULE-INFO-001 - Resource hands

Resource types in a player's hand are private. Total resource-card count is public and must be reported truthfully. Source: BASE pp. 3, 8.

### RULE-INFO-002 - Development cards

Unplayed development-card identities are private. Public state exposes only total unplayed count, played Knights, resolved progress cards in the event log, and legally revealed VP cards. Source: BASE pp. 5, 7, 14.

### RULE-INFO-003 - Bank and deck

Face-up resource-bank counts are public. Development deck order and identities are secret; remaining deck count is public. Source: BASE pp. 3, 5, 12.

### IMPLEMENTATION-INFO-004 - Event visibility

Open-table actions expose their resource types in the public event log: production, build payments, maritime trades, domestic trades, Year of Plenty choices, and Monopoly transfers. This preserves information observable from the face-up physical bank. Individual discard choices remain private, although the aggregate bank change is observable. A random steal exposes the card type only to the stealing and robbed players; the public event exposes only the participants and count.

## 14. Engine invariants

The following must hold after every accepted command:

- `RULE-INV-001`: No resource bank or player count is negative.
- `RULE-INV-002`: For each resource, bank plus all hands equals 24.
- `RULE-INV-003`: Exactly 34 development cards exist across deck, hands, played areas, and removed progress-card records.
- `RULE-INV-004`: Each vertex has at most one building; each edge has at most one road.
- `RULE-INV-005`: A player's on-board plus supplied pieces equal 15 roads, 5 settlements, and 4 cities, treating a city-upgraded settlement as returned.
- `RULE-INV-006`: The robber occupies exactly one of the 30 terrain hexes.
- `RULE-INV-007`: At most one player holds Longest Road and at most one holds Largest Army.
- `RULE-INV-008`: Public projections never contain another player's resource types, development identities, or the deck order.
- `RULE-INV-009`: Replaying persisted events from the same initial seed produces identical authoritative state.

## 15. Rules regression matrix

Each row must become at least one automated fixture before the rules engine is considered complete.

| Test ID | Scenario | Governing rules |
| --- | --- | --- |
| `R-SETUP-01` | Five-player beginner layout leaves one neutral blocking color | RULE-SETUP-002 |
| `R-SETUP-02` | Variable setup skips both deserts without consuming tokens | RULE-SETUP-003, RULE-COMP-006 |
| `R-SETUP-03` | Reverse round grants resources only for second settlement | RULE-SETUP-007 |
| `R-TURN-01` | Player 1 plays Knight before roll, then must roll | RULE-TURN-002, RULE-DEV-004 |
| `R-TURN-02` | Player 2 domestic trade is rejected | RULE-TURN-005, RULE-TRADE-002 |
| `R-TURN-03` | Both markers advance and remain three seats apart | RULE-TURN-006, RULE-SETUP-008 |
| `R-PROD-01` | City and settlement produce 3 total from one hex | RULE-PROD-001 |
| `R-PROD-02` | Multi-player shortage pays nobody for that resource | RULE-PROD-002 |
| `R-PROD-03` | Single-player shortage pays remaining cards | RULE-PROD-002 |
| `R-ROB-01` | Eight cards discard four; seven discard zero; nine discard four | RULE-ROBBER-002 |
| `R-ROB-02` | Knight moves robber and steals without discards | RULE-ROBBER-006 |
| `R-ROB-03` | Same robber hex and self-target are rejected | RULE-ROBBER-003, RULE-ROBBER-004 |
| `R-ROB-04` | Adjacent zero-card opponent is selectable and yields no card | RULE-ROBBER-004, RULE-ROBBER-005 |
| `R-BUILD-01` | Settlement respects distance and road connection | RULE-BUILD-004 |
| `R-BUILD-02` | Opponent building blocks road continuation | RULE-BUILD-003, RULE-LR-001 |
| `R-BUILD-03` | City returns settlement and doubles production | RULE-BUILD-005 |
| `R-TRADE-01` | Gift, like-for-like, and third-party trade are rejected | RULE-TRADE-002, RULE-TRADE-003 |
| `R-TRADE-02` | Specific 2:1 beats generic 3:1 and default 4:1 | RULE-TRADE-005 |
| `R-TRADE-03` | Newly built harbor can be used in same action window | RULE-BUILD-006 |
| `R-DEV-01` | Newly bought Knight/progress cannot be played same player-turn | RULE-DEV-003 |
| `R-DEV-02` | Newly bought VP card can be revealed immediately only to win | RULE-DEV-008 |
| `R-DEV-03` | Road Building's first road enables its second | RULE-DEV-005 |
| `R-DEV-04` | Monopoly transfers all selected resources from all opponents | RULE-DEV-007 |
| `R-LR-01` | Fork chooses one trail and does not sum branches | RULE-LR-001 |
| `R-LR-02` | Opponent settlement breaks a road and triggers tie rules | RULE-LR-003 |
| `R-LR-03` | Current holder retains award on qualifying tie | RULE-LR-003 |
| `R-LA-01` | Three played Knights awards; equal challenger does not take | RULE-LA-001, RULE-LA-002 |
| `R-VP-01` | Player at 10 outside own player-turn waits | RULE-VP-002 |
| `R-VP-02` | Player 1 victory ends paired turn before Player 2 | RULE-VP-003 |
| `R-INFO-01` | Public projection contains counts but no private card identities | RULE-INFO-001 through RULE-INFO-003, IMPLEMENTATION-INFO-004 |

## 16. Explicitly unsupported variants

Version one does not include:

- The pre-2022 special building phase
- Three- or four-player games
- Seven or more players
- Fully shuffled number values
- Friendly robber / “three victory points” variant
- Alternate victory targets
- Seafarers, Cities & Knights, Traders & Barbarians, or other expansions
- Trading favors, future promises, buildings, development cards, or points

Adding any variant requires a new ruleset version and must not change in-progress games created under this version.
