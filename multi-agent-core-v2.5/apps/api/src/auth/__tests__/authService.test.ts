import { describe, expect, it } from "vitest";
import type { FastifyRequest } from "fastify";
import { AuthService } from "../authService.js";
import type { SessionRecord, UserRecord } from "../authRepository.js";
import type { AppConfig } from "../../config.js";

class MemoryAuthRepository {
  private user: UserRecord | null = null;
  private session: SessionRecord | null = null;
  public async createUser(input: { email: string; passwordHash: string }): Promise<UserRecord> {
    this.user = { id: "00000000-0000-4000-8000-000000000001", email: input.email, passwordHash: input.passwordHash, disabledAt: null, roles: ["trader"] };
    return this.user;
  }
  public async findUserByEmail(): Promise<UserRecord | null> { return this.user; }
  public async findUserById(): Promise<UserRecord | null> { return this.user; }
  public async createSession(input: { userId: string; refreshTokenHash: string; csrfTokenHash: string; expiresAt: Date }): Promise<SessionRecord> {
    this.session = { id: "00000000-0000-4000-8000-000000000002", userId: input.userId, refreshTokenHash: input.refreshTokenHash, csrfTokenHash: input.csrfTokenHash, expiresAt: input.expiresAt, revokedAt: null };
    return this.session;
  }
  public async findSessionById(): Promise<SessionRecord | null> { return this.session; }
  public async findSessionByRefreshHash(): Promise<SessionRecord | null> { return this.session; }
  public async rotateSession(): Promise<SessionRecord | null> { return this.session; }
  public async touchSession(): Promise<void> {}
  public async revokeSession(): Promise<void> { if (this.session) this.session = { ...this.session, revokedAt: new Date() }; }
  public async revokeAllUserSessions(): Promise<void> {}
}

const config = { NODE_ENV: "test", ACCESS_TOKEN_TTL_SECONDS: 900, REFRESH_TOKEN_TTL_SECONDS: 1209600, AUTH_REGISTRATION_MODE: "open" } as AppConfig;
const request = { headers: { "user-agent": "vitest" }, ip: "127.0.0.1" } as FastifyRequest;

describe("AuthService", () => {
  it("creates a cookie-session compatible login without client supplied user id", async () => {
    const repository = new MemoryAuthRepository();
    const service = new AuthService(Buffer.alloc(32, 1).toString("base64"), repository as never, config);
    const registered = await service.register({ email: "trader@example.com", password: "StrongPass123!", request });
    const login = await service.login({ email: "trader@example.com", password: "StrongPass123!", request });
    expect(registered.user.id).toBe(login.user.id);
    expect(login.accessToken.split(".")).toHaveLength(3);
    expect(login.csrfToken.length).toBeGreaterThan(20);
  });
});
