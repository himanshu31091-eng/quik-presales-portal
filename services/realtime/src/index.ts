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

/** Minimum gap between logged connection errors, per client. */
const ERROR_LOG_INTERVAL_MS = 30_000;

/**
 * Attach an `error` listener to a Redis client, throttled.
 *
 * Two reasons this exists:
 *
 * 1. `duplicate()` does NOT copy listeners, so every duplicated client needs
 *    its own handler. Without one, ioredis prints "missing 'error' handler on
 *    this Redis client" and dumps the unhandled error on each reconnect — and
 *    an unhandled `error` on an EventEmitter can take the process down.
 * 2. `maxRetriesPerRequest: null` means a client retries forever. On a dev box
 *    with no Redis running that is five clients reconnecting indefinitely; left
 *    unthrottled it produces hundreds of identical lines a minute and buries
 *    every other app's output in the shared `turbo dev` console.
 *
 * One line per client per 30s is enough to know Redis is down; `/health` and
 * the `redisUp` gauge remain the authoritative signal.
 */
function attachErrorLogging(client: Redis, name: string): void {
  let lastLoggedAt = 0;
  let suppressed = 0;

  client.on("error", (e: Error) => {
    const now = Date.now();
    if (now - lastLoggedAt < ERROR_LOG_INTERVAL_MS) {
      suppressed += 1;
      return;
    }
    logger.error(
      { error: e.message, client: name, ...(suppressed > 0 ? { suppressed } : {}) },
      "redis error",
    );
    lastLoggedAt = now;
    suppressed = 0;
  });
}

let redisReady = false;
pubClient.on("ready", () => {
  redisReady = true;
  metrics.redisUp.set(1);
});
pubClient.on("end", () => {
  redisReady = false;
  metrics.redisUp.set(0);
});

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

// Every client, not just the two that report into /health. The three created by
// duplicate() had no error handler at all before this.
attachErrorLogging(pubClient, "pub");
attachErrorLogging(subClient, "sub");
attachErrorLogging(fanoutSub, "fanout");
attachErrorLogging(presenceClient, "presence");
attachErrorLogging(ringingClient, "ringing");

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
