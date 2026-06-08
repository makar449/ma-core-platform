import type { FastifyRequest } from "fastify";
import { HttpError } from "../infrastructure/httpErrors.js";

export interface SensitiveRoutePolicy {
  readonly key: string;
  readonly method: string;
  readonly pathPrefix: string;
  readonly maxAttempts: number;
  readonly windowMs: number;
}

interface Bucket {
  readonly resetAt: number;
  count: number;
}

export class SensitiveRouteLimiter {
  private readonly buckets = new Map<string, Bucket>();

  public constructor(private readonly policies: readonly SensitiveRoutePolicy[]) {}

  public enforce(request: FastifyRequest): void {
    const policy = this.policies.find((item) => request.method === item.method && request.url.split("?")[0]?.startsWith(item.pathPrefix));
    if (!policy) return;
    const principal = extractPrincipal(request);
    const key = `${policy.key}:${principal}`;
    const now = Date.now();
    const existing = this.buckets.get(key);
    if (!existing || existing.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + policy.windowMs });
      this.cleanup(now);
      return;
    }
    existing.count += 1;
    if (existing.count > policy.maxAttempts) {
      throw new HttpError(429, "Sensitive action rate limit exceeded. Wait before retrying.");
    }
  }

  private cleanup(now: number): void {
    if (this.buckets.size < 2048) return;
    for (const [key, value] of this.buckets.entries()) {
      if (value.resetAt <= now) this.buckets.delete(key);
    }
  }
}

export function defaultSensitivePolicies(): readonly SensitiveRoutePolicy[] {
  return [
    { key: "login", method: "POST", pathPrefix: "/api/auth/login", maxAttempts: 8, windowMs: 60_000 },
    { key: "register", method: "POST", pathPrefix: "/api/auth/register", maxAttempts: 4, windowMs: 60_000 },
    { key: "exchange_connect", method: "POST", pathPrefix: "/api/exchanges/connect", maxAttempts: 6, windowMs: 60_000 },
    { key: "kill_switch", method: "POST", pathPrefix: "/api/execution/kill-switch", maxAttempts: 3, windowMs: 60_000 },
    { key: "manual_close", method: "POST", pathPrefix: "/api/execution/positions/", maxAttempts: 12, windowMs: 60_000 },
    { key: "live_mode", method: "POST", pathPrefix: "/api/execution/mode", maxAttempts: 4, windowMs: 60_000 },
    { key: "lock_release", method: "DELETE", pathPrefix: "/api/risk/locks/", maxAttempts: 4, windowMs: 60_000 },
    { key: "password_readiness", method: "POST", pathPrefix: "/api/live-readiness", maxAttempts: 12, windowMs: 60_000 }
  ];
}

function extractPrincipal(request: FastifyRequest): string {
  const forwarded = request.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim().length > 0) return forwarded.split(",")[0]?.trim() ?? request.ip;
  return request.ip;
}
