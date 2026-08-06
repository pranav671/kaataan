import { RESOURCE_TYPES, type GameState } from "@kaataan/game-engine";
import type { DiceStatisticsView } from "@kaataan/protocol";
import { RESOURCE_META } from "../game/presentation.ts";

import type { BoardSelection } from "./SvgBoard.tsx";
import { Icon } from "./Icon.tsx";

export function SidePanel({ state, events, selection, diceStatistics }: { readonly state: GameState; readonly events: readonly string[]; readonly selection: BoardSelection | null; readonly diceStatistics: DiceStatisticsView }) {
  const maximumRollCount = Math.max(1, ...diceStatistics.outcomes.map((outcome) => outcome.count));
  return (
    <aside className="side-panel">
      {state.lastDiceRoll && <section className="last-roll-card"><div className="last-roll"><Icon name="dice" /><span>Last roll</span><strong>{state.lastDiceRoll}</strong></div></section>}
      <section className="dice-statistics-card">
        <div className="panel-heading"><span>Global rolls</span><strong>{diceStatistics.totalRolls} total</strong></div>
        <div className="dice-statistics" role="table" aria-label="Global dice roll statistics">
          {diceStatistics.outcomes.map((outcome) => <div key={outcome.total} role="row" title={`${outcome.total}: ${outcome.count} rolls (${outcome.percentage.toFixed(1)}%)`}><strong role="cell">{outcome.total}</strong><span role="cell"><i style={{ width: `${outcome.count / maximumRollCount * 100}%` }} /></span><b role="cell">{outcome.count}</b><small role="cell">{outcome.percentage.toFixed(1)}%</small></div>)}
        </div>
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
          {events.map((message, index) => <div className="activity-item" key={`${index}-${message}`}><i /><span>{message}</span></div>)}
        </div>
      </section>
      <section className="award-strip"><div><Icon name="road" /><span>Longest road</span><strong>{state.longestRoadHolderId ? state.players.get(state.longestRoadHolderId)?.name : "Unclaimed"}</strong></div><div><Icon name="helmet" /><span>Largest army</span><strong>{state.largestArmyHolderId ? state.players.get(state.largestArmyHolderId)?.name : "Unclaimed"}</strong></div></section>
    </aside>
  );
}
