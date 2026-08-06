import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent } from "react";
import { RESOURCE_TYPES, TERRAIN_TO_RESOURCE, type GameState, type HexId, type PlayerId, type PortKind, type ResourceBundle, type ResourceType, type TerrainType } from "@kaataan/game-engine";

import type { BoardTargetId, LegalTargets } from "../game/presentation.ts";
import { playerColor, RESOURCE_META } from "../game/presentation.ts";
import { Icon } from "./Icon.tsx";

const SCALE = 66;
const TERRAIN = {
  forest: { fill: "#3f7958", accent: "#265f48", label: "Forest" },
  hills: { fill: "#b86c4b", accent: "#935037", label: "Hills" },
  pasture: { fill: "#92b56a", accent: "#718f4f", label: "Pasture" },
  fields: { fill: "#d9ae4d", accent: "#bd8c2e", label: "Fields" },
  mountains: { fill: "#7d8587", accent: "#5d6669", label: "Mountains" },
  desert: { fill: "#d7ba7c", accent: "#bc9558", label: "Desert" },
} as const;

function xy(position: { readonly x: number; readonly y: number }) {
  return { x: position.x * SCALE, y: position.y * SCALE };
}

function portLabel(kind: PortKind) {
  return kind === "generic" ? "3:1" : "2:1";
}

export interface BoardSelection {
  readonly id: BoardTargetId;
  readonly title: string;
  readonly detail: string;
}

interface SvgBoardProps {
  readonly state: GameState;
  readonly targets: LegalTargets;
  readonly selectedId: BoardTargetId | null;
  readonly onTarget: (id: BoardTargetId) => void;
  readonly onInspect: (selection: BoardSelection) => void;
  readonly colorsByPlayer?: ReadonlyMap<PlayerId, string>;
  readonly rollResult?: { readonly dice: readonly [number, number]; readonly total: number } | null;
  readonly productionPayouts?: Readonly<Record<PlayerId, ResourceBundle>> | null;
}

const DIE_PIPS: Readonly<Record<number, readonly number[]>> = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };

function Die({ value }: { readonly value: number }) {
  const pips = new Set(DIE_PIPS[value] ?? []);
  return <span className="die" aria-label={`Die showing ${value}`}>{Array.from({ length: 9 }, (_, index) => <i key={index} className={pips.has(index) ? "is-pip" : ""} />)}</span>;
}

function ResourceGlyph({ resource, x = 0, y = 0, scale = 1 }: { readonly resource: ResourceType; readonly x?: number; readonly y?: number; readonly scale?: number }) {
  return <g className={`resource-glyph glyph-${resource}`} transform={`translate(${x} ${y}) scale(${scale})`} aria-hidden="true"><circle r="14" fill="#fff8df" stroke="#715c3e" strokeWidth="1.8" />
    {resource === "brick" && <g fill="#b85f49"><rect x="-9" y="-7" width="8" height="6" rx="1" /><rect x="1" y="-7" width="8" height="6" rx="1" /><rect x="-6" y="1" width="8" height="6" rx="1" /><rect x="4" y="1" width="5" height="6" rx="1" /></g>}
    {resource === "lumber" && <g fill="#39775b"><path d="m0-10 8 10H4l7 8H-11l7-8h-4z" /><rect x="-2" y="7" width="4" height="4" /></g>}
    {resource === "wool" && <g fill="#91ad68"><circle cx="-5" cy="0" r="5" /><circle cx="1" cy="-3" r="6" /><circle cx="6" cy="1" r="5" /><rect x="-7" y="4" width="14" height="5" rx="2" /><circle cx="9" cy="-2" r="3" /></g>}
    {resource === "grain" && <g stroke="#c69535" strokeWidth="2" strokeLinecap="round" fill="none"><path d="M0 10V-10M0-4l-6-4M0 1l6-4M0 6l-6-3" /><path d="m-6-8 4 1M6-3l-4 2M-6 3l4 2" /></g>}
    {resource === "ore" && <g fill="#737e87"><path d="m-10 7 4-12 7-5 9 8-2 10-11 2z" /><path d="m-5-4 6-6 2 8z" fill="#aeb5b7" /></g>}
  </g>;
}

