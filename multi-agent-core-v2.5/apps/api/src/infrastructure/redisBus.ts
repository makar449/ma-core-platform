import { createClient, type RedisClientType } from "redis";
import { AgentEnvelopeSchema, type AgentEnvelope, type EventChannel } from "@ma-core/shared";
import type { AppConfig } from "../config.js";
import { logger } from "./logger.js";
import type { MessageProcessingRepository } from "../repositories/messageProcessingRepository.js";

export type EnvelopeHandler = (envelope: AgentEnvelope) => Promise<void>;

const durableChannels = new Set<EventChannel>(["agent.market.vector", "agent.strategy.signal", "agent.risk.halt", "agent.position.timeout", "agent.execution.order", "agent.execution.status", "security.audit"]);
const maxDeliveryAttempts = 3;
const reclaimIdleMs = 30_000;

export interface StreamConsumerHandle {
  stop(): void;
}

export interface StreamLagMetric {
  channel: EventChannel;
  streamLength: number;
  pending: number;
  deadLetters: number;
}

interface StreamMessage {
  id: string;
  message: Record<string, string>;
}

export class RedisMessageBus {
  private readonly publisher: RedisClientType;
  private readonly subscriber: RedisClientType;
  private readonly streamClient: RedisClientType;
  private isConnected = false;

  public constructor(config: AppConfig, private readonly processing?: MessageProcessingRepository) {
    this.publisher = createClient({ url: config.REDIS_URL });
    this.subscriber = createClient({ url: config.REDIS_URL });
    this.streamClient = createClient({ url: config.REDIS_URL });
  }

  public async connect(): Promise<void> {
    if (this.isConnected) {
      return;
    }
    await Promise.all([this.publisher.connect(), this.subscriber.connect(), this.streamClient.connect()]);
    this.isConnected = true;
  }

  public async publish(envelope: AgentEnvelope): Promise<void> {
    const parsed = AgentEnvelopeSchema.parse(envelope);
    if (durableChannels.has(parsed.channel)) {
      await this.publishDurable(parsed, 0);
    }
    await this.publisher.publish(parsed.channel, JSON.stringify(parsed));
  }

  public async subscribe(channel: EventChannel, handler: EnvelopeHandler): Promise<void> {
    await this.subscriber.subscribe(channel, async (rawMessage) => {
      let decoded: unknown;
      try {
        decoded = JSON.parse(rawMessage) as unknown;
      } catch (error) {
        logger.warn({ err: error, channel }, "Redis Pub/Sub message was not valid JSON");
        return;
      }
      const parsed = AgentEnvelopeSchema.safeParse(decoded);
      if (!parsed.success) {
        logger.warn({ channel, issues: parsed.error.issues }, "Redis Pub/Sub envelope failed schema validation");
        return;
      }
      try {
        await handler(parsed.data);
      } catch (error) {
        logger.error({ err: error, channel }, "Redis Pub/Sub handler failed");
      }
    });
  }

  public async consumeDurable(channel: EventChannel, group: string, consumer: string, handler: EnvelopeHandler): Promise<StreamConsumerHandle> {
    const stream = this.streamKey(channel);
    await this.ensureGroup(stream, group);
    let active = true;
    const run = async (): Promise<void> => {
      while (active) {
        try {
          const reclaimed = await this.reclaimPending(stream, group, consumer);
          await this.processMessages(channel, stream, group, reclaimed, handler);
          const fresh = await this.readFresh(stream, group, consumer);
          await this.processMessages(channel, stream, group, fresh, handler);
        } catch (error) {
          if (active) {
            logger.error({ err: error, channel, group }, "Redis Streams consumer loop failed");
            await sleep(1500);
          }
        }
      }
    };
    void run();
    return { stop(): void { active = false; } };
  }

  public async streamMetrics(channels: readonly EventChannel[], group: string): Promise<StreamLagMetric[]> {
    const metrics: StreamLagMetric[] = [];
    for (const channel of channels) {
      const stream = this.streamKey(channel);
      const dead = this.deadLetterKey(channel);
      const [streamLengthRaw, deadLengthRaw, pendingRaw] = await Promise.all([
        this.publisher.xLen(stream).catch(() => 0),
        this.publisher.xLen(dead).catch(() => 0),
        this.publisher.sendCommand(["XPENDING", stream, group]).catch(() => null)
      ]);
      metrics.push({
        channel,
        streamLength: Number(streamLengthRaw),
        deadLetters: Number(deadLengthRaw),
        pending: readPendingCount(pendingRaw)
      });
    }
    return metrics;
  }

  public async listDeadLetters(channel: EventChannel, limit: number): Promise<ReadonlyArray<Record<string, string>>> {
    const rows = await this.publisher.xRevRange(this.deadLetterKey(channel), "+", "-", { COUNT: Math.min(Math.max(limit, 1), 200) });
    return rows.map((row) => normalizeRedisMessage(row.id, row.message).message);
  }

  public async close(): Promise<void> {
    await Promise.all([this.publisher.quit(), this.subscriber.quit(), this.streamClient.quit()]);
    this.isConnected = false;
  }

