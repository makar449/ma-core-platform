import "fastify";
import type { AuthenticatedUser } from "./authService.js";

declare module "fastify" {
  interface FastifyRequest {
    user?: AuthenticatedUser;
  }
}
