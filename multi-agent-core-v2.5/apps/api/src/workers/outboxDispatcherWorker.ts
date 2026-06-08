import type { RedisMessageBus } from "../infrastructure/redisBus.js";
import type { OutboxRepository } from "../repositories/outboxRepository.js";
import { logger } from "../infrastructure/logger.js";

export class OutboxDispatcherWorker {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  public constructor(private readonly outbox: OutboxRepository, private readonly bus: RedisMessageBus, private readonly intervalMs: number) {}

  public start(): void {
    void this.tick();
    this.timer = setInterval(() => void this.tick(), this.intervalMs);
  }

  public stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const batch = await this.outbox.claimBatch(100);
      for (const record of batch) {
        try {
          await this.bus.publish(record.payload);
          await this.outbox.markPublished(record.id);
        } catch (error) {
          await this.outbox.markFailed(record.id, error instanceof Error ? error.message : "Unknown outbox publish error");
        }
      }
    } catch (error) {
      logger.error({ err: error }, "Outbox dispatcher tick failed");
    } finally {
      this.running = false;
    }
  }
}
