import type { FastifyRequest } from "fastify";
import { unauthorized } from "../infrastructure/httpErrors.js";
import type { AuthenticatedUser } from "./authService.js";

export function requireAuthenticatedUser(request: FastifyRequest): AuthenticatedUser {
  const user = request.user;
  if (!user) {
    throw unauthorized("Сессия не найдена или истекла.");
  }
  return user;
}
