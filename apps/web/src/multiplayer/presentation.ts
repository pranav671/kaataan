import type { GameState, PlayerId, ResourceBundle, ResourceType } from "@kaataan/game-engine";
import type { ProjectedGameEvent } from "@kaataan/protocol";

const resourceLabels: Record<ResourceType, string> = { brick: "brick", lumber: "lumber", wool: "wool", grain: "grain", ore: "ore" };

export function bundleLabel(bundle: ResourceBundle): string {
  const parts = (Object.entries(bundle) as [ResourceType, number][]).flatMap(([resource, count]) => count ? [`${count} ${resourceLabels[resource]}`] : []);
  return parts.join(", ") || "nothing";
}

export function projectedEventMessage(event: ProjectedGameEvent, state: GameState): string | null {
  const name = (id: unknown) => typeof id === "string" ? state.players.get(id as PlayerId)?.name ?? "A player" : "A player";
  switch (event.type) {
    case "INITIAL_SETTLEMENT_PLACED": return `${name(event.playerId)} founded a settlement`;
    case "INITIAL_ROAD_PLACED": return `${name(event.playerId)} placed a road`;
    case "ROAD_BUILT": return `${name(event.playerId)} built a road`;
    case "SETTLEMENT_BUILT": return `${name(event.playerId)} built a settlement`;
    case "CITY_BUILT": return `${name(event.playerId)} grew a city`;
    case "DICE_ROLLED": return `${name(event.playerId)} rolled ${String(event.total)}`;
    case "DEVELOPMENT_CARD_PURCHASED": return `${name(event.playerId)} bought a development card`;
    case "DEVELOPMENT_CARD_PLAYED": return `${name(event.playerId)} played a development card`;
    case "ROBBER_MOVED": return `${name(event.playerId)} moved the robber`;
    case "RESOURCE_STOLEN": return `${name(event.playerId)} stole from ${name(event.targetPlayerId)}`;
    case "MARITIME_TRADE_COMPLETED": return `${name(event.playerId)} traded with the bank`;
    case "DOMESTIC_TRADE_COMPLETED": return `${name(event.playerId)} traded with ${name(event.partnerId)}`;
    case "LONGEST_ROAD_HOLDER_CHANGED": return event.holderId ? `${name(event.holderId)} claimed Longest Road` : "Longest Road is unclaimed";
    case "LARGEST_ARMY_HOLDER_CHANGED": return event.holderId ? `${name(event.holderId)} claimed Largest Army` : "Largest Army is unclaimed";
    case "GAME_WON": return `${name(event.winnerId)} won with ${String(event.publicScore)} points`;
    case "PLAYER_TURN_STARTED": return `${name(event.playerId)} is ready to act`;
    case "STARTING_RESOURCES_GRANTED": return `${name(event.playerId)} received starting resources`;
    default: return null;
  }
}
