import { createAdapter } from "@socket.io/redis-adapter";
import Redis from "ioredis";
import { createGateway } from "./gateway";
import { logger } from "./logger";
import { createMetrics } from "./metrics";
import type { RingingRedis } from "./ringing";

/**
 * Production entrypoint for the QuikIT realtime gateway.
 *
 * Wiring:
 *   - pubClient / subClient  → Socket.IO Redis adapter (multi-instance room state)
 *   - fanoutSub              → SUBSCRIBE quikchat:fanout (the publishFanout seam)
 *   - presenceClient         → Redis-only presence sets
 *   - ringingClient          → Redis-backed ringing timeout (§2.1)
 *
 * The gateway authenticates the handshake token, joins org-scoped rooms,
 * authorizes channel joins with assertMembership, and fans out events. It
 * writes no domain rows.
 */
// Default 9100 — a free port outside the 3000–3013 app range (the quikasset
// app owns 3012, so the gateway must not also default there).
const PORT = Number(process.env.PORT ?? process.env.REALTIME_PORT ?? 9100);
// Default aligned to 6379 — the same Redis instance apps/quikchat publishes
// fan-out to. A mismatched port silently breaks fan-out delivery.
const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
const TOKEN_SECRET = process.env.REALTIME_TOKEN_SECRET;
const ALLOWED_ORIGINS = (process.env.REALTIME_ALLOWED_ORIGINS ?? "http://localhost:3011")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);
const MAX_HTTP_BUFFER_SIZE = Number(process.env.REALTIME_MAX_BUFFER_BYTES ?? 1_000_000);

if (!TOKEN_SECRET) {
  logger.error("REALTIME_TOKEN_SECRET is required");
  process.exit(1);
}

const pubClient = new Redis(REDIS_URL, { maxRetriesPerRequest: null });
const subClient = pubClient.duplicate();
const fanoutSub = pubClient.duplicate();
const presenceClient = pubClient.duplicate();
const ringingClient = pubClient.duplicate();

const metrics = createMetrics();

let redisReady = false;
pubClient.on("ready", () => {
  redisReady = true;
  metrics.redisUp.set(1);
});
pubClient.on("end", () => {
  redisReady = false;
  metrics.redisUp.set(0);
});
pubClient.on("error", (e) => logger.error({ error: e.message }, "redis error"));

// §2.8 — fold the fan-out subscriber's connection health into /health (the
// standalone gateway only reported pub readiness).
let fanoutReady = false;
fanoutSub.on("ready", () => {
  fanoutReady = true;
  metrics.fanoutSubUp.set(1);
});
fanoutSub.on("end", () => {
  fanoutReady = false;
  metrics.fanoutSubUp.set(0);
});
fanoutSub.on("error", (e) => logger.error({ error: e.message }, "fanout subscriber error"));

const gateway = createGateway({
  tokenSecret: TOKEN_SECRET,
  allowedOrigins: ALLOWED_ORIGINS,
  fanoutSubscriber: fanoutSub,
  adapterFactory: createAdapter(pubClient, subClient),
  presenceRedis: presenceClient as unknown as import("./presence").PresenceRedis,
  ringingRedis: ringingClient as unknown as RingingRedis,
  healthCheck: () => redisReady,
  fanoutHealthy: () => fanoutReady,
  maxHttpBufferSize: MAX_HTTP_BUFFER_SIZE,
  metrics,
});

gateway.httpServer.listen(PORT, () => {
  logger.info(
    { port: PORT, origins: ALLOWED_ORIGINS },
    "realtime-gateway listening",
  );
});

// Graceful drain: stop accepting, close sockets, disconnect Redis.
let draining = false;
async function shutdown(signal: string) {
  if (draining) return;
  draining = true;
  logger.info({ signal }, "draining");
  try {
    await gateway.close();
    await Promise.allSettled([
      pubClient.quit(),
      subClient.quit(),
      fanoutSub.quit(),
      presenceClient.quit(),
      ringingClient.quit(),
    ]);
  } finally {
    process.exit(0);
  }
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
