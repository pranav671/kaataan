import { useState } from "react";
import {
  RESOURCE_TYPES,
  bestMaritimeTradeRate,
  containsResources,
  createResourceBundle,
  getOwnedPortKinds,
  totalResources,
  type GameCommand,
  type GameState,
  type PlayerId,
  type ResourceBundle,
  type ResourceType,
} from "@kaataan/game-engine";
import type { DomesticTradeOfferView } from "@kaataan/protocol";

import { RESOURCE_META } from "../game/presentation.ts";
import { Icon } from "./Icon.tsx";

interface TradeDialogProps {
  readonly state: GameState;
  readonly actorId: PlayerId;
  readonly onClose: () => void;
  readonly onTrade: (command: GameCommand) => void;
  readonly onDomesticOffer?: (actorGives: ResourceBundle, partnerGives: ResourceBundle) => void;
  readonly counterOffer?: DomesticTradeOfferView;
  readonly onCounter?: (offerId: string, actorGives: ResourceBundle, partnerGives: ResourceBundle) => void;
}

function updateBundle(bundle: ResourceBundle, resource: ResourceType, value: number): ResourceBundle {
  return createResourceBundle({ ...bundle, [resource]: Math.max(0, value) });
}

function BundlePicker({ title, bundle, otherBundle, limits, onChange }: {
  readonly title: string;
  readonly bundle: ResourceBundle;
  readonly otherBundle: ResourceBundle;
  readonly limits?: ResourceBundle;
  readonly onChange: (bundle: ResourceBundle) => void;
}) {
  return <div className="trade-side bundle-side"><span>{title}</span><div className="bundle-picker">{RESOURCE_TYPES.map((resource) => {
    const count = bundle[resource];
    const maximum = limits?.[resource] ?? 19;
    return <div key={resource} className={`${maximum === 0 ? "is-unavailable " : ""}${count > 0 ? "is-selected" : ""}`.trim()} style={{ "--resource-color": RESOURCE_META[resource].color } as React.CSSProperties}><i /><span>{RESOURCE_META[resource].label}</span><button type="button" aria-label={`Remove ${RESOURCE_META[resource].label} from ${title}`} disabled={count === 0} onClick={() => onChange(updateBundle(bundle, resource, count - 1))}><Icon name="minus" /></button><strong>{count}</strong><button type="button" aria-label={`Add ${RESOURCE_META[resource].label} to ${title}`} disabled={count >= maximum || otherBundle[resource] > 0} onClick={() => onChange(updateBundle(bundle, resource, count + 1))}><Icon name="plus" /></button></div>;
  })}</div></div>;
}

