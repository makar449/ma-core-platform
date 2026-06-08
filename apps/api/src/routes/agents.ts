import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { ExchangeSchema } from "@ma-core/shared";
import { badRequest } from "../infrastructure/httpErrors.js";
import type { MarketAnalystAgent } from "../agents/marketAnalystAgent.js";
import type { StrategyAgent } from "../agents/strategyAgent.js";
import type { AuthService } from "../auth/authService.js";
import { requireAuthenticatedUser } from "../auth/requireAuth.js";

const RunMarketSchema = z.object({
  exchange: ExchangeSchema.default("BINANCE"),
  pair: z.string().min(3).max(32).regex(/^[A-Z0-9]{2,15}\/[A-Z0-9]{2,15}$/u, "Pair must use BASE/QUOTE format").default("BTC/USDT")
});

export async function registerAgentRoutes(app: FastifyInstance, deps: { marketAnalyst: MarketAnalystAgent; strategyAgent: StrategyAgent; auth: AuthService }): Promise<void> {
  app.post("/api/agents/market-analysis/run", async (request) => {
    await deps.auth.authenticateRequest(request);
    await deps.auth.requireCsrf(request);
    requireAuthenticatedUser(request);
    const parsed = RunMarketSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      throw badRequest(parsed.error.issues.map((issue) => issue.message).join("; "));
    }
    const transactionId = await deps.marketAnalyst.run(parsed.data.exchange, parsed.data.pair, requireAuthenticatedUser(request).id);
    return { ok: true, transaction_id: transactionId };
  });

  app.post("/api/agents/strategy/ingest", async (request) => {
    await deps.auth.authenticateRequest(request);
    await deps.auth.requireCsrf(request);
    requireAuthenticatedUser(request);
    const stored = await deps.strategyAgent.ingestStrategies();
    return { ok: true, stored };
  });
}
