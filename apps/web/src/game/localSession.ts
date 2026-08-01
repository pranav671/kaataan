import {
  RESOURCE_TYPES,
  createGame,
  createPortPlacement,
  handleCommand,
  type EdgeId,
  type GameCommand,
  type GameEvent,
  type GameState,
  type PlayerId,
  type PortKind,
} from "@kaataan/game-engine";

import { actionPlayerId, legalTargetsFor } from "./presentation.ts";

const PLAYERS = [
  { id: "maya", name: "Maya" },
  { id: "theo", name: "Theo" },
  { id: "nora", name: "Nora" },
  { id: "sam", name: "Sam" },
  { id: "imani", name: "Imani" },
  { id: "leo", name: "Leo" },
] as const;

function demoPorts(state: GameState) {
  const coastal = [...state.layout.topology.edges.values()]
    .filter((edge) => edge.adjacentHexIds.length === 1)
    .sort((left, right) => {
      const center = (edge: typeof left) => {
        const a = state.layout.topology.vertices.get(edge.vertexIds[0])?.position;
        const b = state.layout.topology.vertices.get(edge.vertexIds[1])?.position;
        return { x: ((a?.x ?? 0) + (b?.x ?? 0)) / 2, y: ((a?.y ?? 0) + (b?.y ?? 0)) / 2 };
      };
      const ca = center(left);
      const cb = center(right);
      return Math.atan2(ca.y, ca.x) - Math.atan2(cb.y, cb.x);
    });
  const kinds: readonly PortKind[] = ["generic", "brick", "generic", "lumber", "generic", "wool", "generic", "grain", "generic", "ore", "generic"];
  return kinds.map((kind, index) => {
    const edge = coastal[Math.floor(index * coastal.length / kinds.length)] as { id: EdgeId };
    return createPortPlacement(state.layout.topology, { id: `port-${index + 1}`, edgeId: edge.id, kind });
  });
}

export function createLocalGame(): GameState {
  const initial = createGame({ id: "island-table", seed: "kaataan-ui-session-6", players: PLAYERS, startingPlayerSeat: 0 });
  return { ...initial, ports: demoPorts(initial) };
}

export interface LocalDispatchResult {
  readonly state: GameState;
  readonly events: readonly GameEvent[];
  readonly error: string | null;
}

let commandSequence = 0;

export function dispatchLocal(state: GameState, actorId: PlayerId, command: GameCommand): LocalDispatchResult {
  commandSequence += 1;
  const result = handleCommand(state, {
    actorId,
    expectedVersion: state.version,
    commandId: `local-${commandSequence}`,
    command,
  }, {
    rollDice: () => {
      const cycle = [[3, 3], [4, 4], [2, 3], [5, 4], [6, 5]] as const;
      return cycle[state.pairedTurn % cycle.length] ?? [3, 3];
    },
    randomInteger: () => 0,
  });
  if (!result.accepted) {
    return { state, events: [], error: `${result.code}${result.detail ? ` · ${result.detail}` : ""}` };
  }
  return { state: result.state, events: result.events, error: null };
}

export function quickSetup(start: GameState): LocalDispatchResult {
  let state = start;
  const events: GameEvent[] = [];
  let guard = 0;
  while (state.phase.kind === "setup" && guard < 30) {
    guard += 1;
    const actorId = actionPlayerId(state);
    if (!actorId) return { state, events, error: "No active setup player" };
    const targets = legalTargetsFor(state, actorId, "inspect");
    const target = [...targets.ids][0];
    if (!target) return { state, events, error: "No legal setup target" };
    const command: GameCommand = state.phase.step === "settlement"
      ? { type: "PLACE_INITIAL_SETTLEMENT", vertexId: target as `v:${number}:${number}` }
      : { type: "PLACE_INITIAL_ROAD", edgeId: target as EdgeId };
    const result = dispatchLocal(state, actorId, command);
    if (result.error) return { state, events, error: result.error };
    state = result.state;
    events.push(...result.events);
  }
  return { state, events, error: state.phase.kind === "setup" ? "Setup did not finish" : null };
}

export function resourceOptions() {
  return RESOURCE_TYPES;
}
