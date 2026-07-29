import { createServer, type Server as HttpServer } from "node:http";
import { Server as IOServer } from "socket.io";
import { registerCallingHandlers } from "./calling";
import { FANOUT_CHANNEL, type FanoutEvent, type FanoutEventType } from "./fanout-contract";
import { logger } from "./logger";
import { createMetrics, type Metrics } from "./metrics";
import { markOffline, markOnline, onlineUserIds, refresh, type PresenceRedis } from "./presence";
import { assertMembership, listChannelIdsForMember, listMemberUserIdsForChannels } from "./queries";
import { channelRoom, userRoom } from "./rooms";
import { startSweeper, type RingingRedis } from "./ringing";
import { verifyToken } from "./token";

/** Minimal shape of an ioredis subscriber (real ioredis or ioredis-mock). */
export interface FanoutSubscriber {
  subscribe(channel: string): Promise<unknown> | unknown;
  on(event: "message", listener: (channel: string, message: string) => void): unknown;
}

export interface GatewayOptions {
  tokenSecret: string;
  allowedOrigins: string[] | "*";
  /** Subscriber connection for the `quikchat:fanout` channel. */
  fanoutSubscriber: FanoutSubscriber;
  /** Optional Socket.IO Redis adapter factory (omit for single-instance / tests). */
  adapterFactory?: Parameters<IOServer["adapter"]>[0];
  /** Reports Redis health (adapter/pub connected). Defaults to always-true. */
  healthCheck?: () => boolean;
  /** Reports fan-out subscriber health (§2.8). Defaults to always-true. */
  fanoutHealthy?: () => boolean;
  /** Max inbound events (join/leave) per socket per window. Default 20. */
  wsEventLimit?: number;
  /** Inbound rate-limit window in ms. Default 10_000. */
  wsWindowMs?: number;
  /** Redis client for presence (omit to disable presence). */
  presenceRedis?: PresenceRedis;
  /** Presence key TTL in ms (heartbeat must arrive within this). Default 30_000. */
  presenceTtlMs?: number;
  /** Redis client backing the ringing timeout (§2.1). Omit to disable calling. */
  ringingRedis?: RingingRedis;
  /** Ringing sweep interval in ms. Default 5_000. */
  sweepIntervalMs?: number;
  /** Max inbound Socket.IO message size in bytes (§2.8). Default 1_000_000. */
  maxHttpBufferSize?: number;
  /** Pre-built metrics registry (§2.6). Omit to build one internally. */
  metrics?: Metrics;
  /** Optionally attach to an existing HTTP server instead of creating one. */
  httpServer?: HttpServer;
}

interface SocketBucket {
  count: number;
  resetAt: number;
}

export interface Gateway {
  io: IOServer;
  httpServer: HttpServer;
  metrics: Metrics;
  /** Dispatch a fan-out event to rooms directly (also called by the subscriber). */
  dispatch: (evt: FanoutEvent) => void;
  close: () => Promise<void>;
}

/**
 * Build the realtime gateway. The gateway is fan-out + read-only authorization
 * only — it never writes a domain row.
 */
