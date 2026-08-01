import { useState } from "react";
import { RESOURCE_TYPES, createResourceBundle, type GameCommand, type GameState, type PlayerId, type ResourceType } from "@kaataan/game-engine";

import { RESOURCE_META } from "../game/presentation.ts";
import { Icon } from "./Icon.tsx";

export function PhasePrompt({ state, actorId, onCommand }: { readonly state: GameState; readonly actorId: PlayerId; readonly onCommand: (command: GameCommand) => void }) {
  const [picks, setPicks] = useState<Partial<Record<ResourceType, number>>>({});
  const phase = state.phase;
  if (phase.kind === "robber-steal") {
    return <div className="phase-prompt"><div><span className="eyebrow">Robber</span><strong>Choose who to steal from</strong></div><div className="prompt-options">{phase.eligibleTargetIds.map((id) => <button type="button" key={id} onClick={() => onCommand({ type: "STEAL_FROM_PLAYER", targetPlayerId: id })}>{state.players.get(id)?.name}<Icon name="chevron" /></button>)}</div></div>;
  }
  if (phase.kind === "monopoly") {
    return <div className="phase-prompt"><div><span className="eyebrow">Monopoly</span><strong>Claim one resource type</strong></div><div className="resource-choice-row">{RESOURCE_TYPES.map((resource) => <button type="button" key={resource} style={{ "--resource-color": RESOURCE_META[resource].color } as React.CSSProperties} onClick={() => onCommand({ type: "CHOOSE_MONOPOLY_RESOURCE", resource })}><i />{RESOURCE_META[resource].label}</button>)}</div></div>;
  }
  if (phase.kind !== "year-of-plenty" && phase.kind !== "discarding") return null;
  const required = phase.kind === "year-of-plenty" ? phase.requiredCards : phase.requiredByPlayer[actorId] ?? 0;
  const total = Object.values(picks).reduce((sum, count) => sum + (count ?? 0), 0);
  const maxFor = (resource: ResourceType) => phase.kind === "year-of-plenty" ? state.bank[resource] : state.players.get(actorId)?.hand[resource] ?? 0;
  return <div className="phase-prompt counter-prompt"><div><span className="eyebrow">{phase.kind === "year-of-plenty" ? "Year of Plenty" : "Discard"}</span><strong>Choose {required} card{required === 1 ? "" : "s"}</strong></div><div className="counter-options">{RESOURCE_TYPES.map((resource) => <div key={resource} style={{ "--resource-color": RESOURCE_META[resource].color } as React.CSSProperties}><i /><span>{RESOURCE_META[resource].label}</span><button type="button" aria-label={`Remove ${resource}`} disabled={(picks[resource] ?? 0) === 0} onClick={() => setPicks({ ...picks, [resource]: Math.max(0, (picks[resource] ?? 0) - 1) })}><Icon name="minus" /></button><strong>{picks[resource] ?? 0}</strong><button type="button" aria-label={`Add ${resource}`} disabled={total >= required || (picks[resource] ?? 0) >= maxFor(resource)} onClick={() => setPicks({ ...picks, [resource]: (picks[resource] ?? 0) + 1 })}><Icon name="plus" /></button></div>)}</div><button type="button" className="confirm-button" disabled={total !== required} onClick={() => onCommand(phase.kind === "year-of-plenty" ? { type: "TAKE_YEAR_OF_PLENTY", resources: createResourceBundle(picks) } : { type: "SUBMIT_DISCARD", resources: createResourceBundle(picks) })}>Confirm selection <Icon name="chevron" /></button></div>;
}
