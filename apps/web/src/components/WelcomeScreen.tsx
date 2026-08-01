import { useEffect, useState, type FormEvent } from "react";
import type { PlayerColor } from "@kaataan/protocol";

import type { ConnectionState, MultiplayerClient } from "../multiplayer/client.ts";

const COLORS: readonly { id: PlayerColor; label: string; value: string }[] = [
  { id: "teal", label: "Teal", value: "#156f62" }, { id: "coral", label: "Coral", value: "#d85c41" },
  { id: "gold", label: "Gold", value: "#d9a52b" }, { id: "blue", label: "Blue", value: "#526cc7" },
  { id: "plum", label: "Plum", value: "#8a57a3" }, { id: "umber", label: "Umber", value: "#8a5a35" },
];

export const PLAYER_COLOR_OPTIONS = COLORS;

export function WelcomeScreen({ client, connection, error }: { readonly client: MultiplayerClient; readonly connection: ConnectionState; readonly error: string | null }) {
  const invitedCode = new URLSearchParams(window.location.search).get("room")?.toUpperCase() ?? "";
  const [mode, setMode] = useState<"create" | "join">(invitedCode ? "join" : "create");
  const [name, setName] = useState("");
  const [code, setCode] = useState(invitedCode);
  const [color, setColor] = useState<PlayerColor>("teal");
  const [submitted, setSubmitted] = useState(false);
  const online = connection === "connected";

  useEffect(() => { if (error) setSubmitted(false); }, [error]);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (name.trim().length < 2 || (mode === "join" && code.trim().length < 4) || !online) return;
    setSubmitted(true);
    if (mode === "create") client.createRoom({ name: name.trim(), color });
    else client.joinRoom(code.trim().toUpperCase(), { name: name.trim(), color });
  }

  return <main className="welcome-shell">
    <section className="welcome-story">
      <a className="brand welcome-brand" href="/" aria-label="Kaataan home"><span className="brand-mark"><i /><i /><i /></span><span>KAATAAN</span></a>
      <div className="story-copy"><span className="eyebrow">A living island for your table</span><h1>Build boldly.<br />Trade wisely.</h1><p>Gather five or six friends and settle a shared island in real time. Your private room keeps the board, turns, and hidden cards in sync.</p></div>
      <div className="story-hexes" aria-hidden="true"><i /><i /><i /><i /><i /></div>
      <div className="story-facts"><span><strong>5–6</strong> players</span><span><strong>1</strong> invite code</span><span><strong>Live</strong> game state</span></div>
    </section>
    <section className="welcome-panel">
      <form className="join-card" onSubmit={submit}>
        <span className={`connection-pill is-${connection}`}><i />{online ? "Game server connected" : connection === "reconnecting" ? "Reconnecting…" : "Connecting to table…"}</span>
        <div><span className="eyebrow">Welcome, settler</span><h2>{mode === "create" ? "Create a private room" : "Join your friends"}</h2><p>{mode === "create" ? "You’ll receive an invite code to share." : "Enter the code from your host."}</p></div>
        <div className="mode-switch"><button type="button" className={mode === "create" ? "active" : ""} onClick={() => setMode("create")}>Create room</button><button type="button" className={mode === "join" ? "active" : ""} onClick={() => setMode("join")}>Join room</button></div>
        {mode === "join" && <label className="welcome-field"><span>Invite code</span><input autoFocus value={code} maxLength={12} placeholder="KTN482" onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} /></label>}
        <label className="welcome-field"><span>Profile name</span><input autoFocus={mode === "create"} value={name} maxLength={24} placeholder="What should friends call you?" onChange={(event) => setName(event.target.value)} /></label>
        <fieldset className="color-field"><legend>Choose your color</legend><div>{COLORS.map((option) => <button key={option.id} type="button" className={color === option.id ? "selected" : ""} aria-label={option.label} aria-pressed={color === option.id} style={{ "--swatch": option.value } as React.CSSProperties} onClick={() => setColor(option.id)}><i /></button>)}</div></fieldset>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="welcome-submit" type="submit" disabled={!online || submitted || name.trim().length < 2 || (mode === "join" && code.length < 4)}>{submitted ? "Opening the table…" : mode === "create" ? "Create my room" : "Take my seat"}<span>→</span></button>
        <small className="privacy-note">Rooms are private and accessible only with the invite code.</small>
      </form>
    </section>
  </main>;
}
