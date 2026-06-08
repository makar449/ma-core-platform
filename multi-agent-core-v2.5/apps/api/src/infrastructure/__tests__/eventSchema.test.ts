import { describe, expect, it } from "vitest";
import { LiveLogEnvelopeSchema } from "@ma-core/shared";
import { buildEnvelopeBase } from "../envelopeFactory.js";

describe("event protocol", () => {
  it("uses snake_case v1.3 envelope fields", () => {
    const envelope = LiveLogEnvelopeSchema.parse({
      ...buildEnvelopeBase({ senderAgent: "System_Orchestrator", channel: "agent.live.log", pipelineStage: "live_log", agentLog: "ok" }),
      payload: { severity: "info", message: "ok" }
    });
    expect(envelope.schema_version).toBe("1.3");
    expect(envelope.transaction_id.startsWith("tx_")).toBe(true);
    expect(envelope.sender_agent).toBe("System_Orchestrator");
    expect(envelope.agent_log).toBe("ok");
  });
});
