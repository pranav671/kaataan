import { RESOURCE_TYPES, totalResources, type GameState, type PlayerId } from "@kaataan/game-engine";

import { RESOURCE_META } from "../game/presentation.ts";

export function ResourceHand({ state, playerId }: { readonly state: GameState; readonly playerId: PlayerId }) {
  const player = state.players.get(playerId);
  if (!player) return null;
  return (
    <section className="resource-hand" aria-label={`${player.name}'s resource hand`}>
      <div className="hand-heading"><span>Your hand</span><strong>{totalResources(player.hand)} cards</strong></div>
      <div className="resource-cards">
        {RESOURCE_TYPES.map((resource) => {
          const meta = RESOURCE_META[resource];
          return (
            <div key={resource} className={`resource-card resource-${resource}`} style={{ "--resource-color": meta.color } as React.CSSProperties}>
              <div className="resource-art" aria-hidden="true">
                {resource === "brick" && <><i /><i /><i /><i /></>}
                {resource === "lumber" && <><i /><i /><i /></>}
                {resource === "wool" && <><i /><i /><i /><i /></>}
                {resource === "grain" && <><i /><i /><i /></>}
                {resource === "ore" && <><i /><i /><i /></>}
              </div>
              <span>{meta.label}</span><strong>{player.hand[resource]}</strong>
            </div>
          );
        })}
        <div className="development-stack" title="Development cards"><span>DEV</span><strong>{player.developmentCards.length}</strong></div>
      </div>
    </section>
  );
}
