import type { InstitutionalRepository } from "../repositories/institutionalRepository.js";
import type { PrivateStreamRepository } from "../repositories/privateStreamRepository.js";
import type { ReconciliationRepository } from "../repositories/reconciliationRepository.js";
import type { IncidentRepository } from "../repositories/incidentRepository.js";
import { logger } from "../infrastructure/logger.js";

export class SafeModeMonitorWorker {
  private timer: NodeJS.Timeout | null = null;

  public constructor(
    private readonly privateStreams: PrivateStreamRepository,
    private readonly reconciliation: ReconciliationRepository,
    private readonly institutional: InstitutionalRepository,
    private readonly incidents: IncidentRepository,
    private readonly intervalMs: number
  ) {}

  public start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.runOnce().catch((error: unknown) => logger.error({ err: error }, "Safe mode monitor failed"));
    }, this.intervalMs);
  }

  public stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  public async runOnce(): Promise<void> {
    const unhealthyStreams = await this.privateStreams.listUnhealthy(50);
    for (const stream of unhealthyStreams) {
      const active = await this.institutional.getActiveSafeModeEvents(stream.userId);
      const alreadyActive = active.some((event) => event.accountId === stream.accountId && event.triggerType === "PRIVATE_STREAM_LOST");
      if (!alreadyActive) {
        await this.institutional.activateSafeMode({
          userId: stream.userId,
          accountId: stream.accountId,
          triggerType: "PRIVATE_STREAM_LOST",
          severity: stream.status === "FAILED" || stream.status === "DISCONNECTED" ? "critical" : "warning",
          reason: `Private stream ${stream.streamType} is ${stream.status}.`,
          recoveryChecklist: ["Freeze new entries", "Reconnect private stream", "Run exchange reconciliation", "Inspect open protection orders"],
          metadata: { exchange: stream.exchange, status: stream.status, source: "safe_mode_monitor" }
        });
        await this.incidents.create({ incidentType: "SAFE_MODE_PRIVATE_STREAM", severity: stream.status === "FAILED" || stream.status === "DISCONNECTED" ? "critical" : "warning", userId: stream.userId, accountId: stream.accountId, message: `Safe mode activated because ${stream.exchange} private stream is ${stream.status}.`, metadata: { streamType: stream.streamType } });
      }
    }

    const mismatches = await this.reconciliation.listUnresolvedCritical(50);
    for (const mismatch of mismatches) {
      const active = await this.institutional.getActiveSafeModeEvents(mismatch.userId);
      const alreadyActive = active.some((event) => event.accountId === mismatch.accountId && event.triggerType === "RECONCILIATION_FAILED");
      if (!alreadyActive) {
        await this.institutional.activateSafeMode({
          userId: mismatch.userId,
          accountId: mismatch.accountId,
          triggerType: "RECONCILIATION_FAILED",
          severity: "critical",
          reason: mismatch.message,
          recoveryChecklist: ["Freeze new entries", "Open incident center", "Sync positions", "Verify exchange exposure", "Confirm protection orders"],
          metadata: { mismatchType: mismatch.mismatchType, source: "safe_mode_monitor" }
        });
        await this.incidents.create({ incidentType: "SAFE_MODE_RECONCILIATION", severity: "critical", userId: mismatch.userId, accountId: mismatch.accountId, message: mismatch.message, metadata: { mismatchType: mismatch.mismatchType } });
      }
    }
  }
}
