import type { FastifyInstance } from "fastify";
import type { MarketDataSource } from "../data/marketDataSource.js";
import type { AuthService } from "../auth/authService.js";
import { requireAuthenticatedUser } from "../auth/requireAuth.js";

export async function registerMarketRoutes(app: FastifyInstance, deps: { source: MarketDataSource; auth: AuthService }): Promise<void> {
  app.get("/api/market/adapters/status", async (request) => {
    await deps.auth.authenticateRequest(request);
    requireAuthenticatedUser(request);
    return deps.source.getStatuses();
  });
}
