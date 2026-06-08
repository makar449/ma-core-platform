import { describe, expect, it } from "vitest";
import { AgentEnvelopeSchema, HttpUrlSchema, StrategyFeedEnvelopeSchema } from "@ma-core/shared";

describe("event and source security contracts", () => {
  it("rejects non-http strategy source URLs", () => {
    expect(HttpUrlSchema.safeParse("https://example.com/source").success).toBe(true);
    expect(HttpUrlSchema.safeParse("http://example.com/source").success).toBe(true);
    expect(HttpUrlSchema.safeParse("javascript:alert(1)").success).toBe(false);
  });

  it("keeps strategy feed events on the snake_case protocol", () => {
    const envelope = StrategyFeedEnvelopeSchema.parse({
      schema_version: "1.3",
      transaction_id: "tx_strategy_feed_visibility",
      trace_id: "trace_strategy_feed_visibility",
      timestamp: new Date("2026-06-08T02:40:00.000Z").toISOString(),
      sender_agent: "Agent_2_Strategist",
      channel: "agent.strategy.feed",
      pipeline_stage: "strategy_ingestion",
      idempotency_key: "idem_strategy_feed_visibility",
      agent_log: "Accepted source passed anti-manipulation validation.",
      payload: {
        sourceType: "X",
        sourceTitle: "Validated liquidity sweep setup",
        sourceUrl: "https://example.com/validated-source",
        trigger: "5m close back below sweep high",
        action: "SHORT",
        confidenceScore: 0.74,
        sourceTrustScore: 0.81,
        freshnessScore: 0.93,
        evidenceScore: 0.78,
        reviewStatus: "ACCEPTED",
        reviewReason: "Trigger, invalidation and timeframe are explicit."
      }
    });
    expect(AgentEnvelopeSchema.parse(envelope).channel).toBe("agent.strategy.feed");
    expect(envelope.payload.sourceUrl).toBe("https://example.com/validated-source");
  });
});