function TerrainGlyph({ terrain, x, y }: { readonly terrain: TerrainType; readonly x: number; readonly y: number }) {
  if (terrain === "desert") return <g className="resource-glyph glyph-desert" transform={`translate(${x} ${y})`} aria-hidden="true"><circle r="14" fill="#fff8df" stroke="#715c3e" strokeWidth="1.8" /><circle r="5" fill="#c9953d" /><g stroke="#c9953d" strokeWidth="2">{Array.from({ length: 8 }, (_, index) => { const angle = index * Math.PI / 4; return <line key={index} x1={Math.cos(angle) * 8} y1={Math.sin(angle) * 8} x2={Math.cos(angle) * 11} y2={Math.sin(angle) * 11} />; })}</g></g>;
  return <ResourceGlyph resource={TERRAIN_TO_RESOURCE[terrain]} x={x} y={y} />;
}

export function SvgBoard({ state, targets, selectedId, onTarget, onInspect, colorsByPlayer, rollResult, productionPayouts }: SvgBoardProps) {
  const topology = state.layout.topology;
  const bounds = useMemo(() => {
    const points = [...topology.vertices.values()].map((vertex) => xy(vertex.position));
    const minX = Math.min(...points.map((point) => point.x));
    const maxX = Math.max(...points.map((point) => point.x));
    const minY = Math.min(...points.map((point) => point.y));
    const maxY = Math.max(...points.map((point) => point.y));
    return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, width: maxX - minX + 260, height: maxY - minY + 220 };
  }, [topology]);
  const [camera, setCamera] = useState({ x: bounds.cx, y: bounds.cy, zoom: 1 });
  const drag = useRef<{ x: number; y: number; cameraX: number; cameraY: number } | null>(null);
  const view = {
    width: bounds.width / camera.zoom,
    height: bounds.height / camera.zoom,
    x: camera.x - bounds.width / camera.zoom / 2,
    y: camera.y - bounds.height / camera.zoom / 2,
  };

  function zoom(delta: number) {
    setCamera((current) => ({ ...current, zoom: Math.max(.72, Math.min(2.25, current.zoom + delta)) }));
  }

  function onWheel(event: WheelEvent<SVGSVGElement>) {
    event.preventDefault();
    zoom(event.deltaY > 0 ? -.12 : .12);
  }

  function startPan(event: ReactPointerEvent<SVGSVGElement>) {
    const target = event.target as Element;
    if (!target.hasAttribute("data-board-water")) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, y: event.clientY, cameraX: camera.x, cameraY: camera.y };
  }

  function pan(event: ReactPointerEvent<SVGSVGElement>) {
    const activeDrag = drag.current;
    if (!activeDrag) return;
    const ratio = view.width / event.currentTarget.clientWidth;
    setCamera((current) => ({ ...current, x: activeDrag.cameraX - (event.clientX - activeDrag.x) * ratio, y: activeDrag.cameraY - (event.clientY - activeDrag.y) * ratio }));
  }

  function choose(id: BoardTargetId, inspect: BoardSelection) {
    if (targets.ids.has(id)) onTarget(id);
    else onInspect(inspect);
  }

  return (
    <section className="board-card" aria-label="Game board">
      <div className="board-instruction" aria-live="polite">
        <span className={targets.ids.size ? "instruction-pulse" : "instruction-dot"} />
        <div><strong>{targets.instruction}</strong>{targets.ids.size > 0 && <small>{targets.ids.size} legal location{targets.ids.size === 1 ? "" : "s"}</small>}</div>
      </div>
      <svg
        className={`game-board ${drag.current ? "is-panning" : ""}`}
        viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`}
        role="group"
        aria-label="Interactive thirty-tile island board"
        onWheel={onWheel}
        onPointerDown={startPan}
        onPointerMove={pan}
        onPointerUp={() => { drag.current = null; }}
        onPointerCancel={() => { drag.current = null; }}
      >
        <defs>
          <radialGradient id="water" cx="50%" cy="46%" r="70%"><stop offset="0" stopColor="#277d82" /><stop offset="1" stopColor="#0c4d58" /></radialGradient>
          <filter id="tile-shadow" x="-30%" y="-30%" width="160%" height="170%"><feDropShadow dx="0" dy="5" stdDeviation="5" floodColor="#062d35" floodOpacity=".32" /></filter>
          <filter
            id="target-glow"
            filterUnits="userSpaceOnUse"
            x={bounds.cx - bounds.width / 2}
            y={bounds.cy - bounds.height / 2}
            width={bounds.width}
            height={bounds.height}
          >
            <feDropShadow dx="0" dy="0" stdDeviation="5" floodColor="#fff4b7" floodOpacity="1" />
          </filter>
          <pattern id="water-lines" width="76" height="38" patternUnits="userSpaceOnUse"><path d="M-20 16 Q0 4 20 16T60 16T100 16" fill="none" stroke="#b7e4df" strokeOpacity=".11" strokeWidth="3" /></pattern>
        </defs>
        <rect data-board-water="true" x={view.x - 600} y={view.y - 600} width={view.width + 1200} height={view.height + 1200} fill="url(#water)" />
        <rect data-board-water="true" x={view.x - 600} y={view.y - 600} width={view.width + 1200} height={view.height + 1200} fill="url(#water-lines)" />
        <g className="board-compass" transform={`translate(${view.x + 58} ${view.y + view.height - 62})`} opacity=".42"><circle r="24" fill="none" stroke="white" /><path d="m0-21 5 17-5-3-5 3z" fill="white" /><text y="-28" textAnchor="middle" fill="white" fontSize="10">N</text></g>

        <g className="ports-layer">
          {state.ports.map((port) => {
            const a = xy(topology.vertices.get(port.vertexIds[0])!.position);
            const b = xy(topology.vertices.get(port.vertexIds[1])!.position);
            const midpoint = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
            const length = Math.hypot(midpoint.x - bounds.cx, midpoint.y - bounds.cy) || 1;
            const anchor = { x: midpoint.x + (midpoint.x - bounds.cx) / length * 58, y: midpoint.y + (midpoint.y - bounds.cy) / length * 58 };
            return <g key={port.id} className="port" aria-label={`${port.kind} port`}>
              <path d={`M${a.x} ${a.y} L${anchor.x} ${anchor.y} L${b.x} ${b.y}`} fill="none" stroke="#e6d19a" strokeWidth="4" strokeLinecap="round" strokeDasharray="4 7" />
              <g transform={`translate(${anchor.x} ${anchor.y})`}><circle r="29" fill="#f6e9bd" stroke="#715c3e" strokeWidth="2" /><path d="M-11 3h22l-4 7H-7zM0-14V3M0-12l8 10H0" fill="none" stroke="#715c3e" strokeWidth="2" strokeLinejoin="round" /><rect x="-16" y="11" width="32" height="14" rx="7" fill="#715c3e" /><text y="22" textAnchor="middle" fontSize="11" fontWeight="900" fill="#fff8df">{portLabel(port.kind)}</text>{port.kind !== "generic" && <ResourceGlyph resource={port.kind} x={18} y={-17} scale={.78} />}</g>
            </g>;
          })}
        </g>

        <g className="tiles-layer" filter="url(#tile-shadow)">
          {topology.hexIds.map((hexId) => {
            const hex = topology.hexes.get(hexId)!;
            const tile = state.layout.tiles.get(hexId)!;
            const token = tile.token;
            const style = TERRAIN[tile.terrain];
            const points = hex.vertexIds.map((vertexId) => {
              const point = xy(topology.vertices.get(vertexId)!.position);
              const center = xy(hex.position);
              return `${center.x + (point.x - center.x) * .96},${center.y + (point.y - center.y) * .96}`;
            }).join(" ");
            const center = xy(hex.position);
            const legal = targets.ids.has(hexId);
            const selected = selectedId === hexId;
            return (
              <g
                key={hexId}
                className={`hex-tile terrain-${tile.terrain}${legal ? " is-legal" : ""}${selected ? " is-selected" : ""}${rollResult && token?.value === rollResult.total ? " is-roll-match" : ""}`}
                role="button"
                tabIndex={0}
                aria-label={`${style.label}${tile.token ? `, number ${tile.token.value}` : ""}${legal ? ", legal target" : ""}`}
                onClick={(event) => { event.stopPropagation(); choose(hexId, { id: hexId, title: style.label, detail: tile.token ? `Produces on ${tile.token.value}` : "The quiet desert" }); }}
                onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") choose(hexId, { id: hexId, title: style.label, detail: tile.token ? `Produces on ${tile.token.value}` : "The quiet desert" }); }}
              >
                <polygon points={points} fill={style.fill} stroke={legal ? "#fff2ad" : style.accent} strokeWidth={legal ? 6 : 2.5} filter={legal ? "url(#target-glow)" : undefined} />
                <g className="terrain-motif" stroke={style.accent} fill="none" strokeWidth="3" opacity=".5">
                  {tile.terrain === "forest" && <><path d={`M${center.x - 31} ${center.y + 25}l15-34 15 34zM${center.x + 2} ${center.y + 23}l13-29 13 29z`} /><path d={`M${center.x - 16} ${center.y + 23}v14M${center.x + 15} ${center.y + 21}v13`} /></>}
                  {tile.terrain === "hills" && <><path d={`M${center.x - 48} ${center.y + 30}q25-52 49 0q18-34 42 0`} /><path d={`M${center.x - 20} ${center.y + 13}q20-28 38 4`} /></>}
                  {tile.terrain === "pasture" && <><path d={`M${center.x - 46} ${center.y + 21}q12-15 24 0t24 0t24 0`} /><circle cx={center.x + 27} cy={center.y - 17} r="9" /></>}
                  {tile.terrain === "fields" && <><path d={`M${center.x - 35} ${center.y + 30}v-50M${center.x - 35} ${center.y - 6}l-10-9M${center.x - 35} ${center.y + 6}l11-10M${center.x + 32} ${center.y + 32}v-51M${center.x + 32} ${center.y - 5}l-10-9M${center.x + 32} ${center.y + 7}l11-10`} /></>}
                  {tile.terrain === "mountains" && <path d={`M${center.x - 49} ${center.y + 30}l30-55 14 24 17-34 37 65z`} />}
                  {tile.terrain === "desert" && <><path d={`M${center.x - 50} ${center.y + 22}q24-24 50 0t50 0`} /><circle cx={center.x + 27} cy={center.y - 23} r="11" /></>}
                </g>
                <TerrainGlyph terrain={tile.terrain} x={center.x - 35} y={center.y - 31} />
                {token && <g className="number-token" transform={`translate(${center.x} ${center.y})`}><circle r="24" fill="#f8edce" stroke="#715c3e" strokeWidth="2" /><text y="7" textAnchor="middle" fontSize="22" fontWeight="900" fill={token.value === 6 || token.value === 8 ? "#b74335" : "#40372d"}>{token.value}</text><g fill={token.value === 6 || token.value === 8 ? "#b74335" : "#715c3e"}>{Array.from({ length: 6 - Math.abs(7 - token.value) }).map((_, index) => <circle key={index} cx={(index - (5 - Math.abs(7 - token.value)) / 2) * 5} cy="15" r="1.3" />)}</g></g>}
                {state.layout.robberHexId === hexId && <g className="robber" transform={`translate(${center.x + 31} ${center.y - 26})`}><circle cy="-8" r="8" fill="#283335" /><path d="M-10 20q1-22 10-22t10 22z" fill="#283335" stroke="#edf4e7" strokeWidth="1.5" /><title>Robber</title></g>}
              </g>
            );
          })}
        </g>

        <g className="roads-layer">
          {topology.edgeIds.map((edgeId) => {
            const edge = topology.edges.get(edgeId)!;
            const a = xy(topology.vertices.get(edge.vertexIds[0])!.position);
            const b = xy(topology.vertices.get(edge.vertexIds[1])!.position);
            const road = state.occupancy.roadsByEdge.get(edgeId);
            const legal = targets.ids.has(edgeId);
            return <g key={edgeId} className={`board-edge${legal ? " is-legal" : ""}`} role={road || legal ? "button" : undefined} tabIndex={legal ? 0 : undefined} aria-hidden={!road && !legal} aria-label={road ? `${state.players.get(road.playerId)?.name}'s road` : legal ? "Build road here" : undefined} onClick={(event) => { event.stopPropagation(); choose(edgeId, { id: edgeId, title: road ? `${state.players.get(road.playerId)?.name}'s road` : "Open road", detail: road ? "A claimed connection" : "No road has been built here" }); }} onKeyDown={(event) => { if (legal && (event.key === "Enter" || event.key === " ")) onTarget(edgeId); }}>
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="transparent" strokeWidth="22" />
              {road && <><line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#f5ead1" strokeWidth="13" strokeLinecap="round" /><line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={colorsByPlayer?.get(road.playerId) ?? playerColor(state, road.playerId)} strokeWidth="8" strokeLinecap="round" /></>}
            </g>;
          })}
        </g>

        <g className="buildings-layer">
          {topology.vertexIds.map((vertexId) => {
            const vertex = topology.vertices.get(vertexId)!;
            const point = xy(vertex.position);
            const building = state.occupancy.buildingsByVertex.get(vertexId);
            const legal = targets.ids.has(vertexId);
            const cityTarget = legal && targets.action === "city" && building?.kind === "settlement";
            return <g key={vertexId} className={`board-vertex${legal ? " is-legal" : ""}${cityTarget ? " is-city-target" : ""}`} role={building || legal ? "button" : undefined} tabIndex={legal ? 0 : undefined} aria-hidden={!building && !legal} aria-label={building ? `${state.players.get(building.playerId)?.name}'s ${building.kind}` : legal ? `Build ${targets.action} here` : undefined} transform={`translate(${point.x} ${point.y})`} onClick={(event) => { event.stopPropagation(); choose(vertexId, { id: vertexId, title: building ? `${state.players.get(building.playerId)?.name}'s ${building.kind}` : "Open corner", detail: `${vertex.adjacentHexIds.length} adjacent terrain tile${vertex.adjacentHexIds.length === 1 ? "" : "s"}` }); }} onKeyDown={(event) => { if (legal && (event.key === "Enter" || event.key === " ")) onTarget(vertexId); }}>
              <circle r="18" fill="transparent" />
              {legal && !cityTarget && <circle className="legal-vertex" r="10" fill="#fff1a8" stroke="white" strokeWidth="3" filter="url(#target-glow)" />}
              {cityTarget && <circle className="city-target-halo" r="25" fill="none" stroke="#fff1a8" strokeWidth="7" filter="url(#target-glow)" />}
              {building?.kind === "settlement" && <path className={cityTarget ? "city-target-building" : undefined} d="M-13 4V17h26V4L0-8z" fill={colorsByPlayer?.get(building.playerId) ?? playerColor(state, building.playerId)} stroke={cityTarget ? "#fff1a8" : "#f8eed8"} strokeWidth={cityTarget ? 6 : 3} strokeLinejoin="round" filter={cityTarget ? "url(#target-glow)" : undefined} />}
              {building?.kind === "city" && <path d="M-17 17V0h10v-9L4-18v9h12v26z" fill={colorsByPlayer?.get(building.playerId) ?? playerColor(state, building.playerId)} stroke="#f8eed8" strokeWidth="3" strokeLinejoin="round" />}
            </g>;
          })}
        </g>

        <g className="targets-layer" pointerEvents="none">
          {topology.edgeIds.filter((edgeId) => targets.ids.has(edgeId)).map((edgeId) => {
            const edge = topology.edges.get(edgeId)!;
            const a = xy(topology.vertices.get(edge.vertexIds[0])!.position);
            const b = xy(topology.vertices.get(edge.vertexIds[1])!.position);
            return <g key={edgeId} className="legal-road"><line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#4b4330" strokeOpacity=".72" strokeWidth="17" strokeLinecap="round" /><line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#fff1a8" strokeWidth="10" strokeLinecap="round" filter="url(#target-glow)" /></g>;
          })}
        </g>
      </svg>

      {rollResult && <div className="dice-reveal" role="status" aria-live="assertive"><span className="eyebrow">Dice rolled</span><div><Die value={rollResult.dice[0]} /><Die value={rollResult.dice[1]} /><strong>{rollResult.total}</strong></div></div>}
      {productionPayouts && <div className="production-flight" aria-label="Resources distributed">{Object.entries(productionPayouts).flatMap(([playerId, bundle]) => RESOURCE_TYPES.flatMap((resource) => bundle[resource] > 0 ? [<span key={`${playerId}-${resource}`} style={{ "--resource-color": RESOURCE_META[resource].color } as React.CSSProperties}><i />+{bundle[resource]} {RESOURCE_META[resource].label}<b>→ {state.players.get(playerId)?.name}</b></span>] : []))}</div>}

      <div className="board-tools" aria-label="Board zoom controls">
        <button type="button" onClick={() => zoom(.18)} aria-label="Zoom in"><Icon name="zoomIn" /></button>
        <button type="button" onClick={() => zoom(-.18)} aria-label="Zoom out"><Icon name="zoomOut" /></button>
        <button type="button" className="fit-button" onClick={() => setCamera({ x: bounds.cx, y: bounds.cy, zoom: 1 })}>Fit</button>
      </div>
      <div className="board-legend" aria-hidden="true"><span><i className="legend-settlement" />Settlement</span><span><i className="legend-city" />City</span><span><i className="legend-road" />Road</span></div>
    </section>
  );
}
