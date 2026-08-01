import type { ResourceBundle } from "@kaataan/game-engine";
import type { DomesticTradeOfferView, RoomSnapshot } from "@kaataan/protocol";

import type { MultiplayerClient } from "../multiplayer/client.ts";
import { bundleLabel } from "../multiplayer/presentation.ts";
import { Icon } from "./Icon.tsx";

function OfferContents({ offer, viewerId }: { readonly offer: DomesticTradeOfferView; readonly viewerId: string }) {
  const viewerIsActor = viewerId === offer.actorId;
  return <div className="offer-contents"><span><small>You give</small><strong>{bundleLabel((viewerIsActor ? offer.actorGives : offer.partnerGives) as ResourceBundle)}</strong></span><Icon name="trade" /><span><small>You receive</small><strong>{bundleLabel((viewerIsActor ? offer.partnerGives : offer.actorGives) as ResourceBundle)}</strong></span></div>;
}

export function TradeOfferBanner({ room, client, onCounter }: { readonly room: RoomSnapshot; readonly client: MultiplayerClient; readonly onCounter: (offer: DomesticTradeOfferView) => void }) {
  const offer = room.tradeOffers.find((item) => item.actorId === room.viewerId || item.partnerId === room.viewerId);
  if (!offer) return null;
  const proposer = room.members.find((member) => member.id === offer.proposedById);
  const incoming = offer.proposedById !== room.viewerId;
  return <section className={`trade-offer-banner${incoming ? " incoming" : ""}`} role="status">
    <div className="offer-avatar">{proposer?.name.slice(0, 1).toUpperCase() ?? "?"}</div>
    <div className="offer-heading"><span className="eyebrow">{incoming ? "Trade offer" : "Offer sent"}</span><strong>{incoming ? `${proposer?.name ?? "A player"} proposes a trade` : "Waiting for a response"}</strong></div>
    <OfferContents offer={offer} viewerId={room.viewerId} />
    <div className="offer-actions">{incoming ? <><button type="button" className="decline" onClick={() => client.respondToTrade("reject", offer.id)}>Decline</button><button type="button" className="counter" onClick={() => onCounter(offer)}>Counter</button><button type="button" className="accept" onClick={() => client.respondToTrade("accept", offer.id)}>Accept</button></> : <button type="button" className="decline" onClick={() => client.respondToTrade("cancel", offer.id)}>Cancel offer</button>}</div>
  </section>;
}
