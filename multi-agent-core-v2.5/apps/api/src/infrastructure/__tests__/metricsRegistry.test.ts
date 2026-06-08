import { describe, expect, it } from "vitest";
import { MetricsRegistry } from "../metricsRegistry.js";

describe("MetricsRegistry", () => {
  it("keeps counters and gauges in a Prometheus-compatible text format", () => {
    const metrics = new MetricsRegistry();
    metrics.increment("ma_core_events_total", { channel: "agent.live.log" });
    metrics.increment("ma_core_events_total", { channel: "agent.live.log" }, 2);
    metrics.setGauge("ma_core_stream_pending", 4, { channel: "agent.market.vector" });
    const listed = metrics.list(3600);
    expect(listed).toHaveLength(2);
    expect(metrics.toPrometheusText(3600)).toContain("ma_core_events_total");
    expect(metrics.toPrometheusText(3600)).toContain("channel=\"agent.live.log\"}");
  });
});
