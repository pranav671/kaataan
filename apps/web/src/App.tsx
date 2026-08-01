import { useEffect, useMemo, useState } from "react";

import { LobbyScreen } from "./components/LobbyScreen.tsx";
import { OnlineGameTable } from "./components/OnlineGameTable.tsx";
import { WelcomeScreen } from "./components/WelcomeScreen.tsx";
import { BrowserSessionStorage, MultiplayerClient, defaultGameServerUrl, type MultiplayerState } from "./multiplayer/client.ts";

const INITIAL_STATE: MultiplayerState = { connection: "idle", snapshot: null, events: [], error: null };

export function App() {
  const client = useMemo(() => new MultiplayerClient(defaultGameServerUrl(), new BrowserSessionStorage()), []);
  const [multiplayer, setMultiplayer] = useState(INITIAL_STATE);
  const [restoring] = useState(() => client.hasStoredSession());
  useEffect(() => {
    const unsubscribe = client.subscribe(setMultiplayer);
    client.connect();
    return () => { unsubscribe(); client.disconnect(); };
  }, [client]);

  if (!multiplayer.snapshot) {
    if (restoring && !multiplayer.error) return <main className="restore-shell"><span className="brand-mark"><i /><i /><i /></span><span className="eyebrow">Returning to your island</span><h1>Rejoining the table…</h1><div className="restore-loader"><i /><i /><i /></div></main>;
    return <WelcomeScreen client={client} connection={multiplayer.connection} error={multiplayer.error} />;
  }
  if (multiplayer.snapshot.status === "lobby") return <LobbyScreen room={multiplayer.snapshot} client={client} connection={multiplayer.connection} error={multiplayer.error} />;
  return <OnlineGameTable room={multiplayer.snapshot} client={client} connection={multiplayer.connection} events={[...multiplayer.events]} error={multiplayer.error} />;
}
