import { useEffect, useMemo, useState } from "react";
import { playerScore, type EdgeId, type GameCommand, type HexId, type PlayerId, type ResourceBundle, type VertexId } from "@kaataan/game-engine";
import type { DomesticTradeOfferView, PlayerColor, RoomSnapshot } from "@kaataan/protocol";

import type { ConnectionState, MultiplayerClient } from "../multiplayer/client.ts";
import { hydrateGameSnapshot } from "../multiplayer/hydrate.ts";
import { projectedEventMessage } from "../multiplayer/presentation.ts";
import { actionPlayerId, legalTargetsFor, phaseLabel, type BoardAction, type BoardTargetId } from "../game/presentation.ts";
import { ActionDock } from "./ActionDock.tsx";
import { GameOverDialog } from "./GameOverDialog.tsx";
import { Icon } from "./Icon.tsx";
import { PhasePrompt } from "./PhasePrompt.tsx";
import { PlayerRail } from "./PlayerRail.tsx";
import { ResourceHand } from "./ResourceHand.tsx";
import { SidePanel } from "./SidePanel.tsx";
import { SvgBoard, type BoardSelection } from "./SvgBoard.tsx";
import { TradeDialog } from "./TradeDialog.tsx";
import { TradeOfferBanner } from "./TradeOfferBanner.tsx";

const COLOR_VALUES: Record<PlayerColor, string> = { teal: "#156f62", coral: "#d85c41", gold: "#d9a52b", blue: "#526cc7", plum: "#8a57a3", umber: "#8a5a35" };

