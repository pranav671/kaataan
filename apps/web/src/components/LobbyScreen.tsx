import { useEffect, useState, type FormEvent } from "react";
import type { PlayerColor, RoomSnapshot } from "@kaataan/protocol";

import type { ConnectionState, MultiplayerClient } from "../multiplayer/client.ts";
import { PLAYER_COLOR_OPTIONS } from "./WelcomeScreen.tsx";

export function LobbyScreen({ room, client, connection, error }: { readonly room: RoomSnapshot; readonly client: MultiplayerClient; readonly connection: ConnectionState; readonly error: string | null }) {
  const viewer = room.members.find((member) => member.id === room.viewerId)!;
  const [name, setName] = useState(viewer.name);
  const [color, setColor] = useState<PlayerColor>(viewer.color);
  const [copied, setCopied] = useState(false);
  const [pendingKickId, setPendingKickId] = useState<string | null>(null);
  const allReady = room.members.length >= 5 && room.members.every((member) => member.isReady && member.isConnected);
  const inviteUrl = `${window.location.origin}${window.location.pathname}?room=${room.code}`;
  useEffect(() => { setName(viewer.name); setColor(viewer.color); }, [viewer.name, viewer.color]);
  useEffect(() => { if (pendingKickId && !room.members.some((member) => member.id === pendingKickId)) setPendingKickId(null); }, [room.members, pendingKickId]);

  async function copyInvite() {
    await navigator.clipboard?.writeText(inviteUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }
  function saveProfile(event: FormEvent) {
    event.preventDefault();
    if (name.trim().length >= 2) client.updateProfile({ name: name.trim(), color });
  }

  return <main className="lobby-shell">
    <header className="lobby-topbar"><a className="brand" href="/"><span className="brand-mark"><i /><i /><i /></span><span>KAATAAN</span></a><span className={`connection-pill compact is-${connection}`}><i />{connection === "connected" ? "Live" : "Reconnecting"}</span></header>
    <section className="lobby-content">
      <div className="lobby-heading"><div><span className="eyebrow">Private table</span><h1>Your island is forming</h1><p>Invite at least four more settlers. The host can begin when everyone is ready.</p></div><button className="leave-button" type="button" onClick={() => client.leave()}>Leave room</button></div>
      <section className="invite-card"><div><span>Invite code</span><strong>{room.code}</strong></div><p>Share this link with friends. Each person chooses their own profile and color.</p><button type="button" onClick={() => void copyInvite()}>{copied ? "Copied!" : "Copy invite link"}</button></section>
      <div className="lobby-grid">
        <section className="seat-section"><div className="section-heading"><div><span className="eyebrow">The table</span><h2>{room.members.length} of 6 seats filled</h2></div><span>{room.members.filter((member) => member.isReady).length} ready</span></div><div className="seat-grid">{Array.from({ length: 6 }, (_, seat) => {
          const member = room.members.find((item) => item.seat === seat);
          if (!member) return <article key={seat} className="seat-card empty"><div>+</div><strong>Open seat</strong><span>Waiting for a friend</span></article>;
          const option = PLAYER_COLOR_OPTIONS.find((item) => item.id === member.color)!;
          const canKick = viewer.isHost && member.id !== viewer.id;
          return <article key={seat} className={`seat-card${member.id === room.viewerId ? " is-you" : ""}`} style={{ "--seat-color": option.value } as React.CSSProperties}><div className="seat-avatar">{member.name.slice(0, 1).toUpperCase()}</div><div><strong>{member.name}{member.id === room.viewerId && <small>You</small>}</strong><span>{member.isHost ? "Host" : `Seat ${seat + 1}`}</span></div><div className="seat-actions"><div className={`ready-badge${member.isReady ? " ready" : ""}`}>{member.isConnected ? member.isReady ? "Ready" : "Not ready" : "Offline"}</div>{canKick && (pendingKickId === member.id ? <div className="kick-confirm"><button type="button" onClick={() => setPendingKickId(null)}>Cancel</button><button type="button" className="danger" onClick={() => client.kickPlayer(member.id)}>Remove</button></div> : <button type="button" className="kick-button" aria-label={`Remove ${member.name} from room`} onClick={() => setPendingKickId(member.id)}>Remove</button>)}</div></article>;
        })}</div></section>
        <aside className="lobby-sidebar"><form className="profile-editor" onSubmit={saveProfile}><span className="eyebrow">Your profile</span><label><span>Name</span><input value={name} maxLength={24} onChange={(event) => setName(event.target.value)} /></label><fieldset className="color-field"><legend>Playing color</legend><div>{PLAYER_COLOR_OPTIONS.map((option) => <button key={option.id} type="button" disabled={room.members.some((member) => member.id !== viewer.id && member.color === option.id)} className={color === option.id ? "selected" : ""} aria-label={option.label} style={{ "--swatch": option.value } as React.CSSProperties} onClick={() => setColor(option.id)}><i /></button>)}</div></fieldset><button className="profile-save" disabled={name.trim().length < 2 || (name.trim() === viewer.name && color === viewer.color)}>Save profile</button></form>
          <section className="ready-panel"><div><span className="eyebrow">Before launch</span><h3>{viewer.isReady ? "You’re ready" : "Ready to settle?"}</h3><p>You can still change your mind until the host starts.</p></div><button className={viewer.isReady ? "unready" : ""} type="button" onClick={() => client.setReady(!viewer.isReady)}>{viewer.isReady ? "Not ready yet" : "Mark me ready"}</button></section>
          {viewer.isHost && <section className="host-panel"><span className="eyebrow">Host controls</span><button type="button" disabled={!allReady || connection !== "connected"} onClick={() => client.startGame()}>Start game <span>→</span></button><p>{room.members.length < 5 ? `${5 - room.members.length} more player${5 - room.members.length === 1 ? "" : "s"} needed` : !allReady ? "Waiting for everyone to be ready" : "Your table is ready to begin"}</p></section>}
          {error && <p className="form-error" role="alert">{error}</p>}
        </aside>
      </div>
    </section>
  </main>;
}