export function createGateway(opts: GatewayOptions): Gateway {
  const metrics = opts.metrics ?? createMetrics();
  const isHealthy = () =>
    (opts.healthCheck ? opts.healthCheck() : true) &&
    (opts.fanoutHealthy ? opts.fanoutHealthy() : true);

  const httpServer =
    opts.httpServer ??
    createServer((req, res) => {
      if (req.url === "/health") {
        const ok = isHealthy();
        res.writeHead(ok ? 200 : 503, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            status: ok ? "ok" : "degraded",
            service: "realtime-gateway",
            redis: opts.healthCheck ? opts.healthCheck() : true,
            fanoutSubscriber: opts.fanoutHealthy ? opts.fanoutHealthy() : true,
          }),
        );
        return;
      }
      if (req.url === "/metrics") {
        metrics
          .render()
          .then(({ body, contentType }) => {
            res.writeHead(200, { "content-type": contentType });
            res.end(body);
          })
          .catch(() => {
            res.writeHead(500, { "content-type": "text/plain" });
            res.end("metrics error");
          });
        return;
      }
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "not found" }));
    });

  const io = new IOServer(httpServer, {
    cors: { origin: opts.allowedOrigins, credentials: true },
    // §2.8 — cap inbound frame size explicitly (default socket.io is 1MB; we set
    // it so the value is intentional and tunable via env in index.ts).
    maxHttpBufferSize: opts.maxHttpBufferSize ?? 1_000_000,
  });
  if (opts.adapterFactory) io.adapter(opts.adapterFactory);

  const updateRoomsGauge = () => {
    try {
      metrics.rooms.set(io.of("/").adapter.rooms.size);
    } catch {
      // adapter may not expose rooms in every environment; best-effort gauge.
    }
  };

  // --- Handshake auth: verify the short-lived token, pin identity to socket ---
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token as string | undefined;
      if (!token) {
        logger.warn({ socketId: socket.id }, "ws auth rejected: no token provided");
        return next(new Error("Missing handshake token"));
      }
      const { userId, orgId } = verifyToken(token, opts.tokenSecret);
      socket.data.userId = userId;
      socket.data.orgId = orgId;
      next();
    } catch (err) {
      logger.warn(
        { socketId: socket.id, error: (err as Error).message },
        "ws auth rejected: unauthorized",
      );
      next(new Error("Unauthorized"));
    }
  });

  const presence = opts.presenceRedis;
  const presenceTtl = opts.presenceTtlMs ?? 30_000;

  io.on("connection", async (socket) => {
    const { userId, orgId } = socket.data as { userId: string; orgId: string };
    logger.info({ socketId: socket.id, orgId, userId }, "ws connect");
    metrics.connections.inc();

    // Personal room (fan-out targeting + channel_created joins).
    await socket.join(userRoom(orgId, userId));

    // Auto-join current channel rooms (read-only, org-scoped).
    let channelIds: string[] = [];
    try {
      channelIds = await listChannelIdsForMember(orgId, userId);
      for (const id of channelIds) await socket.join(channelRoom(orgId, id));
    } catch {
      // If the lookup fails the socket still works; it just starts with no
      // channel rooms and can `join` explicitly.
    }
    updateRoomsGauge();

    const broadcastPresence = (status: "online" | "offline", lastSeen?: string) => {
      const payload = { userId, status, ...(lastSeen ? { lastSeen } : {}) };
      for (const id of channelIds) io.to(channelRoom(orgId, id)).emit("presence", payload);
    };

    // Presence: mark online (Redis), broadcast to shared-channel rooms only, and
    // seed this socket with a snapshot of who's already online in its channels.
    if (presence) {
      try {
        const { firstSocket } = await markOnline(presence, orgId, userId, socket.id, presenceTtl);
        if (firstSocket) broadcastPresence("online");
        const candidates = await listMemberUserIdsForChannels(orgId, channelIds);
        const online = await onlineUserIds(presence, orgId, candidates);
        socket.emit("presence_snapshot", { userIds: online });
      } catch {
        // presence is best-effort; the socket still works without it
      }
      socket.on("heartbeat", () => {
        void refresh(presence, orgId, userId, presenceTtl).catch(() => undefined);
      });
    }

    socket.on("disconnect", async (reason) => {
      logger.info({ socketId: socket.id, orgId, userId, reason }, "ws disconnect");
      metrics.connections.dec();
      updateRoomsGauge();
      if (presence) {
        try {
          const { lastSocket, lastSeen } = await markOffline(presence, orgId, userId, socket.id);
          if (lastSocket) broadcastPresence("offline", lastSeen);
        } catch {
          // best-effort
        }
      }
    });

    // Signal that rooms are joined (clients/tests wait on this before relying
    // on fan-out delivery).
    socket.emit("ready", { channelIds });

    // Per-socket inbound rate limit (join/leave floods).
    const limit = opts.wsEventLimit ?? 20;
    const windowMs = opts.wsWindowMs ?? 10_000;
    const allowInbound = (): boolean => {
      const now = Date.now();
      const b = (socket.data.rl as SocketBucket | undefined) ?? {
        count: 0,
        resetAt: now + windowMs,
      };
      if (now >= b.resetAt) {
        b.count = 0;
        b.resetAt = now + windowMs;
      }
      b.count += 1;
      socket.data.rl = b;
      return b.count <= limit;
    };

    // Join a channel after connect — authorized via the same org-aware check
    // the route handlers use. assertMembership THROWS on failure; the catch is
    // what blocks a non-member from reaching socket.join (do not change to a
    // boolean check — that would be an authz bypass).
    socket.on("join", async (channelId: string, ack?: (r: { ok: boolean }) => void) => {
      if (!allowInbound()) {
        socket.emit("error", { event: "join", channelId, message: "Rate limited" });
        ack?.({ ok: false });
        return;
      }
      try {
        await assertMembership(orgId, channelId, userId);
        await socket.join(channelRoom(orgId, channelId));
        updateRoomsGauge();
        ack?.({ ok: true });
      } catch {
        socket.emit("error", { event: "join", channelId, message: "Forbidden" });
        ack?.({ ok: false });
      }
    });

    socket.on("leave", (channelId: string) => {
      if (!allowInbound()) {
        socket.emit("error", { event: "leave", channelId, message: "Rate limited" });
        return;
      }
      void socket.leave(channelRoom(orgId, channelId));
    });

    // Typing: relay to the channel room EXCLUDING the sender. Membership is the
    // room membership (the socket must be joined to that channel's room).
    socket.on("typing", (payload: { channelId?: string }) => {
      if (!allowInbound()) return;
      const channelId = payload?.channelId;
      if (typeof channelId !== "string") return;
      if (!socket.rooms.has(channelRoom(orgId, channelId))) return; // not a member
      socket.to(channelRoom(orgId, channelId)).emit("typing", { channelId, userId });
    });

    // Calling signaling handlers (membership-gated relay, no DB writes). Only
    // wired when a ringing Redis is configured (§2.1 needs it).
    if (opts.ringingRedis) {
      registerCallingHandlers(io, socket as never, { ringingRedis: opts.ringingRedis });
    }
  });

  // --- §2.1 ringing sweeper: fire timeouts for expired records exactly once ---
  let stopSweeper: (() => void) | undefined;
  if (opts.ringingRedis) {
    stopSweeper = startSweeper(
      opts.ringingRedis,
      (rec) => {
        // Notify BOTH the initiator (call didn't connect) and the target (dismiss
        // the incoming toast). Rooms built from the record's orgId — never a payload.
        io.to(userRoom(rec.orgId, rec.initiatorId)).emit("call:timed_out", { callId: rec.callId });
        io.to(userRoom(rec.orgId, rec.targetUserId)).emit("call:timed_out", { callId: rec.callId });
        logger.info({ callId: rec.callId }, "call ringing timed out (swept)");
      },
      opts.sweepIntervalMs,
    );
  }

  // --- Redis subscriber: fan-out events → org-scoped rooms ---
  void Promise.resolve(opts.fanoutSubscriber.subscribe(FANOUT_CHANNEL)).then(() => {
    metrics.fanoutSubUp.set(1);
  });
  opts.fanoutSubscriber.on("message", (channel, message) => {
    if (channel !== FANOUT_CHANNEL) return;
    const startedAt = performance.now();
    let evt: FanoutEvent;
    try {
      evt = JSON.parse(message) as FanoutEvent;
    } catch {
      return;
    }
    dispatchFanout(io, evt);
    metrics.recordDispatch(evt.event as FanoutEventType, (performance.now() - startedAt) / 1000);
  });

  function dispatch(evt: FanoutEvent): void {
    dispatchFanout(io, evt);
  }

  async function close(): Promise<void> {
    stopSweeper?.();
    await io.close();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  }

  return { io, httpServer, metrics, dispatch, close };
}

