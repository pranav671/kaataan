import type {
  ClientMessage,
  PlayerColor,
  PlayerSessionCredentials,
  ProjectedGameEvent,
  RoomSnapshot,
  TurnTimerSettings,
  ServerMessage,
} from "@kaataan/protocol";
import type { GameCommand, ResourceBundle } from "@kaataan/game-engine";

export type ConnectionState = "idle" | "connecting" | "connected" | "reconnecting" | "offline";

export interface MultiplayerState {
  readonly connection: ConnectionState;
  readonly snapshot: RoomSnapshot | null;
  readonly events: readonly ProjectedGameEvent[];
  readonly error: string | null;
}

export interface SessionStorageAdapter {
  load(): PlayerSessionCredentials | null;
  save(session: PlayerSessionCredentials): void;
  clear(): void;
}

export class BrowserSessionStorage implements SessionStorageAdapter {
  private readonly key = "kaataan.player-session.v1";
  load(): PlayerSessionCredentials | null {
    try {
      const value = window.localStorage.getItem(this.key);
      return value ? JSON.parse(value) as PlayerSessionCredentials : null;
    } catch { return null; }
  }
  save(session: PlayerSessionCredentials): void { window.localStorage.setItem(this.key, JSON.stringify(session)); }
  clear(): void { window.localStorage.removeItem(this.key); }
}

type StateListener = (state: MultiplayerState) => void;

export class MultiplayerClient {
  private socket: WebSocket | null = null;
  private state: MultiplayerState = { connection: "idle", snapshot: null, events: [], error: null };
  private readonly listeners = new Set<StateListener>();
  private reconnectTimer: number | null = null;
  private reconnectAttempt = 0;
  private closedExplicitly = false;
  private sequence = 0;

  constructor(
    private readonly url: string,
    private readonly storage: SessionStorageAdapter,
  ) {}

  subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  hasStoredSession(): boolean { return Boolean(this.storage.load()); }
  clearError(): void { this.patch({ error: null }); }

  connect(): void {
    if (this.socket?.readyState === WebSocket.OPEN || this.socket?.readyState === WebSocket.CONNECTING) return;
    this.closedExplicitly = false;
    const hasSession = Boolean(this.storage.load());
    this.patch({ connection: hasSession && this.reconnectAttempt > 0 ? "reconnecting" : "connecting", error: null });
    const socket = new WebSocket(this.url);
    this.socket = socket;
    socket.addEventListener("open", () => {
      this.reconnectAttempt = 0;
      this.patch({ connection: "connected", error: null });
      const session = this.storage.load();
      if (session) this.send({ type: "session.resume", requestId: this.id("resume"), ...session });
    });
    socket.addEventListener("message", (event) => this.receive(JSON.parse(String(event.data)) as ServerMessage));
    socket.addEventListener("close", () => {
      if (this.socket === socket) this.socket = null;
      if (this.closedExplicitly) return;
      this.patch({ connection: "offline" });
      this.scheduleReconnect();
    });
    socket.addEventListener("error", () => this.patch({ error: "Unable to reach the game server" }));
  }

  createRoom(profile: { readonly name: string; readonly color: PlayerColor }): void {
    this.send({ type: "room.create", requestId: this.id("create"), profile });
  }

  joinRoom(code: string, profile: { readonly name: string; readonly color: PlayerColor }): void {
    this.send({ type: "room.join", requestId: this.id("join"), code, profile });
  }

  updateProfile(profile: { readonly name: string; readonly color: PlayerColor }): void {
    this.send({ type: "room.update_profile", requestId: this.id("profile"), profile });
  }

  setReady(ready: boolean): void { this.send({ type: "room.set_ready", requestId: this.id("ready"), ready }); }
  updateTimerSettings(settings: TurnTimerSettings): void { this.send({ type: "room.update_timer_settings", requestId: this.id("timers"), settings }); }
  startGame(): void { this.send({ type: "room.start", requestId: this.id("start") }); }
  endGame(): void { this.send({ type: "room.end_game", requestId: this.id("end-game") }); }
  kickPlayer(playerId: string): void { this.send({ type: "room.kick", requestId: this.id("kick"), playerId }); }

  gameCommand(expectedVersion: number, command: GameCommand): void {
    const wireCommand = command as unknown as Extract<ClientMessage, { readonly type: "game.command" }>["command"];
    this.send({ type: "game.command", commandId: this.id("command"), expectedVersion, command: wireCommand });
  }

  offerTrade(expectedVersion: number, partnerId: string, actorGives: ResourceBundle, partnerGives: ResourceBundle): void {
    this.send({ type: "trade.offer", requestId: this.id("offer"), expectedVersion, partnerId, actorGives, partnerGives });
  }

  counterTrade(expectedVersion: number, offerId: string, actorGives: ResourceBundle, partnerGives: ResourceBundle): void {
    this.send({ type: "trade.counter", requestId: this.id("counter"), expectedVersion, offerId, actorGives, partnerGives });
  }

  respondToTrade(action: "accept" | "reject" | "cancel", offerId: string): void {
    this.send({ type: `trade.${action}`, requestId: this.id(`trade-${action}`), offerId } as ClientMessage);
  }

  leave(): void {
    if (this.socket?.readyState === WebSocket.OPEN && this.state.snapshot) {
      this.send({ type: "room.leave", requestId: this.id("leave") });
    }
    this.storage.clear();
    this.patch({ snapshot: null, events: [], error: null });
  }

  disconnect(): void {
    this.closedExplicitly = true;
    if (this.reconnectTimer !== null) window.clearTimeout(this.reconnectTimer);
    this.socket?.close();
    this.socket = null;
    this.patch({ connection: "offline" });
  }

  private send(message: ClientMessage): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      this.patch({ error: "You are offline. Reconnecting…" });
      return;
    }
    this.socket.send(JSON.stringify(message));
  }

  private receive(message: ServerMessage): void {
    if (message.type === "session.created") {
      this.storage.save(message.session);
      this.patch({ snapshot: message.snapshot, error: null });
    } else if (message.type === "session.resumed" || message.type === "room.snapshot") {
      this.patch({ snapshot: message.snapshot, error: null });
    } else if (message.type === "session.kicked") {
      this.storage.clear();
      this.patch({ snapshot: null, events: [], error: message.message });
    } else if (message.type === "game.update") {
      this.patch({ snapshot: message.snapshot, events: [...message.events, ...this.state.events].slice(0, 40), error: null });
    } else if (message.type === "request.error") {
      if (message.code === "SESSION_NOT_FOUND" || message.code === "INVALID_RECONNECT_TOKEN" || message.code === "ROOM_NOT_FOUND") {
        this.storage.clear();
        this.patch({ snapshot: null, events: [], error: message.message });
      } else this.patch({ error: message.message });
    }
  }

  private patch(update: Partial<MultiplayerState>): void {
    this.state = { ...this.state, ...update };
    for (const listener of this.listeners) listener(this.state);
  }

  private id(prefix: string): string { return `${prefix}-${Date.now()}-${++this.sequence}`; }

  private scheduleReconnect(): void {
    if (this.closedExplicitly || this.reconnectTimer !== null) return;
    const delay = Math.min(8000, 500 * 2 ** this.reconnectAttempt++);
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }
}

export function defaultGameServerUrl(): string {
  const configured = import.meta.env.VITE_GAME_SERVER_URL as string | undefined;
  if (configured) return configured;
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return import.meta.env.DEV
    ? `${protocol}//${window.location.hostname}:4180/socket`
    : `${protocol}//${window.location.host}/socket`;
}
