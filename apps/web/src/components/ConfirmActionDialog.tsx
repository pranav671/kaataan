import { RESOURCE_TYPES, type GameCommand, type GameState } from "@kaataan/game-engine";

import { RESOURCE_META } from "../game/presentation.ts";
import { Icon } from "./Icon.tsx";

function actionCopy(command: GameCommand, state: GameState): { readonly title: string; readonly detail: string } {
  switch (command.type) {
    case "PLACE_INITIAL_SETTLEMENT": return { title: "Place this settlement?", detail: "Your opening settlement cannot be moved after placement." };
    case "PLACE_INITIAL_ROAD": return { title: "Place this opening road?", detail: "This road will connect to the settlement you just placed." };
    case "BUILD_ROAD": return { title: "Build this road?", detail: "The road cost will be paid to the bank." };
    case "BUILD_SETTLEMENT": return { title: "Build this settlement?", detail: "The selected corner and its resource cost will be committed." };
    case "BUILD_CITY": return { title: "Promote this settlement?", detail: "The selected settlement will become a city and its cost will be paid." };
    case "MOVE_ROBBER": return { title: "Move the robber here?", detail: "Production on the selected tile will be blocked." };
    case "STEAL_FROM_PLAYER": return { title: `Steal from ${state.players.get(command.targetPlayerId)?.name ?? "this player"}?`, detail: "One random resource card will be taken and shown in game activity." };
    case "SUBMIT_DISCARD": return { title: "Discard these cards?", detail: RESOURCE_TYPES.filter((resource) => command.resources[resource] > 0).map((resource) => `${command.resources[resource]} ${RESOURCE_META[resource].label}`).join(", ") };
    case "MARITIME_TRADE": return { title: "Confirm bank trade?", detail: `Give ${RESOURCE_META[command.give].label} and receive ${RESOURCE_META[command.receive].label} at your best available rate.` };
    case "BUY_DEVELOPMENT_CARD": return { title: "Buy a development card?", detail: "One wool, one grain, and one ore will be paid to the bank." };
    case "PLAY_DEVELOPMENT_CARD": return { title: "Play this development card?", detail: "You can normally play only one development card in this turn." };
    case "CHOOSE_MONOPOLY_RESOURCE": return { title: `Claim all ${RESOURCE_META[command.resource].label}?`, detail: "Every other player will give you all cards of this resource." };
    case "END_SUBTURN": return { title: "Finish this action turn?", detail: "You will not be able to trade or build again during this subturn." };
    default: return { title: "Confirm this action?", detail: "This choice will be applied to the game." };
  }
}

export function ConfirmActionDialog({ command, state, onCancel, onConfirm }: { readonly command: GameCommand; readonly state: GameState; readonly onCancel: () => void; readonly onConfirm: () => void }) {
  const copy = actionCopy(command, state);
  return <div className="modal-backdrop" role="presentation" onMouseDown={onCancel}><section className="dialog confirmation-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirmation-title" onMouseDown={(event) => event.stopPropagation()}><div className="confirmation-mark"><Icon name="target" /></div><span className="eyebrow">Please confirm</span><h2 id="confirmation-title">{copy.title}</h2><p>{copy.detail}</p><div className="confirmation-actions"><button type="button" onClick={onCancel}>Go back</button><button type="button" className="confirm-button" onClick={onConfirm}>Confirm action <Icon name="chevron" /></button></div></section></div>;
}
