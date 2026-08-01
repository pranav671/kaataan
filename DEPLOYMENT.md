# Kaataan deployment

Kaataan ships as two containers behind a single public origin:

- `web`: the static React build and Nginx reverse proxy
- `game-server`: the authoritative HTTP/WebSocket service

Nginx serves the application and forwards `/socket` to the game server. The browser therefore uses the same host for HTTPS and secure WebSockets in production without embedding an environment-specific server address.

## Local production build

```bash
docker compose up --build
```

Open `http://localhost:8080`.

Health endpoints:

- Web: `http://localhost:8080/health`
- Game server through the proxy: `http://localhost:8080/server-health`

Stop the stack without deleting games:

```bash
docker compose down
```

The named `kaataan-data` volume survives container replacement. Running `docker compose down -v` intentionally deletes the persisted rooms and should not be used during a normal upgrade.

## Durable state

The game server writes `/data/rooms.json` after every durable room, profile, readiness, trade, and game-state mutation. Writes use a temporary file followed by an atomic rename. Reconnect tokens are stored in this server-only file, so its permissions, backups, and access should be treated like application credentials.

After a server restart:

- Lobby and active rooms are restored.
- Board topology, hands, development deck, awards, phase, and pending trade are restored.
- All players initially appear offline.
- A browser with a valid reconnect token resumes its exact seat.

For a host deployment, back up the Docker volume or bind-mount an encrypted host directory at `/data`.

## Public deployment

Terminate TLS at the platform load balancer or an outer reverse proxy and forward HTTP to the `web` container. The proxy must support WebSocket upgrades and should use a connection idle timeout greater than the server's 30-second heartbeat interval.

Only the `web` service needs to be public. Keep port 4180 private to the container network.

Recommended production requirements:

- HTTPS with automatic certificate renewal
- Encrypted volume backups
- A single game-server replica while file persistence is in use
- Centralized stdout/stderr collection
- Resource and uptime alerts for both health endpoints

File persistence intentionally targets a single authoritative server. Horizontal scaling requires replacing it with a transactional shared store plus cross-instance room routing.

## Environment variables

Game server:

| Variable | Default | Purpose |
| --- | --- | --- |
| `KAATAAN_SERVER_HOST` | `127.0.0.1` | HTTP bind host |
| `KAATAAN_SERVER_PORT` | `4180` | HTTP/WebSocket port |
| `KAATAAN_DATA_FILE` | unset | Enables durable room persistence at the given path |

Web build:

| Variable | Default | Purpose |
| --- | --- | --- |
| `VITE_GAME_SERVER_URL` | same-origin `/socket` in production | Optional explicit WebSocket URL |

## Upgrade procedure

1. Back up the data volume.
2. Build the new images.
3. Replace both services with `docker compose up -d --build`.
4. Confirm `/health` and `/server-health`.
5. Reload a browser session and confirm it resumes the same room.