  private async ensureGroup(stream: string, group: string): Promise<void> {
    try {
      await this.streamClient.xGroupCreate(stream, group, "0", { MKSTREAM: true });
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes("BUSYGROUP")) {
        throw error;
      }
    }
  }

  private async readFresh(stream: string, group: string, consumer: string): Promise<StreamMessage[]> {
    const response = await this.streamClient.xReadGroup(group, consumer, [{ key: stream, id: ">" }], { BLOCK: 5000, COUNT: 10 });
    return this.normalizeStreamResponse(response);
  }

  private async reclaimPending(stream: string, group: string, consumer: string): Promise<StreamMessage[]> {
    const response = await this.streamClient.sendCommand(["XAUTOCLAIM", stream, group, consumer, String(reclaimIdleMs), "0-0", "COUNT", "10"]);
    return this.normalizeAutoClaimResponse(response);
  }

  private async processMessages(channel: EventChannel, stream: string, group: string, messages: readonly StreamMessage[], handler: EnvelopeHandler): Promise<void> {
    for (const entry of messages) {
      const rawEnvelope = entry.message.envelope;
      const attempts = Number(entry.message.attempt_count ?? "0");
      if (!rawEnvelope) {
        await this.streamClient.xAck(stream, group, entry.id);
        continue;
      }
      const parsed = safeParseEnvelope(rawEnvelope);
      if (!parsed) {
        await this.moveToDeadLetter(channel, entry.id, rawEnvelope, "schema_validation_failed", attempts);
        await this.streamClient.xAck(stream, group, entry.id);
        continue;
      }
      const shouldHandle = await this.processing?.begin({ idempotencyKey: parsed.idempotency_key, streamName: stream, redisMessageId: entry.id, handlerName: group }) ?? true;
      if (!shouldHandle) {
        await this.streamClient.xAck(stream, group, entry.id);
        continue;
      }
      try {
        await handler(parsed);
        await this.processing?.markProcessed(parsed.idempotency_key);
        await this.streamClient.xAck(stream, group, entry.id);
      } catch (error) {
        const reason = error instanceof Error ? error.message : "handler_failed";
        const nextAttempt = attempts + 1;
        if (nextAttempt >= maxDeliveryAttempts) {
          await this.processing?.markFailed(parsed.idempotency_key, reason, true);
          await this.moveToDeadLetter(channel, entry.id, rawEnvelope, reason, nextAttempt);
        } else {
          await this.processing?.markFailed(parsed.idempotency_key, reason, false);
          await this.publishDurable(parsed, nextAttempt);
        }
        await this.streamClient.xAck(stream, group, entry.id);
      }
    }
  }

  private async publishDurable(envelope: AgentEnvelope, attemptCount: number): Promise<void> {
    if (attemptCount === 0) {
      const dedupeKey = `ma-core:idempotency:${envelope.idempotency_key}`;
      const reserved = await this.publisher.set(dedupeKey, "1", { NX: true, EX: 86_400 });
      if (reserved !== "OK") {
        return;
      }
    }
    await this.publisher.xAdd(this.streamKey(envelope.channel), "*", {
      idempotency_key: envelope.idempotency_key,
      transaction_id: envelope.transaction_id,
      attempt_count: String(attemptCount),
      envelope: JSON.stringify(envelope)
    });
  }

  private async moveToDeadLetter(channel: EventChannel, sourceMessageId: string, envelope: string, reason: string, attemptCount: number): Promise<void> {
    await this.publisher.xAdd(this.deadLetterKey(channel), "*", { source_message_id: sourceMessageId, reason, attempt_count: String(attemptCount), envelope });
  }

  private streamKey(channel: EventChannel): string {
    return `ma-core:stream:${channel}`;
  }

  private deadLetterKey(channel: EventChannel): string {
    return `ma-core:dead-letter:${channel}`;
  }

  private normalizeStreamResponse(response: unknown): StreamMessage[] {
    if (!Array.isArray(response)) {
      return [];
    }
    const messages: StreamMessage[] = [];
    for (const stream of response) {
      if (!isStreamBatch(stream)) {
        continue;
      }
      for (const message of stream.messages) {
        messages.push(normalizeRedisMessage(message.id, message.message));
      }
    }
    return messages;
  }

  private normalizeAutoClaimResponse(response: unknown): StreamMessage[] {
    if (!Array.isArray(response) || response.length < 2) {
      return [];
    }
    const rawMessages = response[1];
    if (!Array.isArray(rawMessages)) {
      return [];
    }
    return rawMessages.flatMap((entry) => {
      if (!Array.isArray(entry) || typeof entry[0] !== "string") {
        return [];
      }
      return [normalizeRedisArrayMessage(entry[0], entry[1])];
    });
  }
}

function safeParseEnvelope(rawEnvelope: string): AgentEnvelope | null {
  try {
    const parsed = AgentEnvelopeSchema.safeParse(JSON.parse(rawEnvelope) as unknown);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function isStreamBatch(value: unknown): value is { messages: readonly { id: string; message: Record<string, unknown> }[] } {
  if (typeof value !== "object" || value === null || !("messages" in value)) {
    return false;
  }
  const messages = (value as { messages?: unknown }).messages;
  return Array.isArray(messages) && messages.every((message) => typeof message === "object" && message !== null && "id" in message && "message" in message);
}

function normalizeRedisMessage(id: string, message: Record<string, unknown>): StreamMessage {
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(message)) {
    if (typeof value === "string") {
      normalized[key] = value;
    }
  }
  return { id, message: normalized };
}

function normalizeRedisArrayMessage(id: string, raw: unknown): StreamMessage {
  const normalized: Record<string, string> = {};
  if (Array.isArray(raw)) {
    for (let index = 0; index < raw.length; index += 2) {
      const key = raw[index];
      const value = raw[index + 1];
      if (typeof key === "string" && typeof value === "string") {
        normalized[key] = value;
      }
    }
  }
  return { id, message: normalized };
}

function readPendingCount(value: unknown): number {
  if (Array.isArray(value) && typeof value[0] === "number") {
    return value[0];
  }
  return 0;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