export function TradeDialog({ state, actorId, onClose, onTrade, onDomesticOffer, counterOffer, onCounter }: TradeDialogProps) {
  const [tab, setTab] = useState<"bank" | "player">(counterOffer ? "player" : "bank");
  const [give, setGive] = useState<ResourceType>("brick");
  const [receive, setReceive] = useState<ResourceType>("lumber");
  const [actorGives, setActorGives] = useState<ResourceBundle>(counterOffer?.actorGives ?? createResourceBundle());
  const [partnerGives, setPartnerGives] = useState<ResourceBundle>(counterOffer?.partnerGives ?? createResourceBundle());
  const actor = state.players.get(actorId)!;
  const ports = getOwnedPortKinds(state.ports, state.occupancy, actorId);
  const rate = bestMaritimeTradeRate(ports, give);
  const domesticAllowed = state.phase.kind === "player1-actions" || state.phase.kind === "player2-actions";
  const validResources = RESOURCE_TYPES.filter((resource) => resource !== give);
  const viewerIsGameActor = !counterOffer || counterOffer.actorId === actorId;
  const viewerGives = viewerIsGameActor ? actorGives : partnerGives;
  const viewerReceives = viewerIsGameActor ? partnerGives : actorGives;
  const setViewerGives = viewerIsGameActor ? setActorGives : setPartnerGives;
  const setViewerReceives = viewerIsGameActor ? setPartnerGives : setActorGives;
  const overlapping = RESOURCE_TYPES.some((resource) => actorGives[resource] > 0 && partnerGives[resource] > 0);
  const domesticValid = totalResources(viewerGives) > 0 && totalResources(viewerReceives) > 0 && !overlapping && containsResources(actor.hand, viewerGives);
  const canTrade = tab === "bank" ? actor.hand[give] >= rate && state.bank[receive] > 0 : domesticValid;

  function submit() {
    if (tab === "bank") onTrade({ type: "MARITIME_TRADE", give, receive });
    else if (counterOffer && onCounter) onCounter(counterOffer.id, actorGives, partnerGives);
    else if (onDomesticOffer) onDomesticOffer(actorGives, partnerGives);
  }

  return <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
    <section className="dialog trade-dialog" role="dialog" aria-modal="true" aria-labelledby="trade-title" onMouseDown={(event) => event.stopPropagation()}>
      <div className="dialog-heading"><div><span className="eyebrow">{counterOffer ? "Continue the negotiation" : "Make an exchange"}</span><h2 id="trade-title">{counterOffer ? "Counter this offer" : "Trade resources"}</h2></div><button type="button" className="icon-button" aria-label="Close trade dialog" onClick={onClose}><Icon name="close" /></button></div>
      {!counterOffer && <div className="dialog-tabs"><button type="button" className={tab === "bank" ? "active" : ""} onClick={() => setTab("bank")}><Icon name="ship" />Bank & ports</button><button type="button" className={tab === "player" ? "active" : ""} disabled={!domesticAllowed} title={domesticAllowed ? undefined : "Player trades are available during an action subturn"} onClick={() => setTab("player")}><Icon name="hand" />Open offer</button></div>}
      {tab === "bank" ? <div className="trade-flow"><div className="trade-side"><span>You give</span><div className="resource-picker">{RESOURCE_TYPES.map((resource) => { const resourceRate = bestMaritimeTradeRate(ports, resource); const unavailable = actor.hand[resource] < resourceRate; return <button type="button" key={resource} disabled={unavailable} className={`${give === resource ? "selected " : ""}${unavailable ? "is-unavailable" : ""}`.trim()} style={{ "--resource-color": RESOURCE_META[resource].color } as React.CSSProperties} onClick={() => { setGive(resource); if (receive === resource) setReceive(RESOURCE_TYPES.find((item) => item !== resource)!); }}><i />{RESOURCE_META[resource].label}<strong>{resourceRate}</strong></button>; })}</div></div><div className="trade-arrow"><Icon name="trade" /><span>{rate}:1 rate</span></div><div className="trade-side"><span>You receive</span><div className="resource-picker">{validResources.map((resource) => <button type="button" key={resource} disabled={state.bank[resource] === 0} className={`${receive === resource ? "selected " : ""}${state.bank[resource] === 0 ? "is-unavailable" : ""}`.trim()} style={{ "--resource-color": RESOURCE_META[resource].color } as React.CSSProperties} onClick={() => setReceive(resource)}><i />{RESOURCE_META[resource].label}<strong>1</strong></button>)}</div></div></div>
        : <div className="trade-flow bundle-trade-flow"><BundlePicker title="You give" bundle={viewerGives} otherBundle={viewerReceives} limits={actor.hand} onChange={setViewerGives} /><div className="trade-arrow"><Icon name="trade" /><span>Negotiated</span></div><BundlePicker title="You receive" bundle={viewerReceives} otherBundle={viewerGives} onChange={setViewerReceives} /></div>}
      <div className="dialog-footer"><p>{canTrade ? (tab === "player" ? counterOffer ? "Your counter replaces your previous response to this offer." : "Everyone at the table can accept, decline, or counter this offer." : "This trade is available.") : tab === "player" ? "Add cards to both sides and make sure you own everything offered." : "The selected cards are not currently available."}</p><button type="button" className="confirm-button" disabled={!canTrade} onClick={submit}>{counterOffer ? "Send counteroffer" : tab === "player" && onDomesticOffer ? "Publish offer" : "Confirm trade"} <Icon name="chevron" /></button></div>
    </section>
  </div>;
}
