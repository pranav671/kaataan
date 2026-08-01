import { totalResources, type GameState, type PlayerId } from "@kaataan/game-engine";

import { displayedScore, pairedRole, playerColor } from "../game/presentation.ts";
import { Icon } from "./Icon.tsx";

interface PlayerRailProps {
  readonly state: GameState;
  readonly actorId: PlayerId | null;
  readonly colorsByPlayer?: ReadonlyMap<PlayerId, string>;
}

export function PlayerRail({ state, actorId, colorsByPlayer }: PlayerRailProps) {
  return (
    <aside className="player-rail" aria-label="Players">
      <div className="rail-heading"><span>Table</span><span className="online-label"><i />Live</span></div>
      <div className="player-list">
        {state.playerOrder.map((playerId) => {
          const player = state.players.get(playerId)!;
          const active = playerId === actorId;
          const role = pairedRole(state, playerId);
          return (
            <article key={playerId} className={`player-card${active ? " is-active" : ""}`} style={{ "--player-color": colorsByPlayer?.get(playerId) ?? playerColor(state, playerId) } as React.CSSProperties}>
              <div className="avatar" aria-hidden="true">{player.name.slice(0, 1)}</div>
              <div className="player-card-main">
                <div className="player-name-line"><strong>{player.name}</strong>{role && <span className={`role-pill role-${role.at(-1)}`}>P{role.at(-1)}</span>}</div>
                <div className="player-meta"><span><Icon name="cards" />{totalResources(player.hand)}</span><span><Icon name="road" />{15 - player.pieces.roads}</span><span><Icon name="home" />{5 - player.pieces.settlements + 4 - player.pieces.cities}</span></div>
              </div>
              <div className="score-orb" aria-label={`${displayedScore(state, playerId)} victory points`}>{displayedScore(state, playerId)}<small>VP</small></div>
              {(state.longestRoadHolderId === playerId || state.largestArmyHolderId === playerId) && <div className="player-awards" aria-label="Awards">{state.longestRoadHolderId === playerId && <Icon name="road" />}{state.largestArmyHolderId === playerId && <Icon name="helmet" />}</div>}
            </article>
          );
        })}
      </div>
      <div className="rail-footnote"><Icon name="spark" /><span>Paired turn <strong>{state.pairedTurn}</strong></span></div>
    </aside>
  );
}
