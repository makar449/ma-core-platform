import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import helmet from "@fastify/helmet";
import { loadConfig } from "./config.js";
import { logger } from "./infrastructure/logger.js";
import { Database } from "./infrastructure/db.js";
import { RedisMessageBus } from "./infrastructure/redisBus.js";
import { LiveEventHub } from "./infrastructure/liveEventHub.js";
import { EventLogRepository } from "./repositories/eventLogRepository.js";
import { ApiKeyRepository } from "./repositories/apiKeyRepository.js";
import { StrategyRepository } from "./repositories/strategyRepository.js";
import { SignalRepository } from "./repositories/signalRepository.js";
import { AdapterStatusRepository } from "./repositories/adapterStatusRepository.js";
import { ApiWalletVault } from "./security/vault.js";
import { resolveVaultMasterKey } from "./security/vaultKeyProvider.js";
import { AuthService } from "./auth/authService.js";
import { AuthRepository } from "./auth/authRepository.js";
import { OsintRepository } from "./repositories/osintRepository.js";
import { MessageProcessingRepository } from "./repositories/messageProcessingRepository.js";
import { LlmFailureRepository } from "./repositories/llmFailureRepository.js";
import { ExchangeRegistry } from "./exchanges/exchangeRegistry.js";
import { CompositeMarketDataSource } from "./data/marketDataSource.js";
import { LlmJsonClient } from "./llm/llmJsonClient.js";
import { StrategyVectorStore } from "./strategies/vectorStore.js";
import { XRecentSearchClient } from "./osint/xClient.js";
import { YouTubeSearchClient } from "./osint/youtubeClient.js";
import { RedditPublicClient } from "./osint/redditClient.js";
import { MarketAnalystAgent } from "./agents/marketAnalystAgent.js";
import { StrategyAgent } from "./agents/strategyAgent.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerExchangeRoutes } from "./routes/exchanges.js";
import { registerAgentRoutes } from "./routes/agents.js";
import { registerEventRoutes } from "./routes/events.js";
import { registerSignalRoutes } from "./routes/signals.js";
import { registerMarketRoutes } from "./routes/market.js";
import { registerOpsRoutes } from "./routes/ops.js";
import { TradingAccountRepository } from "./repositories/tradingAccountRepository.js";
import { PositionRepository } from "./repositories/positionRepository.js";
import { ExecutionRepository } from "./repositories/executionRepository.js";
import { DailyRiskRepository } from "./repositories/dailyRiskRepository.js";
import { TradingLockRepository } from "./repositories/tradingLockRepository.js";
import { SymbolRulesRepository } from "./repositories/symbolRulesRepository.js";
import { RiskPolicyRepository } from "./repositories/riskPolicyRepository.js";
import { RiskEventRepository } from "./repositories/riskEventRepository.js";
import { IncidentRepository } from "./repositories/incidentRepository.js";
import { OrderRepository } from "./repositories/orderRepository.js";
import { ExchangeAuditRepository } from "./repositories/exchangeAuditRepository.js";
import { PnlRepository } from "./repositories/pnlRepository.js";
import { ExecutionExchangeRegistry } from "./execution/executionExchangeRegistry.js";
import { OrderExecutorAgent } from "./agents/orderExecutorAgent.js";
import { DailyDrawdownGuardAgent } from "./agents/dailyDrawdownGuardAgent.js";
import { DailyProfitCapGuardAgent } from "./agents/dailyProfitCapGuardAgent.js";
import { TimeHorizonGuardAgent } from "./agents/timeHorizonGuardAgent.js";
import { registerRiskRoutes } from "./routes/risk.js";
import { HttpError } from "./infrastructure/httpErrors.js";
import { MetricsRegistry } from "./infrastructure/metricsRegistry.js";
import { bootstrapWorkers, type WorkerHandles } from "./workers/bootstrap.js";
import { PrivateStreamRepository } from "./repositories/privateStreamRepository.js";
import { OutboxRepository } from "./repositories/outboxRepository.js";
import { ReconciliationRepository } from "./repositories/reconciliationRepository.js";
import { LiveReadinessRepository } from "./repositories/liveReadinessRepository.js";
import { ProtectionSupervisorRepository } from "./repositories/protectionSupervisorRepository.js";
import { ImmutableAuditRepository } from "./repositories/immutableAuditRepository.js";
import { PrivateStreamSupervisor } from "./execution/privateStreamSupervisor.js";
import { ExchangeReconciliationWorker } from "./workers/exchangeReconciliationWorker.js";
import { OutboxDispatcherWorker } from "./workers/outboxDispatcherWorker.js";
import { ProtectionOrderSupervisor } from "./workers/protectionOrderSupervisor.js";
import { SafeModeMonitorWorker } from "./workers/safeModeMonitorWorker.js";
import { InstitutionalRepository } from "./repositories/institutionalRepository.js";
import { registerInstitutionalRoutes } from "./routes/institutional.js";
import { SensitiveRouteLimiter, defaultSensitivePolicies } from "./security/sensitiveRouteLimiter.js";


