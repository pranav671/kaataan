import { BUILD_COSTS, type GameState, type PlayerId } from "@kaataan/game-engine";

import { buildCostEntries, canAfford, type BoardAction } from "../game/presentation.ts";
import { Icon, type IconName } from "./Icon.tsx";

interface ActionDockProps {
  readonly state: GameState;
  readonly actorId: PlayerId;
  readonly disabled: boolean;
  readonly selectedAction: BoardAction;
  readonly onAction: (action: BoardAction) => void;
  readonly onRoll: () => void;
  readonly onEndTurn: () => void;
  readonly onTrade: () => void;
  readonly onBuyDevelopment: () => void;
}

const BUILDS: readonly { action: BoardAction; cost: keyof typeof BUILD_COSTS; label: string; icon: IconName }[] = [
  { action: "road", cost: "road", label: "Road", icon: "road" },
  { action: "settlement", cost: "settlement", label: "Settlement", icon: "home" },
  { action: "city", cost: "city", label: "City", icon: "city" },
];

function Cost({ item }: { readonly item: keyof typeof BUILD_COSTS }) {
  return <span className="cost-row">{buildCostEntries(item).map(([resource, count]) => <i key={resource} className={`cost-dot resource-bg-${resource}`}>{count}</i>)}</span>;
}

export function ActionDock({ state, actorId, disabled, selectedAction, onAction, onRoll, onEndTurn, onTrade, onBuyDevelopment }: ActionDockProps) {
  const preRoll = state.phase.kind === "player1-pre-roll";
  const actions = state.phase.kind === "player1-actions" || state.phase.kind === "player2-actions";
  if (!preRoll && !actions) {
    if (state.phase.kind === "setup" || state.phase.kind === "game-over") return null;
    return <nav className="action-dock is-waiting" aria-label="Game actions" aria-disabled="true"><button type="button" className="primary-action" disabled><Icon name="target" /><span><strong>Resolve {state.phase.kind.replaceAll("-", " ")}</strong><small>Actions return after this choice</small></span></button></nav>;
  }
  return (
    <nav className={`action-dock${disabled ? " is-waiting" : ""}`} aria-label="Game actions" aria-disabled={disabled}>
      {preRoll ? (
        <button type="button" className="primary-action roll-button" disabled={disabled} onClick={onRoll}><Icon name="dice" /><span><strong>{disabled ? "Waiting for roll" : "Roll dice"}</strong><small>{disabled ? "Another player is active" : "Begin your turn"}</small></span></button>
      ) : <>
        <div className="build-actions">
          {BUILDS.map((build) => <button key={build.action} type="button" className={selectedAction === build.action ? "is-selected" : ""} disabled={disabled || !canAfford(state, actorId, build.cost)} onClick={() => onAction(selectedAction === build.action ? "inspect" : build.action)}><Icon name={build.icon} /><span><strong>{build.label}</strong><Cost item={build.cost} /></span></button>)}
        </div>
        <span className="dock-divider" />
        <button type="button" className="secondary-action" disabled={disabled} onClick={onTrade}><Icon name="trade" /><span><strong>Trade</strong><small>Bank or players</small></span></button>
        <button type="button" className="secondary-action" disabled={disabled || !canAfford(state, actorId, "developmentCard")} onClick={onBuyDevelopment}><Icon name="cards" /><span><strong>Develop</strong><Cost item="developmentCard" /></span></button>
        <button type="button" className="end-action" disabled={disabled} onClick={onEndTurn}><span><strong>{disabled ? "Waiting" : "Done"}</strong><small>{disabled ? "Another player" : "End actions"}</small></span><Icon name="chevron" /></button>
      </>}
    </nav>
  );
}
