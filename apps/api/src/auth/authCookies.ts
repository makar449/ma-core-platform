import type { FastifyReply, FastifyRequest } from "fastify";
import type { AppConfig } from "../config.js";

export const accessCookieName = "ma_access";
export const refreshCookieName = "ma_refresh";
export const csrfCookieName = "ma_csrf";

export interface CookieTokens {
  accessToken: string;
  refreshToken: string;
  csrfToken: string;
}

export function readCookie(request: FastifyRequest, name: string): string | null {
  const header = request.headers.cookie;
  if (!header) {
    return null;
  }
  const pieces = header.split(";");
  for (const piece of pieces) {
    const [rawName, ...rawValue] = piece.trim().split("=");
    if (rawName === name) {
      return decodeURIComponent(rawValue.join("="));
    }
  }
  return null;
}

export function setAuthCookies(reply: FastifyReply, config: AppConfig, tokens: CookieTokens): void {
  const secure = config.NODE_ENV === "production";
  const common = [`Path=/`, `SameSite=Strict`, secure ? `Secure` : ``, config.COOKIE_DOMAIN ? `Domain=${config.COOKIE_DOMAIN}` : ``].filter(Boolean).join("; ");
  reply.header("set-cookie", [
    `${accessCookieName}=${encodeURIComponent(tokens.accessToken)}; ${common}; HttpOnly; Max-Age=${config.ACCESS_TOKEN_TTL_SECONDS}`,
    `${refreshCookieName}=${encodeURIComponent(tokens.refreshToken)}; ${common}; HttpOnly; Max-Age=${config.REFRESH_TOKEN_TTL_SECONDS}`,
    `${csrfCookieName}=${encodeURIComponent(tokens.csrfToken)}; ${common}; Max-Age=${config.REFRESH_TOKEN_TTL_SECONDS}`
  ]);
}

export function clearAuthCookies(reply: FastifyReply, config: AppConfig): void {
  const secure = config.NODE_ENV === "production";
  const common = [`Path=/`, `SameSite=Strict`, secure ? `Secure` : ``, config.COOKIE_DOMAIN ? `Domain=${config.COOKIE_DOMAIN}` : ``].filter(Boolean).join("; ");
  reply.header("set-cookie", [
    `${accessCookieName}=; ${common}; HttpOnly; Max-Age=0`,
    `${refreshCookieName}=; ${common}; HttpOnly; Max-Age=0`,
    `${csrfCookieName}=; ${common}; Max-Age=0`
  ]);
}
