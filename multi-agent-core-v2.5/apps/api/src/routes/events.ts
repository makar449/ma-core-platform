import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { EventChannelSchema, AgentEnvelopeSchema, type AgentEnvelope } from "@ma-core/shared";
import type { EventLogRepository } from "../repositories/eventLogRepository.js";
import type { LiveEventHub } from "../infrastructure/liveEventHub.js";
import type { AuthService } from "../auth/authService.js";
import { requireAuthenticatedUser } from "../auth/requireAuth.js";
import { badRequest } from "../infrastructure/httpErrors.js";

const RecentEventsQuerySchema = z.object({
  channel: EventChannelSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50)
});

export async function registerEventRoutes(app: FastifyInstance, deps: { events: EventLogRepository; hub: LiveEventHub; auth: AuthService }): Promise<void> {
  app.get("/api/events/recent", async (request) => {
    await deps.auth.authenticateRequest(request);
    const user = requireAuthenticatedUser(request);
    const parsed = RecentEventsQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) {
      throw badRequest(parsed.error.issues.map((issue) => issue.message).join("; "));
    }
    return deps.events.listRecent(parsed.data.limit, parsed.data.channel, user.id);
  });

  app.get("/api/live/events", async (request, reply) => {
    await deps.auth.authenticateRequest(request);
    const user = requireAuthenticatedUser(request);
    let closed = false;
    reply.raw.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no"
    });

    const writeSse = (eventName: string, payload: object): void => {
      if (closed || reply.raw.destroyed || reply.raw.writableEnded) {
        return;
      }
      reply.raw.write(`event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`);
    };

    writeSse("heartbeat", { ts: new Date().toISOString(), status: "connected" });

    const unsubscribe = deps.hub.subscribe((envelope) => {
      const parsed = AgentEnvelopeSchema.safeParse(envelope);
      if (!parsed.success) {
        return;
      }
      if (!eventIsVisibleToUser(parsed.data, user.id)) {
        return;
      }
      writeSse(parsed.data.channel, parsed.data);
    });

    const heartbeat = setInterval(() => {
      writeSse("heartbeat", { ts: new Date().toISOString(), status: "connected" });
    }, 25_000);

    request.raw.on("close", () => {
      closed = true;
      unsubscribe();
      clearInterval(heartbeat);
      if (!reply.raw.destroyed && !reply.raw.writableEnded) {
        reply.raw.end();
      }
    });
  });
}

function eventIsVisibleToUser(envelope: AgentEnvelope, userId: string): boolean {
  if (envelope.user_id && envelope.user_id !== userId) {
    return false;
  }
  if (envelope.channel === "security.audit" && envelope.payload.userId !== userId) {
    return false;
  }
  if (envelope.channel === "agent.strategy.signal" && envelope.payload.userId && envelope.payload.userId !== userId) {
    return false;
  }
  if (envelope.channel === "agent.execution.status" && envelope.payload.userId !== userId) {
    return false;
  }
  if (envelope.channel === "agent.execution.order" && envelope.payload.userId !== userId) {
    return false;
  }
  if (envelope.channel === "agent.risk.state" && envelope.payload.userId !== userId) {
    return false;
  }
  if (envelope.channel === "agent.risk.halt" && envelope.payload.userId !== userId) {
    return false;
  }
  if (envelope.channel === "agent.position.timeout" && envelope.payload.position.userId !== userId) {
    return false;
  }
  return true;
}
