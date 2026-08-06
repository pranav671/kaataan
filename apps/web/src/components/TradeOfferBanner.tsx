import type { ResourceBundle } from "@kaataan/game-engine";
import type { DomesticTradeOfferView, DomesticTradeResponseView, RoomSnapshot } from "@kaataan/protocol";

import type { MultiplayerClient } from "../multiplayer/client.ts";
import { bundleLabel } from "../multiplayer/presentation.ts";
import { Icon } from "./Icon.tsx";

function OfferContents({ offer, viewerId }: { readonly offer: DomesticTradeOfferView; readonly viewerId: string }) {
  const viewerIsActor = viewerId === offer.actorId;
  return <div className="offer-contents"><span><small>You give</small><strong>{bundleLabel((viewerIsActor ? offer.actorGives : offer.partnerGives) as ResourceBundle)}</strong></span><Icon name="trade" /><span><small>You receive</small><strong>{bundleLabel((viewerIsActor ? offer.partnerGives : offer.actorGives) as ResourceBundle)}</strong></span></div>;
}

function responseLabel(response: DomesticTradeResponseView | undefined): string {
  if (!response) return "Awaiting response";
  if (response.status === "accepted") return "Accepted your offer";
  if (response.status === "declined") return "Declined your offer";
  return `Offers ${bundleLabel(response.partnerGives!)} for ${bundleLabel(response.actorGives!)}`;
}

export function TradeOfferBanner({ room, client, onCounter }: { readonly room: RoomSnapshot; readonly client: MultiplayerClient; readonly onCounter: (offer: DomesticTradeOfferView) => void }) {
  const offer = room.tradeOffers[0];
  if (!offer) return null;
  const publisher = room.members.find((member) => member.id === offer.actorId);
  const isPublisher = offer.actorId === room.viewerId;
  const ownResponse = offer.responses.find((response) => response.playerId === room.viewerId);
  const counterSource = ownResponse?.status === "countered"
    ? { ...offer, actorGives: ownResponse.actorGives!, partnerGives: ownResponse.partnerGives! }
    : offer;

  return <section className={`trade-offer-banner open-trade${isPublisher ? " is-publisher" : " incoming"}`} role="status">
    <div className="offer-summary">
      <div className="offer-avatar">{publisher?.name.slice(0, 1).toUpperCase() ?? "?"}</div>
      <div className="offer-heading"><span className="eyebrow">{isPublisher ? "Open offer published" : "Open trade"}</span><strong>{isPublisher ? "Choose a response to complete the trade" : `${publisher?.name ?? "A player"} published an offer`}</strong></div>
      <OfferContents offer={offer} viewerId={room.viewerId} />
    </div>
    {isPublisher ? <div className="offer-response-list">
      {room.members.filter((member) => member.id !== room.viewerId).map((member) => {
        const response = offer.responses.find((item) => item.playerId === member.id);
        const selectable = response?.status === "accepted" || response?.status === "countered";
        return <button type="button" key={member.id} className={`offer-response is-${response?.status ?? "pending"}`} disabled={!selectable} onClick={() => client.selectTradeResponse(offer.id, member.id)}>
          <span className="response-avatar">{member.name.slice(0, 1).toUpperCase()}</span>
          <span><strong>{member.name}</strong><small>{responseLabel(response)}</small></span>
          {selectable && <b>{response?.status === "countered" ? "Accept counter" : "Trade"}</b>}
        </button>;
      })}
    </div> : <div className="recipient-response">
      <span className={`response-state is-${ownResponse?.status ?? "pending"}`}>{responseLabel(ownResponse)}</span>
      <div className="offer-actions"><button type="button" className="decline" onClick={() => client.respondToTrade("reject", offer.id)}>Decline</button><button type="button" className="counter" onClick={() => onCounter(counterSource)}>Counter</button><button type="button" className="accept" onClick={() => client.respondToTrade("accept", offer.id)}>Accept</button></div>
    </div>}
    {isPublisher && <button type="button" className="cancel-open-offer" onClick={() => client.respondToTrade("cancel", offer.id)}>Cancel offer</button>}
  </section>;
}
