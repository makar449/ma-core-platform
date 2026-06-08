import { z } from "zod";
import type { FastifyInstance } from "fastify";
import type { SignalRepository } from "../repositories/signalRepository.js";
import type { StrategyRepository } from "../repositories/strategyRepository.js";
import type { AuthService } from "../auth/authService.js";
import { requireAuthenticatedUser } from "../auth/requireAuth.js";
import { badRequest } from "../infrastructure/httpErrors.js";

const LimitQuerySchema = z.object({ limit: z.coerce.number().int().min(1).max(100).default(25) });

export async function registerSignalRoutes(app: FastifyInstance, deps: { signals: SignalRepository; strategies: StrategyRepository; auth: AuthService }): Promise<void> {
  app.get("/api/signals", async (request) => {
    await deps.auth.authenticateRequest(request);
    const user = requireAuthenticatedUser(request);
    const parsed = LimitQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) {
      throw badRequest(parsed.error.issues.map((issue) => issue.message).join("; "));
    }
    return deps.signals.listRecentForUser(user.id, parsed.data.limit);
  });

  app.get("/api/strategies", async (request) => {
    await deps.auth.authenticateRequest(request);
    requireAuthenticatedUser(request);
    const parsed = LimitQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) {
      throw badRequest(parsed.error.issues.map((issue) => issue.message).join("; "));
    }
    return deps.strategies.listRecentAccepted(parsed.data.limit);
  });
}
