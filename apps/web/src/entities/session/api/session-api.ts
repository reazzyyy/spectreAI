import { apiRequest } from "@/shared/api";
import type { AuthSession, LoginInput } from "../model/types";

/** POST /auth/login — sets HttpOnly cookie via rewrite proxy. */
export function login(input: LoginInput): Promise<AuthSession> {
  return apiRequest<AuthSession>("/auth/login", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/** GET /auth/me — requires valid session cookie. */
export function fetchMe(): Promise<AuthSession> {
  return apiRequest<AuthSession>("/auth/me", { method: "GET" });
}

/** POST /auth/logout — revokes session and clears cookie (idempotent). */
export function logout(): Promise<{ ok: true }> {
  return apiRequest<{ ok: true }>("/auth/logout", { method: "POST" });
}
