import { describe, expect, it } from "vitest";
import { createMetrics } from "./metrics";

// collectDefault:false keeps the registry deterministic (no process metrics).
function fresh() {
  return createMetrics({ collectDefault: false });
}

describe("metrics (§2.6)", () => {
  it("renders Prometheus text with the service label", async () => {
    const m = fresh();
    const { body, contentType } = await m.render();
    expect(contentType).toMatch(/text\/plain/);
    expect(body).toContain("realtime_connections_open");
    expect(body).toContain('service="realtime-gateway"');
  });

  it("counts fan-out events by type and records dispatch latency", async () => {
    const m = fresh();
    m.recordDispatch("message", 0.002);
    m.recordDispatch("message", 0.004);
    m.recordDispatch("reaction", 0.001);
    const body = await m.render().then((r) => r.body);
    // Label order (default `service` + metric `event`) is not guaranteed, so match loosely.
    expect(body).toMatch(/realtime_fanout_events_total\{[^}]*event="message"[^}]*\} 2/);
    expect(body).toMatch(/realtime_fanout_events_total\{[^}]*event="reaction"[^}]*\} 1/);
    expect(body).toContain("realtime_dispatch_latency_seconds_count");
  });

  it("exposes connection / redis / fanout-subscriber gauges", async () => {
    const m = fresh();
    m.connections.inc();
    m.connections.inc();
    m.connections.dec();
    m.redisUp.set(1);
    m.fanoutSubUp.set(0);
    const body = await m.render().then((r) => r.body);
    expect(body).toMatch(/realtime_connections_open\{[^}]*\} 1/);
    expect(body).toMatch(/realtime_redis_up\{[^}]*\} 1/);
    expect(body).toMatch(/realtime_fanout_subscriber_up\{[^}]*\} 0/);
  });
});
