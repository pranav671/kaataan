import type {
  AxialCoordinate,
  BoardTopology,
  EdgeId,
  EdgeTopology,
  HexId,
  HexTopology,
  VertexId,
  VertexTopology,
} from "./types.ts";

const SQRT_3 = Math.sqrt(3);

const CORNER_OFFSETS = [
  { x: 1, y: -1 },
  { x: 1, y: 1 },
  { x: 0, y: 2 },
  { x: -1, y: 1 },
  { x: -1, y: -1 },
  { x: 0, y: -2 },
] as const;

const HEX_DIRECTIONS = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
] as const;

function hexId(q: number, r: number): HexId {
  return `h:${q}:${r}`;
}

function vertexId(x: number, y: number): VertexId {
  return `v:${x}:${y}`;
}

function edgeId(first: VertexId, second: VertexId): EdgeId {
  const [start, end] = first < second ? [first, second] : [second, first];
  return `e:${start}|${end}`;
}

function extendedCoordinates(): AxialCoordinate[] {
  const coordinates: AxialCoordinate[] = [];
  for (let r = -3; r <= 3; r += 1) {
    for (let q = -3; q <= 2; q += 1) {
      const s = -q - r;
      if (s >= -2 && s <= 3) {
        coordinates.push({ q, r });
      }
    }
  }
  return coordinates.sort((left, right) =>
    left.r === right.r ? left.q - right.q : left.r - right.r,
  );
}

interface MutableVertex {
  id: VertexId;
  lattice: { x: number; y: number };
  adjacentHexIds: Set<HexId>;
  adjacentEdgeIds: Set<EdgeId>;
  neighboringVertexIds: Set<VertexId>;
}

interface MutableEdge {
  id: EdgeId;
  vertexIds: [VertexId, VertexId];
  adjacentHexIds: Set<HexId>;
}

export function createExtendedBoardTopology(): BoardTopology {
  const coordinates = extendedCoordinates();
  const coordinateIds = new Set(coordinates.map(({ q, r }) => hexId(q, r)));
  const vertices = new Map<VertexId, MutableVertex>();
  const edges = new Map<EdgeId, MutableEdge>();
  const hexes = new Map<HexId, HexTopology>();

  for (const coordinate of coordinates) {
    const id = hexId(coordinate.q, coordinate.r);
    const centerLattice = {
      x: 2 * coordinate.q + coordinate.r,
      y: 3 * coordinate.r,
    };
    const vertexIds = CORNER_OFFSETS.map((offset) => {
      const x = centerLattice.x + offset.x;
      const y = centerLattice.y + offset.y;
      const idForVertex = vertexId(x, y);
      const existing = vertices.get(idForVertex);
      if (existing) {
        existing.adjacentHexIds.add(id);
      } else {
        vertices.set(idForVertex, {
          id: idForVertex,
          lattice: { x, y },
          adjacentHexIds: new Set([id]),
          adjacentEdgeIds: new Set(),
          neighboringVertexIds: new Set(),
        });
      }
      return idForVertex;
    }) as unknown as [VertexId, VertexId, VertexId, VertexId, VertexId, VertexId];

    const edgeIds = vertexIds.map((start, index) => {
      const end = vertexIds[(index + 1) % vertexIds.length] as VertexId;
      const idForEdge = edgeId(start, end);
      const existing = edges.get(idForEdge);
      if (existing) {
        existing.adjacentHexIds.add(id);
      } else {
        edges.set(idForEdge, {
          id: idForEdge,
          vertexIds: start < end ? [start, end] : [end, start],
          adjacentHexIds: new Set([id]),
        });
      }
      vertices.get(start)?.adjacentEdgeIds.add(idForEdge);
      vertices.get(end)?.adjacentEdgeIds.add(idForEdge);
      vertices.get(start)?.neighboringVertexIds.add(end);
      vertices.get(end)?.neighboringVertexIds.add(start);
      return idForEdge;
    }) as unknown as [EdgeId, EdgeId, EdgeId, EdgeId, EdgeId, EdgeId];

    const neighboringHexIds = HEX_DIRECTIONS
      .map((direction) => hexId(coordinate.q + direction.q, coordinate.r + direction.r))
      .filter((neighborId) => coordinateIds.has(neighborId));

    hexes.set(id, {
      id,
      coordinate,
      position: {
        x: centerLattice.x * SQRT_3 / 2,
        y: centerLattice.y / 2,
      },
      vertexIds,
      edgeIds,
      neighboringHexIds,
    });
  }

  const frozenVertices = new Map<VertexId, VertexTopology>();
  for (const vertex of vertices.values()) {
    frozenVertices.set(vertex.id, {
      id: vertex.id,
      lattice: vertex.lattice,
      position: {
        x: vertex.lattice.x * SQRT_3 / 2,
        y: vertex.lattice.y / 2,
      },
      adjacentHexIds: [...vertex.adjacentHexIds].sort(),
      adjacentEdgeIds: [...vertex.adjacentEdgeIds].sort(),
      neighboringVertexIds: [...vertex.neighboringVertexIds].sort(),
    });
  }

  const frozenEdges = new Map<EdgeId, EdgeTopology>();
  for (const edge of edges.values()) {
    frozenEdges.set(edge.id, {
      id: edge.id,
      vertexIds: edge.vertexIds,
      adjacentHexIds: [...edge.adjacentHexIds].sort(),
    });
  }

  return {
    hexes,
    vertices: frozenVertices,
    edges: frozenEdges,
    hexIds: [...hexes.keys()].sort(),
    vertexIds: [...frozenVertices.keys()].sort(),
    edgeIds: [...frozenEdges.keys()].sort(),
  };
}

export function parseHexId(id: HexId): AxialCoordinate {
  const [, q, r] = id.split(":");
  return { q: Number(q), r: Number(r) };
}

export function toHexId(coordinate: AxialCoordinate): HexId {
  return hexId(coordinate.q, coordinate.r);
}