/**
 * Route a fan-out event to the correct org-scoped room. The room is ALWAYS
 * built from `evt.orgId` — a payload can never make an event cross tenants.
 */
export function dispatchFanout(io: IOServer, evt: FanoutEvent): void {
  const { orgId, event, payload } = evt;

  if (event === "channel_created") {
    const p = payload as { channelId: string; memberIds: string[] };
    if (!p?.channelId || !Array.isArray(p.memberIds)) return;
    const rooms = p.memberIds.map((u) => userRoom(orgId, u));
    // Adapter-aware: joins matching sockets across all instances.
    void io.in(rooms).socketsJoin(channelRoom(orgId, p.channelId));
    return;
  }

  // Per-user event: deliver to the recipient's user room (the gateway joins it
  // on connect). Room built from orgId/userId — never from the payload.
  if (event === "notification") {
    if (!evt.userId) return;
    io.to(userRoom(orgId, evt.userId)).emit("notification", payload);
    return;
  }

  // message / message_update / reaction / system / read → the channel room.
  // `system` is delivered as a `message` (it already carries a full MessageDto);
  // `read` carries { channelId, userId, readAt } for live read-receipts.
  const emitEvent = event === "system" ? "message" : event;
  io.to(channelRoom(orgId, evt.channelId)).emit(emitEvent, payload);
}
