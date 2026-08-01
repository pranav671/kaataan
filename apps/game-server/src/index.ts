import { createKaataanServer } from "./server.ts";
import { JsonFileRoomPersistence } from "./persistence.ts";
import { RoomManager } from "./roomManager.ts";

export * from "./errors.ts";
export * from "./projection.ts";
export * from "./persistence.ts";
export * from "./roomManager.ts";
export * from "./server.ts";

const port = Number(process.env.KAATAAN_SERVER_PORT ?? 4180);
const host = process.env.KAATAAN_SERVER_HOST ?? "127.0.0.1";
const dataFile = process.env.KAATAAN_DATA_FILE;
const rooms = new RoomManager(dataFile ? { persistence: new JsonFileRoomPersistence(dataFile) } : {});
const server = createKaataanServer({ rooms });

server.listen(port, host).then((address) => {
  process.stdout.write(`Kaataan game server listening on http://${address.host}:${address.port}\n`);
}).catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : "Server failed to start"}\n`);
  process.exitCode = 1;
});

async function shutdown(): Promise<void> {
  await server.close();
  process.exit(0);
}

process.on("SIGINT", () => { void shutdown(); });
process.on("SIGTERM", () => { void shutdown(); });