export interface AppRuntime {
  app: ReturnType<typeof Fastify>;
  config: ReturnType<typeof loadConfig>;
  shutdown(): Promise<void>;
}

export async function buildApp(): Promise<AppRuntime> {
  const config = loadConfig();
  const app = Fastify({ logger: config.NODE_ENV === "production" ? { level: "info" } : { level: "debug" } });
  const sensitiveLimiter = new SensitiveRouteLimiter(defaultSensitivePolicies());
  await app.register(helmet, { global: true });
  await app.register(cors, {
    origin: config.NODE_ENV === "production" ? config.WEB_ORIGIN ?? false : config.WEB_ORIGIN ?? true,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["content-type", "authorization", "x-csrf-token"]
  });
  await app.register(rateLimit, { max: config.NODE_ENV === "production" ? 120 : 300, timeWindow: "1 minute" });

  const metrics = new MetricsRegistry();
  const db = new Database(config);
  const processing = new MessageProcessingRepository(db);
  const bus = new RedisMessageBus(config, processing);
  await bus.connect();
  const hub = new LiveEventHub();
  const events = new EventLogRepository(db);
  const apiKeys = new ApiKeyRepository(db);
  const strategies = new StrategyRepository(db);
  const signals = new SignalRepository(db);
  const osint = new OsintRepository(db);
  const adapterStatuses = new AdapterStatusRepository(db);
  const llmFailures = new LlmFailureRepository(db);
  const tradingAccounts = new TradingAccountRepository(db);
  const positions = new PositionRepository(db);
  const executions = new ExecutionRepository(db);
  const dailyRisk = new DailyRiskRepository(db);
  const tradingLocks = new TradingLockRepository(db);
  const symbolRules = new SymbolRulesRepository(db);
  const riskPolicies = new RiskPolicyRepository(db);
  const riskEvents = new RiskEventRepository(db);
  const incidents = new IncidentRepository(db);
  const orders = new OrderRepository(db);
  const exchangeAudit = new ExchangeAuditRepository(db);
  const pnl = new PnlRepository(db);
  const privateStreams = new PrivateStreamRepository(db);
  const outbox = new OutboxRepository(db);
  const reconciliation = new ReconciliationRepository(db);
  const liveReadiness = new LiveReadinessRepository(db);
  const protectionSupervisorRepository = new ProtectionSupervisorRepository(db);
  const immutableAudit = new ImmutableAuditRepository(db);
  const institutional = new InstitutionalRepository(db);
  const resolvedVaultKey = await resolveVaultMasterKey(config);
  const vault = new ApiWalletVault(resolvedVaultKey.key, resolvedVaultKey.version);
  const authRepository = new AuthRepository(db);
  const auth = new AuthService(config.JWT_AUTH_SECRET_BASE64, authRepository, config);
  const registry = new ExchangeRegistry(config);
  const executionRegistry = new ExecutionExchangeRegistry(config, exchangeAudit, privateStreams);
  const llm = new LlmJsonClient(config, llmFailures);
  const vectorStore = new StrategyVectorStore(strategies);
  const marketDataSource = new CompositeMarketDataSource(config);
  const marketAnalyst = new MarketAnalystAgent(marketDataSource, llm, bus, events);
  const strategyAgent = new StrategyAgent(
    [
      new XRecentSearchClient(config.X_BEARER_TOKEN, config.X_CRYPTO_AUTHOR_IDS),
      new YouTubeSearchClient(config.YOUTUBE_API_KEY, config.YOUTUBE_OAUTH_ACCESS_TOKEN, config.YOUTUBE_CRYPTO_CHANNEL_IDS),
      new RedditPublicClient(config.REDDIT_USER_AGENT)
    ],
    llm,
    vectorStore,
    signals,
    osint,
    bus,
    events
  );
  const orderExecutor = new OrderExecutorAgent(tradingAccounts, apiKeys, vault, executionRegistry, tradingLocks, positions, executions, symbolRules, riskPolicies, orders, incidents, bus, events, outbox, {
    riskPerTradeFraction: config.EXECUTION_RISK_PER_TRADE_FRACTION,
    minNotionalUsdt: config.EXECUTION_MIN_NOTIONAL_USDT,
    quantityStep: config.EXECUTION_QUANTITY_STEP,
    minConfidence: config.EXECUTION_MIN_CONFIDENCE,
    maxOrderbookAgeMs: config.EXECUTION_MAX_ORDERBOOK_AGE_MS,
    maxSpreadBps: config.EXECUTION_MAX_SPREAD_BPS,
    maxDailyTrades: config.EXECUTION_MAX_DAILY_TRADES,
    maxOpenPositions: config.EXECUTION_MAX_OPEN_POSITIONS,
    requireSymbolRulesForLive: config.EXECUTION_REQUIRE_SYMBOL_RULES_FOR_LIVE,
    requirePrivateStreamForLive: config.EXECUTION_REQUIRE_PRIVATE_STREAM_FOR_LIVE
  });
  const drawdownGuard = new DailyDrawdownGuardAgent(tradingAccounts, apiKeys, vault, executionRegistry, dailyRisk, tradingLocks, positions, riskEvents, incidents, bus, events, config.DAILY_MAX_DRAWDOWN_RATIO);
  const profitGuard = new DailyProfitCapGuardAgent(tradingAccounts, apiKeys, vault, executionRegistry, dailyRisk, tradingLocks, pnl, riskEvents, bus, events, config.DAILY_PROFIT_CAP_RATIO);
  const timeGuard = new TimeHorizonGuardAgent(positions, bus, events, config.POSITION_TIMEOUT_WARNING_MINUTES, config.POSITION_FORCE_CLOSE_MINUTES);

  app.addHook("onRequest", async (request) => {
    sensitiveLimiter.enforce(request);
    metrics.increment("ma_core_http_requests_total", { method: request.method, route: request.url.split("?")[0] ?? request.url });
  });

  app.setErrorHandler((error, _request, reply) => {
    metrics.increment("ma_core_http_errors_total", { type: error instanceof HttpError ? "public" : "internal" });
    if (error instanceof HttpError) {
      return reply.code(error.statusCode).send({ ok: false, message: error.publicMessage });
    }
    logger.error({ err: error }, "Unhandled API error");
    return reply.code(500).send({ ok: false, message: "Внутренняя ошибка сервера. Запрос не был выполнен." });
  });

  app.get("/health", async () => ({ ok: true, ts: new Date().toISOString() }));
  await registerAuthRoutes(app, { auth, config });
  await registerExchangeRoutes(app, { registry, vault, repository: apiKeys, bus, events, auth, tradingAccounts, config });
  await registerAgentRoutes(app, { marketAnalyst, strategyAgent, auth });
  await registerEventRoutes(app, { events, hub, auth });
  await registerSignalRoutes(app, { signals, strategies, auth });
  await registerMarketRoutes(app, { source: marketDataSource, auth });
  await registerOpsRoutes(app, { bus, auth, metrics, config, outbox, reconciliation, privateStreams, liveReadiness });
  await registerRiskRoutes(app, { auth, risk: dailyRisk, locks: tradingLocks, positions, executions, tradingAccounts, riskPolicies, riskEvents, orders, exchangeAudit, orderExecutor, liveReadiness, privateStreams, reconciliation, immutableAudit, incidents });
  await registerInstitutionalRoutes(app, { auth, institutional, tradingAccounts, riskEvents, incidents });

  const privateStreamSupervisor = new PrivateStreamSupervisor(tradingAccounts, apiKeys, vault, privateStreams, config);
  const outboxDispatcher = new OutboxDispatcherWorker(outbox, bus, config.OUTBOX_DISPATCH_INTERVAL_MS);
  const reconciliationWorker = new ExchangeReconciliationWorker(tradingAccounts, apiKeys, vault, executionRegistry, positions, orders, reconciliation, incidents, config.RECONCILIATION_INTERVAL_MS);
  const protectionSupervisor = new ProtectionOrderSupervisor(tradingAccounts, apiKeys, vault, executionRegistry, positions, tradingLocks, protectionSupervisorRepository, incidents, orderExecutor, config.PROTECTION_SUPERVISOR_INTERVAL_MS);
  const safeModeMonitor = new SafeModeMonitorWorker(privateStreams, reconciliation, institutional, incidents, config.SAFE_MODE_MONITOR_INTERVAL_MS);
  privateStreamSupervisor.start();
  outboxDispatcher.start();
  reconciliationWorker.start();
  protectionSupervisor.start();
  safeModeMonitor.start();

  const workers: WorkerHandles = await bootstrapWorkers({ bus, hub, strategyAgent, marketAnalyst, orderExecutor, drawdownGuard, profitGuard, timeGuard, marketDataSource, adapterStatuses, metrics, config });

  return {
    app,
    config,
    async shutdown(): Promise<void> {
      workers.stop();
      privateStreamSupervisor.stop();
      outboxDispatcher.stop();
      reconciliationWorker.stop();
      protectionSupervisor.stop();
      safeModeMonitor.stop();
      await marketDataSource.close();
      await bus.close();
      await db.close();
      await app.close();
    }
  };
}
