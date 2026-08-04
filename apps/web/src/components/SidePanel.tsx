import { RESOURCE_TYPES, type GameState, type PlayerId } from "@kaataan/game-engine";
import { RESOURCE_META } from "../game/presentation.ts";

import type { BoardSelection } from "./SvgBoard.tsx";
import { Icon } from "./Icon.tsx";

export function SidePanel({ state, events, selection, actorId }: { readonly state: GameState; readonly events: readonly string[]; readonly selection: BoardSelection | null; readonly actorId: PlayerId | null }) {
  const actor = actorId ? state.players.get(actorId) : null;
  return (
    <aside className="side-panel">
      <section className="turn-card">
        <div className="eyebrow">Now playing</div>
        <div className="turn-player"><div className="mini-avatar">{actor?.name.slice(0, 1) ?? "–"}</div><div><strong>{actor?.name ?? "Everyone"}</strong><span>{state.phase.kind.replaceAll("-", " ")}</span></div></div>
        {state.lastDiceRoll && <div className="last-roll"><Icon name="dice" /><span>Last roll</span><strong>{state.lastDiceRoll}</strong></div>}
      </section>
      <section className="bank-card">
        <div className="panel-heading"><span>Bank</span><strong>{state.developmentDeck.length} development</strong></div>
        <div className="bank-resources">{RESOURCE_TYPES.map((resource) => <div key={resource} style={{ "--resource-color": RESOURCE_META[resource].color } as React.CSSProperties}><i /><span>{RESOURCE_META[resource].label}</span><strong>{state.bank[resource]}</strong></div>)}</div>
      </section>
      {selection && <section className="inspect-card"><div className="eyebrow">Board detail</div><strong>{selection.title}</strong><p>{selection.detail}</p></section>}
      <section className="activity-card">
        <div className="panel-heading"><span>Game activity</span><span className="event-count">{events.length}</span></div>
        <div className="activity-list">
          {events.length === 0 && <div className="empty-activity"><Icon name="target" /><span>Your story begins with the first settlement.</span></div>}
          {events.slice(0, 8).map((message, index) => <div className="activity-item" key={`${index}-${message}`}><i /><span>{message}</span></div>)}
        </div>
      </section>
      <section className="award-strip"><div><Icon name="road" /><span>Longest road</span><strong>{state.longestRoadHolderId ? state.players.get(state.longestRoadHolderId)?.name : "Unclaimed"}</strong></div><div><Icon name="helmet" /><span>Largest army</span><strong>{state.largestArmyHolderId ? state.players.get(state.largestArmyHolderId)?.name : "Unclaimed"}</strong></div></section>
    </aside>
  );
}
