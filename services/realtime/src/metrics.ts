/**
 * §2.6 — Prometheus metrics for the realtime gateway.
 *
 * A dedicated Registry per gateway instance (so tests are isolated and a process
 * hosting more than one gateway doesn't cross-contaminate series). Exposed at
 * `GET /metrics` in Prometheus text format.
 */
import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from "prom-client";
import type { FanoutEventType } from "./fanout-contract";

export interface Metrics {
  registry: Registry;
  /** Open Socket.IO connections on this instance. */
  connections: Gauge<string>;
  /** Rooms currently tracked by this instance's adapter. */
  rooms: Gauge<string>;
  /** Fan-out events dispatched, labelled by event type. */
  fanoutEvents: Counter<"event">;
  /** Dispatch latency (parse → emit) in seconds. */
  dispatchLatency: Histogram<string>;
  /** Redis connection health: 1 = ready, 0 = down. */
  redisUp: Gauge<string>;
  /** Fan-out subscriber health: 1 = subscribed, 0 = down. */
  fanoutSubUp: Gauge<string>;
  /** Record a dispatched event of the given type + its latency in seconds. */
  recordDispatch(event: FanoutEventType, latencySeconds: number): void;
  /** Render the registry as Prometheus text. */
  render(): Promise<{ body: string; contentType: string }>;
}

export function createMetrics(opts: { collectDefault?: boolean } = {}): Metrics {
  const registry = new Registry();
  registry.setDefaultLabels({ service: "realtime-gateway" });
  if (opts.collectDefault ?? true) {
    collectDefaultMetrics({ register: registry });
  }

  // `registers: [registry]` attaches each metric to THIS registry only — not
  // prom-client's global default registry. Without it, a second createMetrics()
  // call (e.g. per test) throws "already registered" on the shared global.
  const connections = new Gauge({
    name: "realtime_connections_open",
    help: "Open Socket.IO connections",
    registers: [registry],
  });
  const rooms = new Gauge({
    name: "realtime_rooms_total",
    help: "Rooms tracked by this instance's adapter",
    registers: [registry],
  });
  const fanoutEvents = new Counter({
    name: "realtime_fanout_events_total",
    help: "Fan-out events dispatched to rooms, by event type",
    labelNames: ["event"] as const,
    registers: [registry],
  });
  const dispatchLatency = new Histogram({
    name: "realtime_dispatch_latency_seconds",
    help: "Latency from fan-out message receipt to room emit",
    buckets: [0.0005, 0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1],
    registers: [registry],
  });
  const redisUp = new Gauge({
    name: "realtime_redis_up",
    help: "Redis adapter connection health (1=up,0=down)",
    registers: [registry],
  });
  const fanoutSubUp = new Gauge({
    name: "realtime_fanout_subscriber_up",
    help: "Fan-out subscriber health (1=subscribed,0=down)",
    registers: [registry],
  });

  return {
    registry,
    connections,
    rooms,
    fanoutEvents,
    dispatchLatency,
    redisUp,
    fanoutSubUp,
    recordDispatch(event, latencySeconds) {
      fanoutEvents.inc({ event });
      dispatchLatency.observe(latencySeconds);
    },
    async render() {
      return { body: await registry.metrics(), contentType: registry.contentType };
    },
  };
}