export function OnlineGameTable({ room, client, connection, events, error }: { readonly room: RoomSnapshot; readonly client: MultiplayerClient; readonly connection: ConnectionState; readonly events: Parameters<typeof projectedEventMessage>[0][]; readonly error: string | null }) {
  if (!room.game) return null;
  const state = useMemo(() => hydrateGameSnapshot(room.game!), [room.game]);
  const [action, setAction] = useState<BoardAction>("inspect");
  const [selection, setSelection] = useState<BoardSelection | null>(null);
  const [tradeOpen, setTradeOpen] = useState(false);
  const [counterOffer, setCounterOffer] = useState<DomesticTradeOfferView | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const viewerId = room.viewerId as PlayerId;
  const activeActorId = actionPlayerId(state);
  const viewer = state.players.get(viewerId)!;
  const viewerMustDiscard = state.phase.kind === "discarding" && Boolean(state.phase.requiredByPlayer[viewerId]) && !state.phase.submittedPlayerIds.includes(viewerId);
  const viewerCanAct = connection === "connected" && (viewerMustDiscard || activeActorId === viewerId);
  const waitingName = activeActorId ? state.players.get(activeActorId)?.name : null;
  const targets = useMemo(() => viewerCanAct ? legalTargetsFor(state, viewerId, action) : { action: "inspect" as const, ids: new Set<BoardTargetId>(), instruction: connection !== "connected" ? "Reconnecting to the island…" : waitingName ? `Waiting for ${waitingName}` : phaseLabel(state) }, [state, viewerId, action, viewerCanAct, connection, waitingName]);
  const activity = useMemo(() => events.flatMap((event) => projectedEventMessage(event, state) ?? []).slice(0, 30), [events, state]);
  const colors = useMemo(() => new Map(room.members.map((member) => [member.id, COLOR_VALUES[member.color]])), [room.members]);

  useEffect(() => { setAction("inspect"); setSelection(null); }, [state.phase.kind, activeActorId]);
  useEffect(() => {
    if (!error) return;
    setToast(error);
    const timer = window.setTimeout(() => { setToast(null); client.clearError(); }, 4200);
    return () => window.clearTimeout(timer);
  }, [error, client]);

  function command(commandValue: GameCommand) {
    if (!viewerCanAct) return;
    client.gameCommand(state.version, commandValue);
    setAction("inspect"); setTradeOpen(false);
  }
  function selectBoardTarget(id: BoardTargetId) {
    if (!viewerCanAct) return;
    let next: GameCommand | null = null;
    if (state.phase.kind === "setup") next = state.phase.step === "settlement" ? { type: "PLACE_INITIAL_SETTLEMENT", vertexId: id as VertexId } : { type: "PLACE_INITIAL_ROAD", edgeId: id as EdgeId };
    else if (targets.action === "robber") next = { type: "MOVE_ROBBER", hexId: id as HexId };
    else if (targets.action === "road") next = state.phase.kind === "road-building" ? { type: "PLACE_FREE_ROAD", edgeId: id as EdgeId } : { type: "BUILD_ROAD", edgeId: id as EdgeId };
    else if (targets.action === "settlement") next = { type: "BUILD_SETTLEMENT", vertexId: id as VertexId };
    else if (targets.action === "city") next = { type: "BUILD_CITY", vertexId: id as VertexId };
    if (next) command(next);
  }
  function offerTrade(partnerId: PlayerId, actorGives: ResourceBundle, partnerGives: ResourceBundle) {
    client.offerTrade(state.version, partnerId, actorGives, partnerGives);
    setTradeOpen(false);
  }
  function counterTrade(offerId: string, actorGives: ResourceBundle, partnerGives: ResourceBundle) {
    client.counterTrade(state.version, offerId, actorGives, partnerGives);
    setCounterOffer(null);
  }
  async function copyInvite() {
    const url = `${window.location.origin}${window.location.pathname}?room=${room.code}`;
    await navigator.clipboard?.writeText(url); setToast("Invite link copied");
  }
  const victoryCards = viewer.developmentCards.filter((card) => card.type === "victory-point");
  const victoryCardsNeeded = Math.max(0, 10 - playerScore(state, viewerId).publicScore);

  return <div className="app-shell">
    <header className="topbar"><a className="brand" href="#game"><span className="brand-mark"><i /><i /><i /></span><span>KAATAAN</span></a><div className="room-info"><span className="eyebrow">Private table</span><strong>Island {room.code} <i>•</i> {connection === "connected" ? "Live" : "Reconnecting"}</strong></div><div className="topbar-actions"><button type="button" className="invite-button" onClick={() => void copyInvite()}><Icon name="plus" />Invite friends</button><div className="profile-chip"><div style={{ background: colors.get(viewerId) }}>{viewer.name.slice(0, 1).toUpperCase()}</div><span><small>Your seat</small><strong>{viewer.name}</strong></span></div></div></header>
    <main id="game" className="game-layout"><PlayerRail state={state} actorId={activeActorId} colorsByPlayer={colors} /><div className="game-center"><div className="game-statusbar"><div><span className="eyebrow">{state.phase.kind === "setup" ? "Opening placement" : `Paired turn ${state.pairedTurn}`}</span><h1>{viewerCanAct ? phaseLabel(state) : waitingName ? `${waitingName} is playing` : phaseLabel(state)}</h1></div><div className="status-actions"><span className={`connection-pill compact is-${connection}`}><i />{connection === "connected" ? "Live" : "Reconnecting"}</span><button type="button" className="text-button" onClick={() => client.leave()}>Leave table</button></div></div>
      <SvgBoard state={state} targets={targets} selectedId={selection?.id ?? null} onTarget={selectBoardTarget} onInspect={setSelection} colorsByPlayer={colors} />
      {viewerCanAct && <PhasePrompt state={state} actorId={viewerId} onCommand={command} />}
      <ResourceHand state={state} playerId={viewerId} />
      {viewer.developmentCards.length > 0 && <section className="development-hand"><span>Development cards</span><div>{viewer.developmentCards.map((card) => <button type="button" key={card.id} disabled={!viewerCanAct || (card.type === "victory-point" ? victoryCards.length < victoryCardsNeeded : viewer.developmentCardPlayedThisTurn || card.purchasedPlayerTurn >= viewer.playerTurnSequence)} onClick={() => card.type === "victory-point" ? command({ type: "REVEAL_VICTORY_POINTS", cardIds: victoryCards.slice(0, victoryCardsNeeded).map((item) => item.id) }) : command({ type: "PLAY_DEVELOPMENT_CARD", cardId: card.id })}><Icon name={card.type === "knight" ? "helmet" : card.type === "road-building" ? "road" : "spark"} />{card.type === "victory-point" && victoryCards.length >= victoryCardsNeeded ? "Reveal to win" : card.type.replaceAll("-", " ")}</button>)}</div></section>}
      {viewerCanAct && <ActionDock state={state} actorId={viewerId} selectedAction={action} onAction={setAction} onRoll={() => command({ type: "ROLL_DICE" })} onEndTurn={() => command({ type: "END_SUBTURN" })} onTrade={() => setTradeOpen(true)} onBuyDevelopment={() => command({ type: "BUY_DEVELOPMENT_CARD" })} />}
    </div><SidePanel state={state} events={activity} selection={selection} actorId={activeActorId} /></main>
    {tradeOpen && <TradeDialog state={state} actorId={viewerId} onClose={() => setTradeOpen(false)} onTrade={command} onDomesticOffer={offerTrade} />}
    {counterOffer && <TradeDialog state={state} actorId={viewerId} counterOffer={counterOffer} onClose={() => setCounterOffer(null)} onTrade={command} onCounter={counterTrade} />}
    <TradeOfferBanner room={room} client={client} onCounter={setCounterOffer} />
    <GameOverDialog state={state} onNewGame={() => client.leave()} />
    {toast && <div className="toast" role="status"><Icon name="spark" /><span>{toast}</span></div>}
  </div>;
}
