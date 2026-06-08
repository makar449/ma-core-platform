import { z } from "zod";
import type { FastifyInstance, FastifyReply } from "fastify";
import type { AuthService } from "../auth/authService.js";
import { badRequest } from "../infrastructure/httpErrors.js";
import type { AppConfig } from "../config.js";
import { clearAuthCookies, setAuthCookies } from "../auth/authCookies.js";

const PasswordSchema = z.string().min(12, "Пароль должен содержать минимум 12 символов").max(256)
  .regex(/[a-z]/, "Пароль должен содержать строчную букву")
  .regex(/[A-Z]/, "Пароль должен содержать заглавную букву")
  .regex(/[0-9]/, "Пароль должен содержать цифру")
  .regex(/[^a-zA-Z0-9]/, "Пароль должен содержать спецсимвол");

const RegisterSchema = z.object({
  email: z.string().email().max(320),
  password: PasswordSchema,
  registrationToken: z.string().min(24).max(512).optional()
});

const LoginSchema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(1).max(256)
});

export interface AuthRoutesDeps {
  auth: AuthService;
  config: AppConfig;
}

export async function authenticateRequest(auth: AuthService, request: Parameters<AuthService["authenticateRequest"]>[0]): Promise<void> {
  await auth.authenticateRequest(request);
}

export async function requireCsrf(auth: AuthService, request: Parameters<AuthService["requireCsrf"]>[0]): Promise<void> {
  await auth.requireCsrf(request);
}

export async function registerAuthRoutes(app: FastifyInstance, deps: AuthRoutesDeps): Promise<void> {
  app.post("/api/auth/register", async (request, reply) => {
    const parsed = RegisterSchema.safeParse(request.body);
    if (!parsed.success) {
      throw badRequest(parsed.error.issues.map((issue) => issue.message).join("; "));
    }
    const session = await deps.auth.register({ ...parsed.data, request });
    writeSession(reply, deps.config, session);
    return { ok: true, csrfToken: session.csrfToken, user: publicUser(session.user) };
  });

  app.post("/api/auth/login", async (request, reply) => {
    const parsed = LoginSchema.safeParse(request.body);
    if (!parsed.success) {
      throw badRequest(parsed.error.issues.map((issue) => issue.message).join("; "));
    }
    const session = await deps.auth.login({ ...parsed.data, request });
    writeSession(reply, deps.config, session);
    return { ok: true, csrfToken: session.csrfToken, user: publicUser(session.user) };
  });

  app.post("/api/auth/refresh", async (request, reply) => {
    const session = await deps.auth.refresh(request);
    writeSession(reply, deps.config, session);
    return { ok: true, csrfToken: session.csrfToken, user: publicUser(session.user) };
  });

  app.post("/api/auth/logout", async (request, reply) => {
    await deps.auth.logout(request);
    clearAuthCookies(reply, deps.config);
    return { ok: true };
  });

  app.get("/api/auth/me", async (request) => {
    const user = await deps.auth.me(request);
    return { ok: true, csrfToken: readCsrfToken(request.headers.cookie), user: publicUser(user) };
  });
}

function writeSession(reply: FastifyReply, config: AppConfig, session: { accessToken: string; refreshToken: string; csrfToken: string }): void {
  setAuthCookies(reply, config, session);
}

function publicUser(user: { id: string; email: string; roles: readonly string[] }): { id: string; email: string; roles: readonly string[] } {
  return { id: user.id, email: user.email, roles: user.roles };
}

function readCsrfToken(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) {
    return null;
  }
  const cookie = cookieHeader.split(";").map((piece) => piece.trim()).find((piece) => piece.startsWith("ma_csrf="));
  return cookie ? decodeURIComponent(cookie.slice("ma_csrf=".length)) : null;
}
