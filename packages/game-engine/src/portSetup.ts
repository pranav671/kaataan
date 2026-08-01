import { createSeededRandom, shuffled } from "./random.ts";
import { createPortPlacement } from "./trade.ts";
import type { BoardTopology, EdgeTopology, PortKind, PortPlacement } from "./types.ts";

export const EXTENDED_PORT_INVENTORY: readonly PortKind[] = [
  "generic", "generic", "generic", "generic", "generic", "generic",
  "brick", "lumber", "wool", "grain", "ore",
];

function edgeAngle(topology: BoardTopology, edge: EdgeTopology): number {
  const first = topology.vertices.get(edge.vertexIds[0]);
  const second = topology.vertices.get(edge.vertexIds[1]);
  if (!first || !second) throw new Error(`Port edge ${edge.id} has missing endpoints`);
  return Math.atan2(
    (first.position.y + second.position.y) / 2,
    (first.position.x + second.position.x) / 2,
  );
}

export function createVariablePortPlacements(
  topology: BoardTopology,
  seed: string,
): readonly PortPlacement[] {
  const coastalEdges = [...topology.edges.values()]
    .filter((edge) => edge.adjacentHexIds.length === 1)
    .sort((left, right) => edgeAngle(topology, left) - edgeAngle(topology, right));
  if (coastalEdges.length < EXTENDED_PORT_INVENTORY.length) {
    throw new Error("Board does not have enough coastal edges for the extended port inventory");
  }
  const random = createSeededRandom(`${seed}:ports`);
  const kinds = shuffled(EXTENDED_PORT_INVENTORY, random);
  const offset = random.integer(coastalEdges.length);
  return kinds.map((kind, index) => {
    const edgeIndex = (offset + Math.floor(index * coastalEdges.length / kinds.length))
      % coastalEdges.length;
    const edge = coastalEdges[edgeIndex];
    if (!edge) throw new Error("Failed to select a coastal port edge");
    return createPortPlacement(topology, {
      id: `port-${index + 1}`,
      edgeId: edge.id,
      kind,
    });
  });
}
