import { createGameOverView, type GameState } from "@kaataan/game-engine";

import { Icon } from "./Icon.tsx";

export function GameOverDialog({ state, onNewGame }: { readonly state: GameState; readonly onNewGame: () => void }) {
  if (state.phase.kind !== "game-over") return null;
  const view = createGameOverView(state);
  const rows = [...view.players].sort((a, b) => a.rank - b.rank || a.seat - b.seat);
  const winner = rows.find((row) => row.playerId === view.winnerId)!;
  return <div className="modal-backdrop game-over-backdrop"><section className="dialog game-over-dialog" role="dialog" aria-modal="true" aria-labelledby="winner-title"><div className="winner-mark"><Icon name="award" /></div><span className="eyebrow">Island settled</span><h2 id="winner-title">{winner.name} wins!</h2><p>A remarkable game, decided with {winner.finalScore} public victory points.</p><div className="score-table">{rows.map((row) => <div key={row.playerId} className={row.playerId === view.winnerId ? "winner-row" : ""}><strong>#{row.rank}</strong><span>{row.name}<small>{row.cities} cities · {row.settlements} settlements · {row.longestRoadLength} road</small></span><b>{row.finalScore} VP</b></div>)}</div><div className="winner-awards">{view.longestRoadHolderId && <span><Icon name="road" />Longest Road: {state.players.get(view.longestRoadHolderId)?.name}</span>}{view.largestArmyHolderId && <span><Icon name="helmet" />Largest Army: {state.players.get(view.largestArmyHolderId)?.name}</span>}</div><button type="button" className="confirm-button" onClick={onNewGame}>Return to a new island <Icon name="spark" /></button></section></div>;
}
