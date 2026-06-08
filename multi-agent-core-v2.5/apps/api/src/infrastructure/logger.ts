import pino, { type LoggerOptions } from "pino";

const loggerOptions: LoggerOptions = {
  level: process.env.NODE_ENV === "production" ? "info" : "debug",
  redact: {
    paths: ["apiKey", "apiSecret", "passphrase", "authorization", "headers.X-MBX-APIKEY", "headers.X-BAPI-API-KEY"],
    remove: true
  }
};

if (process.env.NODE_ENV !== "production") {
  loggerOptions.transport = { target: "pino-pretty" };
}

export const logger = pino(loggerOptions);
