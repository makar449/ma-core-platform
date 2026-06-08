import { buildApp } from "./app.js";
import { logger } from "./infrastructure/logger.js";

const runtime = await buildApp();

const shutdown = async (signal: string): Promise<void> => {
  logger.info({ signal }, "Shutting down API runtime");
  await runtime.shutdown();
  process.exit(0);
};

process.on("SIGINT", () => { void shutdown("SIGINT"); });
process.on("SIGTERM", () => { void shutdown("SIGTERM"); });

await runtime.app.listen({ port: runtime.config.API_PORT, host: "0.0.0.0" });
