import { createHash, createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { FastifyRequest } from "fastify";
import { z } from "zod";
import type { AppConfig } from "../config.js";
import { unauthorized } from "../infrastructure/httpErrors.js";
import { readCookie, accessCookieName, refreshCookieName } from "./authCookies.js";
import type { AuthRepository, UserRecord, SessionRecord } from "./authRepository.js";

const scrypt = promisify(scryptCallback);

const TokenHeaderSchema = z.object({ alg: z.literal("HS256"), typ: z.literal("JWT") });
const TokenPayloadSchema = z.object({
  sub: z.string().uuid(),
  sid: z.string().uuid(),
  email: z.string().email(),
  roles: z.array(z.string()),
  iat: z.number().int().positive(),
  exp: z.number().int().positive(),
  iss: z.literal("ma-core-api")
});

export type AuthenticatedUser = {
  readonly id: string;
  readonly email: string;
  readonly sessionId: string;
  readonly roles: readonly string[];
};

export interface AuthSessionResult {
  user: AuthenticatedUser;
  accessToken: string;
  refreshToken: string;
  csrfToken: string;
}

export class AuthService {
  private readonly secret: Buffer;

  public constructor(secretBase64: string, private readonly sessions: AuthRepository, private readonly config: AppConfig) {
    const decoded = Buffer.from(secretBase64, "base64");
    if (decoded.length < 32) {
      throw new Error("JWT_AUTH_SECRET_BASE64 must decode to at least 32 bytes");
    }
    this.secret = decoded;
  }

  public async register(input: { email: string; password: string; registrationToken?: string | undefined; request: FastifyRequest }): Promise<AuthSessionResult> {
    this.assertRegistrationAllowed(input.registrationToken);
    const existing = await this.sessions.findUserByEmail(input.email);
    if (existing) {
      throw unauthorized("Пользователь с таким email уже существует.");
    }
    const user = await this.sessions.createUser({ email: input.email, passwordHash: await this.hashPassword(input.password) });
    return this.createSession(user, input.request);
  }

  public async login(input: { email: string; password: string; request: FastifyRequest }): Promise<AuthSessionResult> {
    const user = await this.sessions.findUserByEmail(input.email);
    if (!user || user.disabledAt) {
      throw unauthorized("Email или пароль неверны.");
    }
    const ok = await this.verifyPassword(input.password, user.passwordHash);
    if (!ok) {
      throw unauthorized("Email или пароль неверны.");
    }
    return this.createSession(user, input.request);
  }

  public async refresh(request: FastifyRequest): Promise<AuthSessionResult> {
    const refreshToken = readCookie(request, refreshCookieName);
    if (!refreshToken) {
      throw unauthorized("Refresh-сессия не найдена.");
    }
    const refreshHash = this.hashOpaqueToken(refreshToken);
    const session = await this.sessions.findSessionByRefreshHash(refreshHash);
    if (!session || session.revokedAt || session.expiresAt.getTime() <= Date.now()) {
      throw unauthorized("Refresh-сессия истекла или отозвана.");
    }
    const user = await this.sessions.findUserById(session.userId);
    if (!user || user.disabledAt) {
      await this.sessions.revokeSession(session.id);
      throw unauthorized("Пользователь недоступен.");
    }
    const nextRefreshToken = this.createOpaqueToken();
    const nextCsrfToken = this.createOpaqueToken();
    const nextSession = await this.sessions.rotateSession({
      sessionId: session.id,
      nextRefreshTokenHash: this.hashOpaqueToken(nextRefreshToken),
      nextCsrfTokenHash: this.hashOpaqueToken(nextCsrfToken),
      nextExpiresAt: new Date(Date.now() + this.config.REFRESH_TOKEN_TTL_SECONDS * 1000)
    });
    if (!nextSession) {
      throw unauthorized("Refresh-сессия не может быть обновлена.");
    }
    const authenticatedUser = this.toAuthenticatedUser(user, nextSession.id);
    return {
      user: authenticatedUser,
      accessToken: this.signUserToken(authenticatedUser, this.config.ACCESS_TOKEN_TTL_SECONDS),
      refreshToken: nextRefreshToken,
      csrfToken: nextCsrfToken
    };
  }

  public async authenticateRequest(request: FastifyRequest): Promise<AuthenticatedUser> {
    const token = readCookie(request, accessCookieName) ?? this.readBearerToken(request);
    if (!token) {
      throw unauthorized("Требуется авторизация.");
    }
    const userFromToken = this.verifyUserToken(token);
    const session = await this.sessions.findSessionById(userFromToken.sessionId);
    if (!this.sessionIsActive(session)) {
      throw unauthorized("Сессия не найдена или истекла.");
    }
    await this.sessions.touchSession(userFromToken.sessionId);
    request.user = userFromToken;
    return userFromToken;
  }

  public async requireCsrf(request: FastifyRequest): Promise<void> {
    const user = request.user ?? await this.authenticateRequest(request);
    const csrfHeader = request.headers["x-csrf-token"];
    const csrfToken = Array.isArray(csrfHeader) ? csrfHeader[0] : csrfHeader;
    if (!csrfToken) {
      throw unauthorized("CSRF-токен отсутствует.");
    }
    const session = await this.sessions.findSessionById(user.sessionId);
    if (!this.sessionIsActive(session)) {
      throw unauthorized("Сессия не найдена или истекла.");
    }
    if (!this.safeEqual(this.hashOpaqueToken(csrfToken), session.csrfTokenHash)) {
      throw unauthorized("CSRF-токен неверен.");
    }
  }

  public async logout(request: FastifyRequest): Promise<void> {
    const token = readCookie(request, accessCookieName);
    if (!token) {
      return;
    }
    try {
      const user = this.verifyUserToken(token);
      await this.sessions.revokeSession(user.sessionId);
    } catch {
      return;
    }
  }

  public async requirePasswordReauth(userId: string, password: string): Promise<void> {
    const user = await this.sessions.findUserById(userId);
    if (!user || user.disabledAt) {
      throw unauthorized("Пользователь недоступен для повторной проверки пароля.");
    }
    const verified = await this.verifyPassword(password, user.passwordHash);
    if (!verified) {
      throw unauthorized("Пароль оператора неверен. Критическое действие отменено.");
    }
  }

  public async me(request: FastifyRequest): Promise<AuthenticatedUser> {
    return this.authenticateRequest(request);
  }

  public signUserToken(user: AuthenticatedUser, ttlSeconds: number): string {
    const now = Math.floor(Date.now() / 1000);
    const payload = TokenPayloadSchema.parse({ sub: user.id, sid: user.sessionId, email: user.email, roles: [...user.roles], iat: now, exp: now + ttlSeconds, iss: "ma-core-api" });
    const encodedHeader = this.encodeJson(TokenHeaderSchema.parse({ alg: "HS256", typ: "JWT" }));
    const encodedPayload = this.encodeJson(payload);
    const signature = this.sign(`${encodedHeader}.${encodedPayload}`);
    return `${encodedHeader}.${encodedPayload}.${signature}`;
  }

  private async createSession(user: UserRecord, request: FastifyRequest): Promise<AuthSessionResult> {
    const refreshToken = this.createOpaqueToken();
    const csrfToken = this.createOpaqueToken();
    const session = await this.sessions.createSession({
      userId: user.id,
      refreshTokenHash: this.hashOpaqueToken(refreshToken),
      csrfTokenHash: this.hashOpaqueToken(csrfToken),
      expiresAt: new Date(Date.now() + this.config.REFRESH_TOKEN_TTL_SECONDS * 1000),
      userAgent: request.headers["user-agent"],
      ipAddress: request.ip
    });
    const authenticatedUser = this.toAuthenticatedUser(user, session.id);
    return {
      user: authenticatedUser,
      accessToken: this.signUserToken(authenticatedUser, this.config.ACCESS_TOKEN_TTL_SECONDS),
      refreshToken,
      csrfToken
    };
  }

  private assertRegistrationAllowed(registrationToken?: string): void {
    if (this.config.AUTH_REGISTRATION_MODE === "disabled") {
      throw unauthorized("Регистрация отключена на этом окружении.");
    }
    if (this.config.AUTH_REGISTRATION_MODE === "invite" && registrationToken !== this.config.AUTH_REGISTRATION_TOKEN) {
      throw unauthorized("Invite token не прошел проверку.");
    }
  }

  private verifyUserToken(token: string): AuthenticatedUser {
    const parts = token.split(".");
    if (parts.length !== 3) {
      throw new Error("Auth token has invalid JWT structure");
    }
    const [encodedHeader, encodedPayload, encodedSignature] = parts;
    if (!encodedHeader || !encodedPayload || !encodedSignature) {
      throw new Error("Auth token has empty JWT sections");
    }
    const expectedSignature = this.sign(`${encodedHeader}.${encodedPayload}`);
    if (!this.safeEqualBase64Url(encodedSignature, expectedSignature)) {
      throw new Error("Auth token signature is invalid");
    }
    TokenHeaderSchema.parse(this.decodeJson(encodedHeader));
    const payload = TokenPayloadSchema.parse(this.decodeJson(encodedPayload));
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp <= now) {
      throw new Error("Auth token has expired");
    }
    return { id: payload.sub, sessionId: payload.sid, email: payload.email, roles: payload.roles };
  }

  private sessionIsActive(session: SessionRecord | null): session is SessionRecord {
    return Boolean(session && !session.revokedAt && session.expiresAt.getTime() > Date.now());
  }

  private toAuthenticatedUser(user: UserRecord, sessionId: string): AuthenticatedUser {
    return { id: user.id, email: user.email, sessionId, roles: user.roles };
  }

  private async hashPassword(password: string): Promise<string> {
    const salt = randomBytes(16);
    const derived = await scrypt(password, salt, 64) as Buffer;
    return `scrypt:v1:${salt.toString("base64url")}:${derived.toString("base64url")}`;
  }

  private async verifyPassword(password: string, encoded: string): Promise<boolean> {
    const parts = encoded.split(":");
    if (parts.length !== 4 || parts[0] !== "scrypt" || parts[1] !== "v1") {
      return false;
    }
    const salt = Buffer.from(parts[2] ?? "", "base64url");
    const expected = Buffer.from(parts[3] ?? "", "base64url");
    const actual = await scrypt(password, salt, expected.length) as Buffer;
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }

  private createOpaqueToken(): string {
    return randomBytes(32).toString("base64url");
  }

  private hashOpaqueToken(token: string): string {
    return createHash("sha256").update(token).digest("base64url");
  }

  private encodeJson(value: unknown): string {
    return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
  }

  private decodeJson(value: string): unknown {
    return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as unknown;
  }

  private sign(value: string): string {
    return createHmac("sha256", this.secret).update(value).digest("base64url");
  }

  private safeEqualBase64Url(left: string, right: string): boolean {
    const leftBuffer = Buffer.from(left, "base64url");
    const rightBuffer = Buffer.from(right, "base64url");
    return this.safeEqual(leftBuffer.toString("base64url"), rightBuffer.toString("base64url"));
  }

  private safeEqual(left: string, right: string): boolean {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);
    if (leftBuffer.length !== rightBuffer.length) {
      return false;
    }
    return timingSafeEqual(leftBuffer, rightBuffer);
  }

  private readBearerToken(request: FastifyRequest): string | null {
    const header = request.headers.authorization;
    return header && header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : null;
  }
}
