import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { EventChannelSchema } from "@ma-core/shared";
import type { RedisMessageBus } from "../infrastructure/redisBus.js";
import type { AuthService } from "../auth/authService.js";
import type { MetricsRegistry } from "../infrastructure/metricsRegistry.js";
import type { OutboxRepository } from "../repositories/outboxRepository.js";
import type { ReconciliationRepository } from "../repositories/reconciliationRepository.js";
import type { PrivateStreamRepository } from "../repositories/privateStreamRepository.js";
import type { LiveReadinessRepository } from "../repositories/liveReadinessRepository.js";
import { requireAuthenticatedUser } from "../auth/requireAuth.js";
import { badRequest, unauthorized } from "../infrastructure/httpErrors.js";
import type { AppConfig } from "../config.js";

const DeadLetterQuerySchema = z.object({ channel: EventChannelSchema.default("agent.market.vector"), limit: z.coerce.number().int().min(1).max(200).default(50) });

export interface OpsRoutesDeps {
  readonly bus: RedisMessageBus;
  readonly auth: AuthService;
  readonly metrics: MetricsRegistry;
  readonly config: AppConfig;
  readonly outbox: OutboxRepository;
  readonly reconciliation: ReconciliationRepository;
  readonly privateStreams: PrivateStreamRepository;
  readonly liveReadiness: LiveReadinessRepository;
}

export async function registerOpsRoutes(app: FastifyInstance, deps: OpsRoutesDeps): Promise<void> {
  app.get("/api/ops/streams/metrics", async (request) => {
    await deps.auth.authenticateRequest(request);
    const user = requireAuthenticatedUser(request);
    if (!user.roles.includes("admin")) throw unauthorized("Недостаточно прав для просмотра stream metrics.");
    return deps.bus.streamMetrics(["agent.market.vector", "agent.strategy.signal", "agent.execution.status", "agent.risk.halt", "agent.position.timeout", "security.audit"], "strategy-agent-v1");
  });

  app.get("/api/ops/streams/dead-letter", async (request) => {
    await deps.auth.authenticateRequest(request);
    const user = requireAuthenticatedUser(request);
    if (!user.roles.includes("admin")) throw unauthorized("Недостаточно прав для просмотра dead-letter stream.");
    const parsed = DeadLetterQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) throw badRequest(parsed.error.issues.map((issue) => issue.message).join("; "));
    return deps.bus.listDeadLetters(parsed.data.channel, parsed.data.limit);
  });

  app.get("/api/ops/metrics", async (request) => {
    await deps.auth.authenticateRequest(request);
    const user = requireAuthenticatedUser(request);
    if (!user.roles.includes("admin")) throw unauthorized("Недостаточно прав для просмотра runtime metrics.");
    return deps.metrics.list(deps.config.OPS_METRICS_RETENTION_SECONDS);
  });



  app.get("/api/ops/outbox", async (request) => {
    await deps.auth.authenticateRequest(request);
    const user = requireAuthenticatedUser(request);
    if (!user.roles.includes("admin")) throw unauthorized("Недостаточно прав для просмотра outbox.");
    const parsed = z.object({ limit: z.coerce.number().int().min(1).max(200).default(50) }).safeParse(request.query ?? {});
    if (!parsed.success) throw badRequest(parsed.error.issues.map((issue) => issue.message).join("; "));
    return deps.outbox.list(parsed.data.limit);
  });

  app.get("/api/ops/metrics/prometheus", async (request, reply) => {
    await deps.auth.authenticateRequest(request);
    const user = requireAuthenticatedUser(request);
    if (!user.roles.includes("admin")) throw unauthorized("Недостаточно прав для просмотра runtime metrics.");
    return reply.type("text/plain; version=0.0.4").send(deps.metrics.toPrometheusText(deps.config.OPS_METRICS_RETENTION_SECONDS));
  });
}
